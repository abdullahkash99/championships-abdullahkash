// بطولات حفل تقاعد الأستاذ محمد صائغ — ملف السيرفر (بدون أي مكتبات خارجية)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const clean1 = v => String(v || '').trim().replace(/^["']|["']$/g, '');
const PASS_LIST = ['ADMIN_KEY', 'ADMIN_PASSWORD', 'ADMIN_PASS', 'ADMIN_SECRET', 'ADMIN_TOKEN', 'KEY', 'PASSWORD', 'ADMIN', 'SECRET'].map(k => clean1(process.env[k])).filter(Boolean);
if (!PASS_LIST.length) PASS_LIST.push('admin123');
const ADMIN_PASSWORD = PASS_LIST[0];
const SECRET = process.env.SECRET || ('s_' + ADMIN_PASSWORD);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'state.json');
const TIDS = ['belot', 'domino', 'tennis'];
const DEFAULT_LIMITS = { belot: 16 }; // الحد الافتراضي، ويمكن تغييره من صفحة الأدمن
const DIDS = TIDS.concat(TIDS.map(x => x + '_teams'));

fs.mkdirSync(DATA_DIR, { recursive: true });
let state = { regs: {}, draws: {} };
try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
if (!state.limits) state.limits = Object.assign({}, DEFAULT_LIMITS);
function save() { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, FILE); }

const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
function makeToken() { const exp = Date.now() + 3 * 24 * 3600 * 1000; return exp + '.' + sign('admin:' + exp); }
function okToken(t) {
  if (!t) return false;
  const [exp, sig] = String(t).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign('admin:' + exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
const cleanName = n => String(n || '').trim().slice(0, 40);
const norm = s => String(s || '').trim().replace(/\s+/g, ' ');
const triple = s => norm(s).split(' ').filter(Boolean).length >= 3;
const countOf = t => Object.values(state.regs).filter(r => r.t === t).length;
const isFull = t => !!state.limits[t] && countOf(t) >= state.limits[t];
function validate(t, b) {
  if (!TIDS.includes(t)) return null;
  if (t === 'tennis') {
    const n = norm(cleanName(b.team || b.name)), p1 = norm(cleanName(b.p1)), p2 = norm(cleanName(b.p2));
    if (!n || !triple(p1) || !triple(p2) || p1 === p2) return null;
    return { n, t, p1, p2 };
  }
  const n = norm(cleanName(b.name));
  return triple(n) ? { n, t } : null;
}
const namesOf = r => r.t === 'tennis' ? [r.p1, r.p2] : [r.n];
function taken(rec, exceptId) {
  const used = new Set();
  for (const [id, r] of Object.entries(state.regs)) if (id !== exceptId) namesOf(r).forEach(x => used.add(norm(x)));
  return namesOf(rec).some(x => used.has(norm(x)));
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 200000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
  });
}

function demoGen(t,count,tryAdd,offset){
 const F=['خالد','فهد','سعد','ناصر','عبدالله','سلطان','تركي','ماجد','بندر','فيصل','وليد','يوسف','إبراهيم','أحمد','عمر','سالم'];
 const Fa=['محمد','عبدالعزيز','صالح','علي','حسن','إبراهيم','سعود','عبدالرحمن'];
 const Fm=['الحربي','القحطاني','الغامدي','الزهراني','العتيبي','الشمري','الدوسري','المطيري','السبيعي','الشهري'];
 const TM=['النسور','الصقور','الفهود','الأسود','العقاب','الذئاب','الشواهين','النمور','الرعد','البرق','الإعصار','الجوارح','الهلال','القمم','الأبطال','الفرسان'];
 const nm=k=>F[k%F.length]+' '+Fa[(k+Math.floor(k/F.length))%Fa.length]+' '+Fm[(k*3+Math.floor(k/8))%Fm.length];
 let k=Math.floor(Math.random()*50),added=0,guard=0;
 while(added<count&&guard++<3000){
  let rec;
  if(t==='tennis'){const a=nm(k++),b=nm(k++);if(a===b)continue;const q=(offset||0)+added;rec={n:TM[q%TM.length]+(q>=TM.length?' '+(Math.floor(q/TM.length)+1):''),t,p1:a,p2:b,demo:true}}
  else rec={n:nm(k++),t,demo:true};
  if(tryAdd(rec))added++;
 }
 return added;
}

console.log('عدد كلمات السر المقبولة: ' + PASS_LIST.length);

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0].replace(/\/+$/, '') || '/';
  const m = req.method;

  if (m === 'GET' && (url === '/' || url === '/admin')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html);
    } catch (e) { res.writeHead(500); return res.end('index.html غير موجود بجانب server.js'); }
  }
  if (m === 'GET' && url === '/api/state') {
    // عام: لا يُرجع أسماء المشتركين، فقط تسجيل الزائر نفسه + أعداد + القرعة والفرق
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const own = 'c_' + (q.get('cid') || '');
    const counts = { belot: 0, domino: 0, tennis: 0 };
    Object.values(state.regs).forEach(r => { if (counts[r.t] != null) counts[r.t]++; });
    return send(res, 200, { regs: state.regs[own] ? { [own]: state.regs[own] } : {}, counts, limits: state.limits, draws: state.draws });
  }

  if (m === 'POST' && url === '/api/register') {
    const b = await readBody(req);
    const rec = validate(b.t, b);
    if (!/^[a-z0-9]{8,40}$/i.test(b.cid || '') || !rec) return send(res, 400, { error: 'bad' });
    const id = 'c_' + b.cid;
    if (state.regs[id]) return send(res, 409, { error: 'already' });
    if (isFull(rec.t)) return send(res, 409, { error: 'full' });
    if (taken(rec, id)) return send(res, 409, { error: 'dup' });
    rec.ts = Date.now(); state.regs[id] = rec; save(); return send(res, 200, { ok: true });
  }

  if (m === 'POST' && url === '/api/admin/login') {
    const b = await readBody(req);
    const pw = clean1(b.password);
    if (PASS_LIST.some(p => p.toLowerCase() === pw.toLowerCase())) return send(res, 200, { token: makeToken() });
    return setTimeout(() => send(res, 401, { error: 'wrong' }), 600);
  }

  if (url.startsWith('/api/admin/')) {
    if (!okToken((req.headers.authorization || '').replace('Bearer ', ''))) return send(res, 401, { error: 'unauthorized' });
    const parts = url.split('/'); // ['', 'api', 'admin', kind, id]
    const kind = parts[3], id = decodeURIComponent(parts[4] || '');
    if (kind === 'state' && m === 'GET') return send(res, 200, state);
    const b = (m === 'POST' || m === 'PATCH' || m === 'PUT') ? await readBody(req) : {};

    if (kind === 'reg' && m === 'POST') {
      const rec = validate(b.t, b);
      if (!rec) return send(res, 400, { error: 'bad' });
      if (isFull(rec.t)) return send(res, 409, { error: 'full' });
      if (taken(rec, null)) return send(res, 409, { error: 'dup' });
      rec.ts = Date.now();
      state.regs['m_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)] = rec;
      save(); return send(res, 200, { ok: true });
    }
    if (kind === 'reg' && m === 'PATCH') {
      const r = state.regs[id];
      if (!r) return send(res, 400, { error: 'bad' });
      const rec = validate(r.t, { name: b.name, team: b.name, p1: b.p1, p2: b.p2 });
      if (!rec) return send(res, 400, { error: 'bad' });
      if (taken(rec, id)) return send(res, 409, { error: 'dup' });
      rec.ts = r.ts; state.regs[id] = rec; save(); return send(res, 200, { ok: true });
    }
    if (kind === 'limit' && m === 'PUT') {
      const n = parseInt(b.limit);
      if (!TIDS.includes(b.t) || isNaN(n) || n < 0) return send(res, 400, { error: 'bad' });
      if (n > 0) state.limits[b.t] = Math.min(n, 500); else delete state.limits[b.t];
      save(); return send(res, 200, { ok: true, limits: state.limits });
    }
    if (kind === 'demo' && m === 'POST') {
      const t = b.t; let c = Math.min(Math.max(parseInt(b.count) || 0, 1), 32);
      if (!TIDS.includes(t)) return send(res, 400, { error: 'bad' });
      const room = state.limits[t] ? state.limits[t] - countOf(t) : 99;
      if (room <= 0) return send(res, 409, { error: 'full' });
      c = Math.min(c, room);
      demoGen(t, c, rec => { if (taken(rec, null)) return false; rec.ts = Date.now(); state.regs['d_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)] = rec; return true; }, Object.values(state.regs).filter(r => r.t === t).length);
      save(); return send(res, 200, { ok: true });
    }
    if (kind === 'demo-clear' && m === 'POST') {
      const ts = new Set();
      for (const [rid, r] of Object.entries(state.regs)) if (r.demo) { ts.add(r.t); delete state.regs[rid]; }
      ts.forEach(t => { delete state.draws[t]; delete state.draws[t + '_teams']; });
      save(); return send(res, 200, { ok: true });
    }
    if (kind === 'reset' && m === 'POST') { state = { regs: {}, draws: {}, limits: state.limits }; save(); return send(res, 200, { ok: true }); }
    if (kind === 'reg' && m === 'DELETE') { delete state.regs[id]; save(); return send(res, 200, { ok: true }); }
    if (kind === 'draw' && m === 'PUT') {
      if (!DIDS.includes(id) || typeof b.r !== 'string') return send(res, 400, { error: 'bad' });
      state.draws[id] = { r: b.r, ts: Date.now() }; save(); return send(res, 200, { ok: true });
    }
    if (kind === 'draw' && m === 'DELETE') { delete state.draws[id]; save(); return send(res, 200, { ok: true }); }
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log('Running on port ' + PORT));
