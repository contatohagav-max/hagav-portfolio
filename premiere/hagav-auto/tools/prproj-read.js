#!/usr/bin/env node
/* Leitor offline de .prproj -> snapshot HAGAV AUTO (mesmo formato que o painel gera).
   Uso: node tools/prproj-read.js projeto.prproj "nome da sequencia" [--sanitize] > snapshot.json
   Somente leitura. Usado para montar gabaritos de teste a partir de projetos reais. */
'use strict';
var fs = require('fs'), zlib = require('zlib'), path = require('path');
var TPS = 254016000000;

function readXml(file) {
  var buf = fs.readFileSync(file);
  return (buf[0] === 0x1f && buf[1] === 0x8b) ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}
function indexObjects(xml) {
  var byId = {}, re = /^\t<([A-Za-z.]+) Object(U?ID)="([^"]+)"[^>]*>$/gm, m;
  while ((m = re.exec(xml))) {
    var close = '\n\t</' + m[1] + '>', end = xml.indexOf(close, m.index);
    if (end < 0) continue;
    byId[m[3]] = { tag: m[1], body: xml.substring(m.index, end + close.length) };
    re.lastIndex = end;
  }
  return byId;
}
function tagText(body, tag) {
  var m = new RegExp('<' + tag.replace(/\./g, '\\.') + '(?: [^>]*)?>([^<]*)</').exec(body);
  return m ? m[1] : null;
}
function ref(body, tag) {
  var m = new RegExp('<' + tag + ' [^>]*Object(?:U?Ref)="([^"]+)"').exec(body);
  return m ? m[1] : null;
}
function refs(body, tag) {
  var out = [], re = new RegExp('<' + tag + ' [^>]*Object(?:U?Ref)="([^"]+)"', 'g'), m;
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
}
function unxml(s) { return String(s == null ? '' : s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function sec(ticks) { return Number(ticks) / TPS; }

function readTrack(byId, trackObj, index, kind) {
  var b = trackObj.body, clips = [];
  var items = refs(b.substring(b.indexOf('<ClipItems'), b.indexOf('</ClipItems>')), 'TrackItem');
  for (var i = 0; i < items.length; i++) {
    var it = byId[items[i]]; if (!it) continue;
    var sub = byId[ref(it.body, 'SubClip')] || { body: '' };
    var clip = byId[ref(sub.body, 'Clip')] || { body: '' };
    var src = byId[ref(clip.body, 'Source')] || { body: '' };
    var media = byId[ref(src.body, 'Media')] || { body: '' };
    var start = Number(tagText(it.body, 'Start') || 0), end = Number(tagText(it.body, 'End') || 0);
    var name = unxml(tagText(sub.body, 'Name') || '');
    var inP = Number(tagText(clip.body, 'InPoint') || 0);
    clips.push({
      nodeId: 'x' + items[i], name: name, start: sec(start), end: sec(end),
      inPoint: sec(inP), outPoint: sec(inP + (end - start)),
      enabled: !/<IsMuted>true<\/IsMuted>/.test(it.body) && !/<Disabled>true/.test(it.body),
      isMGT: /\.aegraphic$/i.test(name) || /\.aegraphic/i.test(media.body),
      mediaPath: unxml(tagText(media.body, 'ActualMediaFilePath') || tagText(media.body, 'FilePath') || '')
    });
  }
  clips.sort(function (a, b2) { return a.start - b2.start; });
  return { index: index, id: kind + (index + 1), name: unxml(tagText(b, 'MZ.TrackName') || ''), locked: /<IsLocked>true/.test(b), muted: /<IsMuted>true<\/IsMuted>\s*<\/Track>/.test(b), clips: clips };
}

function readSequence(file, wanted) {
  var xml = readXml(file), byId = indexObjects(xml), seq = null, key;
  for (key in byId) {
    if (byId[key].tag !== 'Sequence') continue;
    var nm = unxml(tagText(byId[key].body.replace(/<Node[\s\S]*?<\/Node>/, ''), 'Name') || '');
    if (nm === wanted || (!seq && nm.indexOf(wanted) >= 0)) { seq = { id: key, name: nm, body: byId[key].body }; if (nm === wanted) break; }
  }
  if (!seq) throw new Error('Sequencia nao encontrada: ' + wanted);
  var out = { schema: 'hagav-auto.snapshot.v1', source: 'prproj', project: { name: path.basename(file), path: '' },
    sequence: { id: seq.id, name: seq.name, fps: 30, width: 1080, height: 1920 }, videoTracks: [], audioTracks: [], markers: [] };
  var groups = refs(seq.body, 'Second');
  for (var g = 0; g < groups.length; g++) {
    var grp = byId[groups[g]]; if (!grp) continue;
    var kind = grp.tag === 'VideoTrackGroup' ? 'V' : grp.tag === 'AudioTrackGroup' ? 'A' : null;
    if (!kind) continue;
    if (kind === 'V') {
      var fr = Number(tagText(grp.body, 'FrameRate')); if (fr) out.sequence.fps = Math.round(TPS / fr * 1000) / 1000;
      var rect = /<FrameRect>0,0,(\d+),(\d+)</.exec(grp.body); if (rect) { out.sequence.width = +rect[1]; out.sequence.height = +rect[2]; }
    }
    var tr = refs(grp.body, 'Track');
    for (var t = 0; t < tr.length; t++) if (byId[tr[t]]) out[kind === 'V' ? 'videoTracks' : 'audioTracks'].push(readTrack(byId, byId[tr[t]], t, kind));
  }
  var mk = byId[ref(seq.body.substring(seq.body.indexOf('<MarkerOwner')), 'Markers')];
  if (mk) {
    var list = refs(mk.body, 'Second');
    for (var i = 0; i < list.length; i++) {
      var raw = byId[list[i]] && tagText(byId[list[i]].body, 'DVAMarker'); if (!raw) continue;
      var d = JSON.parse(unxml(raw)).DVAMarker || {}, st = sec(d.mStartTime ? d.mStartTime.ticks : 0);
      out.markers.push({ guid: d.mMarkerID || '', start: st, end: st + sec(d.mDuration ? d.mDuration.ticks : 0), name: d.mName || '', comments: (d.mComment || '').replace(/\r\n/g, '\n') });
    }
    out.markers.sort(function (a, b) { return a.start - b.start || (a.guid < b.guid ? -1 : 1); });
  }
  var endMax = 0;
  out.videoTracks.concat(out.audioTracks).forEach(function (t2) { t2.clips.forEach(function (c) { if (c.end > endMax) endMax = c.end; }); });
  out.sequence.durationSec = endMax;
  return out;
}

/* Remove nomes de cliente/caminhos: mantem estrutura, tempos e os nomes necessarios ao teste. */
function sanitize(snap, keep) {
  var n = 0;
  function clean(c) {
    var ext = (/\.[A-Za-z0-9]+$/.exec(c.name) || [''])[0];
    if (!keep.test(c.name)) c.name = 'clip-' + (++n) + ext.toLowerCase();
    c.mediaPath = c.mediaPath ? 'X:/midia/' + c.name : '';
  }
  snap.project.name = 'projeto.prproj';
  snap.videoTracks.forEach(function (t) { t.clips.forEach(clean); });
  snap.audioTracks.forEach(function (t) { t.clips.forEach(clean); });
  return snap;
}

module.exports = { readSequence: readSequence, sanitize: sanitize };
if (require.main === module) {
  var a = process.argv.slice(2), s = readSequence(a[0], a[1]);
  if (a.indexOf('--sanitize') >= 0) sanitize(s, /GLASS|CTA-|aegraphic/i);
  process.stdout.write(JSON.stringify(s, null, 1) + '\n');
}
