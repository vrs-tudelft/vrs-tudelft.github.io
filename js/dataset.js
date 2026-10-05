/* The data input of the Explore pages: which set of aggregate files the views read.
   The sets are listed in data/datasets.json. The choice comes from ?data=<id> in the address,
   then from this browser's last choice, then from the default; changing it rewrites the
   address (so a link keeps the choice) and tells every listener to redraw. */
window.VRSData = (function () {
  "use strict";
  var root = document.documentElement.getAttribute("data-root") || "";
  var KEY = "vrs-data";
  var listeners = [];
  var cfg = null, current = null;

  /* The look of the switch lives here so both Explore pages share it without touching style.css. */
  var CSS =
    ".dsbar{background:var(--accent-soft);border-left:2px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 26px;font-size:.95rem;color:var(--ink-2);max-width:1000px}" +
    ".dsbar.archived{background:#fbf3e4;border-left-color:var(--warn)}" +
    ".dsbar .dsrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}" +
    ".dsbar .dslabel{font-weight:650;font-size:.9rem;color:var(--ink)}" +
    ".dsbar p{margin:8px 0 0}" +
    ".seg{display:inline-flex;border:1px solid var(--line-2);border-radius:9px;background:var(--surface);padding:2px;max-width:100%}" +
    ".seg label{position:relative;flex:1 1 0;cursor:pointer;margin:0}" +
    ".seg input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}" +
    ".seg span{display:flex;align-items:center;justify-content:center;min-height:36px;padding:4px 12px;border-radius:7px;font-size:.88rem;line-height:1.25;color:var(--ink-2);text-align:center;white-space:nowrap}" +
    ".seg label:hover span{background:var(--surface-2)}" +
    ".seg input:checked+span{background:var(--ink);color:#fff}" +
    ".seg input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}" +
    "@media (max-width:440px){.seg{display:flex;width:100%}.seg span{white-space:normal;padding:4px 8px}}" +
    ".dstag{font-size:.82rem;color:var(--muted);margin:14px 0 -12px}" +
    ".linkish,.anim button.linkish{background:none;border:0;padding:0;min-height:0;color:var(--accent);font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:2px}";
  try {
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
  } catch (e) { /* no head yet: unstyled radios still work */ }

  function fromUrl() {
    try { return new URLSearchParams(location.search).get("data"); } catch (e) { return null; }
  }
  function fromStore() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function store(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* private window or blocked storage */ }
  }
  function writeUrl(id) {
    try {
      var u = new URL(location.href);
      u.searchParams.set("data", id);
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) { /* very old browser: the choice simply is not in the address */ }
  }

  function info(id) {
    var s = cfg.sets[id];
    return {
      id: id, path: root + "data/" + s.path, name: s.name, button: s.button, about: s.about,
      archived: !!s.archived, hTop: s.h_top_m, rateLim: s.rate_lim_mm_yr || null, unavailable: s.unavailable || {}
    };
  }

  function applyPage() {
    var I = info(current);
    document.documentElement.setAttribute("data-ds", current);
    document.querySelectorAll("[data-ds-only]").forEach(function (el) {
      el.hidden = el.getAttribute("data-ds-only").split(" ").indexOf(current) < 0;
    });
    document.querySelectorAll("[data-ds-name]").forEach(function (el) { el.textContent = I.name; });
    document.querySelectorAll("[data-ds-about]").forEach(function (el) { el.textContent = I.about; });
    document.querySelectorAll(".dsbar").forEach(function (el) { el.classList.toggle("archived", I.archived); });
    document.querySelectorAll("[data-ds-switch] input").forEach(function (r) { r.checked = r.value === current; });
  }

  function render(el) {
    var group = "ds-" + Math.random().toString(36).slice(2, 7);
    var wrap = document.createElement("div");
    wrap.className = "seg";
    wrap.setAttribute("role", "radiogroup");
    wrap.setAttribute("aria-label", el.getAttribute("data-ds-switch") || "Data input");
    cfg.order.forEach(function (id) {
      var l = document.createElement("label");
      var r = document.createElement("input");
      r.type = "radio"; r.name = group; r.value = id; r.checked = id === current;
      r.addEventListener("change", function () { if (r.checked) set(id); });
      var s = document.createElement("span");
      s.textContent = cfg.sets[id].button;
      l.appendChild(r); l.appendChild(s); wrap.appendChild(l);
    });
    el.innerHTML = "";
    el.appendChild(wrap);
  }

  function set(id) {
    if (!cfg || !cfg.sets[id] || id === current) return;
    current = id;
    store(id); writeUrl(id); applyPage();
    var I = info(id);
    listeners.forEach(function (fn) { try { fn(I); } catch (e) { console.error(e); } });
  }

  var ready = fetch(root + "data/datasets.json").then(function (r) {
    if (!r.ok) throw new Error("data/datasets.json: " + r.status);
    return r.json();
  }).then(function (c) {
    cfg = c;
    var want = fromUrl();
    if (!c.sets[want]) want = fromStore();
    if (!c.sets[want]) want = c.default;
    current = want;
    if (fromUrl() !== current) writeUrl(current);
    document.querySelectorAll("[data-ds-switch]").forEach(render);
    applyPage();
    return info(current);
  });

  return {
    ready: ready,
    set: set,
    onChange: function (fn) { listeners.push(fn); },
    get current() { return current ? info(current) : null; },
    views: function () { return cfg ? cfg.views : {}; }
  };
})();
