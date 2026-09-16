"""Paste the drawings from svg/ into the pages and add width/height to every figure image.

The pages carry markers like <!--svg:d1--> (and <!--svg:d5-compact-->); this replaces each
marker with the contents of svg/d1-*.svg so the pages work without any script or include.
Run again after editing a drawing:  python tools/inline_svg.py
Standard library plus Pillow for the image sizes (falls back to no size attributes).
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG = {p.name.split("-")[0]: p for p in (ROOT / "svg").glob("*.svg")}
MARK = re.compile(r"<!--svg:(\w+)-->|<svg data-svg=\"(\w+)\".*?</svg>", re.S)
IMG = re.compile(r'<img src="((?:\.\./)?figures/[^"]+)"([^>]*?)>')

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


def inline(html: str, page: Path) -> str:
    def rep(m):
        key = (m.group(1) or m.group(2)).lower()
        p = SVG.get(key)
        if not p:
            print(f"{page.name}: no drawing for {key}", file=sys.stderr)
            return m.group(0)
        svg = p.read_text(encoding="utf-8").strip()
        return svg.replace("<svg ", f'<svg data-svg="{key}" ', 1)

    html = MARK.sub(rep, html)

    def size(m):
        src, rest = m.group(1), m.group(2)
        rest = re.sub(r'\s(width|height)="\d+"', "", rest)
        f = ROOT / src.replace("../", "")
        if Image is None or not f.exists():
            return m.group(0)
        w, h = Image.open(f).size
        return f'<img src="{src}" width="{w}" height="{h}"{rest}>'

    return IMG.sub(size, html)


def main() -> int:
    for page in list(ROOT.glob("*.html")) + list((ROOT / "3d").glob("*.html")):
        s = page.read_text(encoding="utf-8")
        t = inline(s, page)
        if t != s:
            page.write_text(t, encoding="utf-8")
            print("updated", page.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
