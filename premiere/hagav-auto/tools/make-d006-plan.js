/* Gera examples/d006.plan.json: o plano que eu (Claude) escrevo a partir dos 2 marcadores de pedido do D006.
   Os textos de conclusao vem do projeto real ja entregue, para o teste comparar 1:1. */
var fs = require('fs'), path = require('path');
var after = require('../test/fixtures/d006-depois.json'), before = require('../test/fixtures/d006-antes.json');
function mk(t, starts) { return after.markers.filter(function (m) { return Math.abs(m.start - t) < 0.02 && m.name.indexOf(starts) === 0; })[0]; }
var M = 'X:/midia/', g = [['V3', 'TOP-CARD'], ['V8', 'TOP-DATA'], ['V9', 'TOP-HORA'], ['V10', 'BUTTON-SURFACE'], ['V11', 'BUTTON-LABEL'], ['V13', 'BUTTON-ARROWS']];
var ops = g.map(function (x, i) { return { id: 'glass-' + (i + 1), type: 'place_item', track: x[0], start: 47.4, end: 51.6, media: M + 'D006-GLASS-' + x[1] + '.png' }; });
ops.push({ id: 'cta', type: 'place_item', track: 'V13', start: 51.6, end: 54.0333333333, srcIn: 1.5, media: M + 'CTA-05NOV-BOTAO.mp4' });
/* troca de camera 6,33–8,80 s confirmada pelo usuario naquela revisao: tela do Pontalti sai, tela da Sigrid entra */
ops.push({ id: 'cam-v4-off', type: 'set_enabled', clip: { track: 'V4', start: 6.3333333333 }, enabled: false });
ops.push({ id: 'cam-v5-on', type: 'set_enabled', clip: { track: 'V5', start: 6.3333333333 }, enabled: true });
var a = mk(47.4, 'CONCLU'), b = mk(51.6, 'CONCLU'), c = mk(0, 'QC');
ops.push({ id: 'mk-glass', type: 'set_marker', match: { time: 47.4, name: '' }, name: a.name, comments: a.comments });
ops.push({ id: 'mk-cta', type: 'set_marker', match: { time: 51.6, name: '' }, name: b.name, comments: b.comments });
ops.push({ id: 'mk-qc', type: 'set_marker', match: { time: 0, nameContains: 'TELAS V4/V5' }, name: c.name, comments: c.comments });
var plan = { schema: 'hagav-auto.plan.v1', id: 'd006-glass-cta-v1', sequence: { id: before.sequence.id, name: before.sequence.name }, ops: ops };
fs.writeFileSync(path.join(__dirname, '../examples/d006.plan.json'), JSON.stringify(plan, null, 1) + '\n');
