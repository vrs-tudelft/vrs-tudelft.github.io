/* The whole-project flowchart: three pipelines in lanes, each can be folded to one box.
   Hover a box for what it does, click to pin its card (its link opens the page section).
   A path walks through its boxes step by step and opens the lanes it needs.
   The chart itself is data in js/overview-data.js (window.VRS_FLOW). */
(function () {
  "use strict";
  var F = window.VRS_FLOW;
  var svg = document.getElementById("ov-svg");
  var world = document.getElementById("ov-world");
  var card = document.getElementById("ov-card");
  var stage = document.getElementById("ov-stage");
  if (!F || !svg) return;

  var ICONS = window.VRS_ICONS || {};        // js/icons.js

  var NS = "http://www.w3.org/2000/svg";
  var G = { mainW: 262, sideW: 200, gapIn: 40, laneGap: 130, rowH: 112, nodeH: 72, top: 110, left: 40, sumH: 196 };
  var LANE_COL = { air: "#4f9a5a", sim: "#8061c0", est: "#3a78a8" };
  var open = {};
  F.lanes.forEach(function (l) { open[l.id] = false; });
  var path = null, step = -1;                 // the path being followed, and its current step
  var pinned = null, hoverId = null;
  var view = { x: 0, y: 0, k: 1 };
  var boxes = {}, laneOf = {}, first = true;
  F.nodes.forEach(function (n) { laneOf[n.id] = n.lane; });

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function icon(parent, name, x, y, size, cls) {
    var g = el("g", { transform: "translate(" + x + "," + y + ") scale(" + size / 24 + ")", class: "ic " + (cls || "") }, parent);
    g.innerHTML = ICONS[name] || "";
    return g;
  }
  function iconHTML(name, cls) { return '<svg viewBox="0 0 24 24" class="' + (cls || "ic") + '" aria-hidden="true">' + (ICONS[name] || "") + "</svg>"; }
  function lane(id) { return F.lanes.filter(function (l) { return l.id === id; })[0]; }
  function pathById(id) { return (F.paths || []).filter(function (p) { return p.id === id; })[0] || null; }

  /* ---------------------------------------------------------------- layout */
  function layout() {
    boxes = {};
    var x = G.left, lanes = [];
    F.lanes.forEach(function (l) {
      var ns = F.nodes.filter(function (n) { return n.lane === l.id; });
      var hasL = ns.some(function (n) { return n.col === -1; }), hasR = ns.some(function (n) { return n.col === 1; });
      var info = { lane: l, x0: x, open: open[l.id], count: ns.length };
      if (!open[l.id]) {
        info.w = G.mainW; info.h = G.sumH;
        boxes["lane:" + l.id] = { x: x, y: G.top, w: G.mainW, h: G.sumH, lx0: x, lx1: x + G.mainW,
          node: { id: "lane:" + l.id, lane: l.id, type: "summary", icon: l.icon, title: l.title, sub: l.summary, tip: l.tip, link: l.link, linkText: l.linkText, code: l.code, count: ns.length } };
      } else {
        var lx = x, mx = x + (hasL ? G.sideW + G.gapIn : 0), rx = mx + G.mainW + G.gapIn, maxRow = 0;
        info.w = (hasL ? G.sideW + G.gapIn : 0) + G.mainW + (hasR ? G.gapIn + G.sideW : 0);
        ns.forEach(function (n) {
          var w = n.col ? G.sideW : G.mainW;
          var bx = n.col === -1 ? lx : n.col === 1 ? rx : mx;
          var h = n.type === "decision" ? G.nodeH + 16 : G.nodeH;
          boxes[n.id] = { x: bx, y: G.top + n.row * G.rowH + (G.nodeH - h) / 2, w: w, h: h, node: n, lx0: x, lx1: x + info.w };
          maxRow = Math.max(maxRow, n.row);
        });
        info.h = maxRow * G.rowH + G.nodeH;
      }
      lanes.push(info);
      x += info.w + G.laneGap;
    });
    var h = 0; lanes.forEach(function (l) { h = Math.max(h, l.h); });
    return { lanes: lanes, width: x - G.laneGap + G.left, height: G.top + h + 60 };
  }
  function boxFor(id) { return boxes[id] || boxes["lane:" + laneOf[id]]; }

  /* ---------------------------------------------------------------- edges */
  function route(a, b, i) {
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    if (a.node.lane !== b.node.lane) {
      var right = b.x > a.x, sx = right ? a.x + a.w : a.x, ex = right ? b.x : b.x + b.w;
      var mid = right ? b.lx0 - G.laneGap / 2 + (i % 5 - 2) * 11 : b.lx1 + G.laneGap / 2;
      if (Math.abs(ay - by) < 2) return [[sx, ay], [ex, by]];
      return [[sx, ay], [mid, ay], [mid, by], [ex, by]];
    }
    if (Math.abs(ax - bx) < 2) return by > ay ? [[ax, a.y + a.h], [bx, b.y]] : [[ax, a.y], [bx, b.y + b.h]];
    if (Math.abs(ay - by) < 2) return bx > ax ? [[a.x + a.w, ay], [b.x, by]] : [[a.x, ay], [b.x + b.w, by]];
    if (by > ay) return [[ax, a.y + a.h], [ax, by], [bx > ax ? b.x : b.x + b.w, by]];
    return [[ax, a.y], [ax, by], [bx > ax ? b.x : b.x + b.w, by]];
  }
  function pathD(pts) {
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], q = pts[i - 1], n = pts[i + 1];
      if (n) {
        var dx1 = Math.sign(p[0] - q[0]), dy1 = Math.sign(p[1] - q[1]), dx2 = Math.sign(n[0] - p[0]), dy2 = Math.sign(n[1] - p[1]);
        var r = Math.min(12, (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1])) / 2, (Math.abs(n[0] - p[0]) + Math.abs(n[1] - p[1])) / 2);
        d += " L" + (p[0] - dx1 * r) + "," + (p[1] - dy1 * r) + " Q" + p[0] + "," + p[1] + " " + (p[0] + dx2 * r) + "," + (p[1] + dy2 * r);
      } else d += " L" + p[0] + "," + p[1];
    }
    return d;
  }

  /* ---------------------------------------------------------------- nodes */
  function shape(g, b) {
    var t = b.node.type, x = b.x, y = b.y, w = b.w, h = b.h, s = 14;
    if (t === "input" || t === "output") return el("path", { d: "M" + (x + s) + "," + y + " H" + (x + w) + " L" + (x + w - s) + "," + (y + h) + " H" + x + " Z", class: "sh" }, g);
    if (t === "decision") return el("path", { d: "M" + (x + w / 2) + "," + y + " L" + (x + w) + "," + (y + h / 2) + " L" + (x + w / 2) + "," + (y + h) + " L" + x + "," + (y + h / 2) + " Z", class: "sh" }, g);
    return el("rect", { x: x, y: y, width: w, height: h, rx: t === "summary" ? 16 : t === "result" ? h / 2 : 9, class: "sh" }, g);
  }
  function wrap(text, maxChars) {
    var words = String(text).split(" "), lines = [], cur = "";
    words.forEach(function (wd) {
      if ((cur + " " + wd).trim().length > maxChars && cur) { lines.push(cur); cur = wd; } else cur = (cur + " " + wd).trim();
    });
    if (cur) lines.push(cur);
    if (lines.length > 1 && lines[lines.length - 1].length <= 2) { var lastw = lines.pop(); lines[lines.length - 1] += " " + lastw; }
    return lines;
  }
  function content(g, b) {
    var n = b.node, t = n.type, x = b.x, w = b.w;
    var iconSize = t === "summary" ? 34 : 22, hasIcon = !!n.icon, io = t === "input" || t === "output";
    var left, right;
    if (t === "decision") { left = x + w * 0.21; right = x + w * 0.79; }
    else if (t === "summary") { left = x + 22; right = x + w - 22; }
    else { left = x + (io ? 22 : 12) + (hasIcon ? 34 : 0); right = x + w - (io ? 22 : 12); }
    var cx = (left + right) / 2, inner = right - left, big = t === "summary";
    var tl = wrap(n.title, Math.floor(inner / (big ? 9 : 7.1)));
    var sub = n.sub ? (Array.isArray(n.sub) ? n.sub.slice() : wrap(n.sub, Math.floor(inner / 5.9))) : [];
    sub = sub.slice(0, big ? 4 : t === "decision" ? 1 : 2);
    var lh = big ? 21 : 16.5, slh = big ? 17 : 14.5;
    var total = tl.length * lh + sub.length * slh;
    var y0 = big ? b.y + 70 : b.y + b.h / 2 - total / 2 + 12 + (t === "decision" && hasIcon ? 7 : 0);
    if (hasIcon) {
      if (big) icon(g, n.icon, x + w / 2 - iconSize / 2, b.y + 18, iconSize, "ic-lane");
      else if (t === "decision") icon(g, n.icon, x + w / 2 - 8, y0 - 30, 16);
      else icon(g, n.icon, x + (io ? 24 : 14), b.y + b.h / 2 - iconSize / 2, iconSize);
    }
    tl.forEach(function (line, i) { el("text", { x: cx, y: y0 + i * lh, class: "tt" }, g).textContent = line; });
    y0 += tl.length * lh;
    sub.forEach(function (line, i) { el("text", { x: cx, y: y0 + i * slh + 1, class: "ts" }, g).textContent = line; });
    if (big) {
      var chip = el("g", { class: "chip" }, g), label = n.count + " steps · click to unfold", cw = label.length * 6.1 + 22;
      el("rect", { x: x + w / 2 - cw / 2, y: b.y + b.h - 32, width: cw, height: 22, rx: 11 }, chip);
      el("text", { x: x + w / 2, y: b.y + b.h - 17 }, chip).textContent = label;
    }
  }

  /* ---------------------------------------------------------------- draw */
  var L, edgeList = [];
  function draw() {
    L = layout();
    while (world.firstChild) world.removeChild(world.firstChild);
    var lanesG = el("g", {}, world), edgesG = el("g", { class: "edges" }, world), labelsG = el("g", {}, world), nodesG = el("g", {}, world);
    var P = pathById(path), stepNo = {};
    if (P) P.steps.forEach(function (id, i) { var b = boxFor(id); if (b && !(b.node.id in stepNo)) stepNo[b.node.id] = i + 1; });

    L.lanes.forEach(function (info) {
      var l = info.lane, pad = 24, c = LANE_COL[l.id] || "#666";
      el("rect", { x: info.x0 - pad, y: 18, width: info.w + 2 * pad, height: info.h + G.top - 18 + pad, rx: 22, class: "lane lane-" + l.id }, lanesG);
      var head = el("g", { class: "lane-head", tabindex: 0, role: "button", "aria-expanded": String(info.open), "aria-label": (info.open ? "Fold " : "Unfold ") + l.title }, lanesG);
      var hx = info.x0 - pad + 20;
      el("rect", { x: hx, y: 36, width: 44, height: 44, rx: 12, fill: c, class: "lane-tile" }, head);
      icon(head, l.icon, hx + 10, 46, 24, "ic-tile");
      el("text", { x: hx + 58, y: 55, class: "lane-title" }, head).textContent = l.num + "  " + l.title;
      el("text", { x: hx + 58, y: 75, class: "lane-sub" }, head).textContent = l.who + " · " + info.count + " steps";
      var fx = info.x0 + info.w + pad - 20, chipW = info.open ? 64 : 80;
      if (info.open) {
        var chip = el("g", { class: "lane-chip" }, head);
        el("rect", { x: fx - chipW, y: 44, width: chipW, height: 26, rx: 13 }, chip);
        el("text", { x: fx - chipW / 2, y: 61 }, chip).textContent = info.open ? "Fold" : "Unfold";
      }
      head.addEventListener("click", function () { setLane(l.id, !open[l.id]); });
      head.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLane(l.id, !open[l.id]); } });
    });

    var drawn = {}, idx = {};
    edgeList = [];
    F.edges.forEach(function (e) {
      var a = boxFor(e.from), b = boxFor(e.to);
      if (!a || !b || a === b) return;
      var key = a.node.id + ">" + b.node.id;
      if (drawn[key]) return;
      var cross = a.node.lane !== b.node.lane;
      if (cross) idx[b.node.lane] = (idx[b.node.lane] || 0) + 1;
      var pts = route(a, b, cross ? idx[b.node.lane] - 1 : 0);
      var g = el("g", { class: "edge" + (cross ? " cross" : "") + (e.dashed ? " dashed" : "") }, edgesG);
      el("path", { d: pathD(pts), class: "ln", "marker-end": "url(#ov-arrow)" }, g);
      el("path", { d: pathD(pts), class: "flow" }, g);
      var rec = { g: g, from: a.node.id, to: b.node.id };
      if (e.label) {
        var p0 = pts[pts.length - 2], p1 = pts[pts.length - 1], lx, ly, wl = e.label.length * 6.3 + 16;
        if (p0[1] === p1[1]) { lx = (p0[0] + p1[0]) / 2; ly = p1[1] - 14; } else { lx = p1[0] + wl / 2 + 6; ly = (p0[1] + p1[1]) / 2; }
        var lg = el("g", { class: "el" }, labelsG);
        el("rect", { x: lx - wl / 2, y: ly - 10, width: wl, height: 20, rx: 10 }, lg);
        el("text", { x: lx, y: ly + 4 }, lg).textContent = e.label;
        rec.label = lg;
      }
      drawn[key] = rec; edgeList.push(rec);
    });

    Object.keys(boxes).forEach(function (id) {
      var b = boxes[id], n = b.node;
      var g = el("g", { class: "node t-" + n.type + " lane-" + n.lane, tabindex: 0, role: "button", "data-id": id, "aria-label": n.title }, nodesG);
      if (first) g.style.animationDelay = (n.row || 0) * 35 + (n.col === 1 ? 20 : 0) + "ms";
      else g.style.animation = "none";
      shape(g, b);
      content(g, b);
      if (n.link) {
        var io = n.type === "input" || n.type === "output";
        var dx = n.type === "decision" ? b.x + b.w * 0.7 : io ? b.x + b.w - 13 : b.x + b.w - 10;
        var dy = n.type === "decision" ? b.y + b.h * 0.24 : b.y + 10;
        el("circle", { cx: dx, cy: dy, r: 3.4, class: "has-link" }, g);
      }
      if (stepNo[id]) {
        var bg = el("g", { class: "badge" }, g);
        var bx0 = n.type === "decision" ? b.x + b.w / 2 - 40 : b.x - 8, by0 = n.type === "decision" ? b.y + 4 : b.y - 10;
        el("circle", { cx: bx0 + 12, cy: by0 + 12, r: 12.5 }, bg);
        el("text", { x: bx0 + 12, y: by0 + 16.5 }, bg).textContent = stepNo[id];
      }
      g.addEventListener("pointerenter", function () { if (dragging) return; hoverId = id; showCard(id, false); if (!path) highlight(id); });
      g.addEventListener("pointerleave", function () {
        hoverId = null;
        if (pinned && boxes[pinned]) { if (!path) highlight(pinned); showCard(pinned, true); } else { hideCard(); highlight(null); }
      });
      g.addEventListener("click", function (e) {
        e.stopPropagation(); if (moved) return;
        if (n.type === "summary") { setLane(n.lane, true); return; }
        var Pn = pathById(path);
        if (Pn && Pn.steps.indexOf(id) >= 0) { goStep(Pn.steps.indexOf(id)); return; }
        if (Pn) stopPath(true);
        pin(id);
      });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); g.dispatchEvent(new MouseEvent("click")); } });
      g.addEventListener("focus", function () { showCard(id, false); if (!path) highlight(id); });
    });
    first = false;
    highlight(!path && pinned && boxes[pinned] ? pinned : null);
  }

  /* ---------------------------------------------------------------- highlight */
  function reach(id) {
    var up = {}, down = {};
    function walk(start, dir, seen) {
      var stack = [start];
      while (stack.length) {
        var c = stack.pop();
        edgeList.forEach(function (e) {
          var nxt = dir > 0 ? (e.from === c ? e.to : null) : (e.to === c ? e.from : null);
          if (nxt && !seen[nxt]) { seen[nxt] = 1; stack.push(nxt); }
        });
      }
    }
    walk(id, 1, down); walk(id, -1, up);
    return { up: up, down: down };
  }
  function highlight(id) {
    var on = {}, nb = null, P = pathById(path), onPath = {}, cur = P && step >= 0 ? (boxFor(P.steps[step]) || {}).node : null;
    if (P) P.steps.forEach(function (s) { var b = boxFor(s); if (b) onPath[b.node.id] = 1; });
    if (id && !P) { nb = reach(id); on[id] = 1; for (var k in nb.up) on[k] = 1; for (k in nb.down) on[k] = 1; }
    var any = !!id || !!P;
    world.querySelectorAll(".node").forEach(function (g) {
      var nid = g.getAttribute("data-id"), lit = P ? onPath[nid] : on[nid];
      g.classList.toggle("dim", any && !lit);
      g.classList.toggle("onpath", !!P && !!onPath[nid]);
      g.classList.toggle("focus", P ? !!cur && nid === cur.id : nid === id);
    });
    edgeList.forEach(function (e) {
      var lit;
      if (P) lit = onPath[e.from] && onPath[e.to];
      else if (nb) lit = ((e.from === id || nb.down[e.from]) && nb.down[e.to]) || ((e.to === id || nb.up[e.to]) && nb.up[e.from]);
      e.g.classList.toggle("dim", any && !lit);
      e.g.classList.toggle("lit", any && !!lit);
      if (e.label) e.label.classList.toggle("dim", any && !lit);
    });
  }

  /* ---------------------------------------------------------------- card */
  function showCard(id, isPinned) {
    var b = boxes[id]; if (!b) return;
    var n = b.node, l = lane(n.lane), P = pathById(path), si = P ? P.steps.indexOf(id) : -1;
    var h = '<div class="ov-card-head"><span class="ov-card-ic" style="background:' + (LANE_COL[n.lane] || "#666") + '">' + iconHTML(n.icon || (l && l.icon)) + "</span>";
    h += '<div><div class="ov-card-lane lane-' + n.lane + '">' + esc(l ? l.num + " · " + l.title : "") + "</div><h3>" + esc(n.title) + "</h3></div></div>";
    if (n.tip) h += "<p>" + n.tip + "</p>";
    if (n.number) h += '<p class="ov-num">' + n.number + "</p>";
    if (n.code) h += '<button type="button" class="t i tip-trigger" aria-label="Source context" data-tip="'+esc(n.code)+'"><span class="info" aria-hidden="true">i</span></button>';
    if (n.type === "summary") h += '<p class="ov-hint">Click the box to unfold this part.</p>';
    if (n.link) h += '<a class="ov-go" href="' + esc(n.link) + '">' + esc(n.linkText || "Read more on the website") + " &rarr;</a>";
    if (P && si >= 0 && isPinned && si === step) {
      h += '<div class="ov-step"><button type="button" data-step="-1"' + (si === 0 ? " disabled" : "") + ' aria-label="Previous step">&larr;</button>' +
        "<span>Step " + (si + 1) + " of " + P.steps.length + "</span>" +
        '<button type="button" data-step="1"' + (si === P.steps.length - 1 ? " disabled" : "") + ' aria-label="Next step">&rarr;</button></div>';
    } else if (!isPinned && n.type !== "summary") h += '<p class="ov-hint">' + (P && si >= 0 ? "Click to go to step " + (si + 1) + "." : "Click to pin this card.") + "</p>";
    if (isPinned) h += '<button type="button" class="ov-x" aria-label="Close">&times;</button>';
    card.innerHTML = h;
    card.hidden = false;
    card.classList.toggle("pinned", !!isPinned);
    var x = card.querySelector(".ov-x"); if (x) x.addEventListener("click", function () { if (path) stopPath(); else unpin(); });
    card.querySelectorAll("[data-step]").forEach(function (bt) { bt.addEventListener("click", function () { goStep(step + Number(bt.getAttribute("data-step"))); }); });
    place(b);
  }
  function place(b) {
    if (card.hidden) return;
    var sr = stage.getBoundingClientRect(), r = svg.getBoundingClientRect();
    var sx = r.left - sr.left + (b.x * view.k + view.x), sy = r.top - sr.top + (b.y * view.k + view.y);
    var w = card.offsetWidth, h = card.offsetHeight, bw = b.w * view.k, bh = b.h * view.k;
    var left = sx + bw + 16, top = sy + bh / 2 - h / 2;
    if (left + w > sr.width - 10) left = sx - w - 16;
    if (left < 10) { left = Math.max(10, Math.min(sr.width - w - 10, sx + bw / 2 - w / 2)); top = sy + bh + 12; if (top + h > sr.height - 10) top = sy - h - 12; }
    top = Math.max(10, Math.min(sr.height - h - 10, top));
    card.style.left = left + "px"; card.style.top = top + "px";
  }
  function hideCard() { card.hidden = true; }
  function pin(id) {
    if (pinned === id) { unpin(); return; }
    pinned = id; showCard(id, true); highlight(id); setHash();
  }
  function unpin() { pinned = null; hideCard(); highlight(null); setHash(); }

  /* ---------------------------------------------------------------- camera */
  var anim = null;
  function apply() {
    world.setAttribute("transform", "translate(" + view.x + "," + view.y + ") scale(" + view.k + ")");
    var b = boxes[hoverId] || boxes[pinned];
    if (b) place(b);
  }
  function animateTo(t, ms) {
    if (anim) cancelAnimationFrame(anim);
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
    var s = { x: view.x, y: view.y, k: view.k }, t0 = performance.now();
    (function tick(now) {
      var p = ms ? Math.min(1, (now - t0) / ms) : 1, e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      view.x = s.x + (t.x - s.x) * e; view.y = s.y + (t.y - s.y) * e; view.k = s.k + (t.k - s.k) * e; apply();
      anim = p < 1 ? requestAnimationFrame(tick) : null;
    })(t0);
  }
  function frame(x0, y0, x1, y1, maxK) {
    var r = svg.getBoundingClientRect(), pad = 30;
    var k = Math.min((r.width - 2 * pad) / (x1 - x0), (r.height - 2 * pad) / (y1 - y0), maxK || 1.25);
    k = Math.max(k, r.width < 700 ? 0.42 : 0.2);
    return { k: k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: Math.max(pad - y0 * k, (r.height - (y1 - y0) * k) / 2 - y0 * k) };
  }
  function fit(ms) {
    var t = frame(0, 0, L.width, L.height);
    if (svg.getBoundingClientRect().width < 700) { t.x = 16; t.y = 16; }
    animateTo(t, ms || 0);
  }
  function centerOn(b, ms) {
    var r = svg.getBoundingClientRect(), k = Math.max(view.k, r.width < 700 ? 0.6 : 0.85);
    var cardRoom = r.width > 900 ? 190 : 0;
    animateTo({ k: k, x: r.width / 2 - cardRoom - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + b.h / 2) * k }, ms);
  }
  function zoomAt(f, cx, cy) {
    var k = Math.max(0.2, Math.min(2.5, view.k * f)); f = k / view.k;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k; apply();
  }
  svg.addEventListener("wheel", function (e) {               // like Figma: scroll pans, ctrl/cmd + scroll (and trackpad pinch) zooms
    e.preventDefault();
    var r = svg.getBoundingClientRect(), f = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * f * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { view.x -= (e.shiftKey ? e.deltaY : e.deltaX) * f; if (!e.shiftKey) view.y -= e.deltaY * f; apply(); }
  }, { passive: false });
  var dragging = false, moved = false, last = null, pointers = {}, pinch = null;
  svg.addEventListener("pointerdown", function (e) {
    pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; }
    dragging = true; moved = false; last = [e.clientX, e.clientY];
    if (anim) { cancelAnimationFrame(anim); anim = null; }
  });
  window.addEventListener("pointermove", function (e) {
    if (!dragging || !pointers[e.pointerId]) return;
    pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2 && pinch) {
      var a = pointers[ids[0]], b = pointers[ids[1]], r = svg.getBoundingClientRect();
      zoomAt(pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d / view.k, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      moved = true; return;
    }
    var dx = e.clientX - last[0], dy = e.clientY - last[1];
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true; svg.classList.add("grabbing");
    view.x += dx; view.y += dy; last = [e.clientX, e.clientY]; apply();
  });
  function up(e) {
    delete pointers[e.pointerId]; if (Object.keys(pointers).length < 2) pinch = null;
    if (Object.keys(pointers).length) return;
    dragging = false; svg.classList.remove("grabbing");
    setTimeout(function () { moved = false; }, 0);
  }
  window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  svg.addEventListener("click", function () { if (!moved && pinned && !path) unpin(); });
  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (e.key === "Escape") { if (path) stopPath(); else unpin(); }
    if (path && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); goStep(step + (e.key === "ArrowRight" ? 1 : -1)); }
  });

  /* ---------------------------------------------------------------- lanes and paths */
  function syncSwitches() {
    F.lanes.forEach(function (l) { var sw = document.querySelector('input[data-lane="' + l.id + '"]'); if (sw) sw.checked = open[l.id]; });
  }
  function setLane(id, isOpen) { open[id] = isOpen; syncSwitches(); draw(); if (path && step >= 0) refocus(); else fit(350); setHash(); }
  function all(isOpen) { F.lanes.forEach(function (l) { open[l.id] = isOpen; }); syncSwitches(); draw(); fit(350); setHash(); }
  document.querySelectorAll("input[data-lane]").forEach(function (i) { i.addEventListener("change", function () { setLane(i.getAttribute("data-lane"), i.checked); }); });
  var bAll = document.getElementById("ov-all"), bNone = document.getElementById("ov-none");
  if (bAll) bAll.addEventListener("click", function () { stopPath(true); all(true); });
  if (bNone) bNone.addEventListener("click", function () { stopPath(true); all(false); });
  document.getElementById("ov-zin").addEventListener("click", function () { var r = svg.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); });
  document.getElementById("ov-zout").addEventListener("click", function () { var r = svg.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); });
  document.getElementById("ov-fit").addEventListener("click", function () { fit(350); });

  var listEl = document.getElementById("ov-paths"), storyEl = document.getElementById("ov-story");
  if (listEl) {
    listEl.innerHTML = (F.paths || []).map(function (p) {
      return '<button type="button" class="ov-path" data-path="' + p.id + '" aria-pressed="false" title="' + esc(p.title) + " (" + p.steps.length + ' steps)">' + iconHTML(p.icon, "ic") + "<span>" + esc(p.short || p.title) + "</span></button>";
    }).join("");
    listEl.querySelectorAll(".ov-path").forEach(function (bt) {
      bt.addEventListener("click", function () { var id = bt.getAttribute("data-path"); if (path === id) stopPath(); else startPath(id); });
    });
  }
  function renderStory() {
    if (listEl) listEl.querySelectorAll(".ov-path").forEach(function (bt) { var on = bt.getAttribute("data-path") === path; bt.classList.toggle("on", on); bt.setAttribute("aria-pressed", String(on)); });
    if (!storyEl) return;
    var P = pathById(path);
    storyEl.hidden = !P;
    if (!P) { storyEl.innerHTML = ""; return; }
    var dots = P.steps.map(function (s, i) { return '<i class="' + (i === step ? "on" : i < step ? "done" : "") + '"></i>'; }).join("");
    storyEl.innerHTML = "<p><b>" + esc(P.title) + ".</b> " + P.text + "</p>" +
      '<div class="ov-dots" aria-hidden="true">' + dots + "</div>" +
      '<div class="ov-tour"><button type="button" class="ov-btn" data-go="-1"' + (step <= 0 ? " disabled" : "") + '>&larr; Back</button>' +
      "<span>" + (step + 1) + " / " + P.steps.length + "</span>" +
      '<button type="button" class="ov-btn primary" data-go="1"' + (step >= P.steps.length - 1 ? " disabled" : "") + ">Next &rarr;</button></div>";
    storyEl.querySelectorAll("[data-go]").forEach(function (bt) { bt.addEventListener("click", function () { goStep(step + Number(bt.getAttribute("data-go"))); }); });
  }
  function startPath(id, atStep) {
    var P = pathById(id); if (!P) return;
    path = id; step = atStep || 0; pinned = null; hideCard();
    var need = {};
    P.steps.forEach(function (s) { need[laneOf[s]] = 1; });
    F.lanes.forEach(function (l) { open[l.id] = !!need[l.id]; });
    syncSwitches(); draw();
    var xs = [], ys = [];
    P.steps.forEach(function (s) { var b = boxes[s]; if (b) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); } });
    animateTo(frame(Math.min.apply(null, xs) - 40, Math.min.apply(null, ys) - 70, Math.max.apply(null, xs) + 40, Math.max.apply(null, ys) + 40, 1), 450);
    renderStory(); setHash();
    setTimeout(function () { if (path === id) goStep(step); }, 650);
  }
  function goStep(i) {
    var P = pathById(path); if (!P) return;
    step = Math.max(0, Math.min(P.steps.length - 1, i));
    refocus(); renderStory(); setHash();
  }
  function refocus() {
    var P = pathById(path); if (!P) return;
    var id = P.steps[step], b = boxes[id];
    if (!b) { open[laneOf[id]] = true; syncSwitches(); draw(); b = boxes[id]; }
    pinned = id; highlight(null);
    showCard(id, true);
    centerOn(b, 420);
  }
  function stopPath(silent) {
    if (!path) return;
    path = null; step = -1; pinned = null; hideCard();
    if (!silent) { draw(); fit(350); }
    renderStory(); setHash();
  }

  /* ---------------------------------------------------------------- URL state: #fold=air,sim  #box=id  #path=real&step=3 */
  function setHash() {
    var parts = [], closed = F.lanes.filter(function (l) { return !open[l.id]; }).map(function (l) { return l.id; });
    if (path) { parts.push("path=" + path); if (step > 0) parts.push("step=" + (step + 1)); }
    else { if (closed.length) parts.push("fold=" + closed.join(",")); if (pinned) parts.push("box=" + encodeURIComponent(pinned)); }
    try { history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname + location.search); } catch (e) { /* file:// */ }
  }
  function readHash() {
    var h = {};
    location.hash.replace(/^#/, "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) h[p[0]] = decodeURIComponent(p[1] || ""); });
    if (h.fold) h.fold.split(",").forEach(function (id) { if (id in open) open[id] = false; });
    syncSwitches();
    return h;
  }

  var h0 = readHash();
  draw(); fit(0); renderStory();
  if (h0.path && pathById(h0.path)) startPath(h0.path, Math.max(0, (Number(h0.step) || 1) - 1));
  else if (h0.box && boxes[h0.box]) pin(h0.box);
  var t; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { if (path && step >= 0) refocus(); else fit(0); }, 150); });
})();
