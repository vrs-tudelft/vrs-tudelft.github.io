/* VRS: a small canvas player plus loaders, colour scales and axis helpers for the data-driven
   animations. Plain script, no dependencies. Every animation is a function draw(i, ctx, size)
   that paints frame i; the player owns time, controls, resizing and keyboard. */
window.VRS = (function () {
  "use strict";

  /* ---------------------------------------------------------------- loaders */
  var cache = {};
  function json(url) {
    if (!cache[url]) cache[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ": " + r.status);
      return r.json();
    });
    return cache[url];
  }
  function int16(url) {
    var key = "i16:" + url;
    if (!cache[key]) cache[key] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ": " + r.status);
      return r.arrayBuffer();
    }).then(function (buf) { return new Int16Array(buf); });
    return cache[key];
  }
  /* A [rows][cols] view on an Int16 block, in mm (values stored as 0.01 mm). */
  function grid(i16, offsetBytes, rows, cols) {
    var start = offsetBytes / 2;
    return {
      rows: rows, cols: cols,
      get: function (r, c) { return i16[start + r * cols + c] / 100; }
    };
  }

  /* ---------------------------------------------------------------- colours */
  var STOPS = {
    viridis: ["#440154", "#482878", "#3e4a89", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
    magma: ["#000004", "#180f3e", "#451077", "#721f81", "#9f2f7f", "#cd4071", "#f1605d", "#fd9668", "#feca8d", "#fcfdbf"],
    cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8678", "#a59c74", "#c3b369", "#e1cc55", "#fee838"],
    RdBu_r: ["#053061", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f"],
    PuOr: ["#7f3b08", "#b35806", "#e08214", "#fdb863", "#fee0b6", "#f7f7f7", "#d8daeb", "#b2abd2", "#8073ac", "#542788", "#2d004b"],
    twilight: ["#e2d9e2", "#9ebbd9", "#6785be", "#5e5292", "#5a2a5c", "#4b1c34", "#7a2d3d", "#b0645a", "#d7a37f", "#e2d9e2"]
  };
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function ramp(name) {
    var st = STOPS[name].map(hex);
    var n = st.length - 1;
    return function (t) {
      t = Math.max(0, Math.min(1, t));
      var k = Math.min(Math.floor(t * n), n - 1), f = t * n - k;
      var a = st[k], b = st[k + 1];
      return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," + Math.round(a[2] + (b[2] - a[2]) * f) + ")";
    };
  }
  var scales = {
    diverging: function (lim, name) { var r = ramp(name || "RdBu_r"); return function (v) { return r(0.5 + 0.5 * v / lim); }; },
    sequential: function (lo, hi, name) { var r = ramp(name || "viridis"); return function (v) { return r((v - lo) / (hi - lo)); }; },
    cyclic: function (period) { var r = ramp("twilight"); return function (v) { return r(((v % period) + period) % period / period); }; },
    ramp: ramp
  };
  /* Horizontal legend bar. labels: [left, middle, right] */
  function legend(ctx, x, y, w, h, colour, labels, font) {
    for (var k = 0; k < w; k++) { ctx.fillStyle = colour(k / (w - 1)); ctx.fillRect(x + k, y, 1.5, h); }
    ctx.strokeStyle = css("--line"); ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = css("--muted"); ctx.font = font || "11px system-ui"; ctx.textBaseline = "top";
    ctx.textAlign = "left"; ctx.fillText(labels[0], x, y + h + 3);
    if (labels[1] !== undefined) { ctx.textAlign = "center"; ctx.fillText(labels[1], x + w / 2, y + h + 3); }
    ctx.textAlign = "right"; ctx.fillText(labels[2], x + w, y + h + 3);
    ctx.textAlign = "left";
  }

  /* ---------------------------------------------------------------- css tokens */
  var tokens = {};
  function css(name) {
    if (!tokens[name]) tokens[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
    return tokens[name];
  }
  function resetTokens() { tokens = {}; }
  if (window.matchMedia) {
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", resetTokens); } catch (e) { /* older browsers */ }
  }

  /* ---------------------------------------------------------------- axes */
  function linear(d0, d1, r0, r1) {
    var f = function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
    f.invert = function (p) { return d0 + (p - r0) / (r1 - r0) * (d1 - d0); };
    f.domain = [d0, d1]; f.range = [r0, r1];
    return f;
  }
  function niceTicks(d0, d1, count) {
    var span = d1 - d0, step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [];
    for (var v = Math.ceil(d0 / step) * step; v <= d1 + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function fmt(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ""); }
  function xAxis(ctx, x, y, ticks, label, font) {
    ctx.strokeStyle = css("--line"); ctx.fillStyle = css("--muted"); ctx.font = font || "11px system-ui";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.beginPath(); ctx.moveTo(x.range[0], y); ctx.lineTo(x.range[1], y); ctx.stroke();
    ticks.forEach(function (t) {
      var px = x(t.v !== undefined ? t.v : t);
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + 4); ctx.stroke();
      ctx.fillText(t.label !== undefined ? t.label : fmt(t), px, y + 6);
    });
    if (label) { ctx.fillText(label, (x.range[0] + x.range[1]) / 2, y + 20); }
  }
  function yAxis(ctx, y, x, ticks, label, font) {
    ctx.strokeStyle = css("--line"); ctx.fillStyle = css("--muted"); ctx.font = font || "11px system-ui";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.beginPath(); ctx.moveTo(x, y.range[0]); ctx.lineTo(x, y.range[1]); ctx.stroke();
    ticks.forEach(function (t) {
      var py = y(t);
      ctx.beginPath(); ctx.moveTo(x - 4, py); ctx.lineTo(x, py); ctx.stroke();
      ctx.fillText(fmt(t), x - 6, py);
    });
    if (label) {
      ctx.save(); ctx.translate(x - 34, (y.range[0] + y.range[1]) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(label, 0, 0); ctx.restore();
    }
    ctx.textAlign = "left";
  }
  function yearTicks(dates, x) {
    var out = [], last = null;
    dates.forEach(function (d, i) {
      var yv = d.slice(0, 4);
      if (yv !== last) { out.push({ v: i, label: yv }); last = yv; }
    });
    return out;
  }
  function line(ctx, xs, ys, colour, width) {
    ctx.strokeStyle = colour; ctx.lineWidth = width || 1; ctx.beginPath();
    var started = false;
    for (var i = 0; i < xs.length; i++) {
      if (ys[i] === null || ys[i] === undefined || isNaN(ys[i]) || isNaN(xs[i])) { started = false; continue; }
      if (!started) { ctx.moveTo(xs[i], ys[i]); started = true; } else ctx.lineTo(xs[i], ys[i]);
    }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  function text(ctx, s, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.colour || css("--ink"); ctx.font = opts.font || "12px system-ui";
    ctx.textAlign = opts.align || "left"; ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(s, x, y);
  }
  function fmtDate(iso) {
    var m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return parseInt(iso.slice(8, 10), 10) + " " + m[parseInt(iso.slice(5, 7), 10) - 1] + " " + iso.slice(0, 4);
  }
  function stat(a) {
    var n = 0, s = 0, s2 = 0;
    for (var i = 0; i < a.length; i++) { if (a[i] === null || isNaN(a[i])) continue; n++; s += a[i]; s2 += a[i] * a[i]; }
    var m = s / n; return { n: n, mean: m, sd: Math.sqrt(Math.max(s2 / n - m * m, 0)) };
  }
  function pct(a, p) {
    var b = a.filter(function (v) { return v !== null && !isNaN(v); }).slice().sort(function (x, y) { return x - y; });
    return b[Math.min(b.length - 1, Math.floor(p / 100 * b.length))];
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* ---------------------------------------------------------------- the player */
  var ICONS = {
    first: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M6 12 16 5v14z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M18 12 8 19V5z"/></svg>',
    last: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>'
  };
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function create(opts) {
    var mount = typeof opts.mount === "string" ? document.querySelector(opts.mount) : opts.mount;
    var frames = opts.frames, fps = opts.fps || 6, speed = 1, loop = opts.loop !== false;
    var i = opts.start || 0, playing = false, wasPlaying = false, raf = null, acc = 0, lastT = 0;
    mount.classList.add("anim");
    mount.innerHTML = "";
    mount.tabIndex = 0;
    var canvas = document.createElement("canvas");
    var label = document.createElement("div"); label.className = "anim-label"; label.setAttribute("aria-live", "polite");
    var controls = document.createElement("div"); controls.className = "anim-controls";
    var extra = document.createElement("div"); extra.className = "anim-extra";
    mount.appendChild(canvas); mount.appendChild(label); mount.appendChild(controls); mount.appendChild(extra);

    function btn(icon, title, fn) {
      var b = document.createElement("button"); b.type = "button"; b.innerHTML = ICONS[icon]; b.title = title; b.setAttribute("aria-label", title);
      b.addEventListener("click", fn); controls.appendChild(b); return b;
    }
    btn("first", "First frame", function () { pause(); set(0); });
    btn("back", "Previous frame", function () { pause(); set(i - 1); });
    var playBtn = btn("play", "Play", function () { if (playing) pause(); else play(); }); playBtn.classList.add("play");
    btn("fwd", "Next frame", function () { pause(); set(i + 1); });
    btn("last", "Last frame", function () { pause(); set(frames - 1); });
    var range = document.createElement("input"); range.type = "range"; range.min = 0; range.max = frames - 1; range.value = i;
    range.setAttribute("aria-label", "Frame"); range.addEventListener("input", function () { pause(); set(parseInt(range.value, 10)); });
    controls.appendChild(range);
    var sel = document.createElement("select"); sel.setAttribute("aria-label", "Speed");
    [0.5, 1, 2, 4].forEach(function (s) { var o = document.createElement("option"); o.value = s; o.textContent = s + "x"; if (s === 1) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", function () { speed = parseFloat(sel.value); });
    controls.appendChild(sel);
    var loopLab = document.createElement("label"); loopLab.className = "loop";
    var loopBox = document.createElement("input"); loopBox.type = "checkbox"; loopBox.checked = loop;
    loopBox.addEventListener("change", function () { loop = loopBox.checked; });
    loopLab.appendChild(loopBox); loopLab.appendChild(document.createTextNode("loop")); controls.appendChild(loopLab);

    var ctx = canvas.getContext("2d"), size = { w: 0, h: 0 };
    function aspect(w) { return typeof opts.aspect === "function" ? opts.aspect(w) : (opts.aspect || 16 / 9); }
    function resize() {
      var w = Math.max(240, mount.clientWidth - 24), h = Math.round(w / aspect(w));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = { w: w, h: h, font: Math.max(11, Math.min(13, w / 60)) };
      draw();
    }
    function draw() {
      if (!size.w) return;
      ctx.clearRect(0, 0, size.w, size.h);
      try { opts.draw(i, ctx, size); } catch (e) { console.error(e); }
      if (opts.label) label.textContent = opts.label(i);
    }
    function set(k) {
      if (frames <= 0) return;
      if (k < 0) k = loop ? frames - 1 : 0;
      if (k >= frames) { if (loop) k = 0; else { k = frames - 1; pause(); } }
      i = k; range.value = k; draw();
    }
    function tick(t) {
      if (!playing) return;
      if (!lastT) lastT = t;
      acc += (t - lastT) * speed; lastT = t;
      var step = 1000 / fps;
      if (acc >= step) {
        var n = Math.floor(acc / step); acc -= n * step;
        set(i + n);
      }
      raf = requestAnimationFrame(tick);
    }
    function play() {
      if (playing) return;
      playing = true; lastT = 0; acc = 0; playBtn.innerHTML = ICONS.pause; playBtn.title = "Pause";
      raf = requestAnimationFrame(tick);
    }
    function pause() {
      playing = false; playBtn.innerHTML = ICONS.play; playBtn.title = "Play";
      if (raf) cancelAnimationFrame(raf); raf = null;
    }
    mount.addEventListener("keydown", function (e) {
      if (e.target !== mount) return;
      if (e.key === " ") { e.preventDefault(); playing ? pause() : play(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); pause(); set(i + (e.shiftKey ? 10 : 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); pause(); set(i - (e.shiftKey ? 10 : 1)); }
      else if (e.key === "Home") { e.preventDefault(); pause(); set(0); }
      else if (e.key === "End") { e.preventDefault(); pause(); set(frames - 1); }
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(mount); else window.addEventListener("resize", resize);
    if (window.IntersectionObserver) {
      var first = true;
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            if (first) { first = false; if (!reduced && opts.autoplay !== false) play(); }
            else if (wasPlaying) play();
          } else { wasPlaying = playing; pause(); }
        });
      }, { threshold: 0.2 }).observe(mount);
    }
    resize();
    var api = {
      set: set, play: play, pause: pause, redraw: draw, extra: extra,
      get frame() { return i; }, get playing() { return playing; },
      setFrames: function (n) { frames = n; range.max = n - 1; set(Math.min(i, n - 1)); },
      addToggle: function (labelText, name, options, onChange) {
        var wrap = document.createElement("span");
        wrap.appendChild(document.createTextNode(labelText + " "));
        /* one name for the whole group, or the browser treats each option as its own radio */
        var group = name + "-" + Math.random().toString(36).slice(2, 7);
        options.forEach(function (o) {
          var l = document.createElement("label");
          var r = document.createElement("input"); r.type = "radio"; r.name = group; r.value = o.value; r.checked = !!o.checked;
          r.addEventListener("change", function () { onChange(o.value); draw(); });
          l.appendChild(r); l.appendChild(document.createTextNode(o.label)); wrap.appendChild(l);
        });
        extra.appendChild(wrap);
      },
      addCheck: function (labelText, checked, onChange) {
        var l = document.createElement("label");
        var c = document.createElement("input"); c.type = "checkbox"; c.checked = checked;
        c.addEventListener("change", function () { onChange(c.checked); draw(); });
        l.appendChild(c); l.appendChild(document.createTextNode(labelText)); extra.appendChild(l);
      }
    };
    return api;
  }

  function fallback(mount, msg) {
    var m = typeof mount === "string" ? document.querySelector(mount) : mount;
    if (m) m.innerHTML = '<p class="anim-fallback">' + msg + "</p>";
  }

  return {
    load: { json: json, int16: int16, grid: grid },
    scales: scales, legend: legend, css: css,
    axes: { linear: linear, niceTicks: niceTicks, xAxis: xAxis, yAxis: yAxis, yearTicks: yearTicks, fmt: fmt },
    draw: { line: line, text: text },
    util: { fmtDate: fmtDate, stat: stat, pct: pct, ease: ease },
    Player: { create: create, fallback: fallback },
    reducedMotion: reduced
  };
})();
