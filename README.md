# Virtual Radiosonde

[Public website](https://vrs-tudelft.github.io/) explaining the project's question,
controlled tests and Rotterdam evidence. Plain HTML, CSS and JavaScript; GitHub
Pages publishes `main`.

## One research story

1. **Idea:** why points at different heights sample different radar paths, and
   why building motion can imitate that air signal. The pair illustration and
   one motion model replace separate theory, geometry and building-model pages.
2. **Experiment:** recover a known air input from simulated radar, isolate error
   sources, then examine conditional weather inference. Column error and the
   worst layer are both visible. Secondary fit settings, the air-absorption
   diagnostic and P/T assumptions stay available in named dialogs.
3. **Findings:** the canonical full-height Rotterdam comparison and the earlier
   height-support explorer. These are different selections. Building search and
   BAG identities belong beside the spatial evidence; exact layer numbers remain
   available without a second results page.

Every main view uses the compact left rail and full-width dashboard. Help explains
definitions and assumptions; the scientific conclusion and limits stay visible.
Desktop rails and main views must have **zero scroll range**, including short
browser content areas. Do not hide overflow to make a layout check pass.

`js/site-layout.js` handles focused views, keyboard tabs, mobile settings and deep
links. `js/nav.js` provides the three-stage navigation and viewport-safe tooltip
portal. `js/dialogs.js` keeps sources, licences and contributor credits available
from every stage. Supporting detail should not become another top-level page.

## Preserve the distinction between kinds of evidence

- The Idea figures are illustrations, not measured deformation or radar data.
- The Experiment uses precomputed simulated radar. Station-built, reconstructed
  sounding and Cabauw tower atmospheres provide its known air input. The model
  assumptions are shared with the estimator; success is not field validation.
- The Findings plot uses `data/simulator/real.json`, the sole canonical report
  result export. Its default is two layers, motion per building and no air prior.
  The station is a proxy, not collocated vertical truth. Weather still drives the
  building temperature fit. A station-based air prior makes the N comparison
  partly circular.
- N is estimated from the radar. P and T require surface information and profile
  assumptions; derived vapour pressure is conditional on them. Joined layer means
  do not add independent vertical observations.
- Coverage uses the original `buildings.json` and 3DBAG geometry. A published
  10 m group means aggregate support, not continuous facade coverage or a validated
  air layer. Missing or suppressed groups are unavailable, not zero observations.

The synthetic grid, both exploratory processing exports and the report JSON are
unchanged. The private `vrs-data@report-2026-10-31` release retains exact report
inputs and provenance. Do not generate another hand-maintained result summary.

`data/building-temperature.json` is public KNMI weather only: the report's 72 h
exponential memory of hourly station-344 temperature, sampled at 06 UTC on the
public pass dates. Regenerate with the pinned analysis environment:

```sh
python tools/export_building_temperature.py --analysis /path/to/virtual-radiosonde
```

## Building identity and old links

Names and 16-digit BAG pand identifiers come from the existing public export.
Unverified names remain unnamed. BAG links retain leading zeros and follow the
[official registry linking guidance](https://www.registerexterneveiligheid.nl/veelgestelde-vragen-faqs/kgl).

The seven retired page URLs redirect into the three-stage story. Existing building,
height and fit query choices remain useful. For example:

```text
results.html?building=0599100100002429&height=40#coverage
results.html?motion=scatterer&prior=none&layers=2#signal
```

Old `simulator.html?atm=real` links open Findings. Archived processing remains
addressable with `data=2014-2023-processor`, explicitly labelled as archived, while
the public story defaults to the maintained ground-reference explorer. The old
observation movies, process-map browser, unrelated 3D colouring modes and flight
feature no longer ship as alternative story surfaces. Original aggregate exports
remain available, with their own provenance and reference definitions.

## Public-data boundary

Public radar products are aggregate means over at least **20 points**, with their
spread retained in the exports. Do not publish point positions, point time series,
raw radar inputs, private report drafts, credentials or internal work records.
Public weather values are not radar observations.

Preserve attribution: KNMI, NOAA IGRA2, ICOS, BAG/PDOK and 3DBAG. BAG metadata are
CC0; 3DBAG and aerial imagery are CC BY 4.0. Sources and the complete contributor
list remain in the site's Sources & team dialog. Site text and figures are
CC BY 4.0, Virtual Radiosonde team, TU Delft, 2026.

## Check and preview

```sh
python tools/check_links.py
python tools/check_data.py
python tools/check_report.py
python tools/check_workspace.py
node --test tools/city-research.test.mjs
python tools/serve.py
```

CI runs these checks using Python and Node 24. Use Google Chrome for rendered QA:
visit all seven main screens, open the supporting dialogs, vary the real fit and
known-air experiments, select buildings, test old links, and verify keyboard/touch
help. Layout changes do not authorize regenerating scientific results.

Use a `codex/` branch, pass checks and review the rendered implementation before
merging. Preserve the protected experimental branches.
