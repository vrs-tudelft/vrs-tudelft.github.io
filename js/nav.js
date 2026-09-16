/* Shared navigation and footer. One list, every page; the current page is marked. */
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
  var header = document.querySelector("header.top");
  if (header) {
    var old = header.querySelector("nav"); if (old) old.remove();
    var ns = header.querySelector("noscript"); if (ns) ns.remove();
    var nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Site");
    pages.forEach(function (p) {
      var a = document.createElement("a");
      a.href = root + p.href;
      a.textContent = p.label;
      var isHere = p.href === "3d/index.html" ? in3d : (!in3d && p.href === here);
      if (isHere) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
    header.appendChild(nav);
  }
  var footer = document.querySelector("footer[data-shared]");
  if (footer && !footer.innerHTML.trim()) {
    footer.innerHTML =
      "<p>Virtual Radiosonde, a student team project of the course Applied Space Geodesy, TU Delft, 2026. " +
      "Radar: TerraSAR-X point set provided for the course by R.F. Hanssen; the point data is not public and nothing on this site is a single point. " +
      "Weather: KNMI (CC BY 4.0), NOAA IGRA2. Buildings: BAG via PDOK (CC0), 3DBAG (CC BY 4.0). Map tiles in some figures: Esri. " +
      "Work in progress; nothing here is a validated result unless it says so. " +
      "<a href=\"" + root + "index.html#about\">About and licences</a> · <a href=\"https://github.com/vrs-tudelft\">GitHub</a></p>";
  }
})();
