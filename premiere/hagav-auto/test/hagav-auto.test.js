'use strict';
var test = require('node:test'), assert = require('node:assert');
var HAGAV = require('../core/hagav-core.js'), createSim = require('../sim/premiere-sim.js').createSim;
var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
var BEFORE = require('./fixtures/d006-antes.json'), AFTER = require('./fixtures/d006-depois.json'), PLAN = require('../examples/d006.plan.json');
var MEDIA = PLAN.ops.filter(function (o) { return o.media; }).map(function (o) { return o.media; });

/* Gabarito = projeto real entregue. Unica diferenca fora do escopo da v1: o ultimo clipe de V1 foi
   reativado e realinhado a mao naquela sessao (slip) e 33 clipes receberam Lumetri. */
function expected() {
  var e = clone(AFTER), v1 = e.videoTracks[0].clips, b1 = BEFORE.videoTracks[0].clips;
  v1[v1.length - 1] = clone(b1[b1.length - 1]);
  return HAGAV.buildModel(e);
}
function sim(quirks, extra) { return createSim(clone(BEFORE), Object.assign({ media: MEDIA, quirks: quirks || {} }, extra || {})); }
function diffVsReal(s) { s.run('snapshot'); return HAGAV.compare(expected(), s.readJob('snapshot.json'), {}); }
function diffVsBefore(s) { s.run('snapshot'); return HAGAV.compare(HAGAV.buildModel(clone(BEFORE)), s.readJob('snapshot.json'), {}); }

test('D006: o plano reproduz a edicao real entregue, clipe a clipe e marcador a marcador', function () {
  var s = sim();
  s.writePlan(PLAN);
  var chk = s.run('check');
  assert.deepStrictEqual(chk.errors, []);
  var r = s.run('apply');
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors.concat(r.diffs)));
  assert.strictEqual(r.applied, 12);
  assert.deepStrictEqual(diffVsReal(s), []);
  assert.strictEqual(s.backups().length, 1, 'backup do projeto antes da primeira escrita');
  assert.strictEqual(r.saved, true);
  s.dispose();
});

test('D006 passa em todas as combinacoes de defeitos de host conhecidos', function () {
  [true, false].forEach(function (trimWorks) {
    ['ticks', 'seconds'].forEach(function (unit) {
      [0, 1, -1].forEach(function (extra) {
        ['en', 'pt'].forEach(function (locale) {
          var s = sim({ trimWorks: trimWorks, inOutUnit: unit, stillExtraFrames: extra, locale: locale });
          s.writePlan(PLAN);
          var r = s.run('apply');
          assert.strictEqual(r.ok, true, JSON.stringify({ trimWorks: trimWorks, unit: unit, extra: extra, errors: r.errors, diffs: r.diffs }));
          assert.deepStrictEqual(diffVsReal(s), []);
          s.dispose();
        });
      });
    });
  });
});

test('reexecutar o mesmo plano nao repete nada', function () {
  var s = sim();
  s.writePlan(PLAN);
  s.run('apply');
  var n = s.overwrites(), r = s.run('apply');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.applied, 0);
  assert.strictEqual(r.skipped, 12);
  assert.strictEqual(s.overwrites(), n);
  assert.deepStrictEqual(diffVsReal(s), []);
  s.dispose();
});

test('falha no meio (timeout do host): para, registra, e a retomada completa sem duplicar', function () {
  var s = sim({ failOverwriteAt: 4 });
  s.writePlan(PLAN);
  var r = s.run('apply');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.failedOp, 'glass-4');
  assert.strictEqual(r.applied, 3);
  s.setQuirk('failOverwriteAt', 0);
  r = s.run('apply');
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.skipped, 3);
  assert.strictEqual(r.applied, 9);
  assert.deepStrictEqual(diffVsReal(s), []);
  s.dispose();
});

test('plano perigoso e barrado inteiro antes de qualquer escrita', function () {
  var cases = [
    [{ id: 'x', type: 'place_item', track: 'V12', start: 47.4, end: 51.6, media: MEDIA[0] }, /ocupado/],
    [{ id: 'x', type: 'place_item', track: 'V20', start: 1, end: 2, media: MEDIA[0] }, /nao existe/],
    [{ id: 'x', type: 'set_props', clip: { track: 'V1', start: 0 }, position: [540, 960] }, /NORMALIZADOS/],
    [{ id: 'x', type: 'set_marker', match: { time: 12.3 }, name: 'a' }, /Nenhum marcador/],
    [{ id: 'x', type: 'set_marker', match: { time: 0 }, name: 'a' }, /Mais de um marcador/],
    [{ id: 'x', type: 'add_keyframes', clip: { track: 'V1', start: 0 }, property: 'position', keys: [{ t: 0, v: 1 }, { t: 1, v: 2 }] }, /escalar/],
    [{ id: 'x', type: 'remove_clip', clip: { track: 'V7', start: 8.8 } }, /nome exato/],
    [{ id: 'x', type: 'clone_mogrt', master: { track: 'V13', start: 0 }, track: 'V8', start: 1, end: 2, text: 'a' }, /experimental/]
  ];
  cases.forEach(function (c) {
    var s = sim(), p = clone(PLAN);
    p.ops.splice(3, 0, c[0]);
    s.writePlan(p);
    var r = s.run('apply');
    assert.strictEqual(r.ok, false);
    assert.match(r.errors.join(' | '), c[1]);
    assert.strictEqual(s.overwrites(), 0, 'nenhuma escrita');
    assert.strictEqual(s.backups().length, 0);
    assert.deepStrictEqual(diffVsBefore(s), []);
    s.dispose();
  });
  var s2 = sim(), p2 = clone(PLAN);
  p2.sequence.id = 'outra-sequencia';
  s2.writePlan(p2);
  assert.match(s2.run('apply').errors.join(' '), /outra sequencia/);
  s2.dispose();
});

test('a voz nunca e sobrescrita pelo audio de um video inserido', function () {
  /* video com audio sobre trecho em que A1 e A2 estao ocupadas: so A3 (livre) pode receber e descartar */
  var s = sim(), p = { schema: PLAN.schema, id: 'audio', sequence: PLAN.sequence, ops: [{ id: 'v', type: 'place_item', track: 'V8', start: 24, end: 26, media: MEDIA[6] }] };
  s.writePlan(p);
  var r = s.run('apply');
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors.concat(r.diffs)));
  s.run('snapshot');
  var snap = s.readJob('snapshot.json');
  assert.deepStrictEqual(snap.audioTracks.map(function (t) { return t.clips.length; }), BEFORE.audioTracks.map(function (t) { return t.clips.length; }));
  s.dispose();
  /* sem nenhuma faixa de audio livre: recusa */
  var b = clone(BEFORE);
  [1, 2].forEach(function (i) { b.audioTracks[i].clips.push({ name: 'ref.wav', start: 23.5, end: 30, inPoint: 0, outPoint: 6.5, enabled: true }); });
  s = createSim(b, { media: MEDIA });
  s.writePlan(p);
  r = s.run('apply');
  assert.match(r.errors.join(' '), /Nenhuma faixa de audio livre/);
  assert.strictEqual(s.overwrites(), 0);
  s.dispose();
  /* host sem overwrite dirigido: recusa antes de escrever, voz intacta */
  s = sim({ missingSeqOverwrite: true });
  s.writePlan(p);
  r = s.run('apply');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(s.overwrites(), 0);
  assert.deepStrictEqual(diffVsBefore(s), []);
  s.dispose();
});

test('legenda: troca so o texto do MOGRT e prova que o estilo ficou identico; clone experimental', function () {
  var b = clone(BEFORE), cap = b.videoTracks[11].clips[0];
  b.videoTracks[11].clips.forEach(function (c) { c.isMGT = true; c.text = 'Você pode estar "perdendo"'; });
  var s = createSim(b, { media: MEDIA, quirks: { trimWorks: true } });
  var p = { schema: PLAN.schema, id: 'txt', allowExperimental: true, sequence: PLAN.sequence, ops: [
    { id: 't1', type: 'set_mogrt_text', clip: { track: 'V12', start: cap.start }, text: 'Atenção: 18 de novembro\nàs 20h "ao vivo"' },
    { id: 'c1', type: 'clone_mogrt', master: { track: 'V12', start: cap.start }, track: 'V9', start: 2, end: 3.5, text: 'SAIBA MAIS' },
    { id: 'k1', type: 'add_keyframes', clip: { track: 'V9', start: 2 }, property: 'scale', keys: [{ t: 0, v: 100 }, { t: 0.5, v: 112 }] },
    { id: 'p1', type: 'set_props', clip: { track: 'V9', start: 2 }, position: [0.5, 0.52], opacity: 90 }
  ] };
  s.writePlan(p);
  var r = s.run('apply');
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors.concat(r.diffs)));
  s.run('snapshot');
  var snap = s.readJob('snapshot.json');
  assert.strictEqual(snap.videoTracks[11].clips[0].text, 'Atenção: 18 de novembro\nàs 20h "ao vivo"');
  assert.strictEqual(snap.videoTracks[8].clips[0].text, 'SAIBA MAIS');
  var raw = s.seq.videoTracks[11].clips[0].getMGTComponent().properties[1].getValue(), o = JSON.parse(raw);
  assert.strictEqual(o.fontEditValue[0], 'Poppins-ExtraBoldItalic');
  assert.strictEqual(o.fontTextRunLength[0], o.textEditValue.length);
  /* keyframes gravados no dominio da FONTE (entrada do MOGRT em 3600 s) */
  var keys = s.seq.videoTracks[8].clips[0].components[1].properties[1].getKeys().map(function (t) { return Math.round(t.seconds * 100) / 100; });
  assert.deepStrictEqual(keys, [3600, 3600.5]);
  s.dispose();
});

test('diagnostico e leitura de marcadores pendentes', function () {
  var s = sim({ locale: 'pt' }, { selection: function (seq) { return [seq.videoTracks[0].clips[0]]; } });
  var d = s.run('diagnostico');
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.clips[0].components[1].name, 'Movimento');
  var snap = s.run('snapshot');
  var pedidos = snap.pending.filter(function (m) { return m.kind === 'pedido' && m.name === ''; });
  assert.strictEqual(pedidos.length, 2);
  assert.match(pedidos[0].comments, /Lembrete/);
  s.dispose();
});

test('JSON proprio do nucleo (ExtendScript nao tem JSON)', function () {
  var o = { a: [1, 2.5, -3e2, true, null], s: 'ç"\\\n\u2028 – ok', n: { x: {} , y: [] } };
  assert.deepStrictEqual(HAGAV.parse(HAGAV.stringify(o)), o);
  assert.deepStrictEqual(HAGAV.parse(HAGAV.stringify(o, true)), o);
  assert.deepStrictEqual(HAGAV.parse(JSON.stringify(o)), o);
  assert.deepStrictEqual(JSON.parse(HAGAV.stringify(o)), o);
  assert.throws(function () { HAGAV.parse('{"a":1,}'); });
});
