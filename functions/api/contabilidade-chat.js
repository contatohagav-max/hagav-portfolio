// CONTABILIDADE HAGAV - chat de decisoes financeiras com base nos numeros do painel.
// POST /api/contabilidade-chat  { mensagens: [{ role, content }], resumo: string }
// Acesso: sessao do painel com perfil admin ou comercial. Requer ANTHROPIC_API_KEY no Cloudflare.

import Anthropic from '@anthropic-ai/sdk';
import { authenticateRequest, firstEnvValue, json } from '../_utils/admin-auth.js';
import { applyRateLimit, rateLimitResponse } from '../_utils/rate-limit.js';

const MODELO = 'claude-opus-5-5';
const MAX_MENSAGENS = 12;
const MAX_CARACTERES_MENSAGEM = 4000;
const MAX_CARACTERES_RESUMO = 12000;

const INSTRUCOES = `Você é a CONTABILIDADE HAGAV, o assistente financeiro da HAGAV, um pequeno estúdio brasileiro de edição de vídeo (Reels, criativos para anúncio, aulas, VSL) tocado por dois sócios. Eles não são da área de finanças: querem decidir rápido e com segurança se podem comprar, investir, retirar dinheiro ou contratar.

Como responder:
- Use os números da HAGAV que vêm abaixo. Faça as contas de forma visível e simples (ex.: "sobra média de R$ 2,3 mil/mês; a câmera de R$ 8 mil equivale a 3,5 meses de sobra").
- Comece pela recomendação em uma frase (Sim, Ainda não, ou Depende de X), depois explique em poucos tópicos e termine com o próximo passo concreto (quanto guardar por mês, em quantos meses, o que cortar, quantos clientes faltam).
- Proteja o caixa: considere a reserva de emergência (6 meses de custo), a dependência do maior cliente, contas atrasadas e o custo fixo antes de aprovar um gasto. Se a reserva estiver baixa, diga isso com clareza e proponha um caminho (guardar uma parte da sobra, parcelar, esperar um degrau de faturamento).
- Diferencie gasto que gera receita (ex.: equipamento que aumenta a capacidade de entrega, anúncios com retorno medido) de gasto de conforto.
- Linguagem simples, sem jargão. Se usar um termo técnico, explique em poucas palavras. Respostas curtas (até uns 200 palavras), a menos que peçam detalhes.
- Contexto brasileiro: a empresa paga DAS do MEI. Regras de imposto, enquadramento (MEI, Simples Nacional), pró-labore, nota fiscal e separação entre pessoa física e jurídica mudam com a legislação: dê a orientação geral e diga quando confirmar com o contador. Não invente alíquotas, limites ou prazos; se citar um valor de regra, avise que deve ser confirmado.
- Limite do MEI: o painel envia o limite anual configurado, o que entrou no ano e a projeção até dezembro (meses sem lançamento são estimados pela média, avise que o valor real pode ser outro). Pontos gerais para lembrar quando fizer sentido, sempre pedindo confirmação com o contador: o limite é anual, sem teto mensal; até 20% acima, a empresa segue MEI até dezembro, paga a diferença e muda de regime no ano seguinte; acima disso, sai do MEI desde janeiro; Pix recebido no CPF do titular pela mesma atividade conta como faturamento; MEI não pode ter sócio; a declaração anual (DASN-SIMEI) vence em 31 de maio; cliente com CNPJ exige nota fiscal de serviço.
- Sobre investimentos, fale em termos gerais (ex.: reserva em aplicação de liquidez diária e baixo risco) e não recomende produtos ou instituições específicas.
- Se faltar um dado para responder bem, diga qual e responda com a melhor estimativa possível com o que existe.
- Responda sempre em português do Brasil.`;

function limparTexto(valor, max) {
  return String(valor ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

// Mantem so as ultimas mensagens, alternando user/assistant e terminando no usuario.
function normalizarMensagens(entrada) {
  const lista = (Array.isArray(entrada) ? entrada : [])
    .map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: limparTexto(m?.content, MAX_CARACTERES_MENSAGEM),
    }))
    .filter((m) => m.content)
    .slice(-MAX_MENSAGENS);

  const alternadas = [];
  for (const m of lista) {
    const anterior = alternadas[alternadas.length - 1];
    if (anterior && anterior.role === m.role) {
      anterior.content = `${anterior.content}\n\n${m.content}`.slice(0, MAX_CARACTERES_MENSAGEM * 2);
    } else {
      alternadas.push({ ...m });
    }
  }
  while (alternadas.length && alternadas[0].role !== 'user') alternadas.shift();
  if (!alternadas.length || alternadas[alternadas.length - 1].role !== 'user') return [];
  return alternadas;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env, {
    requiredRoles: ['admin', 'comercial'],
    allowBearer: true,
    allowCookie: true,
  });
  if (!auth.ok) return json({ ok: false, error: auth.reason || 'unauthorized' }, auth.status || 401);

  const apiKey = firstEnvValue(env, ['ANTHROPIC_API_KEY']);
  if (!apiKey) return json({ ok: false, error: 'chat_nao_configurado' }, 503);

  const rate = applyRateLimit({
    namespace: 'contabilidade-chat',
    key: auth.actor.id || auth.actor.email || 'anon',
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.ok) {
    return rateLimitResponse({ ok: false, error: 'rate_limited', message: 'Muitas perguntas seguidas. Aguarde alguns minutos.' }, rate);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const messages = normalizarMensagens(body?.mensagens);
  if (!messages.length) return json({ ok: false, error: 'pergunta_vazia', message: 'Escreva uma pergunta.' }, 400);
  const resumo = limparTexto(body?.resumo, MAX_CARACTERES_RESUMO) || 'Sem dados financeiros disponíveis.';
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // Se o modelo principal recusar, a API repete a pergunta num modelo de fallback recomendado.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: INSTRUCOES },
        { type: 'text', text: `Números atuais da HAGAV, calculados pelo painel em ${hoje}:\n${resumo}` },
      ],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return json({ ok: true, resposta: 'Não consigo ajudar com essa pergunta. Tente reformular focando na decisão financeira da HAGAV.' });
    }

    const resposta = response.content
      .filter((bloco) => bloco.type === 'text')
      .map((bloco) => bloco.text)
      .join('\n')
      .trim();

    return json({
      ok: true,
      resposta: resposta || 'Não consegui montar uma resposta agora. Tente perguntar de outro jeito.',
      truncada: response.stop_reason === 'max_tokens',
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return json({ ok: false, error: 'chave_invalida', message: 'A chave da API do Claude no Cloudflare está inválida ou sem permissão.' }, 503);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json({ ok: false, error: 'limite_api', message: 'O assistente está com muitas perguntas agora. Tente em instantes.' }, 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      return json({ ok: false, error: 'pedido_invalido', message: 'Não consegui processar essa pergunta. Tente encurtar ou reformular.' }, 400);
    }
    if (error instanceof Anthropic.APIError) {
      return json({ ok: false, error: 'erro_api', message: 'O assistente está indisponível agora. Tente de novo em instantes.' }, 502);
    }
    return json({ ok: false, error: 'erro_interno', message: 'Erro inesperado ao consultar o assistente.' }, 500);
  }
}
