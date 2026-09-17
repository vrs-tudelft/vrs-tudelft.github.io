# vrs-tudelft.github.io

The public website of the Virtual Radiosonde project: https://vrs-tudelft.github.io

It is plain HTML, CSS and JavaScript. There is no build step. Change a file, push, and the
site updates within a minute or two.

## What is on it

| File | What it shows |
|---|---|
| `index.html` | The idea, five key numbers with their catches, what has been found so far, about and licences |
| `findings.html` | The figures grouped by the question they answer, including the ground and the buildings (`figures.html` redirects here) |
| `method.html` | The data, the three kinds of height, the ground truth, the method, the paper's outline, what is still open, a short glossary, and the rule on what may appear here |
| `animations.html` | Six animations drawn in the browser from the aggregate files in `data/` |
| `3d/index.html` | The experimental 3D view: 3DBAG buildings coloured by the radar aggregates, with a time slider |
| `figures/` | The PNG files, `NN-short-name.png`; the number continues the count in the team repository's `mvp/figures/` (01 to 31 as of 16 September 2026) |
| `svg/` | The drawings; `tools/inline_svg.py` pastes them into the pages |
| `data/` | The aggregate files behind the animations and the 3D view (see the rule below); `data/3d/` holds the building models, the ground image and the manifest |
| `js/` | `nav.js` (the navigation, one list for every page), `player.js` (the canvas player), `animations.js` (the six animations) |
| `3d/` | `viewer.js` (three.js), `3d.css`, `colormaps.js` (generated) |
| `tools/` | `check_data.py` (the aggregation check) and `inline_svg.py` |
| `style.css` | The look: one light theme, the shell grid, the tooltips |

Every figure is made by a script in the team repository
([virtual-radiosonde](https://github.com/vrs-tudelft/virtual-radiosonde), `mvp/src/`)
and has a dated note in `research/notes/` there that says what it shows and what it does
not. The captions here are the plain-language version of those notes.

## What may go on this site

This site is public. Only put here what we would be happy to show anyone:

- Figures, drawings and animations: yes.
- Numbers with their caveats: yes.
- Aggregates of the radar data: yes, if every record is a mean over **at least 20 radar
  points** (a 25 m cell, a building, a 10 m slab of a building, a height band, the scene)
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
mvp/.venv/Scripts/python.exe mvp/src/site_export.py        # data/*.json, data/cells.bin, MANIFEST.json
mvp/.venv/Scripts/python.exe mvp/src/site_figures.py       # mvp/figures/24-31 (copy the PNGs into figures/)
mvp/.venv/Scripts/python.exe mvp/src/site_3d_export.py     # data/3d/*, 3d/colormaps.js, the 3DBAG order in data/buildings.json
```

Then here: `python tools/check_data.py` and, after editing a drawing in `svg/`,
`python tools/inline_svg.py`.

To test locally, serve the folder (the 3D view loads ES modules and will not run from a
`file://` address): `python -m http.server 8000`, then open `http://localhost:8000/`.

## How to add or update something

1. A figure: put the PNG in `figures/` with the next free number, add a `<figure>` block
   to the page it belongs to (copy an existing one), run `tools/inline_svg.py` to fill in
   the image size.
2. An open question: add an item to the list on `method.html`.
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
