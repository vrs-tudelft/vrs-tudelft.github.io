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
- Data: report radar, weather, reference and reuse policy, with frozen and expanded archives distinguished.
- Workflow and 3D: retain their interactive views, using the same navigation and controls-first layout.

Avoid article-width limits inside dashboards. Fit the main desktop views to the
viewport instead of hiding overflow or shrinking text. Put definitions, units and
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

The precomputed synthetic grid under `data/simulator/` is unchanged. The report
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
python tools/serve.py
```

CI runs the four Python checks. Inspect layouts in Google Chrome at desktop,
laptop and mobile sizes, exercise the controls and check keyboard/touch help.
Every main non-simulator desktop tab should fit without vertical scrolling.
Previewing and changing layout do not regenerate scientific results.

Changes to the public layout belong on a `codex/` branch and should pass checks
before merging.
