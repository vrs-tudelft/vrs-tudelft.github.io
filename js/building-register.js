/* Names come from the existing public aggregate export, never from a guessed address.
   BAG deep-link format: registerexterneveiligheid.nl/veelgestelde-vragen-faqs/kgl */
(function () {
  "use strict";
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c];
    });
  }
  function bagUrl(id) {
    if (!/^\d{16}$/.test(id)) throw new Error("Invalid BAG pand ID");
    return "https://bagviewer.kadaster.nl/lvbag/bag-viewer/?searchQuery=" + id + "&objectId=" + id;
  }
  function name(id, record, attrs) {
    return record && record.label || "Unnamed building" + (attrs && attrs.year ? " (" + attrs.year + ")" : "");
  }
  function identity(id, record, attrs) {
    return '<a href="' + bagUrl(id) + '" target="_blank" rel="noopener" class="directory-name">' +
      esc(name(id, record, attrs)) + ' ↗</a><span class="bag-id">BAG ' + id + '</span>';
  }
  window.VRSBuildings = {esc:esc, bagUrl:bagUrl, name:name, identity:identity};

  var host = document.querySelector('[data-building-directory]');
  if (!host) return;
  var root = document.documentElement.getAttribute('data-root') || '';
  var dataset = '2020-2026-ground', doc, page = 0, size = 5;
  host.innerHTML = '<div class="directory-tools"><input type="search" aria-label="Find a building by name or BAG ID" placeholder="Find a name or BAG ID…">' +
    '<label><input type="checkbox" checked>With radar support</label></div>' +
    '<div class="directory-table"></div><div class="report-pages" aria-label="Building pages"></div>';
  var search = host.querySelector('[type=search]'), supported = host.querySelector('[type=checkbox]');
  function render() {
    if (!doc) return;
    var query = search.value.toLocaleLowerCase().trim();
    var ids = doc.order.filter(function (id) {
      return (!supported.checked || !!doc.buildings[id]) &&
        (id + ' ' + name(id, doc.buildings[id], doc.bag3d[id])).toLocaleLowerCase().includes(query);
    }).sort(function (a,b) {
      return name(a,doc.buildings[a],doc.bag3d[a]).localeCompare(name(b,doc.buildings[b],doc.bag3d[b])) || a.localeCompare(b);
    });
    page = Math.max(0, Math.min(page, Math.ceil(ids.length / size) - 1));
    var start = page * size;
    host.querySelector('.directory-table').innerHTML = '<table><thead><tr><th>Building / BAG pand ID</th>' +
      '<th class="directory-roof">Roof above ground</th><th>Radar points</th><th>City</th></tr></thead><tbody>' +
      ids.slice(start, start + size).map(function (id) {
        var r = doc.buildings[id], a = doc.bag3d[id];
        return '<tr data-building-id="' + id + '"><td>' + identity(id, r, a) + '</td><td class="directory-roof">' +
          (a && Number.isFinite(a.height_agl) ? a.height_agl.toFixed(0) + ' m' : 'Unknown') + '</td><td>' +
          (r ? r.n.toLocaleString('en-GB') : 'No published group') + '</td><td><a href="' + root + '3d/index.html?data=' + dataset +
          '&amp;building=' + id + '">Show in 3D →</a></td></tr>';
      }).join('') + '</tbody></table>' + (!ids.length ? '<p>No buildings match this search.</p>' : '');
    host.querySelector('.report-pages').innerHTML = '<span role="status">' + ids.length + ' buildings' +
      (ids.length ? ' · ' + (start + 1) + '–' + Math.min(start + size, ids.length) : '') + '</span>' +
      '<button type="button" data-directory-page="-1" aria-label="Previous buildings" ' + (page === 0 ? 'disabled' : '') + '>←</button>' +
      '<button type="button" data-directory-page="1" aria-label="Next buildings" ' + (start + size >= ids.length ? 'disabled' : '') + '>→</button>';
  }
  search.addEventListener('input', function () { page=0; render(); });
  supported.addEventListener('change', function () { page=0; render(); });
  host.addEventListener('click', function (e) {
    var button = e.target.closest('[data-directory-page]');
    if (button && !button.disabled) { page += Number(button.dataset.directoryPage); render(); }
  });
  fetch(root + 'data/2020-2026-ground/buildings.json').then(function (r) {
    if (!r.ok) throw new Error('Building register ' + r.status);
    return r.json();
  }).then(function (d) { doc=d; render(); }).catch(function (err) {
    host.querySelector('.directory-table').textContent = 'Building register could not be loaded: ' + err.message;
  });
}());
