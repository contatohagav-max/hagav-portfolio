/**
 * HAGAV - Prospeccao por email (Google Apps Script)
 *
 * Roda dentro da caixa de email de prospeccao (Google Workspace).
 *  - enviarFila(): busca no painel as mensagens agendadas e envia (respeitando horario comercial
 *    e o limite diario configurado no painel). Follow-ups saem como resposta na mesma conversa.
 *  - lerRespostas(): le as respostas das conversas de prospeccao e registra no painel.
 *    Bounce, resposta automatica e pedido de descadastro sao reconhecidos aqui; o resto entra
 *    como "respondeu" (a equipe e avisada e a automacao classifica depois).
 *
 * Instalacao (uma vez):
 *  1. Na caixa de prospeccao, abra script.google.com > Novo projeto e cole este arquivo.
 *  2. Configuracoes do projeto > Propriedades do script, crie:
 *       API_BASE   = https://hagav.com.br/api/automacao
 *       API_TOKEN  = (o mesmo AUTOMATION_TOKEN do Cloudflare)
 *       FROM_NAME  = Equipe HAGAV            (opcional)
 *       ASSINATURA = texto da assinatura     (opcional)
 *  3. Rode a funcao setup() uma vez e autorize. Ela cria o marcador e os gatilhos.
 */

var CONFIG = {
  LABEL: 'HAGAV/Prospeccao',
  LOTE_POR_RODADA: 4,          // emails por execucao (a cada 15 min)
  HORA_INICIO: 8,              // horario de Brasilia
  HORA_FIM: 18,
  DIAS_UTEIS: [1, 2, 3, 4, 5], // segunda a sexta
  JANELA_RESPOSTAS: '21d',
  TIMEZONE: 'America/Sao_Paulo',
  RODAPE_DESCADASTRO: 'Se preferir não receber mais mensagens nossas, é só responder "sair".',
};

// ---------------------------------------------------------------------------
// Instalacao
// ---------------------------------------------------------------------------

function setup() {
  getOrCreateLabel_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'enviarFila' || fn === 'lerRespostas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarFila').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('lerRespostas').timeBased().everyMinutes(10).create();
  var status = api_('GET', '/status');
  Logger.log('Conexao com o painel OK: ' + JSON.stringify(status));
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

function enviarFila() {
  if (!dentroDoHorario_()) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var fila = api_('GET', '/mensagens/fila?canal=email&limit=' + CONFIG.LOTE_POR_RODADA);
    (fila.mensagens || []).forEach(function (msg) {
      try {
        var enviado = enviarMensagem_(msg);
        api_('PATCH', '/mensagens/' + msg.id, {
          status: 'enviado',
          provider_message_id: enviado.messageId,
          thread_id: enviado.threadId,
        });
        guardarConversa_(enviado.threadId, msg.prospect_id);
        Utilities.sleep(2000 + Math.floor(Math.random() * 4000)); // espaca os envios
      } catch (err) {
        api_('PATCH', '/mensagens/' + msg.id, { status: 'falhou', erro: String(err && err.message || err).slice(0, 900) });
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function enviarMensagem_(msg) {
  var prospect = msg.prospect || {};
  var corpo = montarCorpo_(msg.corpo);
  var label = getOrCreateLabel_();
  var props = PropertiesService.getScriptProperties();
  var fromName = props.getProperty('FROM_NAME') || 'Equipe HAGAV';

  // Follow-up: responde na conversa da primeira mensagem
  if (Number(msg.etapa) > 1) {
    var threadAnterior = buscarThreadAnterior_(msg.prospect_id);
    if (threadAnterior) {
      var thread = GmailApp.getThreadById(threadAnterior);
      if (thread) {
        var draft = thread.createDraftReply(corpo, { name: fromName });
        var sentReply = draft.send();
        thread.addLabel(label);
        return { messageId: sentReply.getId(), threadId: thread.getId() };
      }
    }
  }

  var assunto = msg.assunto || 'Vídeos para o seu próximo lançamento';
  var novo = GmailApp.createDraft(prospect.email, assunto, corpo, { name: fromName });
  var sent = novo.send();
  var sentThread = sent.getThread();
  sentThread.addLabel(label);
  return { messageId: sent.getId(), threadId: sentThread.getId() };
}

function montarCorpo_(texto) {
  var assinatura = PropertiesService.getScriptProperties().getProperty('ASSINATURA') || '';
  return [String(texto || '').trim(), assinatura.trim(), '—\n' + CONFIG.RODAPE_DESCADASTRO]
    .filter(function (p) { return p; })
    .join('\n\n');
}

function buscarThreadAnterior_(prospectId) {
  var dados = api_('GET', '/prospects/' + prospectId);
  var mensagens = (dados.prospect && dados.prospect.mensagens) || [];
  for (var i = mensagens.length - 1; i >= 0; i--) {
    var m = mensagens[i];
    if (m.direcao === 'saida' && m.status === 'enviado' && m.thread_id) return m.thread_id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

function lerRespostas() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var meuEmail = Session.getEffectiveUser().getEmail().toLowerCase();
    var threads = GmailApp.search('label:"' + CONFIG.LABEL + '" newer_than:' + CONFIG.JANELA_RESPOSTAS, 0, 100);
    threads.forEach(function (thread) {
      var registro = lerConversa_(thread.getId());
      if (!registro) return;
      var ultimo = Number(registro.t || 0);
      var maisRecente = ultimo;

      var mensagens = thread.getMessages();
      for (var i = 0; i < mensagens.length; i++) {
        var m = mensagens[i];
        var quando = m.getDate().getTime();
        if (quando <= ultimo) continue;
        var de = String(m.getFrom() || '').toLowerCase();
        if (de.indexOf(meuEmail) === -1) {
          var corpo = limparCitacao_(m.getPlainBody());
          try {
            api_('POST', '/mensagens', {
              prospect_id: registro.p,
              direcao: 'entrada',
              canal: 'email',
              corpo: corpo || '(resposta sem texto)',
              recebido_em: m.getDate().toISOString(),
              provider_message_id: m.getId(),
              thread_id: thread.getId(),
              classificacao: classificar_(m, de, corpo),
            });
          } catch (err) {
            // Nao avanca o marcador: tenta de novo na proxima rodada (o painel ignora duplicadas).
            Logger.log('Falha ao registrar resposta: ' + err);
            break;
          }
        }
        maisRecente = Math.max(maisRecente, quando);
      }

      if (maisRecente > ultimo) guardarConversa_(thread.getId(), registro.p, maisRecente);
    });
  } finally {
    lock.releaseLock();
  }
}

function classificar_(msg, de, corpo) {
  var assunto = String(msg.getSubject() || '').toLowerCase();
  var texto = String(corpo || '').toLowerCase().trim();

  if (/mailer-daemon|postmaster/.test(de) || /delivery status notification|undeliverable|não entregue|nao entregue|falha na entrega/.test(assunto)) {
    return 'bounce';
  }
  var autoSubmitted = '';
  try { autoSubmitted = String(msg.getHeader('Auto-Submitted') || '').toLowerCase(); } catch (e) { /* sem header */ }
  if ((autoSubmitted && autoSubmitted !== 'no') || /resposta autom|automatic reply|auto.?reply|out of office|fora do escrit|ausente|férias|ferias/.test(assunto)) {
    return 'resposta_automatica';
  }
  if (/^(sair|remover|descadastrar|parar|stop|unsubscribe)\b/.test(texto) || /(me (remova|tire)|não (me )?(envie|mande)|nao (me )?(envie|mande)) (mais|mensagens)/.test(texto)) {
    return 'descadastro';
  }
  return null; // vira "respondeu": equipe e avisada e a automacao classifica depois
}

function limparCitacao_(texto) {
  var linhas = String(texto || '').split(/\r?\n/);
  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i];
    if (/^\s*>/.test(l)) break;
    if (/^(em|on) .+(escreveu|wrote):\s*$/i.test(l.trim())) break;
    if (/^-{2,}\s*(mensagem original|original message)/i.test(l.trim())) break;
    saida.push(l);
  }
  return saida.join('\n').trim().slice(0, 6000);
}

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------

function api_(method, path, body) {
  var props = PropertiesService.getScriptProperties();
  var base = String(props.getProperty('API_BASE') || '').replace(/\/+$/, '');
  var token = props.getProperty('API_TOKEN');
  if (!base || !token) throw new Error('Configure API_BASE e API_TOKEN nas propriedades do script.');

  var options = {
    method: method.toLowerCase(),
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
    contentType: 'application/json',
  };
  if (body !== undefined) options.payload = JSON.stringify(body);

  var res = UrlFetchApp.fetch(base + path, options);
  var code = res.getResponseCode();
  var data = {};
  try { data = JSON.parse(res.getContentText() || '{}'); } catch (e) { data = { raw: res.getContentText() }; }
  if (code >= 400) throw new Error('API ' + method + ' ' + path + ' -> ' + code + ' ' + JSON.stringify(data).slice(0, 400));
  return data;
}

function dentroDoHorario_() {
  var agora = new Date();
  var hora = Number(Utilities.formatDate(agora, CONFIG.TIMEZONE, 'H'));
  var diaSemana = Number(Utilities.formatDate(agora, CONFIG.TIMEZONE, 'u')); // 1 = segunda
  return CONFIG.DIAS_UTEIS.indexOf(diaSemana) !== -1 && hora >= CONFIG.HORA_INICIO && hora < CONFIG.HORA_FIM;
}

function getOrCreateLabel_() {
  return GmailApp.getUserLabelByName(CONFIG.LABEL) || GmailApp.createLabel(CONFIG.LABEL);
}

// Guarda qual prospect pertence a cada conversa e ate onde ja lemos.
function guardarConversa_(threadId, prospectId, ultimoLido) {
  if (!threadId || !prospectId) return;
  var props = PropertiesService.getScriptProperties();
  var atual = lerConversa_(threadId) || {};
  props.setProperty('thr:' + threadId, JSON.stringify({
    p: prospectId,
    t: ultimoLido || atual.t || Date.now(),
  }));
}

function lerConversa_(threadId) {
  var raw = PropertiesService.getScriptProperties().getProperty('thr:' + threadId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
