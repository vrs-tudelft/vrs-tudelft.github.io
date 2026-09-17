"""Serve the site locally for testing, telling the browser never to cache.

The plain `python -m http.server` sends no cache headers, so a browser is free to keep
serving an old copy of a page it has already seen; while editing that looks like the
changes never landed. This one says no-store on every response.

    python tools/serve.py [port]        # default 8000

The 3D view loads ES modules, so it needs a server: it will not run from a file:// path.
"""

from __future__ import annotations

import functools
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = Path(__file__).resolve().parents[1]
    handler = functools.partial(NoCacheHandler, directory=str(root))
    print(f"Serving {root} at http://localhost:{port}/  (nothing is cached)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
