/* HAGAV AUTO — executor dentro do Premiere (ExtendScript, ES3).
   Uma chamada do painel = um comando inteiro (snapshot | check | apply | diagnostico).
   Todo o plano roda numa unica chamada: cruzar a ponte painel<->ExtendScript a cada operacao e o que deixa lento.
   Nunca sobrescreve, nunca cria faixa, sempre rele o resultado e grava recibo por operacao. */
var HAGAVAuto = (function () {
  var TPS = 254016000000;
  var NAMES = {
    motion: ['Motion', 'Movimento'], opacityComp: ['Opacity', 'Opacidade'],
    scale: ['Scale', 'Escala'], position: ['Position', 'Posição', 'Posicao'],
    rotation: ['Rotation', 'Rotação', 'Rotacao'], opacity: ['Opacity', 'Opacidade']
  };

  function loadCore(extRoot) {
    if (typeof HAGAV !== 'undefined') return;
    var f = new File(extRoot + '/core/hagav-core.js');
    if (!f.exists) throw new Error('Nucleo nao encontrado: ' + f.fsName);
    $.evalFile(f);
  }

  /* ---------- basicos ---------- */
  function count(c) {
    var keys = ['numItems', 'numTracks', 'numMarkers', 'length'], i, n;
    if (!c) return 0;
    for (i = 0; i < keys.length; i++) { try { n = Number(c[keys[i]]); if (isFinite(n) && n >= 0) return n; } catch (e) {} }
    return 0;
  }
  function secOf(t) { try { return Number(t.seconds); } catch (e) { return NaN; } }
  function mkTime(seconds) { var t = new Time(); t.seconds = seconds; return t; }
  function now() { return new Date().getTime(); }
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function readFile(path) {
    var f = new File(path), s;
    if (!f.exists) return null;
    f.encoding = 'UTF-8';
    if (!f.open('r')) throw new Error('Nao foi possivel ler ' + path);
    s = f.read(); f.close();
    return s;
  }
  function writeFile(path, text) {
    var f = new File(path);
    f.encoding = 'UTF-8'; f.lineFeed = 'Unix';
    if (!f.open('w')) throw new Error('Nao foi possivel gravar ' + path);
    f.write(text); f.close();
  }
  function ensureFolder(path) {
    var f = new Folder(path);
    if (!f.exists && !f.create()) throw new Error('Nao foi possivel criar a pasta ' + path);
    return f;
  }
  function writeJson(path, obj) { writeFile(path, HAGAV.stringify(obj, true)); }
  function readJson(path) { var s = readFile(path); return s === null ? null : HAGAV.parse(s); }
  function normPath(p) { return HAGAV.lower(p).replace(/\\/g, '/'); }

  function activeSequence() {
    if (!app || !app.project) throw new Error('Nenhum projeto aberto.');
    var s = app.project.activeSequence;
    if (!s) throw new Error('Nenhuma sequencia ativa. Abra a sequencia na timeline.');
    return s;
  }
  function seqId(seq) { return HAGAV.lower(seq.sequenceID).replace(/[{}]/g, ''); }
  function fpsOf(seq) {
    var tb = Number(seq.timebase);
    return (isFinite(tb) && tb > 0) ? Math.round(TPS / tb * 1000) / 1000 : 30;
  }
  function defaultJobDir() {
    var seq = activeSequence(), base = ensureFolder(Folder.myDocuments.fsName + '/HAGAV-AUTO');
    return base.fsName + '/' + HAGAV.str(seq.name).replace(/[^A-Za-z0-9_\-]+/g, '_').substring(0, 60) + '_' + seqId(seq).substring(0, 8);
  }

  /* ---------- leitura da timeline ---------- */
  function textParam(clip) {
    var comp, i, n, p, v, found = null;
    if (typeof clip.getMGTComponent !== 'function') return null;
    comp = clip.getMGTComponent();
    if (!comp || !comp.properties) return null;
    n = count(comp.properties);
    for (i = 0; i < n; i++) {
      p = comp.properties[i];
      try { v = p.getValue(); } catch (e) { continue; }
      if (typeof v === 'string' && v.indexOf('"textEditValue"') >= 0) {
        if (found) throw new Error('MOGRT com mais de um campo de texto; escrita recusada.');
        found = { prop: p, raw: v };
      }
    }
    return found;
  }
  function isMGT(clip) { try { return typeof clip.isMGT === 'function' && !!clip.isMGT(); } catch (e) { return false; } }
  function clipInfo(clip, withText) {
    var o = { nodeId: HAGAV.str(clip.nodeId), name: HAGAV.str(clip.name), start: secOf(clip.start), end: secOf(clip.end), inPoint: secOf(clip.inPoint), outPoint: secOf(clip.outPoint), enabled: !clip.disabled, isMGT: isMGT(clip), mediaPath: '' }, tp;
    try { if (clip.projectItem && typeof clip.projectItem.getMediaPath === 'function') o.mediaPath = HAGAV.str(clip.projectItem.getMediaPath()); } catch (e) {}
    if (withText && o.isMGT) { try { tp = textParam(clip); if (tp) o.text = HAGAV.mogrtText(tp.raw).text; } catch (e2) { o.textError = HAGAV.str(e2.message); } }
    return o;
  }
  function snapshot(seq, withText) {
    var out = { schema: 'hagav-auto.snapshot.v1', source: 'premiere', takenAt: stamp(),
      project: { name: HAGAV.str(app.project.name), path: HAGAV.str(app.project.path) },
      sequence: { id: seqId(seq), name: HAGAV.str(seq.name), fps: fpsOf(seq), width: Number(seq.frameSizeHorizontal), height: Number(seq.frameSizeVertical), durationSec: Number(seq.end) / TPS },
      videoTracks: [], audioTracks: [], markers: [] }, g, groups = [seq.videoTracks, seq.audioTracks], t, n, tr, c, cn, o, m;
    for (g = 0; g < 2; g++) {
      n = count(groups[g]);
      for (t = 0; t < n; t++) {
        tr = groups[g][t];
        o = { index: t, id: (g === 0 ? 'V' : 'A') + (t + 1), name: HAGAV.str(tr.name), locked: false, muted: false, clips: [] };
        try { if (typeof tr.isLocked === 'function') o.locked = !!tr.isLocked(); } catch (e) {}
        try { if (typeof tr.isMuted === 'function') o.muted = !!tr.isMuted(); } catch (e2) {}
        cn = count(tr.clips);
        for (c = 0; c < cn; c++) o.clips.push(clipInfo(tr.clips[c], withText && g === 0));
        out[g === 0 ? 'videoTracks' : 'audioTracks'].push(o);
      }
    }
    if (seq.markers) {
      m = seq.markers.getFirstMarker();
      while (m) {
        out.markers.push({ guid: HAGAV.str(m.guid), start: secOf(m.start), end: secOf(m.end), name: HAGAV.str(m.name), comments: HAGAV.str(m.comments).replace(/\r\n/g, '\n') });
        m = seq.markers.getNextMarker(m);
      }
    }
    return out;
  }

  /* ---------- localizar coisas ---------- */
  function trackAt(seq, kind, index) {
    var tr = (kind === 'V' ? seq.videoTracks : seq.audioTracks)[index];
    if (!tr) throw new Error('Faixa ' + kind + (index + 1) + ' nao encontrada.');
    return tr;
  }
  function findClip(seq, ref, fps) {
    var tr = trackAt(seq, ref.kind || 'V', ref.trackIndex), n = count(tr.clips), i, c, hit = null, s = HAGAV.fr(ref.start, fps);
    for (i = 0; i < n; i++) {
      c = tr.clips[i];
      if (HAGAV.fr(secOf(c.start), fps) !== s) continue;
      if (ref.name && HAGAV.str(c.name) !== ref.name) continue;
      if (hit) throw new Error('Mais de um clipe corresponde ao alvo em ' + ref.track + '.');
      hit = c;
    }
    if (!hit) throw new Error('Clipe alvo nao encontrado em ' + ref.track + ' em ' + ref.start + ' s.');
    return hit;
  }
  function idMap(tr) {
    var m = {}, n = count(tr.clips), i;
    for (i = 0; i < n; i++) m[HAGAV.str(tr.clips[i].nodeId)] = HAGAV.fr(secOf(tr.clips[i].start), 1000) + '|' + HAGAV.fr(secOf(tr.clips[i].end), 1000);
    return m;
  }
  function newClips(tr, before) {
    var out = [], n = count(tr.clips), i;
    for (i = 0; i < n; i++) if (!HAGAV.has(before, HAGAV.str(tr.clips[i].nodeId))) out.push(tr.clips[i]);
    return out;
  }
  function audioState(seq) {
    var out = [], n = count(seq.audioTracks), i;
    for (i = 0; i < n; i++) out.push(idMap(seq.audioTracks[i]));
    return out;
  }
  function findItemByPath(item, wanted) {
    var n, i, child, hit;
    if (!item || !item.children) return null;
    n = count(item.children);
    for (i = 0; i < n; i++) {
      child = item.children[i];
      try { if (typeof child.getMediaPath === 'function' && normPath(child.getMediaPath()) === wanted) return child; } catch (e) {}
      if (child.children && count(child.children)) { hit = findItemByPath(child, wanted); if (hit) return hit; }
    }
    return null;
  }
  function findBin(name) {
    var root = app.project.rootItem, n = count(root.children), i;
    for (i = 0; i < n; i++) if (HAGAV.str(root.children[i].name) === name && root.children[i].children) return root.children[i];
    return root.createBin(name);
  }
  function findOrImport(media) {
    var wanted = normPath(media), item = findItemByPath(app.project.rootItem, wanted);
    if (item) return item;
    if (!new File(media).exists) throw new Error('Arquivo nao existe no disco: ' + media);
    app.project.importFiles([media], true, findBin('HAGAV AUTO'), false);
    item = findItemByPath(app.project.rootItem, wanted);
    if (!item) throw new Error('Importacao nao apareceu no projeto: ' + media);
    return item;
  }
  function setInOut(item, a, b) {
    var got = NaN;
    item.setInPoint(mkTime(a).ticks, 4); item.setOutPoint(mkTime(b).ticks, 4);
    /* Se o host leu os ticks como segundos, a saida relida fica absurda: so entao troca de unidade. */
    try { if (typeof item.getOutPoint === 'function') got = secOf(item.getOutPoint(1)); } catch (e) {}
    if (isFinite(got) && got > b * 1000 + 1000) { item.setInPoint(a, 4); item.setOutPoint(b, 4); }
  }
  function clearInOut(item) {
    try { if (typeof item.clearInPoint === 'function') item.clearInPoint(); if (typeof item.clearOutPoint === 'function') item.clearOutPoint(); } catch (e) {}
  }

  /* ---------- operacoes ---------- */
  function placeOnce(seq, op, item, fps, outAdjust) {
    var vKind = op.kind === 'V', tr = trackAt(seq, op.kind, op.trackIndex), before = idMap(tr), dur = op.end - op.start, a = op.still ? 0 : op.srcIn, made;
    /* Sem overwrite com faixa de audio dirigida, o audio do video cairia numa faixa que nao escolhemos: recusa antes de escrever. */
    if (vKind && !op.still && typeof seq.overwriteClip !== 'function') throw new Error('Este Premiere nao expoe sequence.overwriteClip; video com audio nao e inserido para nao arriscar a voz.');
    setInOut(item, a, a + dur + outAdjust);
    if (vKind && !op.still && typeof seq.overwriteClip === 'function') seq.overwriteClip(item, mkTime(op.start), op.trackIndex, op.audioTrackIndex);
    else tr.overwriteClip(item, op.start);
    made = newClips(tr, before);
    if (made.length !== 1) throw new Error('Esperado 1 clipe novo em ' + op.track + ', surgiram ' + made.length + '.');
    return made[0];
  }
  function doPlace(seq, op, fps) {
    var item = findOrImport(op.media), audioBefore = audioState(seq), clip, gotS, gotE, i, j, made, tr, after, key, detail = {};
    try {
      clip = placeOnce(seq, op, item, fps, 0);
      gotS = HAGAV.fr(secOf(clip.start), fps); gotE = HAGAV.fr(secOf(clip.end), fps);
      if (gotS === op.startFrame && gotE !== op.endFrame) {
        try { clip.end = mkTime(op.end); } catch (e) {}
        gotE = HAGAV.fr(secOf(clip.end), fps);
        if (gotE !== op.endFrame) {
          /* a borda nao se move neste host: remove so o clipe recem-criado e refaz com a saida compensada */
          detail.retry = (op.endFrame - gotE) + ' quadro(s)';
          clip.remove(false, false);
          clip = placeOnce(seq, op, item, fps, (op.endFrame - gotE) / fps);
          gotS = HAGAV.fr(secOf(clip.start), fps); gotE = HAGAV.fr(secOf(clip.end), fps);
        }
      }
      if (gotS !== op.startFrame || gotE !== op.endFrame) {
        clip.remove(false, false);
        throw new Error('Clipe ficou em ' + (gotS / fps) + '–' + (gotE / fps) + ' s em vez de ' + op.start + '–' + op.end + ' s; removido.');
      }
    } finally {
      clearInOut(item);
    }
    /* audio: nada que ja existia pode mudar; o que nasceu junto so fica se keepAudio */
    after = audioState(seq);
    for (i = 0; i < audioBefore.length; i++) {
      for (key in audioBefore[i]) if (HAGAV.has(audioBefore[i], key) && after[i][key] !== audioBefore[i][key]) throw new Error('Audio existente em A' + (i + 1) + ' foi alterado pela insercao. PARE e confira a faixa.');
      tr = seq.audioTracks[i]; made = newClips(tr, audioBefore[i]);
      for (j = made.length - 1; j >= 0; j--) {
        if (op.keepAudio && i === op.audioTrackIndex) { detail.audio = 'mantido em A' + (i + 1); continue; }
        made[j].remove(false, false); detail.audioRemovido = 'A' + (i + 1);
      }
    }
    detail.start = secOf(clip.start); detail.end = secOf(clip.end); detail.nodeId = HAGAV.str(clip.nodeId);
    return detail;
  }
  function findMarker(seq, op, fps) {
    var m = seq.markers.getFirstMarker(), hit = null, s = HAGAV.fr(op.time, fps), mt = op.match;
    while (m) {
      if (HAGAV.fr(secOf(m.start), fps) === s &&
          (!HAGAV.has(mt, 'name') || HAGAV.str(m.name) === mt.name) &&
          (!mt.nameContains || HAGAV.lower(m.name).indexOf(HAGAV.lower(mt.nameContains)) >= 0) &&
          (!mt.commentContains || HAGAV.lower(m.comments).indexOf(HAGAV.lower(mt.commentContains)) >= 0)) {
        if (hit) throw new Error('Mais de um marcador corresponde.');
        hit = m;
      }
      m = seq.markers.getNextMarker(m);
    }
    if (!hit) throw new Error('Marcador nao encontrado em ' + op.time + ' s.');
    return hit;
  }
  function writeMarker(m, op) {
    if (HAGAV.has(op, 'name')) m.name = op.name;
    if (HAGAV.has(op, 'comments')) m.comments = op.comments;
    if (HAGAV.has(op, 'colorIndex') && typeof m.setColorByIndex === 'function') m.setColorByIndex(op.colorIndex);
    if (HAGAV.has(op, 'name') && HAGAV.str(m.name) !== op.name) throw new Error('Nome do marcador nao foi gravado.');
    return { name: HAGAV.str(m.name) };
  }
  function byName(coll, names) {
    var n = count(coll), i, j, dn;
    for (i = 0; i < n; i++) {
      dn = HAGAV.str(coll[i].displayName);
      for (j = 0; j < names.length; j++) if (dn === names[j]) return coll[i];
    }
    return null;
  }
  function propOf(clip, key) {
    var comp = byName(clip.components, key === 'opacity' ? NAMES.opacityComp : NAMES.motion), p;
    if (!comp) throw new Error('Componente ' + (key === 'opacity' ? 'Opacity' : 'Motion') + ' nao encontrado no clipe (idioma do Premiere? rode o Diagnostico).');
    p = byName(comp.properties, NAMES[key]);
    if (!p) throw new Error('Propriedade ' + key + ' nao encontrada.');
    return p;
  }
  function near(a, b) { return Math.abs(Number(a) - Number(b)) < 0.0015; }
  function doProps(seq, op, fps) {
    var clip = findClip(seq, op.clip, fps), key, p, v, out = {};
    for (key in op.props) {
      if (!HAGAV.has(op.props, key)) continue;
      p = propOf(clip, key);
      p.setValue(op.props[key], true);
      v = p.getValue();
      if (key === 'position' ? !(v && near(v[0], op.props[key][0]) && near(v[1], op.props[key][1])) : !near(v, op.props[key])) throw new Error(key + ' nao confirmou na releitura (lido ' + HAGAV.stringify(v) + ').');
      out[key] = v;
    }
    return out;
  }
  function doKeys(seq, op, fps) {
    var clip = findClip(seq, op.clip, fps), p = propOf(clip, op.property), base = secOf(clip.inPoint), mode = op.interpolation === 'linear' ? 0 : op.interpolation === 'hold' ? 4 : 5, i, t, keys, k, ok, read = [];
    if (!p.isTimeVarying()) p.setTimeVarying(true);
    for (i = 0; i < op.keys.length; i++) {
      t = base + op.keys[i].t; /* dominio da FONTE: clipe com entrada em 3600 s precisa de 3600 + t */
      p.addKey(t); p.setValueAtKey(t, op.keys[i].v, true);
      try { p.setInterpolationTypeAtKey(t, mode, true); } catch (e) {}
    }
    keys = p.getKeys() || [];
    for (k = 0; k < keys.length; k++) read.push(secOf(keys[k]) - base);
    for (i = 0; i < op.keys.length; i++) {
      ok = false;
      for (k = 0; k < read.length; k++) if (Math.abs(read[k] - op.keys[i].t) < 0.5 / fps) ok = true;
      if (!ok) throw new Error('Keyframe em ' + op.keys[i].t + ' s nao confirmou. Lidos: ' + HAGAV.stringify(read));
    }
    return { keys: read.length };
  }
  function setText(clip, text) {
    var tp = textParam(clip), before, next, after;
    if (!tp) throw new Error('Clipe sem campo de texto de MOGRT.');
    before = HAGAV.mogrtText(tp.raw);
    next = HAGAV.mogrtText(tp.raw, text);
    tp.prop.setValue(next.raw, true);
    after = HAGAV.mogrtText(HAGAV.str(tp.prop.getValue()));
    if (after.text !== text) throw new Error('Texto nao confirmou na releitura.');
    if (after.rest !== before.rest) throw new Error('Fonte/estilo do MOGRT mudou durante a escrita. Conferir o clipe.');
    return { text: after.text };
  }
  function doClone(seq, op, fps) {
    var master = findClip(seq, { kind: 'V', trackIndex: HAGAV.parseTrack(op.master.track).index, track: op.master.track, start: op.master.start, name: op.master.name }, fps),
      tr = trackAt(seq, 'V', op.trackIndex), before = idMap(tr), made, clip, mc, nc, n, i, v, keys = ['scale', 'position', 'rotation', 'opacity'];
    tr.overwriteClip(master.projectItem, op.start);
    made = newClips(tr, before);
    if (made.length !== 1) throw new Error('Clone: esperado 1 clipe novo, surgiram ' + made.length + '.');
    clip = made[0];
    try {
      mc = master.getMGTComponent(); nc = clip.getMGTComponent(); n = count(mc.properties);
      if (count(nc.properties) !== n) throw new Error('Clone com parametros diferentes do master.');
      for (i = 0; i < n; i++) { try { v = mc.properties[i].getValue(); nc.properties[i].setValue(v, false); } catch (e) {} }
      for (i = 0; i < keys.length; i++) { try { propOf(clip, keys[i]).setValue(propOf(master, keys[i]).getValue(), false); } catch (e2) {} }
      clip.end = mkTime(op.end);
      if (HAGAV.fr(secOf(clip.start), fps) !== op.startFrame || HAGAV.fr(secOf(clip.end), fps) !== op.endFrame) throw new Error('Clone ficou em ' + secOf(clip.start) + '–' + secOf(clip.end) + ' s.');
      return setText(clip, op.text);
    } catch (err) {
      clip.remove(false, false);
      throw err;
    }
  }
  function execOp(seq, op, fps) {
    var clip, m;
    if (op.type === 'place_item') return doPlace(seq, op, fps);
    if (op.type === 'clone_mogrt') return doClone(seq, op, fps);
    if (op.type === 'set_marker') return writeMarker(findMarker(seq, op, fps), op);
    if (op.type === 'add_marker') { m = seq.markers.createMarker(op.time); return writeMarker(m, op); }
    if (op.type === 'set_props') return doProps(seq, op, fps);
    if (op.type === 'add_keyframes') return doKeys(seq, op, fps);
    clip = findClip(seq, op.clip, fps);
    if (op.type === 'set_mogrt_text') return setText(clip, op.text);
    if (op.type === 'set_enabled') { clip.disabled = !op.enabled; if (!clip.disabled !== op.enabled) throw new Error('Estado nao confirmou.'); return { enabled: op.enabled }; }
    if (op.type === 'remove_clip') { clip.remove(false, false); return { removed: op.clip.name }; }
    throw new Error('Operacao sem executor: ' + op.type);
  }

  /* ---------- comandos ---------- */
  function backup(jobDir) {
    var src, dir, dest;
    app.project.save();
    src = new File(app.project.path);
    if (!src.exists) throw new Error('Projeto ainda nao foi salvo em disco; salve antes de aplicar.');
    dir = ensureFolder(jobDir + '/backups');
    dest = new File(dir.fsName + '/' + stamp() + '_' + HAGAV.str(src.name));
    if (!src.copy(dest.fsName) || !dest.exists || dest.length !== src.length) throw new Error('Backup do projeto falhou; nada foi alterado.');
    return dest.fsName;
  }
  function doneMap(receipts) {
    var d = {}, k;
    for (k in receipts.ops) if (HAGAV.has(receipts.ops, k) && receipts.ops[k].status === 'ok') d[k] = 1;
    return d;
  }
  function loadPlan(jobDir, seq) {
    var plan = readJson(jobDir + '/plan.json'), rc;
    if (!plan) throw new Error('plan.json nao encontrado em ' + jobDir);
    rc = readJson(jobDir + '/receipts.json');
    if (!rc || rc.planId !== HAGAV.str(plan.id) || rc.sequenceId !== seqId(seq)) rc = { planId: HAGAV.str(plan.id), sequenceId: seqId(seq), ops: {} };
    return { plan: plan, receipts: rc };
  }
  function cmdSnapshot(jobDir) {
    var seq = activeSequence(), t0 = now(), snap = snapshot(seq, true);
    writeJson(jobDir + '/snapshot.json', snap);
    return { ok: true, sequence: snap.sequence, pending: HAGAV.pendingMarkers(snap), ms: now() - t0, file: jobDir + '/snapshot.json' };
  }
  function cmdCheck(jobDir) {
    var seq = activeSequence(), ld = loadPlan(jobDir, seq), pf = HAGAV.preflight(ld.plan, snapshot(seq, false), doneMap(ld.receipts)), todo = 0, i;
    for (i = 0; i < pf.ops.length; i++) if (!pf.ops[i].skip) todo++;
    return { ok: pf.ok, errors: pf.errors, warnings: pf.warnings, total: pf.ops.length, pendentes: todo };
  }
  function cmdApply(jobDir) {
    var seq = activeSequence(), t0 = now(), fps = fpsOf(seq), ld = loadPlan(jobDir, seq), pf, res, i, op, t1, detail, diffs, wrote = false;
    pf = HAGAV.preflight(ld.plan, snapshot(seq, false), doneMap(ld.receipts));
    res = { ok: false, planId: ld.receipts.planId, sequence: HAGAV.str(seq.name), errors: pf.errors, warnings: pf.warnings, applied: 0, skipped: 0, failedOp: null, timings: [], diffs: [] };
    if (!pf.ok) { res.stage = 'preflight'; writeJson(jobDir + '/result.json', res); return res; }
    for (i = 0; i < pf.ops.length; i++) {
      op = pf.ops[i];
      if (op.skip) { res.skipped++; continue; }
      if (!wrote) { res.backup = backup(jobDir); wrote = true; }
      t1 = now();
      try {
        detail = execOp(seq, op, fps);
        ld.receipts.ops[op.id] = { status: 'ok', type: op.type, ms: now() - t1, at: stamp(), detail: detail };
        res.applied++;
      } catch (e) {
        ld.receipts.ops[op.id] = { status: 'failed', type: op.type, ms: now() - t1, at: stamp(), error: HAGAV.str(e.message) };
        res.failedOp = op.id; res.errors.push('[' + op.id + '] ' + HAGAV.str(e.message));
      }
      res.timings.push({ id: op.id, type: op.type, ms: now() - t1 });
      writeJson(jobDir + '/receipts.json', ld.receipts); /* recibo a cada operacao: se travar, a retomada nao repete nada */
      if (res.failedOp) break;
    }
    if (!res.failedOp) {
      diffs = HAGAV.compare(pf.expected, snapshot(seq, false), { ignoreMarkers: false });
      res.diffs = diffs;
      res.ok = diffs.length === 0;
      if (res.ok && wrote && ld.plan.save !== false) { app.project.save(); res.saved = true; }
    }
    res.totalMs = now() - t0;
    res.perf = perfNote(res, seq);
    writeJson(jobDir + '/result.json', res);
    return res;
  }
  /* Registro de velocidade: separa "plano grande" de "maquina/timeline lenta". */
  function perfNote(res, seq) {
    var i, slow = [], worst = 0, clips = 0, t, n = count(seq.videoTracks);
    for (t = 0; t < n; t++) clips += count(seq.videoTracks[t].clips);
    for (i = 0; i < res.timings.length; i++) { if (res.timings[i].ms > worst) worst = res.timings[i].ms; if (res.timings[i].ms > 2500) slow.push(res.timings[i].id + ' ' + res.timings[i].ms + ' ms'); }
    return { os: HAGAV.str($.os), premiere: HAGAV.str(app.version), clipesDeVideo: clips, piorOperacaoMs: worst, operacoesLentas: slow,
      leitura: slow.length ? 'Ha operacoes acima de 2,5 s. Se a timeline tem poucos clipes, o gargalo e disco/RAM/GPU desta maquina; se tem centenas, e o custo normal do Premiere em timeline cheia.' : 'Sem gargalo de maquina nesta execucao.' };
  }
  function cmdDiagnostico(jobDir) {
    var seq = activeSequence(), t0 = now(), out = { ok: true, premiere: HAGAV.str(app.version), os: HAGAV.str($.os), core: HAGAV.VERSION, sequence: HAGAV.str(seq.name), fps: fpsOf(seq), api: {}, clips: [] }, sel, i, c, k, j, comp, o, tp, snap;
    out.api.seqOverwriteClip = typeof seq.overwriteClip; out.api.createSubsequence = typeof seq.createSubsequence;
    out.api.trackOverwriteClip = count(seq.videoTracks) ? typeof seq.videoTracks[0].overwriteClip : 'sem faixa';
    out.api.trackIsLocked = count(seq.videoTracks) ? typeof seq.videoTracks[0].isLocked : 'sem faixa';
    out.api.json = typeof JSON; out.api.qe = typeof qe;
    sel = typeof seq.getSelection === 'function' ? seq.getSelection() : [];
    for (i = 0; i < count(sel) && i < 6; i++) {
      c = sel[i]; o = { name: HAGAV.str(c.name), isMGT: isMGT(c), start: secOf(c.start), inPoint: secOf(c.inPoint), components: [] };
      for (k = 0; k < count(c.components); k++) {
        comp = { name: HAGAV.str(c.components[k].displayName), props: [] };
        for (j = 0; j < count(c.components[k].properties) && j < 24; j++) {
          try { comp.props.push(HAGAV.str(c.components[k].properties[j].displayName) + ' = ' + HAGAV.stringify(c.components[k].properties[j].getValue()).substring(0, 60)); } catch (e) { comp.props.push('?'); }
        }
        o.components.push(comp);
      }
      if (o.isMGT) { try { tp = textParam(c); o.text = tp ? HAGAV.mogrtText(tp.raw).text : null; o.textoEditavel = !!tp; } catch (e2) { o.textoErro = HAGAV.str(e2.message); } }
      out.clips.push(o);
    }
    snap = snapshot(seq, true);
    out.snapshotMs = now() - t0; out.pending = HAGAV.pendingMarkers(snap).length;
    out.nota = out.clips.length ? '' : 'Selecione 1 legenda (MOGRT) e 1 clipe de video e rode de novo para o relatorio completo.';
    writeJson(jobDir + '/diagnostico.json', out);
    return out;
  }

  function run(cmd, jobDir, extRoot) {
    var out;
    try {
      loadCore(extRoot);
      if (cmd === 'jobdir') return HAGAV.stringify({ ok: true, jobDir: defaultJobDir() });
      if (!jobDir) jobDir = defaultJobDir();
      ensureFolder(jobDir);
      if (cmd === 'snapshot') out = cmdSnapshot(jobDir);
      else if (cmd === 'check') out = cmdCheck(jobDir);
      else if (cmd === 'apply') out = cmdApply(jobDir);
      else if (cmd === 'diagnostico') out = cmdDiagnostico(jobDir);
      else throw new Error('Comando desconhecido: ' + cmd);
      out.jobDir = jobDir;
      return HAGAV.stringify(out);
    } catch (e) {
      return '{"ok":false,"errors":[' + (typeof HAGAV !== 'undefined' ? HAGAV.stringify(String(e.message || e)) : '"' + String(e.message || e).replace(/["\\\n\r]/g, ' ') + '"') + ']}';
    }
  }

  return { run: run };
}());
