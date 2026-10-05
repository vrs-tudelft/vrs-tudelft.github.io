"""Write the aggregate files for the 2020-2026 processing in the ground frame: data/2020-2026-ground/.

The September files in data/ come from the older processing (2014-2023) in the processor's own
reference frame. This script makes the same files for the newer processing (2020-01-08 to
2026-08-24, 213 passes) after the team's ground reference (adopted 5 October 2026) is applied:
on every pass, the median displacement of the coherent ground points (height above ground below
5 m, coherence above 0.6) that the two processings share as unique mutual-nearest pairs is
subtracted from every point. See the team repository's 04_python/tsx/ground_reference.py and
01_reference/notes/2026-09-29-unique-pair-ground-reference.md.

Everything else is the team repository's site_export.py, unchanged: the same groups, the same
rule (every record a mean over at least 20 points, published with its spread), the same check.
Only three inputs differ:

  - the displacement series, with the ground median subtracted per pass;
  - the per-point fitted terms (rate, curvature, yearly wave). The processor fits offset, centred
    time, its square and a cos/sin pair on the day of year (checked: correlation 1.000 with that
    model on both files). Subtracting one series from every point shifts every fitted term by the
    fit of that series, so the processor's own values are shifted by it;
  - the De Bilt soundings are read for 2019-2026 instead of 2014-2023, and the top of the layer is
    the highest coherent point of this set instead of 83 m.

The joint fit (joint.json) is not written: the KNMI Rotterdam daily temperatures on hand end on
31 December 2023, so only the first four of the six and a half years would enter it.

Run from this repository with the team repository's environment:
  "../ASG Project/.venv/Scripts/python.exe" tools/export_ground_frame.py [--team "../ASG Project"]
Then: python tools/check_data.py
"""

from __future__ import annotations

import argparse
import functools
import json
import sys
from pathlib import Path

import numpy as np

SITE = Path(__file__).resolve().parents[1]
DATASET = "2020-2026-ground"
SKIP = ("joint",)
SONDE_YEARS = (2019, 2026)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--team", type=Path, default=SITE.parent / "ASG Project")
    ap.add_argument("--out", type=Path, default=SITE / "data" / DATASET)
    a = ap.parse_args(argv)
    sys.path.insert(0, str((a.team / "04_python" / "tsx").resolve()))

    import vrs_data as vrs
    import ground_points as gp
    import height_profile as hp
    import joint_regression as jr
    import site_export as se
    from point_matching import mutual_point_pairs
    from overlap_rates import PAIR_M, DH_M

    old = vrs.load(vrs.DEFAULT_CSV)
    new = vrs.load(vrs.CSV_2020_2026)
    p_old, p_new = gp.prepare(old), gp.prepare(new)

    # ---- the ground reference: unique mutual-nearest pairs that are ground in both sets
    ia, ib = mutual_point_pairs(p_old, p_new, PAIR_M, DH_M)
    both = p_old["ground"][ia] & p_new["ground"][ib]
    ref_idx = ib[both]
    if len(np.unique(ref_idx)) != len(ref_idx) or not len(ref_idx):
        raise SystemExit("reference indices must be nonempty and unique")
    D = new.disp.to_numpy(float)
    ref = np.nanmedian(D[ref_idx], axis=0)                     # metres, one value per pass
    print(f"ground reference: {len(ia)} pairs, {len(ref_idx)} ground in both; "
          f"reference series {ref.min() * 1000:+.2f} to {ref.max() * 1000:+.2f} mm")

    # ---- shift the processor's per-point terms by the fit of the reference series
    ep = new.epochs
    t = (ep - ep[0]).days.to_numpy(float) / 365.25
    tc = t - t.mean()
    w = 2 * np.pi * ep.dayofyear.to_numpy(float) / 365.25
    A = np.column_stack([np.ones_like(t), tc, tc ** 2, np.cos(w), np.sin(w)])
    c, *_ = np.linalg.lstsq(A, ref, rcond=None)
    meta = new.meta.copy()
    for k, col in ((1, "pnt_linear"), (2, "pnt_quadratic"), (3, "pnt_seasonal_cos"), (4, "pnt_seasonal_sin")):
        meta[col] = meta[col] - c[k]
    disp = new.disp.sub(ref.astype("float32"), axis=1)
    stack = vrs.PsiStack(meta=meta, disp=disp, epochs=ep, amp=new.amp)
    print(f"reference fit: rate {c[1] * 1000:+.3f} mm/yr, curvature {c[2] * 1000:+.4f} mm/yr2, "
          f"yearly wave {np.hypot(c[3], c[4]) * 1000:.3f} mm")

    # ---- the inputs that depend on the period and the set
    P = gp.prepare(stack)
    h_top = float(np.round(np.nanmax(P["h"][P["good"]])))
    hp.H_TOP = h_top
    igra = hp.load_igra_profiles
    hp.load_igra_profiles = functools.partial(igra, y0=SONDE_YEARS[0], y1=SONDE_YEARS[1], ztop=h_top)
    se.POINT_COUNTS = tuple(sorted({20594, 11818, len(stack), int(P["good"].sum())}))
    x, y = se.to_rd(stack.meta["pnt_lon"].to_numpy(), stack.meta["pnt_lat"].to_numpy())
    I = dict(stack=stack, P=P, knmi=jr.load_knmi(), xy_rd=np.column_stack([x, y]),
             sondes=jr.load_igra_layer(y0=SONDE_YEARS[0], y1=SONDE_YEARS[1]))

    out = a.out
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*"):
        if f.is_file() and not f.name.startswith("points"):
            f.unlink()
    frame = dict(
        dataset=DATASET,
        label="2020-2026, ground reference",
        source="TerraSAR-X descending, newer processing: fullpixel_20260921155333.csv, "
               f"{ep[0].date()} to {ep[-1].date()}, {len(ep)} passes",
        frame=f"ground: on every pass the median displacement of {len(ref_idx)} coherent ground points "
              "(below 5 m above ground, coherence above 0.6), shared with the 2014-2023 processing as "
              "unique mutual-nearest pairs, is subtracted; rates are relative to that ground, not absolute. "
              "Adopted by the team on 5 October 2026",
        n_reference_points=int(len(ref_idx)),
        h_top_m=h_top)
    counts = dict(points=len(stack), coh_gt_0_6=int(P["good"].sum()), epochs=len(ep),
                  ground=int(P["ground"].sum()), reference_points=int(len(ref_idx)))
    for name in se.EXPORTS:
        if name in SKIP:
            continue
        if name == "cells":
            obj, _ = se.export_cells(I, out, False)
            obj["series"]["layout"] = obj["series"]["layout"].replace("[288]", f"[{len(ep)}]")
            counts["cells_all"] = obj["grids"]["all"]["n_cells"]
            counts["cells_ground"] = obj["grids"]["ground"]["n_cells"]
        else:
            obj = getattr(se, f"export_{name}")(I)
        if name == "buildings":
            arch = json.loads((SITE / "data" / "buildings.json").read_text(encoding="utf-8"))
            # the 3DBAG order and register attributes belong to the geometry in data/3d/, not to a data set
            for k in ("order", "bag3d", "bag3d_note"):
                obj[k] = arch[k]
            missing = sorted(set(obj["buildings"]) - set(arch["order"]))
            if missing:
                print("buildings with data but no 3D model (not drawn in 3D):", missing)
            counts["buildings"] = obj["n_buildings"]
        if name == "outlines":
            counts["outlines"] = obj["n"]
        if name == "profile":
            obj["h_top_m"] = h_top
        if name == "yearclock":
            obj["air"]["label"] = "air temperature, KNMI 344 daily mean [degC]; monthly means over 2014-2023, the years on hand"
        if name == "epochs":
            obj["knmi"]["note"] = "KNMI 344 daily values on hand up to 31 December 2023; later passes have none"
        obj["dataset"] = frame
        text = json.dumps(se._clean(obj), separators=(",", ":"), ensure_ascii=False)
        (out / f"{name}.json").write_text(text, encoding="utf-8")
        print(f"{name:10s} {len(text.encode()) / 1024:8.1f} KB")

    problems, min_seen, total = se.check_aggregation(out)
    se.write_manifest(out, min_seen, counts)
    man = json.loads((out / "MANIFEST.json").read_text(encoding="utf-8"))
    man["dataset"] = frame
    man["not_written"] = {"joint.json": "KNMI Rotterdam daily temperatures on hand end on 31 December 2023"}
    (out / "MANIFEST.json").write_text(json.dumps(man, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    for p in problems:
        print("PROBLEM", p)
    print(f"check: {len(problems)} problems; {total / 1024:.0f} KB; min n per file: {min_seen}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
