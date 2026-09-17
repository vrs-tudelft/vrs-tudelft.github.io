"""Check that nothing in data/ is per-point radar data. Standard library only.

The TerraSAR-X point set was provided for the course and may not be passed on. The
files in data/ are aggregates: every record that comes from radar points is a mean
over at least MIN_N points, and the only positions are those of public things (BAG
outlines, cells on a fixed grid). This script walks every JSON file and refuses

  - a record with n below MIN_N,
  - a key that names a point attribute or a point position,
  - an array as long as the point set (20 594) or the coherent subset (11 818),
  - a data folder above the size cap,
  - a per-point file (data/points.*) that git has been allowed to track. Those files may be
    generated locally for the team to look at, with site_export.py --points, but they are
    ignored by git and must never be committed or published.

Run from the repository root before pushing:  python tools/check_data.py
Exit code 0 means clean. The same check runs inside the team repository's exporter.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

MIN_N = 20
SIZE_CAP = 1_500_000
BANNED = re.compile(r"(^pnt_|^lat$|^lon$|3857|^idx|^WKT$)")
POINT_COUNTS = (20594, 11818)
DATA = Path(__file__).resolve().parents[1] / "data"


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
    """Per-point files are fine locally, fatal if git is tracking them."""
    try:
        out = subprocess.run(["git", "ls-files", "data/points.*"], cwd=DATA.parent,
                             capture_output=True, text=True, check=False).stdout
    except OSError:
        return []
    return [line for line in out.splitlines() if line.strip()]


def main() -> int:
    problems, seen, total = [], {}, 0
    for f in tracked_point_files():
        problems.append(f"{f}: a per-point file is tracked by git; it may not leave this machine")
    local_points = sorted(DATA.glob("points.*"))
    for f in sorted(DATA.rglob("*")):
        if f.is_dir() or f.name == "MANIFEST.json" or f.name == "manifest.json" or f.name.startswith("points."):
            continue
        total += f.stat().st_size
        if f.suffix == ".json":
            walk(json.loads(f.read_text(encoding="utf-8")), "", f.relative_to(DATA).as_posix(), problems, seen)
        elif f.suffix == ".bin" and f.stat().st_size % 2:
            problems.append(f"{f.name}: odd byte count")
    top = sum(f.stat().st_size for f in DATA.glob("*") if f.is_file() and not f.name.startswith("points."))
    if top > SIZE_CAP:
        problems.append(f"data/ (top level) is {top} bytes, cap {SIZE_CAP}")
    for p in problems:
        print("PROBLEM", p)
    print(f"{len(problems)} problems; {total / 1024:.0f} KB in data/ ({top / 1024:.0f} KB top level); "
          f"smallest group per file: {seen}")
    if local_points:
        print("note: " + ", ".join(f.name for f in local_points) + " present locally; git ignores them, "
              "they are not part of the published site")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
