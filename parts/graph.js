
/* ---------- graph ---------- */
const G = {
  mode: store.get("tt-gmode") === "atlas" ? "atlas" : "hood",
  up: 2, down: 2, focus: null,
  hcam: { x: 0, y: 0, k: 1 }, acam: { x: 0, y: 0, k: 1 },
  pos: new Map(), els: new Map(), edges: [], anim: 0, atlasFit: false,
};
const NW = 188, NH = 32, FH = 40, COLW = 252, ROWH = 42;
const gwrap = $("#gwrap"), gstage = $("#gstage"), gedges = $("#gedges"), gnodes = $("#gnodes"), canvas = $("#atlas");
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = t => 1 - Math.pow(1 - t, 3);

function graphShow(n) {
  if (tab !== "graph") return;
  document.querySelectorAll("[data-gmode]").forEach(b => b.setAttribute("aria-selected", b.dataset.gmode === G.mode));
  const atlas = G.mode === "atlas";
  gwrap.classList.toggle("atlas-on", atlas);
  gstage.hidden = atlas; canvas.hidden = !atlas;
  $("#gdepth").hidden = atlas; $("#glegend").hidden = !atlas;
  $("#gtip").hidden = true;
  G.focus = n || null;
  gcard(n);
  if (atlas) { atlasInit(); if (!G.atlasFit) { atlasFitAll(); G.atlasFit = true; } else if (n) atlasReveal(n); atlasSelect(n); }
  else hoodRender(n || byId.get("steam_engine") || N[0], !n);
}
function gcard(n) {
  const el = $("#gcard");
  if (!n) {
    el.classList.add("empty");
    el.innerHTML = G.mode === "atlas"
      ? `<div class="m">Atlas</div><p>All ${fmt(N.length)} technologies, placed by date (left to right, on a log scale) and field (rows). Pinch or ${isMac ? "⌘" : "Ctrl"}-scroll to zoom, drag to pan, click a dot to trace its ancestry.</p>`
      : `<div class="m">Neighborhood</div><p>Pick a technology to see what it required (left) and what it led to (right). Click any node to re-center the graph on it.</p>`;
    return;
  }
  el.classList.remove("empty");
  el.innerHTML = `<div class="m">${dot(n)}${CATS[n.cat][0]} · ${fmt(n.nAnc)} behind · ${fmt(n.nDes)} ahead</div>
    <div class="t"><h2>${esc(n.name)}</h2><span class="yr">${yr(n.year)}</span></div>
    <p>${esc(n.desc)}</p>
    <div class="a"><a class="btn-p" href="${wikiUrl(n.wiki)}" target="_blank" rel="noopener">${ICON_EXT}Wikipedia</a><button class="btn-s" data-gopen="explore">Open in Explore</button>${G.mode === "atlas" ? `<button class="btn-s" data-gopen="hood">Neighborhood</button>` : `<button class="btn-s" data-gopen="atlas">Find in Atlas</button>`}</div>`;
}
$("#gcard").addEventListener("click", e => {
  const b = e.target.closest("[data-gopen]"); if (!b) return;
  const v = b.dataset.gopen, n = G.focus;
  if (v === "explore") { setTab("explore"); go(n); }
  else { setMode(v); }
});
function setMode(m) { G.mode = m; store.set("tt-gmode", m); graphShow(G.focus); }
document.querySelectorAll("[data-gmode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.gmode)));
$("#gdepth").addEventListener("click", e => {
  const b = e.target.closest("[data-d]"); if (!b) return;
  const [k, d] = b.dataset.d.split(","); G[k] = Math.min(4, Math.max(0, G[k] + +d));
  hoodRender(G.focus || byId.get("steam_engine"), false, true);
});

/* --- neighborhood layout --- */
function hoodLayout(f) {
  const lv = new Map([[f, 0]]), cols = { 0: [f] }, more = {};
  const grow = (dir, steps) => {
    let fr = [f];
    for (let d = 1; d <= steps; d++) {
      const nx = new Set();
      for (const n of fr) for (const m of (dir < 0 ? n.req : n.kids)) if (!lv.has(m)) nx.add(m);
      let arr = [...nx].sort((a, b) => b.nDes - a.nDes || byYear(a, b));
      const cap = d === 1 ? 60 : 30;
      if (arr.length > cap) { more[dir * d] = arr.length - cap; arr = arr.slice(0, cap); }
      if (!arr.length) break;
      arr.forEach(m => lv.set(m, dir * d)); cols[dir * d] = arr; fr = arr;
    }
  };
  grow(-1, G.up); grow(1, G.down);
  const keys = Object.keys(cols).map(Number).sort((a, b) => a - b);
  keys.forEach(k => cols[k].sort(byYear));
  const idx = new Map(), reidx = () => keys.forEach(k => cols[k].forEach((n, i) => idx.set(n, i)));
  reidx();
  const nb = (n, k) => [...n.req, ...n.kids].filter(m => lv.get(m) === k);
  const sweep = (k, ref) => {
    const bc = new Map();
    for (const n of cols[k]) { const ns = nb(n, ref); bc.set(n, ns.length ? ns.reduce((s, m) => s + idx.get(m) / cols[ref].length, 0) / ns.length * cols[k].length : idx.get(n)); }
    cols[k].sort((a, b) => bc.get(a) - bc.get(b));
    cols[k].forEach((n, i) => idx.set(n, i));
  };
  for (let it = 0; it < 4; it++) {
    for (const k of keys) if (k > 0 && cols[k - 1]) sweep(k, k - 1);
    for (const k of [...keys].reverse()) if (k < 0 && cols[k + 1]) sweep(k, k + 1);
  }
  const pos = new Map();
  for (const k of keys) {
    const L = cols[k];
    L.forEach((n, i) => pos.set(n, { x: k * COLW - NW / 2, y: (i - (L.length - 1) / 2) * ROWH - (n === f ? FH : NH) / 2 }));
  }
  const edges = [];
  for (const [n, l] of lv) for (const p of n.req) if (lv.has(p) && lv.get(p) === l - 1) edges.push([p, n]);
  return { lv, cols, keys, more, pos, edges };
}
const edgeD = (a, b, pa, pb, f) => {
  const ah = a === f ? FH : NH, bh = b === f ? FH : NH;
  const ax = pa.x + NW, ay = pa.y + ah / 2, bx = pb.x, by = pb.y + bh / 2, dx = Math.max(40, (bx - ax) / 2);
  return `M${ax.toFixed(1)},${ay.toFixed(1)}C${(ax + dx).toFixed(1)},${ay.toFixed(1)} ${(bx - dx).toFixed(1)},${by.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
};
function hoodRender(f, isDefault, keepCam) {
  $("#gup").textContent = G.up; $("#gdown").textContent = G.down;
  document.querySelectorAll("#gdepth [data-d]").forEach(b => { const [k, d] = b.dataset.d.split(","); b.disabled = (G[k] + +d) < 0 || (G[k] + +d) > 4; });
  const L = hoodLayout(f);
  G.hoodFocus = f;
  // nodes: enter / update / exit
  const from = new Map();
  for (const [n, el] of G.els) {
    if (!L.lv.has(n)) { el.classList.add("out"); setTimeout(() => el.remove(), 260); G.els.delete(n); }
    else from.set(n, G.pos.get(n));
  }
  const fp = G.pos.get(f) || { x: 0, y: 0 };
  for (const [n, l] of L.lv) {
    let el = G.els.get(n);
    if (!el) {
      el = document.createElement("div");
      el.className = "gn in";
      el.dataset.id = n.id;
      el.setAttribute("role", "button"); el.tabIndex = 0;
      el.innerHTML = `${dot(n)}<span class="nm">${esc(n.name)}</span><span class="yr">${yr(n.year)}</span>`;
      el.title = `${n.name} · ${fmtYear(n.year)}`;
      gnodes.appendChild(el);
      G.els.set(n, el);
      // enter from near the old focus for continuity
      from.set(n, G.pos.size ? { x: fp.x + (l < 0 ? -40 : l > 0 ? 40 : 0), y: fp.y } : L.pos.get(n));
      requestAnimationFrame(() => el.classList.remove("in"));
    }
    el.classList.toggle("focus", n === f);
  }
  G.pos = L.pos; G.edges = L.edges; G.layout = L;
  // headers and "+N more"
  let hh = "";
  for (const k of L.keys) {
    const col = L.cols[k], top = Math.min(...col.map(n => L.pos.get(n).y)), bot = Math.max(...col.map(n => L.pos.get(n).y));
    const label = k === 0 ? "" : k === -1 ? "Required" : k === 1 ? "Led to" : k < 0 ? `${-k} steps back` : `${k} steps ahead`;
    const total = col.length + (L.more[k] || 0);
    if (label) hh += `<div class="ghead" style="transform:translate(${k * COLW - NW / 2}px,${top - 26}px)">${label}<span>${fmt(total)}</span></div>`;
    if (L.more[k]) hh += `<div class="gmore" style="transform:translate(${k * COLW - NW / 2}px,${bot + NH + 10}px)">+${fmt(L.more[k])} more, ranked lower by influence</div>`;
  }
  gnodes.querySelectorAll(".ghead,.gmore").forEach(e => e.remove());
  gnodes.insertAdjacentHTML("afterbegin", hh);
  // camera target
  const cam0 = { ...G.hcam };
  let cam1 = cam0;
  {
    const W = gwrap.clientWidth, Hh = gwrap.clientHeight;
    const xs = [...L.pos.values()].map(p => p.x), minX = Math.min(...xs), maxX = Math.max(...xs) + NW;
    const ys = [...L.pos.values()].map(p => p.y), minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + NH;
    const k = Math.min(1, Math.max(W < 760 ? .5 : .68, (W - 32) / (maxX - minX), Math.min(1, (Hh - 150) / (maxY - minY))));
    cam1 = { k, x: W / 2 - ((minX + maxX) / 2) * k, y: Hh / 2 - 20 - 0 * k };
    if (G.hcam.k === 1 && G.hcam.x === 0 && G.hcam.y === 0) Object.assign(cam0, cam1);
  }
  // tween
  cancelAnimationFrame(G.anim);
  const t0 = performance.now(), D = reduceMotion() ? 0 : 420;
  const step = now => {
    const t = D ? Math.min(1, (now - t0) / D) : 1, e = easeOut(t);
    const cur = new Map();
    for (const [n] of L.lv) {
      const a = from.get(n) || L.pos.get(n), b = L.pos.get(n);
      const p = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
      cur.set(n, p);
      G.els.get(n).style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
    }
    G.hcam = { k: cam0.k + (cam1.k - cam0.k) * e, x: cam0.x + (cam1.x - cam0.x) * e, y: cam0.y + (cam1.y - cam0.y) * e };
    applyHcam();
    gedges.innerHTML = L.edges.map(([a, b]) => `<path data-a="${a.id}" data-b="${b.id}"${a === f || b === f ? ' class="f"' : ""} d="${edgeD(a, b, cur.get(a), cur.get(b), f)}"/>`).join("");
    if (t < 1) G.anim = requestAnimationFrame(step);
  };
  G.anim = requestAnimationFrame(step);
}
function applyHcam() {
  const c = G.hcam;
  gstage.style.transform = `translate(${c.x}px,${c.y}px) scale(${c.k})`;
  gwrap.style.backgroundPosition = `${c.x}px ${c.y}px`;
  gwrap.style.backgroundSize = `${22 * c.k}px ${22 * c.k}px`;
}
gnodes.addEventListener("mouseover", e => {
  const el = e.target.closest(".gn"); if (!el) return;
  const id = el.dataset.id;
  gstage.classList.add("hovering");
  gedges.querySelectorAll("path").forEach(p => p.classList.toggle("hot", p.dataset.a === id || p.dataset.b === id));
});
gnodes.addEventListener("mouseout", e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(".gn")) { gstage.classList.remove("hovering"); gedges.querySelectorAll(".hot").forEach(p => p.classList.remove("hot")); } });
gnodes.addEventListener("keydown", e => { if (e.key === "Enter") { const el = e.target.closest(".gn"); if (el) go(byId.get(el.dataset.id)); } });

/* --- shared pan / zoom --- */
const cam = () => G.mode === "atlas" ? G.acam : G.hcam;
function zoomAt(f, cx, cy) {
  const c = cam(), lim = G.mode === "atlas" ? [atlasMinK(), 40] : [.2, 2.5];
  const k = Math.min(lim[1], Math.max(lim[0], c.k * f)), r = k / c.k;
  c.x = cx - (cx - c.x) * r; c.y = cy - (cy - c.y) * r; c.k = k;
  redraw();
}
function redraw() { if (G.mode === "atlas") atlasDraw(); else applyHcam(); }
const ptrs = new Map(); let drag = null;
gwrap.addEventListener("pointerdown", e => {
  if (e.target.closest(".gtools,.gcard,.glegend")) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  gwrap.setPointerCapture(e.pointerId);
  const c = cam();
  drag = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false, target: e.target, k: c.k, dist: 0 };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag.dist = Math.hypot(a.x - b.x, a.y - b.y); drag.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
});
gwrap.addEventListener("pointermove", e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!drag) { if (G.mode === "atlas" && e.pointerType === "mouse") atlasHover(e); return; }
  const c = cam();
  if (ptrs.size === 2 && drag.dist) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = gwrap.getBoundingClientRect();
    const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    zoomAt((drag.k * d / drag.dist) / c.k, mid.x, mid.y);
    drag.moved = true; return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true; gwrap.classList.add("dragging"); $("#gtip").hidden = true;
  c.x = drag.cx + dx; c.y = drag.cy + dy; redraw();
});
const endPtr = e => {
  ptrs.delete(e.pointerId);
  if (!drag) return;
  if (ptrs.size === 1) { const [p] = ptrs.values(), c = cam(); drag = { x: p.x, y: p.y, cx: c.x, cy: c.y, moved: true, k: c.k, dist: 0 }; return; }
  const d = drag; drag = null; gwrap.classList.remove("dragging");
  if (d.moved || e.type === "pointercancel") return;
  if (G.mode === "atlas") { const n = atlasHit(e); if (n) go(n); else if (G.focus) { G.focus = null; atlasSelect(null); gcard(null); } }
  else { const el = d.target.closest && d.target.closest(".gn"); if (el) go(byId.get(el.dataset.id)); }
};
gwrap.addEventListener("pointerup", endPtr);
gwrap.addEventListener("pointercancel", endPtr);
gwrap.addEventListener("dblclick", e => { if (G.mode === "atlas") { const n = atlasHit(e); if (n) { go(n); setMode("hood"); } } });
gwrap.addEventListener("wheel", e => {
  if (e.target.closest(".gcard")) return;
  e.preventDefault();
  const r = gwrap.getBoundingClientRect();
  const mouse = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .012), e.clientX - r.left, e.clientY - r.top);
  else if (mouse) zoomAt(Math.exp(-e.deltaY * .002), e.clientX - r.left, e.clientY - r.top);
  else { const c = cam(); c.x -= e.deltaX; c.y -= e.deltaY; redraw(); }
}, { passive: false });
document.querySelector(".gtools").addEventListener("click", e => {
  const b = e.target.closest("[data-z]"); if (!b) return;
  const z = +b.dataset.z, W = gwrap.clientWidth, Hh = gwrap.clientHeight;
  if (z === 0) { if (G.mode === "atlas") atlasFitAll(); else hoodRender(G.hoodFocus || G.focus || byId.get("steam_engine")); }
  else zoomAt(z > 0 ? 1.35 : 1 / 1.35, W / 2, Hh / 2);
});
document.addEventListener("keydown", e => {
  if (tab !== "graph" || scrimEl || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey) return;
  if (e.key === "f") document.querySelector('[data-z="0"]').click();
  else if (e.key === "=" || e.key === "+") document.querySelector('[data-z="1"]').click();
  else if (e.key === "-") document.querySelector('[data-z="-1"]').click();
  else if (e.key === "a") setMode(G.mode === "atlas" ? "hood" : "atlas");
  else if (e.key === "r") $("#random").click();
});
new ResizeObserver(() => { if (tab === "graph") { if (G.mode === "atlas") { atlasResize(); atlasDraw(); } } }).observe(gwrap);

/* --- atlas --- */
const LANES = ["foundations", "agriculture", "materials", "construction", "manufacturing", "energy", "transport", "aerospace", "military", "communication", "electronics", "computing", "instruments", "knowledge", "medicine", "biotech", "daily"];
const AW = 5600, ROW = 13, GAP = 15, LPAD = 32;
let A = null;
// atlas time scale: blend of log time and node density, so crowded modern decades get room
const YS = N.map(n => n.year).sort((a, b) => a - b);
function cdf(y) { let lo = 0, hi = YS.length; while (lo < hi) { const m = (lo + hi) >> 1; if (YS[m] < y) lo = m + 1; else hi = m; } return lo / YS.length; }
const ax = y => AW * (.6 * cdf(y) + .4 * tp(y) / 100);
function oklchRGB(L, C, h) {
  const hr = h * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  const f = x => { x = x <= .0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - .055; return Math.round(Math.min(1, Math.max(0, x)) * 255); };
  return `rgb(${f(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s)},${f(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s)},${f(-.0041960863 * l - .7034186147 * m + 1.707614701 * s)})`;
}
function atlasInit() {
  if (A) { atlasResize(); return; }
  A = { x: new Float32Array(N.length), y: new Float32Array(N.length), lanes: [], grid: new Map(), dpr: 1 };
  let y = 0;
  for (const cat of LANES) {
    const list = N.filter(n => n.cat === cat).sort((a, b) => a.year - b.year || b.nDes - a.nDes);
    const rows = [];
    for (const n of list) {
      const x = ax(n.year);
      let r = rows.findIndex(last => x - last >= GAP);
      if (r < 0) { r = rows.length; rows.push(x); } else rows[r] = x;
      A.x[n.i] = x; A.y[n.i] = y + LPAD + r * ROW;
    }
    const h = LPAD + Math.max(1, rows.length) * ROW + 14;
    A.lanes.push({ cat, y, h, count: list.length });
    y += h;
  }
  A.H = y;
  for (const n of N) { const key = ((A.x[n.i] / 24) | 0) + "," + ((A.y[n.i] / 24) | 0); if (!A.grid.has(key)) A.grid.set(key, []); A.grid.get(key).push(n); }
  A.byNDes = [...N].sort((a, b) => b.nDes - a.nDes);
  atlasResize();
}
function atlasResize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = gwrap.clientWidth, Hh = gwrap.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(Hh * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr); }
  A.dpr = dpr; A.W = W; A.Hh = Hh;
}
const atlasMinK = () => A ? Math.min((A.W - 40) / (AW + 160), (A.Hh - 140) / A.H) * .8 : .1;
function atlasFitAll() {
  const k = Math.min((A.W - 60) / (AW + 160), (A.Hh - 150) / A.H);
  G.acam = { k, x: 30 + 140 * k, y: 70 };
  atlasDraw();
}
function atlasReveal(n) {
  const sx = A.x[n.i] * G.acam.k + G.acam.x, sy = A.y[n.i] * G.acam.k + G.acam.y;
  if (sx < 60 || sx > A.W - 60 || sy < 70 || sy > A.Hh - 160) { G.acam.x = A.W / 2 - A.x[n.i] * G.acam.k; G.acam.y = A.Hh / 2 - A.y[n.i] * G.acam.k; }
}
function atlasSelect(n) {
  A.sel = n || null; A.anc = new Set(); A.des = new Set();
  if (n) {
    const st = [n]; while (st.length) for (const p of st.pop().req) if (!A.anc.has(p)) { A.anc.add(p); st.push(p); }
    const sd = [n]; while (sd.length) for (const k of sd.pop().kids) if (!A.des.has(k)) { A.des.add(k); sd.push(k); }
  }
  atlasDraw();
}
function atlasHit(e) {
  if (!A) return null;
  const r = gwrap.getBoundingClientRect(), c = G.acam;
  const wx = (e.clientX - r.left - c.x) / c.k, wy = (e.clientY - r.top - c.y) / c.k;
  const R = Math.max(5, 9 / c.k);
  let best = null, bd = R * R;
  const gx = (wx / 24) | 0, gy = (wy / 24) | 0, span = Math.ceil(R / 24);
  for (let i = gx - span; i <= gx + span; i++) for (let j = gy - span; j <= gy + span; j++) {
    const cell = A.grid.get(i + "," + j); if (!cell) continue;
    for (const n of cell) { const d = (A.x[n.i] - wx) ** 2 + (A.y[n.i] - wy) ** 2; if (d < bd) { bd = d; best = n; } }
  }
  return best;
}
function atlasHover(e) {
  const n = atlasHit(e), tip = $("#gtip");
  if (n !== A.hover) { A.hover = n; atlasDraw(); }
  gwrap.style.cursor = n ? "pointer" : "";
  if (!n) { tip.hidden = true; return; }
  const r = gwrap.getBoundingClientRect();
  tip.innerHTML = `${dot(n)}<span>${esc(n.name)}</span><span class="yr">${yr(n.year)}</span>`;
  tip.hidden = false;
  const x = A.x[n.i] * G.acam.k + G.acam.x, y = A.y[n.i] * G.acam.k + G.acam.y;
  tip.style.transform = `translate(${Math.min(x + 12, A.W - tip.offsetWidth - 8)}px,${y - 34}px)`;
}
gwrap.addEventListener("pointerleave", () => { if (A && A.hover) { A.hover = null; $("#gtip").hidden = true; atlasDraw(); } });
let atlasRaf = 0;
function atlasDraw() { if (!A || G.mode !== "atlas" || tab !== "graph") return; if (!atlasRaf) atlasRaf = requestAnimationFrame(() => { atlasRaf = 0; atlasPaint(); }); }
function atlasPaint() {
  const cs = getComputedStyle(document.documentElement), tok = v => cs.getPropertyValue(v).trim();
  const ctx = canvas.getContext("2d"), { dpr, W, Hh } = A, c = G.acam, k = c.k;
  const catL = parseFloat(tok("--cat-l")), catC = parseFloat(tok("--cat-c"));
  if (A.colKey !== catL + "," + catC) { A.colKey = catL + "," + catC; A.col = {}; for (const cat in CATS) A.col[cat] = oklchRGB(catL, catC, CATS[cat][1]); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = tok("--bg-2"); ctx.fillRect(0, 0, W, Hh);
  const SX = x => x * k + c.x, SY = y => y * k + c.y;
  // lanes
  A.lanes.forEach((l, i) => { if (i % 2 === 0) { ctx.fillStyle = tok("--bg"); ctx.fillRect(0, SY(l.y), W, l.h * k); } });
  // era lines
  ctx.strokeStyle = tok("--line"); ctx.lineWidth = 1;
  ctx.font = `500 10.5px ${tok("--sans")}`; ctx.fillStyle = tok("--fg-3");
  ERAS.forEach((e, i) => { const x0 = i ? Math.round(SX(ax(e[2]))) + .5 : SX(0), x1 = i < ERAS.length - 1 ? SX(ax(e[3])) : SX(AW);
    if (i) { ctx.beginPath(); ctx.moveTo(x0, SY(0) - 18); ctx.lineTo(x0, SY(A.H)); ctx.stroke(); }
    const w = ctx.measureText(e[1]).width; if (x1 - x0 > w + 12) ctx.fillText(e[1], Math.max(x0 + 6, Math.min(x1 - w - 6, 8 + 200)), SY(0) - 8); });
  // edges
  const sel = A.sel, vis = (x, y) => x > -50 && x < W + 50 && y > -50 && y < Hh + 50;
  ctx.lineWidth = 1;
  ctx.strokeStyle = tok("--fg-3"); ctx.globalAlpha = sel ? .05 : Math.min(.16, .07 + k * .05);
  ctx.beginPath();
  for (const n of N) { const bx = SX(A.x[n.i]), by = SY(A.y[n.i]); for (const p of n.req) { const ax = SX(A.x[p.i]), ay = SY(A.y[p.i]); if ((ax < 0 && bx < 0) || (ax > W && bx > W) || (ay < 0 && by < 0) || (ay > Hh && by > Hh)) continue; ctx.moveTo(ax, ay); ctx.lineTo(bx, by); } }
  ctx.stroke();
  if (sel) {
    const drawSet = (set, color, alpha, up) => {
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1.2; ctx.beginPath();
      for (const n of [sel, ...set]) for (const p of (up ? n.req : n.kids)) if (p === sel || set.has(p)) { const ax = SX(A.x[n.i]), ay = SY(A.y[n.i]), bx = SX(A.x[p.i]), by = SY(A.y[p.i]); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
      ctx.stroke();
    };
    drawSet(A.anc, tok("--fg"), .42, true);
    drawSet(A.des, tok("--link"), .32, false);
  }
  ctx.globalAlpha = 1;
  // nodes, batched by category
  const r = Math.min(5, Math.max(1.4, 2.6 * Math.sqrt(k)));
  for (const cat of LANES) {
    ctx.fillStyle = A.col[cat];
    for (const pass of sel ? [0, 1] : [1]) {
      ctx.globalAlpha = pass === 0 ? .18 : 1;
      ctx.beginPath();
      for (const n of N) {
        if (n.cat !== cat) continue;
        const on = !sel || n === sel || A.anc.has(n) || A.des.has(n);
        if (sel && (pass === 1) !== on) continue;
        const x = SX(A.x[n.i]), y = SY(A.y[n.i]); if (!vis(x, y)) continue;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const n of [A.hover, sel].filter(Boolean)) { const x = SX(A.x[n.i]), y = SY(A.y[n.i]); ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, 6.2832); ctx.strokeStyle = tok("--fg"); ctx.lineWidth = 2; ctx.stroke(); }
  // labels with collision avoidance
  ctx.font = `500 11.5px ${tok("--sans")}`; ctx.textBaseline = "middle";
  const placed = [], hit = (x, y, w) => placed.some(p => x < p[2] && x + w > p[0] && y - 8 < p[3] && y + 8 > p[1]);
  const cand = sel ? [sel, ...sel.req, ...sel.kids, ...A.byNDes] : A.byNDes;
  const maxL = Math.min(260, 12 + k * 140);
  const bg = tok("--bg"), fg = tok("--fg"), fg2 = tok("--fg-2");
  let count = 0; const seen = new Set();
  for (const n of cand) {
    if (count >= maxL) break; if (seen.has(n)) continue; seen.add(n);
    if (sel && n !== sel && !A.anc.has(n) && !A.des.has(n)) continue;
    const x = SX(A.x[n.i]) + r + 5, y = SY(A.y[n.i]); if (!vis(x, y)) continue;
    const w = ctx.measureText(n.name).width;
    if (x + w > W - 8 || y < 60) continue;
    if (n !== sel && hit(x - 2, y, w + 4)) continue;
    placed.push([x - 2, y - 8, x + w + 2, y + 8]);
    ctx.fillStyle = bg; ctx.globalAlpha = .82; ctx.fillRect(x - 3, y - 8, w + 6, 16); ctx.globalAlpha = 1;
    ctx.fillStyle = n === sel ? fg : fg2; ctx.fillText(n.name, x, y);
    count++;
  }
  // lane labels (sticky left)
  ctx.font = `600 10.5px ${tok("--sans")}`; ctx.textBaseline = "alphabetic";
  for (const l of A.lanes) {
    const y = SY(l.y) + 18; if (y < 56 || y > Hh - 8) continue;
    const label = CATS[l.cat][0].toUpperCase(), w = ctx.measureText(label).width;
    ctx.fillStyle = bg; ctx.globalAlpha = .9; ctx.fillRect(8, y - 12, w + 30, 17); ctx.globalAlpha = 1;
    ctx.fillStyle = A.col[l.cat]; ctx.beginPath(); ctx.arc(17, y - 4, 3.5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = tok("--fg-3"); ctx.fillText(label, 26, y);
  }
  // time axis (sticky bottom)
  const ay = Hh - 26;
  ctx.fillStyle = tok("--bg"); ctx.globalAlpha = .92; ctx.fillRect(0, ay - 14, W, 40); ctx.globalAlpha = 1;
  ctx.strokeStyle = tok("--line"); ctx.beginPath(); ctx.moveTo(0, ay - 14.5); ctx.lineTo(W, ay - 14.5); ctx.stroke();
  ctx.font = `11px ${tok("--mono")}`; ctx.fillStyle = tok("--fg-3"); ctx.textAlign = "center";
  let lastX = -1e9;
  for (const y of [-3000000, -1000000, -300000, -100000, -30000, -10000, -5000, -3000, -1000, 1, 500, 1000, 1300, 1500, 1600, 1700, 1750, 1800, 1825, 1850, 1875, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]) {
    const x = SX(ax(y)); if (x < 40 || x > W - 30 || x - lastX < 64) continue;
    ctx.fillRect(x, ay - 14, 1, 5); ctx.fillText(yr(y).replace("1 CE", "1 CE"), x, ay + 6); lastX = x;
  }
  ctx.textAlign = "start";
}
const themeMQ = matchMedia("(prefers-color-scheme: dark)");
themeMQ.addEventListener && themeMQ.addEventListener("change", () => atlasDraw());
new MutationObserver(() => atlasDraw()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

