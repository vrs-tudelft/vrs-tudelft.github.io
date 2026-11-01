# Virtual Radiosonde website

[Live project](https://vrs-tudelft.github.io/) ·
[Analysis](https://github.com/vrs-tudelft/virtual-radiosonde) ·
[Organisation](https://github.com/vrs-tudelft)

The public interface follows one research story:

| Stage | Screens |
| --- | --- |
| [Idea](https://vrs-tudelft.github.io/index.html#height) | Differential radar path and the building-motion confound |
| [Experiment](https://vrs-tudelft.github.io/simulator.html#steps) | Known-air recovery, error sources and conditional weather inference |
| [Findings](https://vrs-tudelft.github.io/results.html#signal) | Canonical Rotterdam comparison and BAG-linked radar height coverage |

There are seven main views and six supporting dialogs. Explanations belong in
contextual info/warning icons beside their chart, metric or control, with hover,
keyboard, Escape and tap support. Keep chart values, units, dates, legends and
operational messages visible. Do not add explanatory banners or repeated captions.
Desktop main views and settings rails must have exactly zero scroll range; do not
hide overflow to pass a layout check. Phones use collapsible settings and can scroll.

## Run and check

Plain HTML/CSS/JavaScript; there is no package build or bundler. From this repository:

```sh
python tools/serve.py
python tools/check_links.py
python tools/check_data.py
python tools/check_report.py
python tools/check_workspace.py
node --test tools/city-research.test.mjs
```

CI uses Python and Node 24. Review all seven views and supporting dialogs in Google
Chrome, including short laptop content areas down to 1280×600, keyboard/touch help
and phone layouts. GitHub Pages publishes `main` after merging reviewed changes.
Use a `codex/` branch for agent work and preserve the experimental branches.

## Evidence and data boundaries

- Idea figures are illustrations. Experiment uses precomputed simulated radar;
  shared forward/estimation assumptions make success a controlled test, not field validation.
- `data/simulator/real.json` is the canonical observed-result export. The report
  default is motion per building, two layers and no air prior. Its station series
  is a proxy, not measured vertical urban truth. A station-based prior reuses that information.
- N is the radar estimate; P/T assumptions and derived vapour pressure are conditional.
- Coverage uses an earlier height-limited processing and the existing 3DBAG geometry.
  Published 10 m groups indicate support, not continuous facade coverage or retrieved air.
  The archived `2014-2023-processor` selection remains explicitly labelled.
- Public radar products aggregate at least 20 points. Never publish raw point
  locations/series, per-point derivatives, private report drafts or credentials.

Exact inputs/products are in the private `vrs-data` report release. Updating UI or
documentation does not authorize regenerating scientific exports. Public building
names and 16-digit BAG IDs come from the retained export; unknown names remain unknown.

## Source map and compatibility

`index.html`, `simulator.html` and `results.html` are the active destinations.
`js/site-layout.js`, `js/nav.js` and `js/dialogs.js` provide views, tooltips and details.
`3d/viewer.js` renders height support; `3d/research.js` derives readouts from aggregates.
Old method/data/building/movie URLs redirect to the corresponding stage and retain
useful fit/building query choices. Old simulator real-mode links go to Findings.

`data/building-temperature.json` is public KNMI weather: the report's 72 h hourly
station-344 temperature memory at the public pass dates, not a private radar product.
Its exporter is `tools/export_building_temperature.py`; use its `--help` and a pinned
analysis checkout before regenerating it.

Preserve KNMI, NOAA IGRA2, ICOS, BAG/PDOK and 3DBAG attribution and the complete team
credits in Sources & team. BAG metadata: CC0; 3DBAG/aerial imagery and the site's
text/figures: CC BY 4.0, with the existing provider attribution.
