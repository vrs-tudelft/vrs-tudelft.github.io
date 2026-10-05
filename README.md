# vrs-tudelft.github.io

The public website of the Virtual Radiosonde project: https://vrs-tudelft.github.io

It is plain HTML, CSS and JavaScript. There is no build step. Change a file, push, and the
site updates within a minute or two.

## What is on it

| File | What it shows |
|---|---|
| `index.html` | The idea in plain language, where each stage stands, what holds so far, about and licences |
| `data.html` | The two TerraSAR-X processings, building heights (3DBAG/AHN5), soundings, stations and towers, and the rule on what may be published |
| `low-level.html` | The annual low-level reconstruction of the lowest 200 m (1 October 2026) and its Brasschaat and Cabauw checks |
| `simulation.html` | Placeholder: the end-to-end simulation is being rebuilt ("Simulation: model update pending") |
| `reference.html` | Where the zero sits: the +0.60 mm/yr offset between processings and the shared-ground proposal (29 September 2026) |
| `estimation.html` | The estimation pilot (30 September 2026): references, four buildings, held-out dates, synthetic signal retention, absolute-profile ambiguity. Figures 37-39 and `data/estimation-pilot.json` |
| `paper.html` | The paper's title and outline, the team, the course |
| `animations.html` | "Explore": six animations from the aggregate files, with a data-input switch (see below) |
| `3d/index.html` | The experimental 3D view, with the same switch and the gull easter egg |
| `findings.html`, `method.html`, `figures.html` | Redirects to the pages that replaced them (October 2026) |
| `figures/` | The PNG files, `NN-short-name.png`; the number continues the count in the team repository's `05_results/00_tsx_figures/` (01 to 31 as of 16 September 2026) |
| `svg/` | The drawings; `tools/inline_svg.py` pastes them into the pages |
| `data/` | The aggregate files behind the animations and the 3D view (see the rule below), one set per data input: the archived September set (2014-2023, processor reference) in `data/` itself, the 2020-2026 set in the ground reference in `data/2020-2026-ground/`, each with its own `MANIFEST.json`; `data/datasets.json` lists them; `data/3d/` holds the building models, the ground image and the manifest, shared by both |
| `js/` | `nav.js` (the navigation, one list for every page), `player.js` (the canvas player), `dataset.js` (the data-input switch), `animations.js` (the six animations) |
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
3D view in place. A view the active set cannot support says why instead of drawing: the
buildings-or-air joint fit is not built for 2020-2026, because the KNMI Rotterdam daily
temperatures on hand end in December 2023. To add a set: write its folder, add it to
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
.venv/Scripts/python.exe 04_python/tsx/site_figures.py       # 05_results/00_tsx_figures/24-31 (copy the PNGs into figures/)
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

The estimation pilot is regenerated separately, from the team repository:

```powershell
.venv/Scripts/python.exe 04_python/tsx/estimation_pilot.py
.venv/Scripts/python.exe 04_python/tsx/publish_estimation_pilot.py
```

The second command stages only the approved aggregate/synthetic outputs and page
edits in this checkout. It does not commit or push. Run this site's data check
and inspect the diff before publication. The walkthrough and VS Code workspace
are in the team repository's `03_notebooks/04_estimation_reference_pilot/`.

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
