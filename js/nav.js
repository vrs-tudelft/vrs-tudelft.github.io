/* Header, on-page section nav with scroll-spy, footer, and tooltips on touch. */
(function () {
  /* the story of the report: introduction, theory, methodology (overview, end-to-end simulation,
     estimation, the buildings' functional model), results, and the data as appendix. The method's
     chapters share one top tab and get their own row of sub-tabs. */
  var pages = [
    { href: "index.html", label: "Home" },
    { href: "theory.html", label: "Theory" },
    { href: "overview.html", label: "Method", sub: [
      { href: "overview.html", label: "Overview" },
      { href: "simulator.html", label: "Simulator" },
      { href: "estimation.html", label: "Estimation" },
      { href: "buildings.html", label: "Buildings", also: ["animations.html"], in3d: true }
    ] },
    { href: "results.html", label: "Results" },
    { href: "data.html", label: "Data" }
  ];
  var root = document.documentElement.getAttribute("data-root") || "";
  var here = location.pathname.replace(/\/+$/, "").split("/").pop() || "index.html";
  var in3d = document.documentElement.hasAttribute("data-3d");
  function isHere(p) { return p.in3d && in3d ? true : !in3d && (p.href === here || (p.also || []).indexOf(here) >= 0); }
  function link(p, cur) {
    var a = document.createElement("a");
    a.href = root + p.href;
    a.textContent = p.label;
    if (cur) a.setAttribute("aria-current", "page");
    return a;
  }

  /* ---- header: main tabs right; on a method page its sub-tabs next to the brand ---- */
  var inner = document.querySelector("header.top .top-inner");
  if (inner) {
    var old = inner.querySelector("nav"); if (old) old.remove();
    var ns = inner.querySelector("noscript"); if (ns) ns.remove();
    var nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Site");
    var subOf = null;
    pages.forEach(function (p) {
      var cur = p.sub ? p.sub.some(isHere) : isHere(p);
      if (p.sub && cur) subOf = p;
      nav.appendChild(link(p, cur));
    });
    if (subOf) {
      var sub = document.createElement("nav");
      sub.className = "subnav";
      sub.setAttribute("aria-label", subOf.label);
      subOf.sub.forEach(function (p) { sub.appendChild(link(p, isHere(p))); });
      inner.appendChild(sub);
      document.documentElement.classList.add("has-subnav");
    }
    inner.appendChild(nav);
  }

  /* ---- on-page section nav, built from the h2 headings ---- */
  var side = document.querySelector("nav.side");
  var heads = [].slice.call(document.querySelectorAll("main h2[id]"));
  if (side && heads.length > 1) {
    heads.forEach(function (h) {
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.getAttribute("data-short") || h.textContent;
      side.appendChild(a);
    });
    var links = {};
    [].slice.call(side.children).forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var current = null;
    function mark(id) {
      if (id === current) return;
      current = id;
      for (var k in links) links[k].classList.toggle("on", k === id);
    }
    var ticking = false;
    function spy() {
      var best = null;
      heads.forEach(function (h) { if (h.getBoundingClientRect().top <= 140) best = h.id; });
      mark(best || heads[0].id);
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; spy(); });
    }, { passive: true });
    spy();
  } else if (side) {
    side.remove();
  }

  /* ---- footer ---- */
  var footer = document.querySelector("footer[data-shared]");
  if (footer && !footer.innerHTML.trim()) {
    footer.innerHTML =
      "<p>Virtual Radiosonde, a student team project of the course Applied Space Geodesy, TU Delft, 2026. " +
      "Radar: two TerraSAR-X point sets provided for the course by R.F. Hanssen; the point data is not public and nothing on this site is a single point. " +
      "Weather and soundings: KNMI (CC BY 4.0), NOAA IGRA2, ICOS (CC BY 4.0). Buildings: BAG via PDOK (CC0), 3DBAG (CC BY 4.0). " +
      "Work in progress; nothing here is a validated result unless it says so. " +
      "<a href=\"" + root + "index.html#about\">About and licences</a> · <a href=\"https://github.com/vrs-tudelft\">GitHub</a></p>";
  }

  /* ---- tooltips: hover and focus are CSS; a tap toggles ---- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest(".t") : null;
    document.querySelectorAll(".t.open").forEach(function (o) { if (o !== t) o.classList.remove("open"); });
    if (t) { t.classList.toggle("open"); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.querySelectorAll(".t.open").forEach(function (o) { o.classList.remove("open"); });
  });
  /* keep a tooltip inside the window: flip it to the left or right edge when needed */
  function place(t) {
    t.classList.remove("left", "right");
    /* inside a scrolling panel (the simulator) the panel's edges count, not the window's */
    var box = t.closest(".app-panel"), lo = 0, hi = innerWidth;
    if (box) { var b = box.getBoundingClientRect(); lo = b.left; hi = b.right; }
    var r = t.getBoundingClientRect(), w = Math.min(box ? 270 : 330, (hi - lo) * 0.76);
    if (r.left + r.width / 2 - w / 2 < lo + 12) t.classList.add("left");
    else if (r.left + r.width / 2 + w / 2 > hi - 12) t.classList.add("right");
  }
  document.querySelectorAll(".t").forEach(function (t) {
    if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
    t.addEventListener("pointerenter", function () { place(t); });
    t.addEventListener("focus", function () { place(t); });
    t.addEventListener("click", function () { place(t); });
  });
})();
