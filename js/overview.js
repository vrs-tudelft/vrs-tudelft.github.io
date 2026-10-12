/* The whole-project flowchart: three pipelines in lanes, each can be folded to one box.
   Hover a box for what it does, click to pin the card (its link opens the page section).
   The chart itself is in js/overview-data.js (window.VRS_FLOW). */
(function () {
  "use strict";
  var F = window.VRS_FLOW;
  var svg = document.getElementById("ov-svg");
  var world = document.getElementById("ov-world");
  var card = document.getElementById("ov-card");
  var stage = document.getElementById("ov-stage");
  if (!F || !svg) return;

  var NS = "http://www.w3.org/2000/svg";
  var G = { mainW: 250, sideW: 190, gapIn: 40, laneGap: 120, rowH: 112, nodeH: 70, top: 92, left: 40, sumH: 150 };
  var open = {};                                   // lane id -> expanded?
  F.lanes.forEach(function (l) { open[l.id] = true; });
  var path = "";                                   // highlighted story ("" = none)
  var pinned = null, hoverId = null;
  var view = { x: 0, y: 0, k: 1 };
  var boxes = {};                                  // node id -> {x,y,w,h,node}
  var laneOf = {};
  F.nodes.forEach(function (n) { laneOf[n.id] = n.lane; });

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------------------------------------------------------- layout */
  function layout() {
    boxes = {};
    var x = G.left, lanes = [];
    F.lanes.forEach(function (l) {
      var ns = F.nodes.filter(function (n) { return n.lane === l.id; });
      var hasL = ns.some(function (n) { return n.col === -1; }), hasR = ns.some(function (n) { return n.col === 1; });
      var info = { lane: l, x0: x, open: open[l.id] };
      if (!open[l.id]) {
        info.w = G.mainW; info.mainX = x;
        var rows = 0; ns.forEach(function (n) { rows = Math.max(rows, n.row); });
        info.h = G.sumH;
        boxes["lane:" + l.id] = { x: x, y: G.top, w: G.mainW, h: G.sumH, lx0: x, lx1: x + G.mainW, node: { id: "lane:" + l.id, lane: l.id, type: "summary", title: l.title, sub: l.summary, tip: l.tip, link: l.link, linkText: l.linkText, code: l.code, paths: l.paths } };
      } else {
        var lx = hasL ? x : null, mx = x + (hasL ? G.sideW + G.gapIn : 0), rx = mx + G.mainW + G.gapIn;
        info.w = (hasL ? G.sideW + G.gapIn : 0) + G.mainW + (hasR ? G.gapIn + G.sideW : 0);
        info.mainX = mx;
        var maxRow = 0;
        ns.forEach(function (n) {
          var w = n.col === 0 || n.col == null ? G.mainW : G.sideW;
          var bx = n.col === -1 ? lx : n.col === 1 ? rx : mx;
          var h = n.type === "decision" ? G.nodeH + 14 : G.nodeH;
          var y = G.top + n.row * G.rowH + (G.nodeH - h) / 2;
          boxes[n.id] = { x: bx, y: y, w: w, h: h, node: n, lx0: x, lx1: x + info.w };
          maxRow = Math.max(maxRow, n.row);
        });
        info.h = maxRow * G.rowH + G.nodeH;
      }
      lanes.push(info);
      x += info.w + G.laneGap;
    });
    return { lanes: lanes, width: x - G.laneGap + G.left, height: G.top + Math.max.apply(null, lanes.map(function (l) { return l.h; })) + 60 };
  }
  function boxFor(id) { return boxes[id] || boxes["lane:" + laneOf[id]]; }

  /* ---------------------------------------------------------------- edges */
  function route(a, b, i) {
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    var pts;
    if (a.node.lane !== b.node.lane) {                          // across lanes, through the gap before b's lane
      var right = b.x > a.x;
      var sx = right ? a.x + a.w : a.x, ex = right ? b.x : b.x + b.w;
      var mid = right ? b.lx0 - G.laneGap / 2 + (i % 5 - 2) * 10 : b.lx1 + G.laneGap / 2;
      pts = [[sx, ay], [mid, ay], [mid, by], [ex, by]];
      if (Math.abs(ay - by) < 2) pts = [[sx, ay], [ex, by]];
    } else if (Math.abs(ax - bx) < 2) {                          // straight down (or up)
      pts = by > ay ? [[ax, a.y + a.h], [bx, b.y]] : [[ax, a.y], [bx, b.y + b.h]];
    } else if (Math.abs(ay - by) < 2) {                          // side by side
      pts = bx > ax ? [[a.x + a.w, ay], [b.x, by]] : [[a.x, ay], [b.x + b.w, by]];
    } else if (by > ay) {                                        // down first, then sideways into b's side
      pts = [[ax, a.y + a.h], [ax, by], [bx > ax ? b.x : b.x + b.w, by]];
    } else {                                                     // up: sideways out of a, into b's side
      pts = [[ax, a.y], [ax, by], [bx > ax ? b.x : b.x + b.w, by]];
    }
    return pts;
  }
  function pathD(pts) {
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], q = pts[i - 1], n = pts[i + 1];
      if (n) {                                                   // rounded corners
        var r = 10, dx1 = Math.sign(p[0] - q[0]), dy1 = Math.sign(p[1] - q[1]), dx2 = Math.sign(n[0] - p[0]), dy2 = Math.sign(n[1] - p[1]);
        var l1 = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]), l2 = Math.abs(n[0] - p[0]) + Math.abs(n[1] - p[1]);
        r = Math.min(r, l1 / 2, l2 / 2);
        d += " L" + (p[0] - dx1 * r) + "," + (p[1] - dy1 * r) + " Q" + p[0] + "," + p[1] + " " + (p[0] + dx2 * r) + "," + (p[1] + dy2 * r);
      } else d += " L" + p[0] + "," + p[1];
    }
    return d;
  }

  /* ---------------------------------------------------------------- shapes */
  function shape(g, b) {
    var n = b.node, t = n.type, x = b.x, y = b.y, w = b.w, h = b.h, s = 14;
    if (t === "input" || t === "output") return el("path", { d: "M" + (x + s) + "," + y + " H" + (x + w) + " L" + (x + w - s) + "," + (y + h) + " H" + x + " Z", class: "sh" }, g);
    if (t === "decision") return el("path", { d: "M" + (x + w / 2) + "," + y + " L" + (x + w) + "," + (y + h / 2) + " L" + (x + w / 2) + "," + (y + h) + " L" + x + "," + (y + h / 2) + " Z", class: "sh" }, g);
    return el("rect", { x: x, y: y, width: w, height: h, rx: t === "summary" ? 14 : t === "result" ? 18 : 6, class: "sh" }, g);
  }
  function wrap(text, maxChars) {
    var words = String(text).split(" "), lines = [], cur = "";
    words.forEach(function (wd) {
      if ((cur + " " + wd).trim().length > maxChars && cur) { lines.push(cur); cur = wd; } else cur = (cur + " " + wd).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function label(g, b) {
    var n = b.node, cx = b.x + b.w / 2, inner = b.w - (n.type === "decision" ? 80 : n.type === "input" || n.type === "output" ? 40 : 24);
    var tw = n.type === "summary" ? 8.6 : 7.1;
    var t = wrap(n.title, Math.floor(inner / tw)), sub = n.sub ? (Array.isArray(n.sub) ? n.sub : wrap(n.sub, Math.floor(inner / 5.9))) : [];
    if (n.type === "summary") sub = sub.slice(0, 5);
    else sub = sub.slice(0, 2);
    var lh = 17, slh = 15, total = t.length * lh + sub.length * slh, y = b.y + b.h / 2 - total / 2 + 12;
    t.forEach(function (line, i) { var e = el("text", { x: cx, y: y + i * lh, class: "tt" }, g); e.textContent = line; });
    y += t.length * lh;
    sub.forEach(function (line, i) { var e = el("text", { x: cx, y: y + i * slh + 1, class: "ts" }, g); e.textContent = line; });
  }

  /* ---------------------------------------------------------------- draw */
  var L;
  function draw() {
    L = layout();
    while (world.firstChild) world.removeChild(world.firstChild);
    var lanesG = el("g", {}, world), edgesG = el("g", { class: "edges" }, world), nodesG = el("g", {}, world);

    L.lanes.forEach(function (info) {
      var l = info.lane, pad = 22;
      el("rect", { x: info.x0 - pad, y: 18, width: info.w + 2 * pad, height: info.h + G.top - 18 + pad, rx: 18, class: "lane lane-" + l.id }, lanesG);
      var head = el("g", { class: "lane-head", tabindex: 0, role: "button", "aria-expanded": String(info.open), "aria-label": (info.open ? "Fold " : "Unfold ") + l.title }, lanesG);
      var hx = info.x0 - pad + 18;
      var num = el("text", { x: hx, y: 52, class: "lane-num" }, head); num.textContent = l.num;
      var ht = el("text", { x: hx + 26, y: 52, class: "lane-title" }, head); ht.textContent = l.title;
      var hs = el("text", { x: hx + 26, y: 72, class: "lane-sub" }, head); hs.textContent = (info.open ? "▾ fold" : "▸ unfold") + " · " + l.who;
      head.addEventListener("click", function () { setLane(l.id, !open[l.id]); });
      head.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLane(l.id, !open[l.id]); } });
    });

    var drawn = {}, idx = {};
    F.edges.forEach(function (e) {
      var a = boxFor(e.from), b = boxFor(e.to);
      if (!a || !b || a === b) return;
      var key = a.node.id + ">" + b.node.id;
      if (drawn[key]) { drawn[key].ids.push(e); return; }
      var cross = a.node.lane !== b.node.lane;
      idx[b.node.lane] = (idx[b.node.lane] || 0) + (cross ? 1 : 0);
      var pts = route(a, b, cross ? idx[b.node.lane] - 1 : 0);
      var g = el("g", { class: "edge" + (cross ? " cross" : "") + (e.dashed ? " dashed" : "") }, edgesG);
      el("path", { d: pathD(pts), class: "ln", "marker-end": "url(#ov-arrow)" }, g);
      if (e.label) {
        var p0 = pts[pts.length - 2], p1 = pts[pts.length - 1], tx;
        if (p0[1] === p1[1]) {                                   // last leg horizontal: label above it
          tx = el("text", { x: (p0[0] + p1[0]) / 2, y: p1[1] - 7, class: "el" }, g);
        } else {                                                 // last leg vertical: label beside it
          tx = el("text", { x: p1[0] + 8, y: (p0[1] + p1[1]) / 2 + 4, class: "el left" }, g);
        }
        tx.textContent = e.label;
      }
      drawn[key] = { g: g, from: a.node.id, to: b.node.id, ids: [e] };
    });

    Object.keys(boxes).forEach(function (id) {
      var b = boxes[id], n = b.node;
      var g = el("g", { class: "node t-" + n.type + " lane-" + n.lane, tabindex: 0, role: "button", "data-id": id, "aria-label": n.title }, nodesG);
      shape(g, b);
      label(g, b);
      if (n.link) {
        var dx = n.type === "decision" ? b.x + b.w * 0.7 : n.type === "input" || n.type === "output" ? b.x + b.w - 12 : b.x + b.w - 9;
        var dy = n.type === "decision" ? b.y + b.h * 0.24 : b.y + 9;
        el("circle", { cx: dx, cy: dy, r: 3.2, class: "has-link" }, g);
      }
      g.addEventListener("pointerenter", function () { if (!dragging) { hoverId = id; showCard(id, false); highlight(id); } });
      g.addEventListener("pointerleave", function () { hoverId = null; if (!pinned) { hideCard(); highlight(null); } else { highlight(pinned); showCard(pinned, true); } });
      g.addEventListener("click", function (e) { e.stopPropagation(); if (moved) return; if (n.type === "summary") { setLane(n.lane, true); return; } pin(id); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pin(id); } if (e.key === "Escape") unpin(); });
      g.addEventListener("focus", function () { showCard(id, false); highlight(id); });
    });
    edgeIndex = drawn;
    svg.setAttribute("aria-label", "Project flowchart");
    highlight(pinned && boxes[pinned] ? pinned : null);
    if (pinned && !boxes[pinned]) unpin();
  }
  var edgeIndex = {};

  /* ---------------------------------------------------------------- highlight */
  function neighbours(id) {
    var up = {}, down = {}, list = Object.keys(edgeIndex).map(function (k) { return edgeIndex[k]; });
    function walk(start, dir, seen) {
      var stack = [start];
      while (stack.length) {
        var c = stack.pop();
        list.forEach(function (e) {
          var nxt = dir > 0 ? (e.from === c ? e.to : null) : (e.to === c ? e.from : null);
          if (nxt && !seen[nxt]) { seen[nxt] = 1; stack.push(nxt); }
        });
      }
    }
    walk(id, 1, down); walk(id, -1, up);
    return { up: up, down: down };
  }
  function highlight(id) {
    var on = {}, nb = null, nodes = world.querySelectorAll(".node"), edges = Object.keys(edgeIndex).map(function (k) { return edgeIndex[k]; });
    if (id) { nb = neighbours(id); on[id] = 1; for (var k in nb.up) on[k] = 1; for (k in nb.down) on[k] = 1; }
    else if (path) {
      Object.keys(boxes).forEach(function (bid) { var p = boxes[bid].node.paths || []; if (p.indexOf(path) >= 0) on[bid] = 1; });
    }
    var any = !!id || !!path;
    nodes.forEach(function (g) {
      var nid = g.getAttribute("data-id");
      g.classList.toggle("dim", any && !on[nid]);
      g.classList.toggle("focus", nid === id);
    });
    edges.forEach(function (e) {
      var lit = any && on[e.from] && on[e.to];
      if (nb) lit = ((e.from === id || nb.down[e.from]) && nb.down[e.to]) || ((e.to === id || nb.up[e.to]) && nb.up[e.from]);
      e.g.classList.toggle("dim", any && !lit);
      e.g.classList.toggle("lit", any && lit);
    });
  }

  /* ---------------------------------------------------------------- card */
  function showCard(id, isPinned) {
    var b = boxes[id]; if (!b) return;
    var n = b.node, lane = F.lanes.filter(function (l) { return l.id === n.lane; })[0];
    var h = '<div class="ov-card-lane lane-' + n.lane + '">' + esc(lane ? lane.num + "  " + lane.title : "") + "</div>";
    h += "<h3>" + esc(n.title) + "</h3>";
    if (n.tip) h += "<p>" + n.tip + "</p>";
    if (n.number) h += '<p class="ov-num">' + n.number + "</p>";
    if (n.code) h += '<p class="ov-code"><span>Code</span> <code>' + esc(n.code) + "</code></p>";
    if (n.type === "summary") h += '<p class="ov-hint">Click the box to unfold this part.</p>';
    if (n.link) h += '<a class="ov-go" href="' + esc(n.link) + '">' + esc(n.linkText || "Read more on the website") + " &rarr;</a>";
    if (!isPinned && n.type !== "summary") h += '<p class="ov-hint">Click to pin this card.</p>';
    if (isPinned) h += '<button type="button" class="ov-x" aria-label="Close">&times;</button>';
    card.innerHTML = h;
    card.hidden = false;
    card.classList.toggle("pinned", !!isPinned);
    var x = card.querySelector(".ov-x"); if (x) x.addEventListener("click", unpin);
    place(b);
  }
  function place(b) {
    var sr = stage.getBoundingClientRect(), r = svg.getBoundingClientRect();
    var sx = r.left - sr.left + (b.x * view.k + view.x), sy = r.top - sr.top + (b.y * view.k + view.y);
    var w = card.offsetWidth, h = card.offsetHeight, bw = b.w * view.k, bh = b.h * view.k;
    var left = sx + bw + 14, top = sy + bh / 2 - h / 2;
    if (left + w > sr.width - 10) left = sx - w - 14;
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

  /* ---------------------------------------------------------------- pan and zoom */
  function apply() { world.setAttribute("transform", "translate(" + view.x + "," + view.y + ") scale(" + view.k + ")"); if (pinned && boxes[pinned]) place(boxes[pinned]); else if (!card.hidden && hoverId && boxes[hoverId]) place(boxes[hoverId]); }
  function fit() {
    var r = svg.getBoundingClientRect(), pad = 16;
    var k = Math.min((r.width - 2 * pad) / L.width, (r.height - 2 * pad) / L.height, 1.25);
    k = Math.max(k, 0.2);
    view.k = k; view.x = (r.width - L.width * k) / 2; view.y = Math.max(pad, (r.height - L.height * k) / 2);
    if (r.width < 700) { view.k = Math.max(k, 0.42); view.x = pad; view.y = pad; }
    apply();
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
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k };
    }
    dragging = true; moved = false; last = [e.clientX, e.clientY];
  });
  window.addEventListener("pointermove", function (e) {
    if (!dragging || !pointers[e.pointerId]) return;
    pointers[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2 && pinch) {
      var a = pointers[ids[0]], b = pointers[ids[1]], r = svg.getBoundingClientRect();
      var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(pinch.k * d / pinch.d / view.k, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      moved = true; return;
    }
    var dx = e.clientX - last[0], dy = e.clientY - last[1];
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!moved) svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
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
  svg.addEventListener("click", function () { if (!moved && pinned) unpin(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") unpin(); });

  /* ---------------------------------------------------------------- controls */
  function setLane(id, isOpen) {
    open[id] = isOpen;
    var sw = document.querySelector('input[name="lane-' + id + '"]'); if (sw) sw.checked = isOpen;
    draw(); fit(); setHash();
  }
  document.querySelectorAll("input[data-lane]").forEach(function (i) {
    i.addEventListener("change", function () { setLane(i.getAttribute("data-lane"), i.checked); });
  });
  document.querySelectorAll("input[name=path]").forEach(function (i) {
    i.addEventListener("change", function () { path = i.value; unpin(); highlight(null); renderStory(); setHash(); });
  });
  function all(isOpen) {
    F.lanes.forEach(function (l) { open[l.id] = isOpen; var sw = document.querySelector('input[name="lane-' + l.id + '"]'); if (sw) sw.checked = isOpen; });
    draw(); fit(); setHash();
  }
  var bAll = document.getElementById("ov-all"), bNone = document.getElementById("ov-none");
  if (bAll) bAll.addEventListener("click", function () { all(true); });
  if (bNone) bNone.addEventListener("click", function () { all(false); });
  document.getElementById("ov-zin").addEventListener("click", function () { var r = svg.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); });
  document.getElementById("ov-zout").addEventListener("click", function () { var r = svg.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); });
  document.getElementById("ov-fit").addEventListener("click", fit);

  var storyEl = document.getElementById("ov-story");
  function renderStory() {
    if (!storyEl) return;
    var s = (F.paths || []).filter(function (p) { return p.id === path; })[0];
    storyEl.innerHTML = s ? "<p>" + s.text + "</p>" : "";
    storyEl.hidden = !s;
  }

  /* ---------------------------------------------------------------- URL state: #fold=air,sim&path=real&box=id */
  function setHash() {
    var closed = F.lanes.filter(function (l) { return !open[l.id]; }).map(function (l) { return l.id; });
    var parts = [];
    if (closed.length) parts.push("fold=" + closed.join(","));
    if (path) parts.push("path=" + path);
    if (pinned) parts.push("box=" + encodeURIComponent(pinned));
    try { history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname + location.search); } catch (e) { /* file:// */ }
  }
  function readHash() {
    var h = {}; location.hash.replace(/^#/, "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) h[p[0]] = decodeURIComponent(p[1] || ""); });
    if (h.fold) h.fold.split(",").forEach(function (id) { if (id in open) open[id] = false; });
    F.lanes.forEach(function (l) { var sw = document.querySelector('input[name="lane-' + l.id + '"]'); if (sw) sw.checked = open[l.id]; });
    if (h.path) { path = h.path; var r = document.querySelector('input[name=path][value="' + h.path + '"]'); if (r) r.checked = true; }
    return h.box || null;
  }

  var startBox = readHash();
  draw(); fit(); renderStory();
  if (startBox && boxes[startBox]) pin(startBox); else highlight(null);
  var t; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(fit, 150); });
})();
