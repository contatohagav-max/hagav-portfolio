// CEP: mascara, consulta do endereco (ViaCEP, servico publico dos Correios) e montagem do endereco completo.

export function somenteDigitosCep(valor) {
  return String(valor || '').replace(/\D/g, '').slice(0, 8);
}

export function formatarCep(valor) {
  const d = somenteDigitosCep(valor);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Busca rua, bairro, cidade e UF de um CEP.
 * @returns {Promise<{ logradouro, bairro, cidade, uf }>} lanca Error com mensagem em portugues
 */
export async function buscarCep(cep, { signal } = {}) {
  const d = somenteDigitosCep(cep);
  if (d.length !== 8) throw new Error('O CEP precisa ter 8 números.');
  let resposta;
  try {
    resposta = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('Não consegui consultar o CEP agora. Preencha o endereço manualmente.');
  }
  if (!resposta.ok) throw new Error('Não consegui consultar o CEP agora. Preencha o endereço manualmente.');
  const dados = await resposta.json().catch(() => null);
  if (!dados || dados.erro) throw new Error('CEP não encontrado. Confira os números.');
  return {
    logradouro: String(dados.logradouro || '').trim(),
    bairro: String(dados.bairro || '').trim(),
    cidade: String(dados.localidade || '').trim(),
    uf: String(dados.uf || '').trim(),
  };
}

// Texto da rua/bairro/cidade a partir da consulta: "Rua X - Bairro, Cidade/UF".
export function enderecoDaConsulta({ logradouro, bairro, cidade, uf } = {}) {
  const local = [cidade, uf].filter(Boolean).join('/');
  const ruaBairro = [logradouro, bairro].filter(Boolean).join(' - ');
  return [ruaBairro, local].filter(Boolean).join(', ');
}

// Endereco completo para o contrato: "Rua X, 123, apto 4 - Bairro, Cidade/UF - CEP 00000-000".
export function montarEnderecoCompleto({ endereco, numero, cep } = {}) {
  const base = String(endereco || '').trim();
  const num = String(numero || '').trim();
  const cepFmt = somenteDigitosCep(cep).length === 8 ? `CEP ${formatarCep(cep)}` : '';
  let texto = base;
  if (num) {
    // Encaixa o numero logo depois da rua (antes do " - bairro"), quando houver.
    const corte = base.search(/ - |, /);
    texto = corte > 0 ? `${base.slice(0, corte)}, ${num}${base.slice(corte)}` : [base, num].filter(Boolean).join(', ');
  }
  return [texto, cepFmt].filter(Boolean).join(' - ');
}
