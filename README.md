# Virtual Radiosonde website

Public site: https://vrs-tudelft.github.io. Plain HTML, CSS and JavaScript, with no
build step. GitHub Pages publishes `main`.

## Composition

Use the simulator's composition: a compact settings rail on the left and a
full-width dashboard on the right. Non-simulator pages share `js/site-layout.js`
and `css/workspace.css`. Tabs show one focused view, retain deep links and support
arrow keys. Mobile settings collapse above the selected view.

- Home: visual introduction, report run and sources.
- Theory: live air calculator, selectable geometry examples and assumptions.
- Estimation: a layer schematic beside the retrieval steps, report tests and limits.
- Buildings: one motion model or observation player at a time; controls stay in the rail.
- Results: shared report variants, per-pass and station plots, layer metrics and interpretation.
- Data: radar, weather, reference and reuse policy, plus a searchable building-name/BAG directory.
- Workflow: the project flowchart with its path descriptions beside the diagram.
- 3D: linked height support, building profiles and a time series within the same dashboard.

Avoid article-width limits inside dashboards. Fit the main desktop views to the
viewport. Sidebars must fit without a second vertical scroll area; compact their
spacing and secondary controls while keeping labels readable. Do not hide overflow
to make a fit check pass. Put definitions, units and
supporting provenance in concise `data-tip` help. Keep the scientific limitation
visible: the real-data station comparison is not measured vertical truth.

`js/nav.js` provides the compact site menu and shared tooltip portal. Help works
on hover, keyboard focus and touch; Escape dismisses it. Fixed positioning keeps
help outside clipped or scrolling panels. New help controls should be named
`button type="button"` elements.

## Data sources

Home, Estimation, Results and the simulator's real mode use
`data/simulator/real.json`, the reproduced report export from committed analysis.
Do not maintain a second live result summary. Its defaults are motion per
building, two layers and no station-based air prior. The private
`vrs-data@report-2026-10-31` release preserves exact inputs and provenance.

This layout revision preserves the current synthetic grid under `data/simulator/`,
including the newly added sensor-centred Cabauw setups. The report
uses 213 radar-date epochs, 361 selected sounding epochs and 116 Cabauw mornings;
those are distinct from whole-archive source counts. The full expanded weather
contribution has 1,279 reports, with one duplicated alias excluded from canonical
flight counting.

`data/building-temperature.json` contains only public KNMI weather: the report's
72 h exponential memory of hourly station-344 temperature, at 06 UTC on the 213
public pass dates. It reads no radar points. Regenerate using the analysis Python
environment and its pinned temperature model:

```sh
python tools/export_building_temperature.py --analysis /path/to/virtual-radiosonde
```

The older exploratory radar processings in `data/datasets.json` power the six
Building players and 3D city. Their point selection and height support differ
from the report's full-height export. The 2020-2026 ground reference and archived
2014-2023 processor reference remain selectable; their manifests and aggregates
are unchanged. `animations.html` preserves older links by redirecting to the
matching Building player.

## 3D research and building identity

The default city view asks where a vertical radar profile has observation support.
Its 10 m slider counts only published building/slab groups with at least 20 points.
An active slab uses the same count colour scale as the selected building's height
chart; other supported heights are muted. Building geometry outside retained radar
heights is grey. A coloured slab is a published group, not continuous facade coverage,
an independent air layer, or proof of retrieval accuracy.

The selected-building timeline is the highest supported slab mean minus the lowest
supported slab mean, in mm along the radar line of sight. It still mixes motion and
air. The city-gradient timeline is the exploratory residual radar height gradient,
with daily temperature on a separate labelled scale. Neither is retrieved urban
refractivity. The exploratory city selection remains distinct from the report run.

Building labels and 16-digit BAG pand identifiers come from the existing public
`buildings.json` exports. Unverified labels stay unnamed. The Data directory lists
all 46 models, with an optional radar-support filter, official BAG links and a 3D
deep link of the form `3d/index.html?data=2020-2026-ground&building=<BAG-ID>&height=40`.
The BAG URL uses `searchQuery` and `objectId`, following the
[government registry's linking guidance](https://www.registerexterneveiligheid.nl/veelgestelde-vragen-faqs/kgl).
Friendly names are export labels, not an assertion that BAG stores that name.

## Public-data boundary

Radar products must be means over at least **20 points**, published with their
spread. Never publish a single point position, point time series, raw radar file,
private report draft, credentials, internal status or logbook. The course radar
inputs remain private. Public meteorological values are not radar observations.

Weather and soundings: KNMI, NOAA IGRA2 and ICOS. Buildings: BAG via PDOK (CC0),
3DBAG (CC BY 4.0). Preserve provider attribution. The site and its figures are
CC BY 4.0, Virtual Radiosonde team, TU Delft, 2026. Sources and contributor credits
are under Home's About tab.

## Checks and preview

```sh
python tools/check_links.py
python tools/check_data.py
python tools/check_report.py
python tools/check_workspace.py
node --test tools/city-research.test.mjs
python tools/serve.py
```

CI runs the four Python checks and research-readout tests using Node 24.
Inspect layouts in Google Chrome at desktop,
laptop and mobile sizes, exercise the controls and check keyboard/touch help.
Every main non-simulator desktop tab and its sidebar should fit without vertical
scrolling. Exercise all six observation players after their data have loaded;
their canvases size to the space remaining around their controls.
Previewing and changing layout do not regenerate scientific results.

Changes to the public layout belong on a `codex/` branch and should pass checks
before merging.
