// --------------------------------------------------------------
// CITYSCAPE 2D - FULL VIBRANT & PACKED HOUSES/TREES
// --------------------------------------------------------------
const W = 2600, H = 2600, COLS = 7, ROWS = 6, MARGIN = 190;
const svg = document.getElementById('mapSVG');

const state = {
  nodes: [], edges: [], graph: {},
  start: null, goal: null, path: [],
  zoom: 1, mode: null,
  running: false, paused: false, prog: 0, raf: null, lastT: 0
};

function ns(tag, attrs = {}, text = "") {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (let [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
}
function rng(min, max) { return min + Math.random() * (max - min); }

// ========== BEZIER CURVE ==========
function bpt(e, t) {
  const m = 1 - t;
  return { x: m*m*e.a.x + 2*m*t*e.cx + t*t*e.b.x, y: m*m*e.a.y + 2*m*t*e.cy + t*t*e.b.y };
}
function bdrv(e, t) {
  const m = 1 - t;
  return { dx: 2*m*(e.cx - e.a.x) + 2*t*(e.b.x - e.cx), dy: 2*m*(e.cy - e.a.y) + 2*t*(e.b.y - e.cy) };
}
function blen(e) {
  let len = 0, prev = bpt(e, 0);
  for (let i = 1; i <= 45; i++) {
    const cur = bpt(e, i / 45);
    len += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return len;
}
function bpath(e) { return `M${e.a.x.toFixed(1)} ${e.a.y.toFixed(1)} Q${e.cx.toFixed(1)} ${e.cy.toFixed(1)} ${e.b.x.toFixed(1)} ${e.b.y.toFixed(1)}`; }

// graph
function addEdge(idA, idB) {
  if (state.graph[idA] && state.graph[idA].some(n => n.to === idB)) return;
  const a = state.nodes[idA], b = state.nodes[idB];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const curve = (Math.random() - 0.5) * dist * 0.55;
  const dx = b.x - a.x, dy = b.y - a.y, lenVec = Math.hypot(dx, dy) || 1;
  const nx = -dy / lenVec, ny = dx / lenVec;
  const edge = { a, b, cx: mx + nx * curve, cy: my + ny * curve };
  edge.length = blen(edge);
  state.edges.push(edge);
  const idx = state.edges.length - 1;
  state.graph[idA].push({ to: idB, edgeIdx: idx, dist: edge.length });
  state.graph[idB].push({ to: idA, edgeIdx: idx, dist: edge.length });
}
function degree(id) { return (state.graph[id] || []).length; }

function ensureConnected() {
  if (state.nodes.length <= 1) return;
  function comp(start) {
    const set = new Set([start]), q = [start];
    while (q.length) { const cur = q.shift(); for (const nb of state.graph[cur]) if (!set.has(nb.to)) { set.add(nb.to); q.push(nb.to); } }
    return set;
  }
  let visited = new Set(), comps = [];
  for (let i = 0; i < state.nodes.length; i++) if (!visited.has(i)) { const c = comp(i); comps.push(c); for (let n of c) visited.add(n); }
  if (comps.length === 1) return;
  let main = comps[0];
  for (let i = 1; i < comps.length; i++) {
    let other = comps[i];
    let best = { d: Infinity, a: -1, b: -1 };
    for (let a of main) for (let b of other) { const d = Math.hypot(state.nodes[a].x - state.nodes[b].x, state.nodes[a].y - state.nodes[b].y); if (d < best.d) best = { d, a, b }; }
    if (best.a !== -1) { addEdge(best.a, best.b); for (let n of other) main.add(n); }
  }
}
function ensureNoDeadEnds() {
  let changed = true, passes = 0;
  while (changed && passes < 20) {
    changed = false; passes++;
    const dead = state.nodes.filter(n => degree(n.id) < 2);
    for (const n of dead) {
      if (degree(n.id) >= 2) continue;
      const candidates = state.nodes.filter(m => m.id !== n.id && !state.graph[n.id].some(nb => nb.to === m.id));
      if (!candidates.length) continue;
      candidates.sort((a,b) => (Math.hypot(a.x-n.x, a.y-n.y) + degree(a.id)*40) - (Math.hypot(b.x-n.x, b.y-n.y) + degree(b.id)*40));
      addEdge(n.id, candidates[0].id);
      changed = true;
    }
  }
}

// ========== PATHFINDING ==========
function dijkstra(s, g) {
  const n = state.nodes.length;
  const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), vis = new Array(n).fill(false);
  dist[s] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!vis[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || dist[u] === Infinity || u === g) break;
    vis[u] = true;
    for (const nb of state.graph[u] || []) { const nd = dist[u] + nb.dist; if (nd < dist[nb.to]) { dist[nb.to] = nd; prev[nb.to] = u; } }
  }
  const path = []; let cur = g;
  while (cur !== -1) { path.unshift(cur); cur = prev[cur]; }
  return path[0] === s ? path : [];
}
function pathSegments(path) {
  const segs = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i+1];
    const e = state.edges.find(e => (e.a.id === a && e.b.id === b) || (e.a.id === b && e.b.id === a));
    if (e) segs.push({ edge: e, fwd: e.a.id === a });
  }
  return segs;
}
function totalLen(path) { return pathSegments(path).reduce((s, seg) => s + seg.edge.length, 0); }

// ========== ANIMASI KENDARAAN ==========
const SPEED = { car: 440, moto: 580, bike: 260 };
let pathLen = 0;

function startAnim() {
  if (state.start===null || state.goal===null) return;
  if (state.path.length < 2) {
    state.path = dijkstra(state.start, state.goal);
    renderHighlight();
    if (state.path.length < 2) { setStatus('Tidak ada jalur','err'); return; }
  }
  if (!state.running) state.prog = 0;
  pathLen = totalLen(state.path);
  state.running = true;
  state.paused = false;
  state.lastT = performance.now();
  setStatus('Berjalan...','run');
  syncBtns();
  animLoop(performance.now());
}
function pauseAnim() {
  state.running = false;
  state.paused = true;
  if (state.raf) cancelAnimationFrame(state.raf);
  setStatus('Dijeda','');
  syncBtns();
}
function stopAnim() {
  state.running = false;
  state.paused = false;
  state.prog = 0;
  if (state.raf) cancelAnimationFrame(state.raf);
  const vg = document.getElementById('vehicle');
  if (vg) while (vg.firstChild) vg.removeChild(vg.firstChild);
  syncBtns();
}
function animLoop(ts) {
  if (!state.running) return;
  const dt = (ts - state.lastT) / 1000;
  state.lastT = ts;
  const spd = SPEED[document.getElementById('selVehicle').value] || 380;
  state.prog += spd * dt / pathLen;
  if (state.prog >= 1) {
    drawVehicle(1);
    state.running = false;
    setStatus('Sampai! 🎉','ok');
    syncBtns();
    return;
  }
  drawVehicle(state.prog);
  state.raf = requestAnimationFrame(animLoop);
}
function drawVehicle(prog) {
  const vg = document.getElementById('vehicle');
  while (vg.firstChild) vg.removeChild(vg.firstChild);
  const segs = pathSegments(state.path);
  if (!segs.length) return;
  let traveled = prog * pathLen, idx = 0;
  while (idx < segs.length-1 && traveled > segs[idx].edge.length) { traveled -= segs[idx].edge.length; idx++; }
  const { edge, fwd } = segs[idx];
  const t = Math.min(traveled / (edge.length || 1), 0.999);
  const e = fwd ? edge : { a: edge.b, b: edge.a, cx: edge.cx, cy: edge.cy };
  const pos = bpt(e, t), drv = bdrv(e, t);
  const deg = Math.atan2(drv.dy, drv.dx) * 180 / Math.PI;
  const type = document.getElementById('selVehicle').value;
  const grp = ns('g', { transform: `translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)}) rotate(${deg.toFixed(1)})` });
  if (type === 'car') drawCar(grp);
  else if (type === 'moto') drawMoto(grp);
  else drawBike(grp);
  vg.appendChild(grp);
}
function drawCar(g) {
  g.appendChild(ns('ellipse', { cx: 0, cy: 7, rx: 32, ry: 14, fill: 'rgba(0,0,0,0.3)' }));
  g.appendChild(ns('rect', { x: -32, y: -15, width: 64, height: 30, rx: 8, fill: '#e67e22' }));
  g.appendChild(ns('rect', { x: -18, y: -27, width: 36, height: 22, rx: 6, fill: '#d35400' }));
  g.appendChild(ns('rect', { x: -14, y: -23, width: 28, height: 16, rx: 3, fill: '#f1c40f' }));
  [[-24,-20],[22,-20],[-24,20],[22,20]].forEach(([wx,wy]) => {
    g.appendChild(ns('circle', { cx: wx, cy: wy, r: 10, fill: '#222' }));
    g.appendChild(ns('circle', { cx: wx, cy: wy, r: 5, fill: '#aaa' }));
  });
}
function drawMoto(g) {
  g.appendChild(ns('ellipse', { cx: 0, cy: 6, rx: 24, ry: 10, fill: 'rgba(0,0,0,0.3)' }));
  g.appendChild(ns('rect', { x: -24, y: -10, width: 48, height: 18, rx: 8, fill: '#3498db' }));
  g.appendChild(ns('circle', { cx: 20, cy: 0, r: 12, fill: '#111' }));
  g.appendChild(ns('circle', { cx: -20, cy: 0, r: 12, fill: '#111' }));
  g.appendChild(ns('ellipse', { cx: 0, cy: -14, rx: 9, ry: 13, fill: '#2980b9' }));
}
function drawBike(g) {
  g.appendChild(ns('ellipse', { cx: 0, cy: 5, rx: 20, ry: 8, fill: 'rgba(0,0,0,0.25)' }));
  g.appendChild(ns('line', { x1: -20, y1: 0, x2: 20, y2: 0, stroke: '#95a5a6', 'stroke-width': 4 }));
  g.appendChild(ns('line', { x1: 0, y1: 0, x2: 0, y2: -18, stroke: '#95a5a6', 'stroke-width': 4 }));
  g.appendChild(ns('circle', { cx: 20, cy: 0, r: 12, fill: 'none', stroke: '#bdc3c7', 'stroke-width': 3.5 }));
  g.appendChild(ns('circle', { cx: -20, cy: 0, r: 12, fill: 'none', stroke: '#bdc3c7', 'stroke-width': 3.5 }));
  g.appendChild(ns('circle', { cx: 0, cy: -26, r: 9, fill: '#e67e22' }));
}

// ========== RENDER & UI ==========
function renderRoads() {
  const g = ns('g', { id: 'roads' });
  state.edges.forEach(e => {
    const d = bpath(e);
    g.appendChild(ns('path', { d, fill: 'none', stroke: '#cbbf7a', 'stroke-width': 48, 'stroke-linecap': 'round' }));
    g.appendChild(ns('path', { d, fill: 'none', stroke: '#f8e8b0', 'stroke-width': 42, 'stroke-linecap': 'round' }));
    g.appendChild(ns('path', { d, fill: 'none', stroke: '#eed483', 'stroke-width': 36, 'stroke-linecap': 'round' }));
    g.appendChild(ns('path', { d, fill: 'none', stroke: '#ffec9e', 'stroke-width': 28, 'stroke-linecap': 'round' }));
    g.appendChild(ns('path', { d, fill: 'none', stroke: '#f5bc70', 'stroke-width': 4.5, 'stroke-dasharray': '28 22', opacity: 0.9 }));
  });
  svg.appendChild(g);
}

function renderNodes() {
  const g = ns('g', { id: 'nodes' });
  state.nodes.forEach(n => {
    g.appendChild(ns('circle', { cx: n.x, cy: n.y, r: 20, fill: '#fff3cf', stroke: '#f3b33d', 'stroke-width': 3 }));
    g.appendChild(ns('circle', { cx: n.x, cy: n.y, r: 11, fill: '#ffdd99' }));
    g.appendChild(ns('circle', { cx: n.x, cy: n.y, r: 5, fill: '#d4912e' }));
    const hit = ns('circle', { cx: n.x, cy: n.y, r: 32, fill: 'transparent', 'data-id': n.id, style: 'cursor:pointer' });
    hit.addEventListener('click', () => nodeClick(n.id));
    g.appendChild(hit);
  });
  svg.appendChild(g);
}

function renderHighlight() {
  let g = document.getElementById('routeHL');
  if (g) while (g.firstChild) g.removeChild(g.firstChild);
  else { g = ns('g', { id: 'routeHL' }); svg.appendChild(g); }
  if (!state.path.length) return;
  pathSegments(state.path).forEach(({ edge: e, fwd }) => {
    const ed = fwd ? e : { a: e.b, b: e.a, cx: e.cx, cy: e.cy };
    const d = bpath(ed);
    g.appendChild(ns('path', { d, fill: 'none', stroke: '#ff47c2', 'stroke-width': 20, 'stroke-linecap': 'round', opacity: 0.4 }));
    g.appendChild(ns('path', { d, fill: 'none', stroke: '#3b82f6', 'stroke-width': 7, 'stroke-dasharray': '12 10', 'stroke-linecap': 'round' }));
  });
}

function renderFlags() {
  let g = document.getElementById('flags');
  if (!g) { g = ns('g', { id: 'flags' }); svg.appendChild(g); }
  else while (g.firstChild) g.removeChild(g.firstChild);
  if (state.start !== null) drawFlag(g, state.nodes[state.start], '#e63946', 'S');
  if (state.goal !== null) drawFlag(g, state.nodes[state.goal], '#2ecc71', 'G');
}
function drawFlag(p, n, color, label) {
  const { x, y } = n;
  p.appendChild(ns('circle', { cx: x, cy: y, r: 27, fill: color, opacity: 0.2 }));
  p.appendChild(ns('line', { x1: x, y1: y-8, x2: x, y2: y-82, stroke: color, 'stroke-width': 5 }));
  p.appendChild(ns('polygon', { points: `${x},${y-80} ${x+42},${y-60} ${x},${y-42}`, fill: color, opacity: 0.95 }));
  p.appendChild(ns('text', { x: x+18, y: y-61, fill: 'white', 'font-size': 17, 'font-weight': 'bold', 'text-anchor': 'middle' }, label));
}

function render() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.appendChild(ns('rect', { x: 0, y: 0, width: W, height: H, fill: '#c7e6c7' }));
  const defs = ns('defs', {});
  const pat = ns('pattern', { id: 'grassGrid', width: 70, height: 70, patternUnits: 'userSpaceOnUse' });
  pat.appendChild(ns('line', { x1: 0, y1: 0, x2: 70, y2: 0, stroke: '#b2d8a8', 'stroke-width': 1 }));
  pat.appendChild(ns('line', { x1: 0, y1: 0, x2: 0, y2: 70, stroke: '#b2d8a8', 'stroke-width': 1 }));
  defs.appendChild(pat);
  svg.appendChild(defs);
  svg.appendChild(ns('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#grassGrid)' }));
  renderRoads();
  svg.appendChild(ns('g', { id: 'routeHL' }));
  renderNodes();
  svg.appendChild(ns('g', { id: 'flags' }));
  svg.appendChild(ns('g', { id: 'vehicle' }));
  renderHighlight();
  renderFlags();
}

function nodeClick(id) {
  if (state.mode === 'start') {
    state.start = id; state.path = [];
    renderFlags(); renderHighlight();
    setStatus(`🔴 START Node ${id}`, 'ok');
    state.mode = null;
    document.getElementById('viewport').style.cursor = 'grab';
    syncBtns();
  } else if (state.mode === 'goal') {
    if (id === state.start) { setStatus('Goal harus beda!','err'); return; }
    state.goal = id;
    state.path = dijkstra(state.start, state.goal);
    renderFlags(); renderHighlight();
    if (state.path.length > 1) {
      pathLen = totalLen(state.path);
      setStatus(`✨ Jarak ${Math.round(pathLen)}px`, 'ok');
    } else setStatus('No path','err');
    state.mode = null;
    document.getElementById('viewport').style.cursor = 'grab';
    syncBtns();
  }
}
function setStatus(txt, type) {
  const p = document.getElementById('pill');
  p.textContent = txt;
  p.className = 'pill' + (type ? ' ' + type : '');
}
function syncBtns() {
  const ok = state.start !== null && state.goal !== null && state.path.length > 1;
  document.getElementById('btnPlay').disabled = !ok;
  document.getElementById('btnStop').disabled = !state.running && !state.paused && state.prog === 0;
  document.getElementById('btnPlay').textContent = state.running ? '⏸ Pause' : (state.paused ? '▶ Lanjutkan' : '▶ Start');
}
function setZoom(z) {
  state.zoom = Math.max(0.25, Math.min(4, z));
  document.getElementById('world').style.transform = `scale(${state.zoom})`;
  document.getElementById('zLabel').textContent = Math.round(state.zoom*100) + '%';
}

function generateMap() {
  stopAnim();
  state.nodes = []; state.edges = []; state.graph = {};
  state.start = null; state.goal = null; state.path = [];
  const stepX = (W-2*MARGIN)/(COLS-1);
  const stepY = (H-2*MARGIN)/(ROWS-1);
  for (let r=0; r<ROWS; r++) for (let c=0; c<COLS; c++) {
    const offX = (Math.random()-0.5)*stepX*0.3;
    const offY = (Math.random()-0.5)*stepY*0.3;
    state.nodes.push({ id: r*COLS+c, x: MARGIN+c*stepX+offX, y: MARGIN+r*stepY+offY, r, c });
    state.graph[r*COLS+c] = [];
  }
  for (let r=0; r<ROWS; r++) for (let c=0; c<COLS; c++) {
    const id = r*COLS+c;
    if (c < COLS-1 && Math.random() < 0.55) addEdge(id, id+1);
    if (r < ROWS-1 && Math.random() < 0.55) addEdge(id, id+COLS);
    if (c < COLS-1 && r < ROWS-1 && Math.random() < 0.2) addEdge(id, id+COLS+1);
    if (c > 0 && r < ROWS-1 && Math.random() < 0.2) addEdge(id, id+COLS-1);
  }
  ensureConnected();
  ensureNoDeadEnds();
  render();
  setStatus('Peta siap!','ok');
  syncBtns();
}

// Event listeners
document.getElementById('btnGen').addEventListener('click', generateMap);
document.getElementById('btnModeStart').addEventListener('click', () => {
  state.mode = 'start';
  setStatus('🔴 Klik node untuk START','');
  document.getElementById('viewport').style.cursor = 'crosshair';
});
document.getElementById('btnModeGoal').addEventListener('click', () => {
  if (state.start === null) { setStatus('Pilih start dulu!','err'); return; }
  state.mode = 'goal';
  setStatus('🟢 Klik node untuk GOAL','');
  document.getElementById('viewport').style.cursor = 'crosshair';
});
document.getElementById('btnPlay').addEventListener('click', () => {
  if (state.running) pauseAnim(); else startAnim();
});
document.getElementById('btnStop').addEventListener('click', () => {
  stopAnim();
  setStatus('Reset posisi','');
  syncBtns();
});
document.getElementById('zIn').addEventListener('click', () => setZoom(state.zoom * 1.2));
document.getElementById('zOut').addEventListener('click', () => setZoom(state.zoom / 1.2));

const vp = document.getElementById('viewport');
let drag = false, dx0 = 0, dy0 = 0, sx0 = 0, sy0 = 0;
vp.addEventListener('mousedown', e => {
  if (state.mode) return;
  drag = true; dx0 = e.clientX; dy0 = e.clientY; sx0 = vp.scrollLeft; sy0 = vp.scrollTop;
  vp.style.cursor = 'grabbing';
});
document.addEventListener('mousemove', e => {
  if (drag) { vp.scrollLeft = sx0 - (e.clientX - dx0); vp.scrollTop = sy0 - (e.clientY - dy0); }
});
document.addEventListener('mouseup', () => {
  drag = false;
  if (!state.mode) vp.style.cursor = 'grab';
});
vp.addEventListener('wheel', e => {
  if (e.ctrlKey) { e.preventDefault(); setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }
}, { passive: false });

// Init
generateMap();
setTimeout(() => {
  vp.scrollLeft = (W - vp.clientWidth) / 2;
  vp.scrollTop = (H - vp.clientHeight) / 2;
}, 150);