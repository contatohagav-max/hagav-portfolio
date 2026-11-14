/* Simulador do Premiere para testes offline do HAGAV AUTO.
   Carrega o MESMO host.jsx/hagav-core.js do painel dentro de um contexto sem recursos ES5+
   (como o ExtendScript), sobre uma timeline montada a partir de um snapshot real.
   Reproduz de proposito os defeitos de host ja observados (borda que nao se move, audio que nasce
   junto com o video, unidade de in/out, nomes em portugues) para provar que o executor os tolera.
   Isto valida a LOGICA. Nao substitui o teste no Premiere real. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
var TPS = 254016000000;

function Time(sec) { this._s = sec || 0; }
Object.defineProperty(Time.prototype, 'seconds', { get: function () { return this._s; }, set: function (v) { this._s = Number(v); } });
Object.defineProperty(Time.prototype, 'ticks', { get: function () { return String(Math.round(this._s * TPS)); }, set: function (v) { this._s = Number(v) / TPS; } });

function coll(arr, countKey) {
  Object.defineProperty(arr, countKey, { get: function () { return arr.length; } });
  return arr;
}
function toSec(t) { return t instanceof Time ? t.seconds : (typeof t === 'string' || t > 1e7 ? Number(t) / TPS : Number(t)); }

function createSim(snapshot, opts) {
  opts = opts || {};
  var q = Object.assign({ trimWorks: false, inOutUnit: 'ticks', stillExtraFrames: 0, locale: 'en', failOverwriteAt: 0 }, opts.quirks || {});
  var fps = snapshot.sequence.fps, nextId = 1, overwrites = 0, saves = 0;
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'hagav-sim-'));
  var mediaOnDisk = {};
  (opts.media || []).forEach(function (m) { mediaOnDisk[m.toLowerCase().replace(/\\/g, '/')] = true; });
  var L = q.locale === 'pt'
    ? { motion: 'Movimento', opacity: 'Opacidade', scale: 'Escala', position: 'Posição', rotation: 'Rotação' }
    : { motion: 'Motion', opacity: 'Opacity', scale: 'Scale', position: 'Position', rotation: 'Rotation' };

  function Prop(name, value) { this.displayName = name; this._v = value; this._keys = null; }
  Prop.prototype.getValue = function () { return this._v; };
  Prop.prototype.setValue = function (v) { this._v = v; return true; };
  Prop.prototype.isTimeVarying = function () { return !!this._keys; };
  Prop.prototype.setTimeVarying = function (b) { this._keys = b ? (this._keys || []) : null; };
  Prop.prototype.addKey = function (t) { this._keys.push({ t: toSec(t), v: this._v }); };
  Prop.prototype.setValueAtKey = function (t, v) { var s = toSec(t); this._keys.forEach(function (k) { if (Math.abs(k.t - s) < 1e-6) k.v = v; }); };
  Prop.prototype.setInterpolationTypeAtKey = function () { return true; };
  Prop.prototype.getKeys = function () { return (this._keys || []).map(function (k) { return new Time(k.t); }); };
  function comp(name, props) { return { displayName: name, properties: coll(props, 'numItems') }; }

  function Clip(c, track, item) {
    this.nodeId = 'n' + (nextId++); this.name = c.name; this.start = new Time(c.start); this._end = new Time(c.end);
    this.inPoint = new Time(c.inPoint); this.outPoint = new Time(c.outPoint); this.disabled = c.enabled === false;
    this._track = track; this._isMGT = !!c.isMGT; this.projectItem = item || projectItemFor(c.mediaPath || c.name, c.isMGT);
    this.components = coll(track.kind === 'V' ? [
      comp(L.opacity, [new Prop(L.opacity, 100)]),
      comp(L.motion, [new Prop(L.position, [0.5, 0.5]), new Prop(L.scale, 100), new Prop(L.rotation, 0)])
    ] : [], 'numItems');
    if (this._isMGT) {
      var text = typeof c.text === 'string' ? c.text : 'Legenda';
      this._mgt = comp('Graphic Parameters', [new Prop('Tamanho', 86.2), new Prop('Texto', JSON.stringify({ capPropFontEdit: true, capPropTextRunCount: 1, fontEditValue: ['Poppins-ExtraBoldItalic'], fontSizeEditValue: [86.2], fontTextRunLength: [text.length], textEditValue: text }))]);
    }
  }
  Object.defineProperty(Clip.prototype, 'end', {
    get: function () { return this._end; },
    set: function (t) { if (q.trimWorks) { this.outPoint = new Time(this.inPoint.seconds + toSec(t) - this.start.seconds); this._end = new Time(toSec(t)); } }
  });
  Clip.prototype.isMGT = function () { return this._isMGT; };
  Clip.prototype.getMGTComponent = function () { return this._mgt || null; };
  Clip.prototype.remove = function () { var l = this._track.clips, i = l.indexOf(this); if (i >= 0) l.splice(i, 1); return true; };

  var items = {};
  function ProjectItem(mediaPath, isMGT) {
    this.name = path.basename(mediaPath.replace(/\\/g, '/')); this._path = mediaPath; this._in = null; this._out = null; this._isMGT = !!isMGT;
    this._still = /\.(png|jpe?g|tiff?|psd)$/i.test(this.name);
    this._hasAudio = !this._still && !isMGT && /\.(mp4|mov|mxf|wav|mp3)$/i.test(this.name) && !(opts.silent || []).some(function (s) { return s === this.name; }, this);
  }
  ProjectItem.prototype.getMediaPath = function () { return this._path; };
  ProjectItem.prototype.setInPoint = function (v) { this._in = q.inOutUnit === 'ticks' ? Number(v) / TPS : Number(v); };
  ProjectItem.prototype.setOutPoint = function (v) { this._out = q.inOutUnit === 'ticks' ? Number(v) / TPS : Number(v); };
  ProjectItem.prototype.getInPoint = function () { return new Time(this._in || 0); };
  ProjectItem.prototype.getOutPoint = function () { return new Time(this._out || 0); };
  ProjectItem.prototype.clearInPoint = function () { this._in = null; };
  ProjectItem.prototype.clearOutPoint = function () { this._out = null; };
  function projectItemFor(mediaPath, isMGT) {
    var key = String(mediaPath).toLowerCase().replace(/\\/g, '/');
    if (!items[key]) { items[key] = new ProjectItem(mediaPath, isMGT); rootChildren.push(items[key]); }
    return items[key];
  }
  var rootChildren = coll([], 'numItems');

  function Track(t, kind, index) {
    var self = this;
    this.name = t.name; this.kind = kind; this.index = index; this._locked = !!t.locked;
    this.clips = coll([], 'numItems');
    t.clips.forEach(function (c) { self.clips.push(new Clip(c, self)); });
  }
  Track.prototype.isLocked = function () { return this._locked; };
  Track.prototype.isMuted = function () { return false; };
  Track.prototype._write = function (item, start, dur, inSec) {
    var end = start + dur, self = this, eps = 1e-6;
    /* sobrescrita de verdade: o que estiver no caminho e cortado/removido (para o teste flagrar destruicao) */
    this.clips.slice().forEach(function (c) {
      var cs = c.start.seconds, ce = c._end.seconds;
      if (ce <= start + eps || cs >= end - eps) return;
      if (cs >= start - eps && ce <= end + eps) c.remove();
      else if (cs < start) c._end = new Time(start);
      else { c.inPoint = new Time(c.inPoint.seconds + end - cs); c.start = new Time(end); }
    });
    var clip = new Clip({ name: item.name, start: start, end: end, inPoint: inSec, outPoint: inSec + dur, isMGT: item._isMGT }, this, item);
    this.clips.push(clip);
    this.clips.sort(function (a, b) { return a.start.seconds - b.start.seconds; });
    return clip;
  };
  function place(item, time, vTrack, aTrack) {
    overwrites++;
    if (q.failOverwriteAt && overwrites === q.failOverwriteAt) throw new Error('Falha simulada do host (timeout).');
    var start = toSec(time), inSec = item._still ? 3600 : (item._in || 0), dur;
    if (item._isMGT) { dur = 5; inSec = 3600; }
    else if (item._in === null || item._out === null) dur = 5;
    else dur = item._out - item._in + (item._still ? q.stillExtraFrames / fps : 0);
    dur = Math.round(dur * fps) / fps;
    if (vTrack) vTrack._write(item, start, dur, inSec);
    if (item._hasAudio && aTrack) aTrack._write(item, start, dur, inSec);
  }
  Track.prototype.overwriteClip = function (item, time) {
    if (this.kind === 'V') place(item, time, this, seq.audioTracks[0]); /* pior caso: audio cai em A1 */
    else place(item, time, null, this);
    return true;
  };

  var markers = snapshot.markers.map(function (m) { return { guid: m.guid || ('g' + (nextId++)), start: new Time(m.start), end: new Time(m.end), name: m.name, comments: m.comments, setColorByIndex: function (i) { this.color = i; } }; });
  var seq = {
    sequenceID: '{' + snapshot.sequence.id + '}', name: snapshot.sequence.name, timebase: String(Math.round(TPS / fps)),
    frameSizeHorizontal: snapshot.sequence.width, frameSizeVertical: snapshot.sequence.height,
    videoTracks: coll([], 'numTracks'), audioTracks: coll([], 'numTracks'),
    markers: {
      getFirstMarker: function () { markers.sort(function (a, b) { return a.start.seconds - b.start.seconds; }); return markers[0] || null; },
      getNextMarker: function (m) { return markers[markers.indexOf(m) + 1] || null; },
      createMarker: function (t) { var m = { guid: 'g' + (nextId++), start: new Time(toSec(t)), end: new Time(toSec(t)), name: '', comments: '', setColorByIndex: function () {} }; markers.push(m); return m; }
    },
    overwriteClip: function (item, time, v, a) { place(item, time, seq.videoTracks[v], seq.audioTracks[a]); return true; },
    getSelection: function () { return opts.selection ? opts.selection(seq) : []; }
  };
  Object.defineProperty(seq, 'end', { get: function () { var e = 0; seq.videoTracks.concat(seq.audioTracks).forEach(function (t) { t.clips.forEach(function (c) { e = Math.max(e, c._end.seconds); }); }); return String(Math.round(e * TPS)); } });
  snapshot.videoTracks.forEach(function (t, i) { seq.videoTracks.push(new Track(t, 'V', i)); });
  snapshot.audioTracks.forEach(function (t, i) { seq.audioTracks.push(new Track(t, 'A', i)); });
  if (q.missingSeqOverwrite) delete seq.overwriteClip;

  /* File / Folder sobre uma pasta temporaria real */
  function File(p) { this.fsName = String(p).replace(/\\/g, '/'); this.name = path.basename(this.fsName); this.encoding = ''; this.lineFeed = ''; }
  Object.defineProperty(File.prototype, 'exists', { get: function () { return fs.existsSync(this.fsName) || !!mediaOnDisk[this.fsName.toLowerCase()]; } });
  Object.defineProperty(File.prototype, 'length', { get: function () { return fs.statSync(this.fsName).size; } });
  File.prototype.open = function (mode) { this._mode = mode; this._buf = ''; return mode === 'w' || fs.existsSync(this.fsName); };
  File.prototype.read = function () { return fs.readFileSync(this.fsName, 'utf8'); };
  File.prototype.write = function (s) { this._buf += s; return true; };
  File.prototype.close = function () { if (this._mode === 'w') fs.writeFileSync(this.fsName, this._buf); return true; };
  File.prototype.copy = function (dest) { fs.copyFileSync(this.fsName, dest); return true; };
  function Folder(p) { this.fsName = String(p).replace(/\\/g, '/'); }
  Object.defineProperty(Folder.prototype, 'exists', { get: function () { return fs.existsSync(this.fsName); } });
  Folder.prototype.create = function () { fs.mkdirSync(this.fsName, { recursive: true }); return true; };
  Folder.myDocuments = new Folder(root + '/Documents');
  fs.mkdirSync(root + '/Documents');
  var projectPath = root + '/' + snapshot.project.name;
  fs.writeFileSync(projectPath, 'projeto-simulado');

  var app = {
    version: '26.3.2 (sim)',
    project: {
      name: snapshot.project.name, path: projectPath, activeSequence: seq,
      rootItem: { children: rootChildren, createBin: function (n) { var b = { name: n, children: coll([], 'numItems') }; rootChildren.push(b); return b; } },
      save: function () { saves++; fs.writeFileSync(projectPath, 'projeto-simulado-' + saves); return true; },
      importFiles: function (paths, suppress, bin) {
        for (var i = 0; i < paths.length; i++) { var it = new ProjectItem(paths[i], false); items[String(paths[i]).toLowerCase().replace(/\\/g, '/')] = it; (bin ? bin.children : rootChildren).push(it); }
        return true;
      }
    }
  };

  var sandbox = { app: app, Time: Time, File: File, Folder: Folder, $: { os: 'Windows (sim)', evalFile: function (f) { vm.runInContext(fs.readFileSync(f.fsName, 'utf8'), ctx, { filename: f.fsName }); } } };
  var ctx = vm.createContext(sandbox);
  /* ExtendScript e ES3: tira do contexto tudo que nao existe la, para o teste quebrar se o codigo usar. */
  vm.runInContext([
    "var A=['forEach','map','filter','indexOf','lastIndexOf','some','every','reduce','reduceRight','find','findIndex','includes','fill','keys','entries','values','flat','flatMap','at'];",
    'for(var i=0;i<A.length;i++) delete Array.prototype[A[i]];',
    "var S=['trim','trimStart','trimEnd','includes','startsWith','endsWith','repeat','padStart','padEnd','at','replaceAll'];",
    'for(i=0;i<S.length;i++) delete String.prototype[S[i]];',
    "var O=['keys','values','entries','assign','create','freeze','fromEntries','getOwnPropertyNames'];",
    'for(i=0;i<O.length;i++) delete Object[O[i]];',
    'delete Array.isArray; delete Function.prototype.bind; delete Date.now;',
    'delete this.JSON; delete this.Map; delete this.Set; delete this.Promise; delete this.Symbol;'
  ].join('\n'), ctx);

  var extRoot = path.join(__dirname, '..');
  /* layout instalado: <ext>/core e <ext>/jsx. No repositorio: core/ e panel/jsx/. */
  vm.runInContext(fs.readFileSync(path.join(extRoot, 'panel/jsx/host.jsx'), 'utf8'), ctx, { filename: 'host.jsx' });

  var jobDir = root + '/job';
  fs.mkdirSync(jobDir);
  return {
    root: root, jobDir: jobDir, seq: seq, app: app, fps: fps,
    writePlan: function (plan) { fs.writeFileSync(jobDir + '/plan.json', JSON.stringify(plan)); },
    run: function (cmd) { return JSON.parse(vm.runInContext('HAGAVAuto.run(' + JSON.stringify(cmd) + ',' + JSON.stringify(jobDir) + ',' + JSON.stringify(extRoot.replace(/\\/g, '/')) + ')', ctx)); },
    readJob: function (name) { return JSON.parse(fs.readFileSync(jobDir + '/' + name, 'utf8')); },
    saves: function () { return saves; }, overwrites: function () { return overwrites; },
    setQuirk: function (k, v) { q[k] = v; },
    backups: function () { return fs.existsSync(jobDir + '/backups') ? fs.readdirSync(jobDir + '/backups') : []; },
    dispose: function () { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

module.exports = { createSim: createSim };
