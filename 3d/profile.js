/* The profile of one pass, as the simulator draws it under N, P, T, e: height up, the value across. Shared by the
   Findings map (3d/viewer.js) and the simulator's city (js/sim-city.js). Also the smooth profile both use: a
   monotone cubic through the layer centres (no overshoot), carried on beyond the outer centres along its end
   slope to the bottom and the top of the layers, as the simulator's profiles do, so a pressure profile keeps
   falling instead of turning straight up. */

export function smoothAt(row, E, z) {
  const zc = [], v = [];
  for (let k = 0; k < E.length - 1; k++) if (Number.isFinite(row[k])) { zc.push((E[k] + E[k + 1]) / 2); v.push(row[k]); }
  const n = zc.length;
  if (!n) return NaN;
  if (n === 1) return v[0];
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h.push(zc[i + 1] - zc[i]); d.push((v[i + 1] - v[i]) / h[i]); }
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m.push(0); continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]));
  }
  m.push(d[n - 2]);
  if (z <= zc[0]) return v[0] + m[0] * (z - zc[0]);
  if (z >= zc[n - 1]) return v[n - 1] + m[n - 1] * (z - zc[n - 1]);
  let i = 0; while (i < n - 2 && z > zc[i + 1]) i++;
  const t = (z - zc[i]) / h[i], t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * v[i + 1] + (t3 - t2) * h[i] * m[i + 1];
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function ticks(a, c, n) {
  if (!(c > a)) return [a];
  const s = Math.pow(10, Math.floor(Math.log10((c - a) / n))), f = [1, 2, 5, 10].find(f => (c - a) / (s * f) <= n) * s, o = [];
  for (let v = Math.ceil(a / f) * f; v <= c + 1e-9; v += f) o.push(+v.toFixed(6));
  return o;
}
/* o: {w, h, bot, top, edges, layered (dashed layer edges), lines: [{at: z => value, colour, width, dash, name}],
   dots: [{v, z, colour, r, tip}], unit, dec, title, zero (draw the zero line), range: [lo, hi] (else from the data)} */
export function profileSVG(o) {
  const w = Math.max(200, o.w), H = Math.max(200, o.h), m = { l: 44, r: 12, t: 34, b: 34 }, bot = o.bot, top = o.top;
  const zs = []; for (let i = 0; i <= 200; i++) zs.push(bot + i * (top - bot) / 200);
  const lines = o.lines.map(l => ({ ...l, v: zs.map(l.at) }));
  let lo, hi;
  if (o.range) [lo, hi] = o.range;
  else {
    const vals = lines.flatMap(l => l.v).concat((o.dots || []).map(d => d.v)).filter(Number.isFinite);
    if (o.zero) vals.push(0);
    lo = Math.min(...vals); hi = Math.max(...vals);
    const pad = (hi - lo) * .08 || (o.dec ? .5 : 2); lo -= pad; hi += pad;
  }
  const X = v => m.l + (v - lo) / (hi - lo) * (w - m.l - m.r), Y = z => H - m.b - (z - bot) / (top - bot) * (H - m.t - m.b);
  let b = '<rect width="' + w + '" height="' + H + '" fill="#fcfbf8"/>';
  ticks(lo, hi, 4).forEach(v => { b += '<path d="M' + X(v) + ' ' + m.t + 'V' + (H - m.b) + '" stroke="#e5e3db"/><text x="' + X(v) + '" y="' + (H - m.b + 13) + '" font-size="10" text-anchor="middle" fill="#5b6168">' + (+v.toFixed(o.dec)) + '</text>'; });
  ticks(bot, top, 5).forEach(v => { b += '<path d="M' + m.l + ' ' + Y(v) + 'H' + (w - m.r) + '" stroke="#e5e3db"/><text x="' + (m.l - 5) + '" y="' + (Y(v) + 3) + '" font-size="10" text-anchor="end" fill="#5b6168">' + Math.round(v) + '</text>'; });
  if (o.layered) o.edges.forEach(z => { b += '<path d="M' + m.l + ' ' + Y(z) + 'H' + (w - m.r) + '" stroke="#c9ccd1" stroke-dasharray="2 3"/>'; });
  if (o.zero) b += '<path d="M' + X(0) + ' ' + m.t + 'V' + (H - m.b) + '" stroke="#8a8f96"/>';
  b += '<clipPath id="pclip"><rect x="' + m.l + '" y="' + m.t + '" width="' + (w - m.l - m.r) + '" height="' + (H - m.t - m.b) + '"/></clipPath><g clip-path="url(#pclip)">';
  lines.forEach(l => {
    let d = '', pen = false;
    l.v.forEach((x, i) => { if (!Number.isFinite(x)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(zs[i]).toFixed(1); pen = true; });
    b += '<path d="' + d + '" fill="none" stroke="' + l.colour + '" stroke-width="' + (l.width || 2) + '"' + (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + ' stroke-linejoin="round"/>';
  });
  (o.dots || []).forEach(d => { if (Number.isFinite(d.v)) b += '<circle cx="' + X(d.v) + '" cy="' + Y(d.z) + '" r="' + (d.r || 3) + '" fill="' + d.colour + '"' + (d.r > 3 ? ' stroke="#fff" stroke-width="1.5"' : '') + '>' + (d.tip ? '<title>' + esc(d.tip) + '</title>' : '') + '</circle>'; });
  b += '</g><path d="M' + m.l + ' ' + (H - m.b) + 'H' + (w - m.r) + 'M' + m.l + ' ' + m.t + 'V' + (H - m.b) + '" stroke="#8a8f96"/>';
  b += '<text x="' + ((m.l + w - m.r) / 2) + '" y="' + (H - 4) + '" font-size="10" text-anchor="middle" fill="#5b6168">' + esc(o.unit) + '</text>';
  b += '<text x="10" y="' + ((m.t + H - m.b) / 2) + '" font-size="10" text-anchor="middle" fill="#5b6168" transform="rotate(-90 10 ' + ((m.t + H - m.b) / 2) + ')">height (m NAP)</text>';
  b += '<text x="' + m.l + '" y="13" font-size="11" font-weight="600" fill="#17191c">' + esc(o.title) + '</text>';
  let lx = m.l;
  lines.forEach(l => { b += '<path d="M' + lx + ' 24h14" stroke="' + l.colour + '" stroke-width="2"' + (l.dash ? ' stroke-dasharray="' + l.dash + '"' : '') + '/><text x="' + (lx + 18) + '" y="27" font-size="9.5" fill="#5b6168">' + esc(l.name) + '</text>'; lx += 28 + l.name.length * 5.1; });
  return '<svg viewBox="0 0 ' + w + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">' + b + '</svg>';
}
