/* HAGAV AUTO — nucleo compartilhado (painel do Premiere + Node).
   ES3 puro: roda dentro do ExtendScript. Nao usar map/forEach/indexOf de array, Object.keys, let/const, JSON nativo.
   Responsavel por: validar o plano ANTES de qualquer escrita (preflight), calcular o estado esperado
   e comparar com a releitura da timeline. Nenhuma funcao aqui toca o Premiere. */
var HAGAV = (function () {
  var VERSION = '0.1.0';
  var DONE_PREFIX = 'CONCLUÍDO';

  /* ---------- utilitarios ES3 ---------- */
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return v === null || typeof v === 'undefined' ? '' : String(v); }
  function trim(s) { return str(s).replace(/^\s+|\s+$/g, ''); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function lower(s) { return str(s).toLowerCase(); }

  /* ---------- JSON (o ExtendScript nao tem JSON nativo) ---------- */
  function quote(s) {
    return '"' + str(s).replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
      if (c === '\\') return '\\\\';
      if (c === '"') return '\\"';
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      var h = c.charCodeAt(0).toString(16);
      while (h.length < 4) h = '0' + h;
      return '\\u' + h;
    }) + '"';
  }
  function stringify(v, indent, depth) {
    var t = typeof v, parts = [], i, k, pad = '', padIn = '', nl = '';
    depth = depth || 0;
    if (v === null || t === 'undefined' || t === 'function') return 'null';
    if (t === 'string') return quote(v);
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (depth > 40) return '"[profundidade]"';
    if (indent) { nl = '\n'; for (i = 0; i < depth; i++) pad += ' '; padIn = pad + ' '; }
    if (isArr(v)) {
      for (i = 0; i < v.length; i++) parts.push(padIn + stringify(v[i], indent, depth + 1));
      return parts.length ? '[' + nl + parts.join(',' + nl) + nl + pad + ']' : '[]';
    }
    for (k in v) {
      if (has(v, k) && typeof v[k] !== 'function' && typeof v[k] !== 'undefined') {
        parts.push(padIn + quote(k) + ':' + (indent ? ' ' : '') + stringify(v[k], indent, depth + 1));
      }
    }
    return parts.length ? '{' + nl + parts.join(',' + nl) + nl + pad + '}' : '{}';
  }
  function parse(text) {
    var s = str(text).replace(/^﻿/, ''), i = 0, n = s.length;
    function fail(m) { throw new Error('JSON invalido (' + m + ') na posicao ' + i); }
    function ws() { while (i < n && /\s/.test(s.charAt(i))) i++; }
    function value() {
      ws();
      var c = s.charAt(i), o, k, a, start, m;
      if (c === '{') {
        i++; o = {}; ws();
        if (s.charAt(i) === '}') { i++; return o; }
        while (true) {
          ws(); if (s.charAt(i) !== '"') fail('chave');
          k = string(); ws(); if (s.charAt(i) !== ':') fail(':');
          i++; o[k] = value(); ws();
          if (s.charAt(i) === ',') { i++; continue; }
          if (s.charAt(i) === '}') { i++; return o; }
          fail('objeto');
        }
      }
      if (c === '[') {
        i++; a = []; ws();
        if (s.charAt(i) === ']') { i++; return a; }
        while (true) {
          a.push(value()); ws();
          if (s.charAt(i) === ',') { i++; continue; }
          if (s.charAt(i) === ']') { i++; return a; }
          fail('lista');
        }
      }
      if (c === '"') return string();
      if (s.substr(i, 4) === 'true') { i += 4; return true; }
      if (s.substr(i, 5) === 'false') { i += 5; return false; }
      if (s.substr(i, 4) === 'null') { i += 4; return null; }
      start = i;
      while (i < n && /[-+0-9.eE]/.test(s.charAt(i))) i++;
      m = s.substring(start, i);
      if (!m || !isFinite(Number(m))) fail('valor');
      return Number(m);
    }
    function string() {
      var out = '', c, e;
      i++;
      while (i < n) {
        c = s.charAt(i++);
        if (c === '"') return out;
        if (c !== '\\') { out += c; continue; }
        e = s.charAt(i++);
        if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === 'u') { out += String.fromCharCode(parseInt(s.substr(i, 4), 16)); i += 4; }
        else out += e;
      }
      fail('texto');
    }
    var result = value();
    ws();
    if (i < n) fail('sobra');
    return result;
  }

  /* ---------- tempo: tudo e comparado em quadros inteiros ---------- */
  function fr(sec, fps) { return Math.round(Number(sec) * fps + 1e-7); }
  function snap(sec, fps) { return fr(sec, fps) / fps; }

  function parseTrack(id) {
    var m = /^([VA])(\d+)$/i.exec(trim(id));
    if (!m) return null;
    return { kind: m[1].toUpperCase(), index: Number(m[2]) - 1, id: m[1].toUpperCase() + Number(m[2]) };
  }
  function isStill(name) { return /\.(png|jpe?g|tiff?|psd|bmp|gif|webp)$/i.test(str(name)); }
  function isAudioOnly(name) { return /\.(wav|mp3|aac|m4a|aif|aiff|flac|ogg)$/i.test(str(name)); }
  function baseName(p) { return str(p).replace(/^.*[\\\/]/, ''); }

  /* ---------- modelo: copia leve do snapshot, em quadros ---------- */
  function buildModel(snapshot) {
    var fps = snapshot.sequence.fps, model = { fps: fps, V: [], A: [], markers: [] }, g, t, c, tr, src, list, cl;
    for (g = 0; g < 2; g++) {
      list = g === 0 ? snapshot.videoTracks : snapshot.audioTracks;
      for (t = 0; t < list.length; t++) {
        src = list[t];
        tr = { index: t, id: (g === 0 ? 'V' : 'A') + (t + 1), name: src.name, locked: !!src.locked, clips: [] };
        for (c = 0; c < src.clips.length; c++) {
          cl = src.clips[c];
          tr.clips.push({ name: cl.name, s: fr(cl.start, fps), e: fr(cl.end, fps), i: fr(cl.inPoint, fps), enabled: cl.enabled !== false, isMGT: !!cl.isMGT, text: cl.text, nodeId: cl.nodeId });
        }
        model[g === 0 ? 'V' : 'A'].push(tr);
      }
    }
    for (c = 0; c < snapshot.markers.length; c++) {
      model.markers.push({ s: fr(snapshot.markers[c].start, fps), name: str(snapshot.markers[c].name), comments: str(snapshot.markers[c].comments) });
    }
    return model;
  }
  function trackOf(model, id) {
    var p = parseTrack(id);
    if (!p) return null;
    return model[p.kind][p.index] || null;
  }
  function busy(track, s, e) {
    var i, c;
    for (i = 0; i < track.clips.length; i++) { c = track.clips[i]; if (c.s < e && c.e > s) return c; }
    return null;
  }
  function findClips(model, ref) {
    var tr = ref ? trackOf(model, ref.track) : null, out = [], i, c, s;
    if (!tr || !isNum(ref.start)) return out;
    s = fr(ref.start, model.fps);
    for (i = 0; i < tr.clips.length; i++) {
      c = tr.clips[i];
      if (c.s === s && (!ref.name || c.name === ref.name)) out.push(c);
    }
    return out;
  }
  function findMarkers(model, match) {
    var out = [], i, m, s = fr(match.time, model.fps);
    for (i = 0; i < model.markers.length; i++) {
      m = model.markers[i];
      if (m.s !== s) continue;
      if (has(match, 'name') && m.name !== match.name) continue;
      if (match.nameContains && lower(m.name).indexOf(lower(match.nameContains)) < 0) continue;
      if (match.commentContains && lower(m.comments).indexOf(lower(match.commentContains)) < 0) continue;
      out.push(m);
    }
    return out;
  }

  var SCALAR_PROPS = { scale: 1, rotation: 1, opacity: 1 };

  /* ---------- preflight: valida o plano inteiro e devolve o estado esperado ----------
     Regra central aprendida nas edicoes anteriores: NUNCA sobrescrever nada, nunca criar faixa,
     nunca escrever em faixa travada, nunca aceitar alvo ambiguo. Se houver 1 erro, nada e aplicado. */
  function preflight(plan, snapshot, done) {
    var errors = [], warnings = [], ops = [], ids = {}, model, fps, i, op, n, tr, s, e, hit, list, a, k, key, scratch, dur;
    function err(m) { errors.push((op && op.id ? '[' + op.id + '] ' : '') + m); }
    function warn(m) { warnings.push((op && op.id ? '[' + op.id + '] ' : '') + m); }

    if (!plan || plan.schema !== 'hagav-auto.plan.v1') { errors.push('Plano sem schema hagav-auto.plan.v1.'); return { ok: false, errors: errors, warnings: warnings, ops: [] }; }
    if (!snapshot || !snapshot.sequence) { errors.push('Snapshot ausente.'); return { ok: false, errors: errors, warnings: warnings, ops: [] }; }
    if (!plan.sequence || !plan.sequence.id) errors.push('Plano precisa declarar sequence.id (GUID). Nome sozinho e ambiguo.');
    else if (lower(plan.sequence.id).replace(/[{}]/g, '') !== lower(snapshot.sequence.id).replace(/[{}]/g, '')) errors.push('O plano foi feito para outra sequencia (' + str(plan.sequence.name) + '). Ativa: ' + snapshot.sequence.name + '.');
    if (!isArr(plan.ops) || !plan.ops.length) errors.push('Plano sem operacoes.');
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, ops: [] };

    model = buildModel(snapshot);
    fps = model.fps;
    done = done || {};

    for (i = 0; i < plan.ops.length; i++) {
      op = plan.ops[i];
      n = { id: str(op.id), type: str(op.type) };
      if (!n.id) { op = { id: 'op#' + (i + 1) }; err('Operacao sem id.'); continue; }
      if (has(ids, n.id)) { err('id repetido.'); continue; }
      ids[n.id] = 1;
      /* Ja aplicada em execucao anterior (recibo ok): nao repete. Para clipes criados, exige que ainda estejam la. */
      if (has(done, n.id)) {
        n.skip = true;
        if (n.type === 'place_item' || n.type === 'clone_mogrt') {
          list = findClips(model, { track: op.track, start: op.start });
          if (list.length !== 1 || list[0].e !== fr(op.end, fps)) { err('O recibo diz que ja foi aplicada, mas o clipe nao esta em ' + str(op.track) + ' ' + op.start + '–' + op.end + ' s. Conferir a timeline antes de repetir.'); continue; }
        }
        ops.push(n);
        continue;
      }

      if (n.type === 'place_item' || n.type === 'clone_mogrt') {
        tr = trackOf(model, op.track);
        if (!tr) { err('Faixa ' + str(op.track) + ' nao existe. O app nao cria faixas (desloca as existentes).'); continue; }
        if (parseTrack(op.track).kind !== 'V' && n.type === 'clone_mogrt') { err('MOGRT so em faixa de video.'); continue; }
        if (tr.locked) { err('Faixa ' + tr.id + ' esta travada.'); continue; }
        if (!isNum(op.start) || !isNum(op.end)) { err('start/end obrigatorios (segundos).'); continue; }
        s = fr(op.start, fps); e = fr(op.end, fps);
        if (e <= s) { err('end precisa ser maior que start.'); continue; }
        if (Math.abs(op.start * fps - s) > 0.02 || Math.abs(op.end * fps - e) > 0.02) warn('Tempo fora da grade de quadros; ajustado para ' + (s / fps) + '–' + (e / fps) + ' s.');
        hit = busy(tr, s, e);
        if (hit) { err('Destino ocupado em ' + tr.id + ' por "' + hit.name + '" (' + (hit.s / fps) + '–' + (hit.e / fps) + ' s). Nada e sobrescrito.'); continue; }
        n.track = tr.id; n.trackIndex = tr.index; n.start = s / fps; n.end = e / fps; n.startFrame = s; n.endFrame = e;
        dur = e - s;

        if (n.type === 'place_item') {
          if (!trim(op.media)) { err('media (caminho do arquivo) obrigatorio.'); continue; }
          n.media = str(op.media); n.name = baseName(op.media); n.still = isStill(n.name);
          n.srcIn = isNum(op.srcIn) ? op.srcIn : 0;
          if (n.srcIn < 0) { err('srcIn negativo.'); continue; }
          if (n.still && n.srcIn) { err('Imagem parada nao aceita srcIn.'); continue; }
          n.keepAudio = !!op.keepAudio;
          n.kind = parseTrack(tr.id).kind;
          if (n.kind === 'A' && !isAudioOnly(n.name) && !op.keepAudio) warn('Video colocado em faixa de audio.');
          if (n.kind === 'V' && isAudioOnly(n.name)) { err('Arquivo de audio em faixa de video.'); continue; }
          tr.clips.push({ name: n.name, s: s, e: e, i: n.still ? null : fr(n.srcIn, fps), enabled: true, isMGT: false, created: n.id });
          /* Video com audio: o overwrite do Premiere tambem grava audio. Reservamos uma faixa de audio
             livre no intervalo para receber esse audio, que e removido em seguida (ou mantido se keepAudio). */
          if (n.kind === 'V' && !n.still) {
            scratch = null;
            list = model.A;
            if (op.audioTrack) {
              a = trackOf(model, op.audioTrack);
              if (!a || parseTrack(op.audioTrack).kind !== 'A') { err('audioTrack invalida.'); continue; }
              if (a.locked || busy(a, s, e)) { err('audioTrack ' + a.id + ' ocupada ou travada no intervalo.'); continue; }
              scratch = a;
            } else {
              for (k = list.length - 1; k >= 0; k--) { if (!list[k].locked && !busy(list[k], s, e)) { scratch = list[k]; break; } }
            }
            if (!scratch) { err('Nenhuma faixa de audio livre em ' + n.start + '–' + n.end + ' s para receber o audio do video sem sobrescrever a voz.'); continue; }
            n.audioTrack = scratch.id; n.audioTrackIndex = scratch.index;
            if (n.keepAudio) scratch.clips.push({ name: n.name, s: s, e: e, i: fr(n.srcIn, fps), enabled: true, created: n.id });
          }
        } else {
          if (!plan.allowExperimental) { err('clone_mogrt e experimental neste host; habilite allowExperimental no plano apos o diagnostico aprovar.'); continue; }
          list = findClips(model, op.master);
          if (list.length !== 1) { err('Master de legenda ' + (list.length ? 'ambiguo' : 'nao encontrado') + ' em ' + stringify(op.master) + '.'); continue; }
          if (!list[0].isMGT) { err('O master indicado nao e um MOGRT.'); continue; }
          if (!trim(op.text)) { err('Texto vazio.'); continue; }
          n.master = { track: parseTrack(op.master.track).id, start: list[0].s / fps, name: list[0].name };
          n.text = str(op.text); n.name = list[0].name;
          tr.clips.push({ name: list[0].name, s: s, e: e, i: null, enabled: true, isMGT: true, text: n.text, created: n.id });
        }
        if (dur < 2) warn('Duracao menor que 2 quadros.');
      } else if (n.type === 'set_marker') {
        if (!op.match || !isNum(op.match.time)) { err('match.time obrigatorio.'); continue; }
        list = findMarkers(model, op.match);
        if (list.length !== 1) { err((list.length ? 'Mais de um marcador' : 'Nenhum marcador') + ' corresponde a ' + stringify(op.match) + '.'); continue; }
        n.match = op.match; n.time = list[0].s / fps;
        if (has(op, 'name')) { n.name = str(op.name); list[0].name = n.name; }
        if (has(op, 'comments')) { n.comments = str(op.comments); list[0].comments = n.comments; }
        if (isNum(op.colorIndex)) n.colorIndex = op.colorIndex;
      } else if (n.type === 'add_marker') {
        if (!isNum(op.time) || op.time < 0) { err('time obrigatorio.'); continue; }
        n.time = snap(op.time, fps); n.name = str(op.name); n.comments = str(op.comments);
        if (isNum(op.colorIndex)) n.colorIndex = op.colorIndex;
        model.markers.push({ s: fr(op.time, fps), name: n.name, comments: n.comments });
      } else if (n.type === 'set_props' || n.type === 'add_keyframes' || n.type === 'set_mogrt_text' || n.type === 'set_enabled' || n.type === 'remove_clip') {
        list = findClips(model, op.clip);
        if (list.length !== 1) { err('Clipe alvo ' + (list.length ? 'ambiguo' : 'nao encontrado') + ': ' + stringify(op.clip) + '.'); continue; }
        hit = list[0];
        tr = trackOf(model, op.clip.track);
        if (tr.locked) { err('Faixa ' + tr.id + ' esta travada.'); continue; }
        n.clip = { track: tr.id, trackIndex: tr.index, start: hit.s / fps, name: hit.name, kind: parseTrack(tr.id).kind };
        if (n.type === 'set_props') {
          n.props = {};
          if (has(op, 'scale')) { if (!isNum(op.scale) || op.scale <= 0 || op.scale > 2000) { err('scale invalido.'); continue; } n.props.scale = op.scale; }
          if (has(op, 'rotation')) { if (!isNum(op.rotation)) { err('rotation invalido.'); continue; } n.props.rotation = op.rotation; }
          if (has(op, 'opacity')) { if (!isNum(op.opacity) || op.opacity < 0 || op.opacity > 100) { err('opacity deve ser 0–100.'); continue; } n.props.opacity = op.opacity; }
          if (has(op, 'position')) {
            if (!isArr(op.position) || op.position.length !== 2 || !isNum(op.position[0]) || !isNum(op.position[1])) { err('position deve ser [x, y].'); continue; }
            if (Math.abs(op.position[0]) > 4 || Math.abs(op.position[1]) > 4) { err('position em pixels recusada: use valores NORMALIZADOS (0,5 = centro), nao 540/960.'); continue; }
            n.props.position = [op.position[0], op.position[1]];
          }
        } else if (n.type === 'add_keyframes') {
          key = lower(op.property);
          if (!has(SCALAR_PROPS, key)) { err('Keyframe so em propriedade escalar (scale, rotation, opacity). Posicao animada vem de template.'); continue; }
          if (!isArr(op.keys) || op.keys.length < 2) { err('Informe ao menos 2 keyframes.'); continue; }
          n.property = key; n.keys = []; n.interpolation = lower(op.interpolation || 'bezier');
          a = true;
          for (k = 0; k < op.keys.length; k++) {
            if (!isNum(op.keys[k].t) || !isNum(op.keys[k].v) || op.keys[k].t < 0 || fr(op.keys[k].t, fps) > hit.e - hit.s) { a = false; break; }
            n.keys.push({ t: snap(op.keys[k].t, fps), v: op.keys[k].v });
          }
          if (!a) { err('Keyframe fora do clipe: t e relativo ao inicio do clipe (0 a ' + ((hit.e - hit.s) / fps) + ' s).'); continue; }
        } else if (n.type === 'set_mogrt_text') {
          if (!hit.isMGT) { err('O alvo nao e um MOGRT.'); continue; }
          if (!trim(op.text)) { err('Texto vazio.'); continue; }
          n.text = str(op.text); hit.text = n.text;
        } else if (n.type === 'set_enabled') {
          n.enabled = !!op.enabled; hit.enabled = n.enabled;
        } else {
          if (!op.clip.name) { err('remove_clip exige o nome exato do clipe (protecao contra remocao errada).'); continue; }
          for (k = 0; k < tr.clips.length; k++) { if (tr.clips[k] === hit) { tr.clips.splice(k, 1); break; } }
        }
      } else {
        err('Tipo de operacao desconhecido: ' + n.type + '.');
        continue;
      }
      ops.push(n);
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, ops: ops, expected: model };
  }

  /* ---------- verificacao: estado esperado x releitura real ---------- */
  function compare(expectedModel, snapshot, opts) {
    var got = buildModel(snapshot), diffs = [], fps = got.fps, g, t, a, b, i, ca, cb, kinds = ['V', 'A'], km = {}, m, key;
    opts = opts || {};
    function line(c) { return c.name + ' ' + (c.s / fps) + '–' + (c.e / fps) + ' s'; }
    function sortClips(l) { return l.slice(0).sort(function (x, y) { return x.s - y.s; }); }
    for (g = 0; g < 2; g++) {
      a = expectedModel[kinds[g]]; b = got[kinds[g]];
      if (a.length !== b.length) diffs.push('Numero de faixas ' + kinds[g] + ' mudou: esperado ' + a.length + ', lido ' + b.length + '.');
      for (t = 0; t < a.length && t < b.length; t++) {
        ca = sortClips(a[t].clips); cb = sortClips(b[t].clips);
        if (ca.length !== cb.length) { diffs.push(a[t].id + ': esperado ' + ca.length + ' clipes, lido ' + cb.length + '.'); continue; }
        for (i = 0; i < ca.length; i++) {
          if (ca[i].s !== cb[i].s || ca[i].e !== cb[i].e) diffs.push(a[t].id + ': tempo divergente. Esperado ' + line(ca[i]) + '; lido ' + line(cb[i]) + '.');
          else if (ca[i].name !== cb[i].name) diffs.push(a[t].id + ': clipe divergente em ' + (ca[i].s / fps) + ' s. Esperado ' + ca[i].name + '; lido ' + cb[i].name + '.');
          else if (!opts.ignoreSource && ca[i].i !== null && ca[i].i !== cb[i].i) diffs.push(a[t].id + ': ponto de entrada da fonte divergente em ' + line(ca[i]) + ' (esperado ' + (ca[i].i / fps) + ', lido ' + (cb[i].i / fps) + ').');
          else if (!opts.ignoreEnabled && ca[i].enabled !== cb[i].enabled) diffs.push(a[t].id + ': ativado/desativado divergente em ' + line(ca[i]) + '.');
          else if (ca[i].isMGT && typeof ca[i].text === 'string' && typeof cb[i].text === 'string' && ca[i].text !== cb[i].text) diffs.push(a[t].id + ': texto divergente em ' + line(ca[i]) + '.');
        }
      }
    }
    if (!opts.ignoreMarkers) {
      for (i = 0; i < expectedModel.markers.length; i++) { m = expectedModel.markers[i]; key = m.s + '|' + m.name + '|' + m.comments; km[key] = (km[key] || 0) + 1; }
      for (i = 0; i < got.markers.length; i++) { m = got.markers[i]; key = m.s + '|' + m.name + '|' + m.comments; km[key] = (km[key] || 0) - 1; }
      for (key in km) { if (has(km, key) && km[key] !== 0) diffs.push('Marcador ' + (km[key] > 0 ? 'esperado e ausente' : 'inesperado') + ': ' + key.substring(0, 90)); }
    }
    return diffs;
  }

  /* ---------- marcadores: o que ainda e pedido do editor ---------- */
  function pendingMarkers(snapshot) {
    var out = [], i, m, nm;
    for (i = 0; i < snapshot.markers.length; i++) {
      m = snapshot.markers[i]; nm = trim(m.name);
      if (/^CONCLU[IÍ]DO/i.test(nm) || /^QC\b/i.test(nm)) continue;
      out.push({ time: m.start, name: m.name, comments: m.comments, kind: /CONFERIR|REVIS[AÃ]O/i.test(nm) ? 'nota' : 'pedido' });
    }
    return out;
  }

  /* ---------- texto de MOGRT (logica validada no HAGAV Text Animate) ---------- */
  function fieldStart(raw, field) {
    var marker = '"' + field + '"', first = raw.indexOf(marker), i;
    if (first < 0 || raw.indexOf(marker, first + marker.length) >= 0) throw new Error(field + ' nao aparece exatamente uma vez no parametro de texto.');
    i = first + marker.length;
    while (/\s/.test(raw.charAt(i))) i++;
    if (raw.charAt(i) !== ':') throw new Error('Separador ausente apos ' + field + '.');
    i++;
    while (/\s/.test(raw.charAt(i))) i++;
    return i;
  }
  function stringField(raw, field) {
    var q = fieldStart(raw, field), i;
    if (raw.charAt(q) !== '"') throw new Error(field + ' nao e texto.');
    i = q + 1;
    while (i < raw.length) {
      if (raw.charAt(i) === '\\') { i += 2; continue; }
      if (raw.charAt(i) === '"') return { start: q + 1, end: i, value: raw.substring(q + 1, i) };
      i++;
    }
    throw new Error(field + ' nao foi encerrado.');
  }
  function arrayField(raw, field) {
    var b = fieldStart(raw, field), e;
    if (raw.charAt(b) !== '[') throw new Error(field + ' nao e lista.');
    e = raw.indexOf(']', b + 1);
    if (e < 0) throw new Error(field + ' nao foi encerrado.');
    return { start: b + 1, end: e, value: raw.substring(b + 1, e) };
  }
  function cut(raw, a, b, rep) { return raw.substring(0, a) + rep + raw.substring(b); }
  /* Troca somente o texto no JSON bruto do MOGRT; devolve o novo bruto e a "assinatura" do restante,
     usada para provar que fonte, cor, tamanho e animacao nao foram tocados. */
  function mogrtText(raw, newText) {
    var range, runs, len, escaped, out;
    if (typeof raw !== 'string' || raw.indexOf('"textEditValue"') < 0) throw new Error('Parametro sem textEditValue.');
    runs = /"capPropTextRunCount"\s*:\s*(\d+)/.exec(raw);
    if (runs && Number(runs[1]) !== 1) throw new Error('Texto com mais de um estilo (capPropTextRunCount != 1); escrita recusada.');
    len = arrayField(raw, 'fontTextRunLength');
    if (!/^\s*\d+\s*$/.test(len.value)) throw new Error('fontTextRunLength com mais de um trecho; escrita recusada.');
    range = stringField(raw, 'textEditValue');
    if (typeof newText === 'undefined') return { text: parse('"' + range.value + '"'), raw: raw, rest: rest(raw) };
    escaped = quote(newText); escaped = escaped.substring(1, escaped.length - 1);
    out = cut(raw, range.start, range.end, escaped);
    len = arrayField(out, 'fontTextRunLength');
    out = cut(out, len.start, len.end, String(str(newText).length));
    return { text: str(newText), raw: out, rest: rest(out) };
  }
  function rest(raw) {
    var r = stringField(raw, 'textEditValue'), o = cut(raw, r.start, r.end, ''), l = arrayField(o, 'fontTextRunLength');
    return cut(o, l.start, l.end, '');
  }

  return {
    VERSION: VERSION, DONE_PREFIX: DONE_PREFIX,
    stringify: stringify, parse: parse, fr: fr, snap: snap, parseTrack: parseTrack, isStill: isStill, baseName: baseName,
    buildModel: buildModel, preflight: preflight, compare: compare, pendingMarkers: pendingMarkers, mogrtText: mogrtText,
    isArr: isArr, has: has, str: str, trim: trim, lower: lower, isNum: isNum
  };
}());
if (typeof module !== 'undefined' && module.exports) module.exports = HAGAV;
