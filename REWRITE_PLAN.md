# Site rewrite, October 2026: audit and plan

Branch `rewrite-2026-10`, created from `main` at `8f25d1b` on 5 October 2026. Local only: not
pushed, no GitHub settings changed. Sources of truth: the team repository `virtual-radiosonde`
(`main` at `2bfba45`), its notes in `01_reference/notes/` up to 1 October, the
`03_notebooks/04_estimation_reference_pilot` and `05_annual_low_level_reconstruction` packages,
and `vrs-paper` (`2b4a7eb`, plus local `2401b55` with draft section 3.4 on reference choices).

## 1. Audit of the September site

| Page | Stale, wrong or superseded | Worth keeping |
|---|---|---|
| `index.html` | Five headline numbers all from the older processing in the processor frame (1.69 mm/100 m "candidate air signal", r = 0.56 against De Bilt, "towers still sink at 4 mm a year"); these predate the shared-ground reference and the estimation pilot, which shows the thermal fit can absorb temperature-linked air. "What we have found" reads stronger than the 30 September limits allow. The about box credits an earlier division of work. No mention of the low-level reconstruction or the second processing. | The opening idea, the two-heights drawing (d7), the about/licence boxes, the aggregate rule |
| `findings.html` | Built entirely on the older set and the September residual method. The ground section (seasonal cycle, "breathes in opposite phase") is overtaken by the reference work, which finds a ~0.5 mm composite reference cycle and does not separate reference motion from ground motion. The joint fit (0.62 / 0.064 against 0.92 / 0.109) is an association that the pilot shows cannot separate temperature-correlated air. Several figures plot individual radar points (see below). | Figures 24-28 are aggregates and could return in a later "history" section if wanted |
| `method.html` | The reference point box says "where and how high we do not know" and treats the seasonal ground cycle as an open mirror-image question; superseded by the 29 September reference notes. "That simulation has not been run yet"; the simulation is now being rebuilt. The paper table predates the reorganised `vrs-paper` layout and lists twelve-author framing that needs confirming. | The data rule, the three heights (figure 30), the pass calendar (figure 31), the forward-model chain drawing d1 and d3 (not reused yet) |
| `estimation.html` | Current (30 September). Lacked the plain-language layer and the synthetic table; its reproduce links point into a private repository. | All of it: rewritten in place with the same numbers, figures 37-39 and `data/estimation-pilot.json` |
| `figures.html` | Redirect to findings | Kept as a redirect |
| `animations.html` | All six players use the older processing in the processor frame and the September residual model; "candidate air signal" wording; text refers to retired figure numbers | The players and their aggregate data (n >= 20, with spread). Kept as "Explore", with an archive banner |
| `3d/index.html` | Same frame caveat; its fallback linked to `findings.html#ground` | The viewer, its aggregate layers and the gull easter egg (`3d/flight.js`), which still loads (button present, no console errors). Kept with an archive banner |

### Privacy finding on the live site

The following figures, published on `main` and live now, plot individual radar points (point
maps, per-point scatter or single-point series; figure 02 even prints point identifiers). That
conflicts with the site's own rule that nothing per point is published:

`01-maps`, `02-timeseries`, `03-height-vs-params`, `04-height-diversity`, `09-annual-two-ways`,
`11-basemap-height`, `12-basemaps`, `13-basemap-split-along`, `20-ground-rate-map`,
`21-ground-seasonal`, `22-buildings-rate-age`.

They are removed on this branch (commit "Remove figures that plot individual radar points");
they remain in the history of `main`. Figures 05-08, 10, 14-19, 23-28 appear to be aggregates (07, 08, 15-17, 19, 24, 25, 28 not re-inspected in this pass) and stay in
`figures/` unreferenced, for possible reuse. Figure 23 panel (a) uses 25 m windows; check its
group sizes before reusing it.

### Guards kept

- `.gitignore` keeps `data/points*` out of git; `tools/check_data.py` (n >= 20, banned point
  keys, point-count array lengths, size cap, tracked per-point files) prints `0 problems` on the
  branch. The animation and 3D per-point options still appear only when the local files exist.
- New: `tools/check_links.py` checks every internal href/src and #anchor across all pages, the
  nav list in `js/nav.js`, and em dashes. Result on the branch: `0 problems in 12 pages`. The same
  check on `main` also found no broken internal links; the external links into the private team
  repository (on `estimation.html` and the README) do fail for the public.

## 2. New structure

Eight entries in the header, ordered along the pipeline, plain language first and a boxed
"Technical version" after it. Every number carries an HTML comment naming its source note.

| Page | Content | Status |
|---|---|---|
| `index.html` Home | Idea, drawing d7, pipeline cards with status badges, five claims that hold, about and licences | Written |
| `data.html` Data | Two processings (20 594 / 288; 22 118 / 213; 122 shared dates, 752 pairs), heights (3DBAG, AHN5, 3.20 vs 3.34 m NAP), soundings, stations and towers, publication rule | Written; figures 30, 31 |
| `low-level.html` Air near the ground | Sander's 1 October package: method, withheld-sounding scores, Brasschaat 0.522 to 0.357 K over 0.1-32.8 m, Cabauw, limits | Written; figure slot open |
| `simulation.html` Simulation | Purpose and chain only; section "Simulation: model update pending" | Placeholder |
| `reference.html` Reference | Why a reference, +0.60 mm/yr offset, three options, shared ground +0.11, building table, seasonal cycle, limits, superseded versions | Written as proposed working choice; figure slot open |
| `estimation.html` Estimation | Pilot of 30 September, plain summary, all tables, figures 37-39 | Written |
| `paper.html` Paper and team | Title, success criterion, chapter outline, team, course | Written |
| `animations.html` Explore (+ `3d/`) | Archived September views with banners | Kept |

`findings.html`, `method.html` and `figures.html` are now redirects. Stylesheet: the existing
`style.css`, extended with `.steps`, `.badge`, `.tech`, `.placeholder`, `.banner`, `.asof`;
asset versions bumped to `?v=20261005`.

Phone width (375 px) checked in the browser on every page: no horizontal page scroll. Two
existing phone bugs fixed on the way: the 3D stage was forced to 608 px by `min-height` plus a
16:10 aspect ratio, and hidden tooltips near the right edge widened the animations page.

## 3. Placeholders left

1. `simulation.html`: "Simulation: model update pending". Fill from the updated model once it is
   on GitHub; the September `06_simulation/` draft is deliberately not described.
2. `reference.html`: figure slot for an aggregate version of figures 34-36 (per building and ground
   group, n >= 20, with spread). The existing ones are per point.
3. `low-level.html`: figure slot for the package's public-input comparison figures, after the
   author agrees and the ICOS, KNMI, IGRA and Open-Meteo credits are in the caption.
4. `index.html` "Who made what": credit paragraph marked `DECISION NEEDED`.
5. `estimation.html` "Reproduce": links into the private repository replaced by plain paths,
   marked `DECISION NEEDED`.

## 4. Decisions before anything goes public

1. DECIDED 05-10: take them down now, separately (`hotfix/remove-point-figures`, 9967d8e; push awaits Quinten's OK).
2. DECIDED 05-10: the team adopted the shared-ground reference (bdcf08b).
   Section 3.4 of the paper (local `2401b55`) is a draft and not public.
3. Do Sander and the people named agree with their pages and credits (`low-level.html`, the
   "Who made what" box)? Check the reading of the low-level score table (comment on the page:
   the 59/82/20/46 % in the package README are against straight-line interpolation of the
   remaining readings, not against the weather model).
4. The team list: are all twelve students still active (Shaquille Huiswoud was unconfirmed)?
5. DECIDED 05-10: a data-input switch on Explore and 3D, 2020-2026 ground frame by default, 2014-2023
   processor frame archived (90fbac2 to f30af22). Open: KNMI 344 daily data for 2024-2026 for the
   joint view; own-ground vs shared-ground for a single set; rate colour range of 2 mm/yr.
6. A public home for the reproducibility material (an archive release or a public mirror), since
   the team repository is private.
7. When the simulation update lands: who writes the simulation page, and with which approved
   numbers.

## 5. Next steps after those decisions

- Fill the placeholders, rerun `tools/inline_svg.py`, `tools/check_data.py`, `tools/check_links.py`.
- Review on a phone and a desktop with `python tools/serve.py`.
- Merge into `main` and push only on Quinten's explicit go.
