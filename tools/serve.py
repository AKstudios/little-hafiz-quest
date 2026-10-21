#!/usr/bin/env python3
"""Preview Little Hafiz Quest on your own computer.

Usage (from the project folder):
    python3 tools/serve.py            # then open http://localhost:8000/
    python3 tools/serve.py 8080       # choose another port

Why not `python3 -m http.server`? The recitation player jumps to each āyah inside a sūrah's MP3,
which needs "Range" requests. Python's built-in server ignores them, so audio would always start
at the beginning. This small server adds Range support and listens on this computer only.
"""
import http.server
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        header = self.headers.get('Range')
        if not header or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
        if not match or (match.group(1) == '' and match.group(2) == ''):
            self.send_error(416)
            return None
        if match.group(1) == '':
            start, end = max(0, size - int(match.group(2))), size - 1
        else:
            start = int(match.group(1))
            end = min(int(match.group(2)), size - 1) if match.group(2) else size - 1
        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        f = open(path, 'rb')
        f.seek(start)
        self._remaining = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self._remaining))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, '_remaining', None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)
        self._remaining = None

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), RangeHandler)
    print(f'Little Hafiz Quest: http://localhost:{port}/  (Ctrl+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
