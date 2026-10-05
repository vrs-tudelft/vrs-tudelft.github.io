"""Check that nothing in data/ is per-point radar data. Standard library only.

The TerraSAR-X point sets were provided for the course and may not be passed on. The
files in data/ are aggregates: every record that comes from radar points is a mean
over at least MIN_N points, and the only positions are those of public things (BAG
outlines, cells on a fixed grid). There is one folder of aggregates per data input,
listed in data/datasets.json (the archived 2014-2023 set in data/ itself, the 2020-2026
ground-frame set in data/2020-2026-ground/). For every set this script refuses

  - a record with n below MIN_N,
  - a key that names a point attribute or a point position,
  - an array as long as either point set or its coherent subset,
  - a set above the size cap,
  - a file whose size or hash differs from the set's MANIFEST.json,
  - a view on the Explore pages without its files, unless datasets.json says that view is
    unavailable for the set (and then gives the reason shown on the page),

and, for the whole folder, a per-point file (points.*) that git has been allowed to track.
Those files may be generated locally for the team to look at, with site_export.py --points,
but they are ignored by git and must never be committed or published.

Run from the repository root before pushing:  python tools/check_data.py
Exit code 0 means clean. The same aggregation check runs inside the team repository's exporter.
"""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

MIN_N = 20
SIZE_CAP = 1_500_000
BANNED = re.compile(r"(^pnt_|^lat$|^lon$|3857|^idx|^WKT$)")
POINT_COUNTS = (20594, 11818,      # 2014-2023 processing: all points, coherence > 0.6
                22118, 14901)      # 2020-2026 processing
DATA = Path(__file__).resolve().parents[1] / "data"
NOT_CHECKED = {"MANIFEST.json", "manifest.json", "datasets.json"}


def walk(node, path, fname, problems, seen):
    if isinstance(node, dict):
        n = node.get("n")
        if isinstance(n, (int, float)) and not isinstance(n, bool):
            seen[fname] = min(seen.get(fname, 10 ** 9), int(n))
            if n < MIN_N:
                problems.append(f"{fname}:{path}: n = {n} < {MIN_N}")
        for k, v in node.items():
            if BANNED.search(k):
                problems.append(f"{fname}:{path}/{k}: banned key")
            walk(v, f"{path}/{k}", fname, problems, seen)
    elif isinstance(node, list):
        if len(node) in POINT_COUNTS:
            problems.append(f"{fname}:{path}: array of length {len(node)}")
        if node and isinstance(node[0], (dict, list)):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]", fname, problems, seen)


def tracked_point_files() -> list:
    """Per-point files are fine locally, fatal if git is tracking them, in any folder under data/."""
    try:
        out = subprocess.run(["git", "ls-files", "--", "data/points*", "data/**/points*"], cwd=DATA.parent,
                             capture_output=True, text=True, check=False).stdout
    except OSError:
        return []
    return [line for line in out.splitlines() if line.strip()]


def check_set(set_id: str, folder: Path, spec: dict, views: dict, problems: list) -> str:
    """One data input: its files, its manifest, its views. Returns a one-line summary."""
    seen, total = {}, 0
    files = sorted(f for f in folder.glob("*") if f.is_file() and not f.name.startswith("points"))
    for f in files:
        if f.name in NOT_CHECKED:
            continue
        total += f.stat().st_size
        rel = f.relative_to(DATA).as_posix()
        if f.suffix == ".json":
            walk(json.loads(f.read_text(encoding="utf-8")), "", rel, problems, seen)
        elif f.suffix == ".bin" and f.stat().st_size % 2:
            problems.append(f"{rel}: odd byte count")
    if total > SIZE_CAP:
        problems.append(f"{set_id}: {total} bytes, cap {SIZE_CAP}")
    man_path = folder / "MANIFEST.json"
    if not man_path.exists():
        problems.append(f"{set_id}: no MANIFEST.json")
    else:
        man = json.loads(man_path.read_text(encoding="utf-8"))
        if man.get("min_n") != MIN_N:
            problems.append(f"{set_id}: MANIFEST min_n is {man.get('min_n')}, not {MIN_N}")
        for name, rec in man.get("files", {}).items():
            f = folder / name
            if name.startswith("points"):
                continue                       # a local build; never published, so not required
            if not f.exists():
                problems.append(f"{set_id}: {name} is in MANIFEST.json but missing")
                continue
            sha = hashlib.sha1(f.read_bytes()).hexdigest()[:12]
            if f.stat().st_size != rec.get("bytes") or sha != rec.get("sha1"):
                problems.append(f"{set_id}: {name} differs from MANIFEST.json (regenerate, do not hand-edit)")
    off = spec.get("unavailable", {})
    for view, need in views.items():
        if view in off:
            if not str(off[view]).strip():
                problems.append(f"{set_id}: view {view} is unavailable without a reason")
            continue
        for name in need:
            if not (folder / name).exists():
                problems.append(f"{set_id}: view {view} needs {name}, which is missing; "
                                f"build it or list the view as unavailable in datasets.json")
    return f"{set_id}: {total / 1024:.0f} KB, smallest group per file {seen}"


def main() -> int:
    problems, lines = [], []
    for f in tracked_point_files():
        problems.append(f"{f}: a per-point file is tracked by git; it may not leave this machine")
    cfg = json.loads((DATA / "datasets.json").read_text(encoding="utf-8"))
    if cfg.get("default") not in cfg.get("sets", {}):
        problems.append("datasets.json: the default is not one of the sets")
    if sorted(cfg.get("order", [])) != sorted(cfg.get("sets", {})):
        problems.append("datasets.json: order and sets do not list the same ids")
    covered = set()
    for set_id, spec in cfg["sets"].items():
        folder = (DATA / spec["path"]).resolve()
        if not folder.is_dir():
            problems.append(f"{set_id}: folder data/{spec['path']} is missing")
            continue
        covered.add(folder)
        lines.append(check_set(set_id, folder, spec, cfg.get("views", {}), problems))
    # anything else under data/ that holds JSON (the 3D geometry) gets the record walk too
    other_seen = {}
    for f in sorted(DATA.rglob("*.json")):
        if f.parent.resolve() in covered or f.name in NOT_CHECKED or f.name.startswith("points"):
            continue
        walk(json.loads(f.read_text(encoding="utf-8")), "", f.relative_to(DATA).as_posix(), problems, other_seen)
    for p in problems:
        print("PROBLEM", p)
    for line in lines:
        print(line)
    print(f"{len(problems)} problems in {len(lines)} data sets")
    local_points = sorted(f.relative_to(DATA).as_posix() for f in DATA.rglob("points*"))
    if local_points:
        print("note: " + ", ".join(local_points) + " present locally; git ignores them, "
              "they are not part of the published site")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
