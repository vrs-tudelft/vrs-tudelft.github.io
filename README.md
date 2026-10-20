# vrs-tudelft.github.io

The public website of the Virtual Radiosonde project: https://vrs-tudelft.github.io

It is plain HTML, CSS and JavaScript. There is no build step. Change a file, push, and the
site updates within a minute or two.

## What is on it

| File | What it shows |
|---|---|
| `index.html` | Home: the idea in plain language, the result in one picture, where each stage stands, what holds so far, the paper and the team, about and licences |
| `data.html` | The two TerraSAR-X processings, where the zero sits (the shared-ground reference), building heights (3DBAG/AHN5), soundings, stations and towers, the air near the ground (the low-level reconstruction), links to Explore, and the rule on what may be published |
| `overview.html` | The whole project as one interactive flowchart (air near the ground, simulation, estimation), each part foldable, every box with an icon, a card and a link to its section, six paths that walk through their boxes step by step and open the parts they need; full-window like the simulator. The chart is data in `js/overview-data.js` (with its sources in the header comment), drawn by `js/overview.js` |
| `simulator.html` | The estimation simulator (v2), a full-window page (controls left, results right; `body.app-page` in `style.css`): pick the atmosphere (KNMI-built, the 2025 balloon soundings or the Cabauw tower), switch sinking, shrinking, thermal dilation and the cross-range error on or off, and choose the noise, the number of points and the height layers. It shows the estimate against the truth and the station per layer over time, where the error comes from, a scatter of the departures with its fitted line, and the cumulative trend when the disturbances are added one by one, with a short reading in plain words. The settings are kept in the address, so a link shares them. Every chart card has PNG and SVG buttons that save it as a clean figure (title, legend, settings caption) for reports. Reads `data/simulator/` (precomputed with the team's code, synthetic only; `js/simulator.js`) |
| `estimation.html` | The core: the estimation flowchart of 12 October in plain language, the air prior, the end-to-end simulation, the first pass, the test on the simulation (figures 41-43, 45), the real data 2020-2026 (figures 47-49), the choices made, limits, and the earlier pilot (figure 38) |
| `animations.html` | Explore (linked from Data, no menu tab of its own): six animations from the aggregate files, with a data-input switch (see below) |
| `3d/index.html` | The experimental 3D view, with the same switch and the gull easter egg |
| `figures/` | The PNG files, `NN-short-name.png`; the number continues the count in the team repository's `05_results/00_tsx_figures/` (01 to 31 as of 16 September 2026) |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | The site icon (the brand mark from the header); the `.ico` and `.png` are rendered from the `.svg` |
| `svg/` | The drawings; `tools/inline_svg.py` pastes them into the pages |
| `data/` | The aggregate files behind the animations and the 3D view (see the rule below), one set per data input: the archived September set (2014-2023, processor reference) in `data/` itself, the 2020-2026 set in the ground reference in `data/2020-2026-ground/`, each with its own `MANIFEST.json`; `data/datasets.json` lists them; `data/3d/` holds the building models, the ground image and the manifest, shared by both |
| `js/` | `nav.js` (the navigation: five tabs, Home, Overview, Estimation, Simulator, Data, one list for every page), `player.js` (the canvas player), `dataset.js` (the data-input switch), `animations.js` (the six animations), `simulator.js`, `overview.js` and `overview-data.js`, `icons.js` (the line icons both full-window pages share; `data-icon="name"` fills an element) |
| `3d/` | `viewer.js` (three.js), `3d.css`, `colormaps.js` (generated), `flight.js` (the small bird in the corner of the view: a gull with a flight model over the same scene, loaded only when someone clicks it) |
| `tools/` | `check_data.py` (the aggregation check, per data set), `check_links.py` (every internal link, image and anchor resolves, every file the Explore views fetch exists, no em dashes), `export_ground_frame.py` (writes `data/2020-2026-ground/`), `inline_svg.py` (pastes the drawings in) and `serve.py` (a local server that never caches) |
| `style.css` | The look: one light theme, the shell grid, the tooltips |

Every figure is made by a script in the team repository
([virtual-radiosonde](https://github.com/vrs-tudelft/virtual-radiosonde), `04_python/tsx/`)
and has a dated note in `01_reference/notes/` there that says what it shows and what it does
not. The captions here are the plain-language version of those notes.

## The data-input switch on the Explore pages

`animations.html` and `3d/index.html` share a two-way switch, `js/dataset.js`, that reads
`data/datasets.json`:

- **2020-2026, ground reference** (default): the newer processing, 8 January 2020 to 24 August
  2026, 213 passes. On every pass the median of the 499 coherent ground points (below 5 m) that the
  two processings share as unique mutual-nearest pairs is subtracted, the reference the team
  adopted on 5 October 2026. Rates mean "relative to the street".
- **2014-2023, processor reference (archived September view)**: the September files, unchanged.

The choice is kept in the address (`?data=2020-2026-ground` or `?data=2014-2023-processor`) and in
the browser's local storage; the address wins. Changing it redraws every player and recolours the
3D view in place. A view the active set cannot support says why instead of drawing (set
`unavailable` in `data/datasets.json`); at present every view is built for both sets. The
2020-2026 weather comes from KNMI station 344 daily data fetched on 5 October 2026 from the KNMI
daily-data service (daggegevens.knmi.nl, CC BY 4.0); the raw file stays in the team repository's
`02_data/05_weather/knmi/`, not on this site. To add a set: write its folder, add it to
`data/datasets.json` (with `unavailable` reasons where a view's files are missing) and run both checks.

## What may go on this site

This site is public. Only put here what we would be happy to show anyone:

- Figures, drawings and animations: yes.
- Numbers with their caveats: yes.
- Aggregates of the radar data: yes, if every record is a mean over **at least 20 radar
  points** (a grid cell of 10 or 25 m, a building, a 10 m slab of a building, a height band, the scene),
  **published together with the spread of the points behind it**: the standard deviation of their
  rates with the tenth and ninetieth percentiles, the spread of their heights, and how far they sit
  from their own mean on a single pass (`cells-sd.bin`, and `sd`/`se` per height band). The spread is
  measured after each point's offset, trend and curvature are removed, so it says how well the mean
  stands for its points on one pass, not how differently they settle
  and no record carries a point position or a single point's series. `site_export.py` in
  the team repository writes them that way and refuses anything else; run
  `python tools/check_data.py` here before pushing, it must print `0 problems`.
- Raw data, or files that contain point-by-point data: **no**. The satellite data was
  given to us for the course and may not be passed on.
- Draft text of the paper: no, until it is submitted.
- Internal status, minutes, logbooks, or requests addressed to named people: no.

## How to regenerate

From the team repository, with its virtual environment:

```
.venv/Scripts/python.exe 04_python/tsx/site_export.py        # data/*.json, data/cells.bin, MANIFEST.json
.venv/Scripts/python.exe 04_python/tsx/site_figures.py       # 05_results/00_tsx_figures/30-31 (copy those two PNGs into figures/)
.venv/Scripts/python.exe 04_python/tsx/site_3d_export.py     # data/3d/*, 3d/colormaps.js, the 3DBAG order in data/buildings.json

# Per-point build, for the team only. Writes data/points.json + points.bin (about 7 MB), which
# .gitignore keeps out of git and tools/check_data.py refuses to let anyone commit. The 3D view
# offers "every radar point" while those files are present; the published site never has them.
.venv/Scripts/python.exe 04_python/tsx/site_export.py --only cells --points ../vrs-tudelft.github.io/data
```

The 2020-2026 set in the ground reference is written from this repository, with the team
repository's environment; it imports `site_export.py` and applies the same rules and check:

```
"../ASG Project/.venv/Scripts/python.exe" tools/export_ground_frame.py       # data/2020-2026-ground/*
```

It needs both TerraSAR-X files in the team repository's `02_data/01_insar/` (the older one too,
to find the shared ground points). Re-run it after any change to `site_export.py`.

Then here: `python tools/check_data.py`, `python tools/check_links.py` and, after editing a drawing in `svg/`,
`python tools/inline_svg.py`.

Figure 38 (the earlier pilot) comes from the team repository's `03_notebooks/04_estimation_reference_pilot/`.

The estimation figures 40-50 come from the team repository's notebook
`03_notebooks/07_estimation/estimation.ipynb` (run it, then copy `results_summary.png` as 40, the
notebook's figure outputs as 41-43 and 45, `05_results/24_estimation_refractivity_profile/fig1, fig2, fig6`
as 47-49 and `flowchart/step00_overview.png` as 50). The simulator data are regenerated with:

```
python 04_python/estimation/site_simulator.py --out ../vrs-tudelft.github.io/data/simulator
```

It reruns the team's simulation (`06_simulation`) for every combination of the atmosphere, the four
disturbances, the noise and the number of points (384 runs), and estimates each with the four layer
setups; everything it writes is synthetic. `manifest.json` holds the choices, the defaults and a
compact summary of every combination (per-layer and column errors, station errors, skill), which the
page uses for the attribution and the cumulative trend; `runs/<key>.json` holds the per-pass series of
one run, fetched when it is selected. The run key is `<atm>_s<sinking><shrinking><thermal><crossrange>_n<noise>_p<points>`.
Each estimation also holds `pte`, the simulator's "P, T, e" tab: P (hydrostatic from the ground) and T
(6.5 K/km) from the station, e from the radar's N as section C5 of the team's `estimation_with_pte.ipynb`
(`estimation/pte.py`), with N shifted to the ground (`shift`) or not (`level`, the one the page shows); per layer the rms error, bias
and true spread against the run's own P, T, e, the station alone for e, the median uncertainty of e per pass
(jackknife, or the formal one where the jackknife cannot run: `sigma_source`), and the coldest, median and
warmest pass as profiles. For any pass (the tab's "Random pass"), `data/simulator/atm/<atm>_p<points>.json`
holds the true N, P, T and e on 5 m levels, the ground values and, per layer setup, P, T and the station's N
and e (the simulated air depends on the atmosphere and the number of points only), and each run's
`pte.e_pass` the radar's e per pass; both are written after `site_simulator.py` by
`python 04_python/estimation/site_simulator_passes.py --out ../vrs-tudelft.github.io/data/simulator`.
The N card shows the radar's refractivity against the truth: rms error and r per layer, next to the station alone. The pass profiles also show the measurements behind the air
(`meas`: the Cabauw mast's seven levels of T and e, the De Bilt soundings' reported levels; on the real 2025
passes the same two, 40-50 km away), the mother (the first pass) in the N card with "Show mother", and, with "T and e lumped", one card with
N − 77.6 P/T₀ (T₀ = 288.15 K) instead of T and e apart: the radar's N minus its pressure part at a fixed
temperature, which keeps every effect of T and e and none of the 6.5 K/km assumption (computed on the page
from the stored N and P; its error is practically N's, since P is known to about 0.1 hPa). The radar points per layer are shown under each
layer's name and in the profiles: for the simulations from `manifest.layer_points` (per point count and layer
setup; the points used do not depend on the air, the disturbances or the noise, checked against the runs), for
the real data from `layer_points` in `real.json`.

The simulator's "Real" atmosphere reads `data/simulator/real.json`: the same step-by-step breakdown on the
real 2020-2026 passes, per layer setup and air prior (radar only, or from the ground), with KNMI 344 at
06 UTC carried up with -55 N/km as the truth and the constant air as the reference, and `pte`: P and T
carried up from KNMI 344 (no error: nothing measures them above the street), e against KNMI 344's e carried
up, with the radar's jackknife uncertainty per pass, and three passes as profiles. With Real selected the
disturbances, noise and points are greyed out and the Disturbances and What this means tabs say they belong
to the simulation; old links to `simulator.html#real` open the Real atmosphere. Aggregates per layer
and pass only (at least 100 points per layer); the exporter runs the aggregation check before writing:

```
python 04_python/estimation/site_real_sim.py --out ../vrs-tudelft.github.io/data/simulator
```

To test locally, run `python tools/serve.py` and open `http://localhost:8000/`. It sends
`Cache-Control: no-store`, because a plain `python -m http.server` lets the browser keep
serving pages you have already visited and your edits look as if they never landed. The 3D
view loads ES modules, so it needs a server either way and will not run from a `file://` path.

## How to add or update something

1. A figure: put the PNG in `figures/` with the next free number, add a `<figure>` block
   to the page it belongs to (copy an existing one), run `tools/inline_svg.py` to fill in
   the image size.
2. An open question: add it to the "Limits" section of the page it belongs to.
3. An animation: add a builder to `js/animations.js`, an element with `data-anim="..."`
   to `animations.html`, and the data it needs to `site_export.py`.
4. A term worth explaining: wrap it in `<span class="t" data-tip="...">`, which renders as a tooltip on hover, focus or tap.
5. If a key number on `index.html` changes, change it there too. Bump the `?v=` on the stylesheet and script links when you change them, so returning visitors get the new file.
6. Commit and push, or edit the file directly on GitHub and press "Commit changes".

## Licences

Text, drawings and figures: CC BY 4.0, Virtual Radiosonde team, TU Delft, 2026. Inputs:
TerraSAR-X point set provided for the course by R.F. Hanssen (not redistributable);
KNMI (CC BY 4.0); NOAA IGRA2 (public domain); BAG via PDOK (CC0); 3DBAG (CC BY 4.0);
PDOK aerial image (CC BY 4.0); Esri tiles in the static figures; three.js (MIT).
