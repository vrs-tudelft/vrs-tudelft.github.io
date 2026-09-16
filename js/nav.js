/* Shared navigation and footer. One list, every page; the current page is marked. */
(function () {
  var pages = [
    { href: "index.html", label: "Home" },
    { href: "idea.html", label: "The idea" },
    { href: "data.html", label: "The data" },
    { href: "findings.html", label: "Findings" },
    { href: "buildings.html", label: "Buildings and ground" },
    { href: "animations.html", label: "Animations" },
    { href: "3d/index.html", label: "3D", tag: "experimental" },
    { href: "paper.html", label: "Method and paper" },
    { href: "questions.html", label: "Open questions" },
    { href: "glossary.html", label: "Glossary" },
    { href: "about.html", label: "About" }
  ];
  var root = document.documentElement.getAttribute("data-root") || "";
  var path = location.pathname.replace(/\/+$/, "");
  var here = path.split("/").pop() || "index.html";
  var in3d = /\/3d$|\/3d\/index\.html$|\/3d\/$/.test(location.pathname) || document.documentElement.hasAttribute("data-3d");
  var header = document.querySelector("header.top");
  if (header) {
    var old = header.querySelector("nav");
    if (old) old.remove();
    var noscript = header.querySelector("noscript");
    if (noscript) noscript.remove();
    var nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Site");
    pages.forEach(function (p) {
      var a = document.createElement("a");
      a.href = root + p.href;
      a.textContent = p.label;
      var isHere = (p.href === "3d/index.html") ? in3d : (!in3d && p.href === here);
      if (isHere) a.setAttribute("aria-current", "page");
      if (p.tag) {
        var t = document.createElement("span");
        t.className = "tag";
        t.textContent = p.tag;
        a.appendChild(t);
      }
      nav.appendChild(a);
    });
    var gh = document.createElement("a");
    gh.href = "https://github.com/vrs-tudelft";
    gh.textContent = "GitHub";
    nav.appendChild(gh);
    header.appendChild(nav);
    var cur = nav.querySelector("[aria-current]");
    if (cur && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = Math.max(0, cur.offsetLeft - 16);
    }
  }
  var footer = document.querySelector("footer[data-shared]");
  if (footer && !footer.innerHTML.trim()) {
    footer.innerHTML =
      "<p>Virtual Radiosonde, a student team project of the course Applied Space Geodesy, TU Delft, 2026. " +
      "Radar measurements: TerraSAR-X point set provided for the course by R.F. Hanssen; the point data is not public and " +
      "nothing on this site is a single point. Weather: KNMI (CC BY 4.0) and NOAA IGRA2. Buildings: BAG via PDOK (CC0) and 3DBAG (CC BY 4.0). " +
      "Map tiles in some figures: Esri. Everything here is work in progress; nothing is a validated result unless it says so. " +
      "<a href=\"" + root + "about.html\">About, licences and who did what</a>.</p>";
  }
})();
