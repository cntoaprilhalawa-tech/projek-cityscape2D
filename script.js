// ==============================================================
// CITYSCAPE 2D – Peta Spasial Perkotaan
// Mata Kuliah  : INF11114 Grafika Komputer
// Kelompok     : [Nama Kelompok]
// Anggota      :
//   1. Sorhan              – Bezier, Graf, generateMap
//   2. Farael              – Pathfinding, Animasi Kendaraan
//   3. Ferdy               – Render, Zoom, Pan
//   4. Cinto Aprilman H.   – Elemen Kota, Collision, UI Final
// ==============================================================

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

function generateMap() {
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
  console.log('Map generated:', state.nodes.length, 'nodes,', state.edges.length, 'edges');
}

// Init
generateMap();




// --------------------------------------------------------------
// [ANGGOTA 2 - FARAEL]
// Dijkstra, pathSegments, totalLen,
// animLoop, startAnim, pauseAnim, stopAnim,
// drawVehicle, drawCar, drawMoto, drawBike
// --------------------------------------------------------------



// --------------------------------------------------------------
// [ANGGOTA 3 - FERDY]
// renderRoads, renderNodes, render,
// renderHighlight, renderFlags, drawFlag,
// nodeClick, setStatus, syncBtns, setZoom,
// Event listeners (drag, zoom, buttons)
// --------------------------------------------------------------



// --------------------------------------------------------------
// [ANGGOTA 4 - CINTO]
// isValidPosition, drawTree, drawHouse, drawOffice,
// drawFlowerGarden, renderCityElements
// + Finalisasi index.html & style.css
// --------------------------------------------------------------
