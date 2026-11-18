/* HAGAV AUTO — painel. Cada botao = UMA chamada ao ExtendScript (o plano inteiro roda la dentro). */
(function () {
  'use strict';
  var cep = window.__adobe_cep__, busy = false;
  var $ = function (id) { return document.getElementById(id); };
  var extRoot = cep ? String(cep.getSystemPath('extension')).replace(/^file:\/+/, '').replace(/\\/g, '/') : '';
  if (/^[A-Za-z]%3A|%20/.test(extRoot)) extRoot = decodeURIComponent(extRoot);

  function status(text, cls) { $('status').textContent = text; $('status').className = cls || ''; }
  function log(lines) { $('log').textContent = lines.join('\n'); }
  function q(s) { return JSON.stringify(String(s)); }
  function call(cmd, done) {
    if (!cep) { status('Painel fora do Premiere.', 'bad'); return; }
    if (busy) return;
    busy = true;
    var buttons = document.querySelectorAll('button'), i, t0 = Date.now();
    for (i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    status('Executando…');
    cep.evalScript('HAGAVAuto.run(' + q(cmd) + ',' + q($('job').value.trim()) + ',' + q(extRoot) + ')', function (raw) {
      var r;
      busy = false;
      for (i = 0; i < buttons.length; i++) buttons[i].disabled = false;
      try { r = JSON.parse(raw); } catch (e) { status('Resposta inválida do Premiere: ' + String(raw).slice(0, 200), 'bad'); return; }
      if (r.jobDir && !$('job').value) $('job').value = r.jobDir;
      r.panelMs = Date.now() - t0;
      done(r);
    });
  }
  function problems(r) { return (r.errors || []).concat(r.diffs || []); }

  $('snapshot').onclick = function () {
    call('snapshot', function (r) {
      if (!r.ok) { status('Não foi possível ler a timeline.', 'bad'); log(problems(r)); return; }
      var pedidos = r.pending.filter(function (m) { return m.kind === 'pedido'; });
      status('Timeline lida em ' + r.ms + ' ms — ' + pedidos.length + ' marcador(es) de pedido em aberto.', 'ok');
      log(['Sequência: ' + r.sequence.name, 'Arquivo: ' + r.file, ''].concat(r.pending.map(function (m) {
        return '[' + m.kind + '] ' + m.time.toFixed(2) + ' s  ' + (m.name || '(sem nome)') + (m.comments ? '\n        ' + m.comments.replace(/\n+/g, ' / ') : '');
      })));
    });
  };
  $('check').onclick = function () {
    call('check', function (r) {
      status(r.ok ? 'Plano válido: ' + r.pendentes + ' de ' + r.total + ' operação(ões) a aplicar.' : (typeof r.total === 'number' ? 'Plano recusado — nada será escrito.' : 'Erro do painel (nada foi escrito): ' + (r.errors || [])[0]), r.ok ? 'ok' : 'bad');
      log(problems(r).concat((r.warnings || []).map(function (w) { return 'aviso: ' + w; })));
    });
  };
  $('apply').onclick = function () {
    call('apply', function (r) {
      var lines = problems(r);
      if (r.ok) status('Aplicado e conferido: ' + r.applied + ' operação(ões), ' + r.skipped + ' já feitas. ' + (r.totalMs / 1000).toFixed(1) + ' s.', 'ok');
      else status(r.stage === 'preflight' ? 'Plano recusado — nada foi escrito.' : 'Parou em ' + (r.failedOp || 'conferência final') + '. Veja o registro; o backup está na pasta do trabalho.', 'bad');
      (r.timings || []).forEach(function (t) { lines.push(t.id + '  ' + t.type + '  ' + t.ms + ' ms'); });
      if (r.perf) lines.push('', r.perf.leitura);
      if (r.backup) lines.push('Backup: ' + r.backup);
      log(lines);
    });
  };
  $('diagnostico').onclick = function () {
    call('diagnostico', function (r) {
      status(r.ok ? 'Diagnóstico gravado em diagnostico.json (' + r.snapshotMs + ' ms de leitura).' : 'Diagnóstico falhou.', r.ok ? 'ok' : 'bad');
      log(r.ok ? [JSON.stringify(r, null, 1)] : problems(r));
    });
  };
  if (cep) call('jobdir', function (r) { if (r.ok) status('Pronto. Abra a sequência e clique em “Ler timeline”.'); else { status('Abra um projeto e uma sequência.', 'bad'); log(problems(r)); } });
}());
