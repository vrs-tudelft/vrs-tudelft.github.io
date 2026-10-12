/* Line icons on a 24 x 24 grid, shared by the overview and the simulator. Each entry is the inside
   of an <svg viewBox="0 0 24 24">, drawn with stroke="currentColor". Any element with
   data-icon="name" gets that icon. */
(function () {
  "use strict";
  var ICONS = {
    balloon: '<path d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5c0 4.2-3.6 7.5-6.5 7.5S5.5 13.2 5.5 9A6.5 6.5 0 0 1 12 2.5z"/><path d="M11 16.5h2l-1 1.6z"/><path d="M12 18c-1.2 1.2 1.2 2.4 0 4"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 11v6"/>',
    cloud: '<path d="M17.5 19H8a5 5 0 1 1 1.4-9.8A6 6 0 0 1 21 11.5a4 4 0 0 1-3.5 7.5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    fork: '<circle cx="12" cy="4.5" r="2"/><circle cx="6" cy="19.5" r="2"/><circle cx="18" cy="19.5" r="2"/><path d="M12 6.5v4M12 10.5l-6 7M12 10.5l6 7"/>',
    xcircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9"/>',
    tower: '<path d="M12 3v18M8 21l4-14 4 14M9.2 16h5.6M10.4 11.5h3.2"/><path d="M8.5 4.5a5 5 0 0 1 7 0M6.5 2.5a8 8 0 0 1 11 0"/>',
    ruler: '<path d="M12 4v16M8.5 7.5L12 4l3.5 3.5M8.5 16.5L12 20l3.5-3.5M4 4h3M4 20h3"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5.5"/><circle cx="12" cy="17" r="1.2"/>',
    bell: '<path d="M3 20h18"/><path d="M4 19.5c3 0 4.5-13 8-13s5 13 8 13"/><path d="M12 6.5V20" stroke-dasharray="2 2"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    profile: '<path d="M4 3v18M4 21h16"/><path d="M15 5c-2 3-1 5-3.5 7.5S8 17 8 19"/>',
    city: '<path d="M3 21h18M4.5 21V11h5v10M9.5 21V4h7v17M16.5 21v-8h3v8"/><path d="M12 8h2M12 12h2M12 16h2"/>',
    wave: '<path d="M3 12h3l2.5-6 4 12 3-9 2 3H21"/>',
    zap: '<path d="M13 2.5L4.5 14H11l-1 7.5L19.5 10H13z"/>',
    compare: '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>',
    satellite: '<path d="M9.5 9.5l5 5"/><rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(45 12 12)"/><path d="M8 8L4.5 4.5M3 7l4-4M16 16l3.5 3.5M17 21l4-4"/><path d="M5 15a4 4 0 0 0 4 4M5 11.5a7.5 7.5 0 0 0 7.5 7.5"/>',
    building: '<path d="M5 21V4h9v17M14 9h5v12M3 21h18"/><path d="M8 7.5h3M8 11h3M8 14.5h3M16.5 12.5h0M16.5 16h0"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><circle cx="16.75" cy="16.75" r="1.6"/>',
    crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
    layers: '<path d="M12 3l9 4.8-9 4.8-9-4.8z"/><path d="M3 12.2l9 4.8 9-4.8M3 16.4l9 4.8 9-4.8"/>',
    flag: '<path d="M5 22V3.5M5 4h11.5l-2.2 4 2.2 4H5"/>',
    anchor: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M8 11h8"/><path d="M4 13.5a8 7.5 0 0 0 16 0"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4.5 3 3L20 7"/>',
    flask: '<path d="M9 3h6M10 3v6.2L4.5 18.6A1.8 1.8 0 0 0 6 21.5h12a1.8 1.8 0 0 0 1.5-2.9L14 9.2V3"/><path d="M7.2 15h9.6"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6.4-6.4"/>',
    noise: '<path d="M2.5 12c1.6-5 3.2-5 4.8 0s3.2 5 4.8 0 3.2-5 4.8 0 3.2 5 4.6 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    sink: '<path d="M12 3.5v12M7 11l5 5 5-5M4 20.5h16"/>',
    sideways: '<path d="M3.5 12h17M7.5 8l-4 4 4 4M16.5 8l4 4-4 4"/>',
    reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h0"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>',
    bars: '<path d="M4 6h10M4 12h16M4 18h7"/>',
    timeline: '<path d="M3 20h18"/><circle cx="6" cy="14" r="1.2"/><circle cx="10" cy="9" r="1.2"/><circle cx="14" cy="12" r="1.2"/><circle cx="18" cy="6" r="1.2"/>',
    split: '<path d="M12 3v18"/><path d="M8 7c-3 0-4 3-4 5s1 5 4 5M16 7c3 0 4 3 4 5s-1 5-4 5"/>'
  };
  window.VRS_ICONS = ICONS;
  window.VRS_ICON = function (name, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || "ic") + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>";
  };
  function fill() { document.querySelectorAll("[data-icon]").forEach(function (e) { if (!e.firstElementChild) e.innerHTML = window.VRS_ICON(e.getAttribute("data-icon")); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill); else fill();
})();
