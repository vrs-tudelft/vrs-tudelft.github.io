"""Check that every internal link, image, script and stylesheet in the site's HTML resolves.

Standard library only. Walks every .html file, collects href/src values, ignores external
URLs (http, https, mailto) and the per-point files that are deliberately absent online,
strips ?query, and checks that the file exists and, for #fragments, that the target page
has an element with that id. Also flags em dashes in page text.
Run from the repository root:  python tools/check_links.py   (exit code 0 means clean)
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
ATTR = re.compile(r'\b(?:href|src)="([^"]+)"')
IDS = re.compile(r'\bid="([^"]+)"')


def ids_of(page: Path) -> set:
    return set(IDS.findall(page.read_text(encoding="utf-8")))


def main() -> int:
    problems = []
    pages = sorted(p for p in ROOT.rglob("*.html") if ".git" not in p.parts)
    for page in pages:
        text = page.read_text(encoding="utf-8")
        if "\u2014" in text:
            problems.append(f"{page.relative_to(ROOT)}: contains an em dash")
        for ref in ATTR.findall(text):
            if re.match(r"^(https?:|mailto:|data:|javascript:)", ref):
                continue
            path, _, frag = ref.partition("#")
            path = unquote(path.split("?")[0])
            target = page if not path else (page.parent / path).resolve()
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                problems.append(f"{page.relative_to(ROOT)}: missing {ref}")
                continue
            if frag and target.suffix == ".html" and frag not in ids_of(target):
                problems.append(f"{page.relative_to(ROOT)}: no id '{frag}' in {target.relative_to(ROOT)}")
    for js in ["js/nav.js"]:
        for href in re.findall(r'href: "([^"]+)"', (ROOT / js).read_text(encoding="utf-8")):
            if not (ROOT / href).exists():
                problems.append(f"{js}: nav entry {href} missing")
    # visible text also comes from scripts, the data-input list and the docs
    texts = [*ROOT.glob("js/*.js"), *ROOT.glob("3d/*.js"), *ROOT.glob("tools/*.py"), *ROOT.glob("*.md"),
             ROOT / "style.css", ROOT / "3d" / "3d.css", ROOT / "data" / "datasets.json"]
    for f in texts:
        if f.exists() and "\u2014" in f.read_text(encoding="utf-8"):
            problems.append(f"{f.relative_to(ROOT)}: contains an em dash")
    # every file the Explore pages fetch for each data input exists (or the view says why not)
    cfg = json.loads((ROOT / "data" / "datasets.json").read_text(encoding="utf-8"))
    for sid, spec in cfg["sets"].items():
        for view, need in cfg["views"].items():
            if view in spec.get("unavailable", {}):
                continue
            for name in need:
                if not (ROOT / "data" / spec["path"] / name).exists():
                    problems.append(f"data/datasets.json: {sid} view {view} fetches data/{spec['path']}{name}, missing")
    for p in problems:
        print("PROBLEM", p)
    print(f"{len(problems)} problems in {len(pages)} pages")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
