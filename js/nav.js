/* Header, on-page section nav with scroll-spy, footer, and tooltips on touch. */
(function () {
  var pages = [
    { href: "index.html", label: "Home" },
    { href: "findings.html", label: "Findings" },
    { href: "method.html", label: "Data and method" },
    { href: "animations.html", label: "Animations" },
    { href: "3d/index.html", label: "3D" }
  ];
  var root = document.documentElement.getAttribute("data-root") || "";
  var here = location.pathname.replace(/\/+$/, "").split("/").pop() || "index.html";
  var in3d = document.documentElement.hasAttribute("data-3d");

  /* ---- header ---- */
  var inner = document.querySelector("header.top .top-inner");
  if (inner) {
    var old = inner.querySelector("nav"); if (old) old.remove();
    var ns = inner.querySelector("noscript"); if (ns) ns.remove();
    var nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Site");
    pages.forEach(function (p) {
      var a = document.createElement("a");
      a.href = root + p.href;
      a.textContent = p.label;
      if (p.href === "3d/index.html" ? in3d : (!in3d && p.href === here)) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
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
      "Radar: TerraSAR-X point set provided for the course by R.F. Hanssen; the point data is not public and nothing on this site is a single point. " +
      "Weather: KNMI (CC BY 4.0), NOAA IGRA2. Buildings: BAG via PDOK (CC0), 3DBAG (CC BY 4.0). " +
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
    var r = t.getBoundingClientRect(), w = Math.min(330, innerWidth * 0.76);
    if (r.left + r.width / 2 - w / 2 < 12) t.classList.add("left");
    else if (r.left + r.width / 2 + w / 2 > innerWidth - 12) t.classList.add("right");
  }
  document.querySelectorAll(".t").forEach(function (t) {
    if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
    t.addEventListener("pointerenter", function () { place(t); });
    t.addEventListener("focus", function () { place(t); });
    t.addEventListener("click", function () { place(t); });
  });
})();
