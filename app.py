"""Loopback-only workbench; recordings live only in request-scoped temp directories."""
import base64
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
from urllib.parse import urlsplit
import audio

ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(32)
CACHE = Path(os.environ.get('AUDIO_DESK_CACHE', str(ROOT / '.cache')))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, body, mime='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def json(self, obj, status=200):
        self.send(json.dumps(obj, allow_nan=False).encode(), status=status)

    def valid_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def do_GET(self):
        if not self.valid_host():
            return self.json({'error': 'Use the loopback launch URL.'}, 403)
        path = urlsplit(self.path).path
        if path == '/api/config':
            return self.json({'token': TOKEN, 'tolerances': audio.TOL})
        if path == '/api/demo':
            try:
                provenance = json.loads((ROOT / 'demo/sources.json').read_text())
                entries = []
                for s in provenance:
                    data = (CACHE / s['demo_file']).read_bytes()
                    if audio.sha(data) != s['demo_sha256']:
                        raise ValueError('Demo hash mismatch. Reacquire demo.')
                    entries.append({'name': s['demo_file'], 'data': base64.b64encode(data).decode(), 'provenance': s})
                return self.json({'files': entries})
            except (OSError, ValueError) as e:
                return self.json({'error': 'Run python scripts/acquire_demo.py first. ' + str(e)}, 400)
        files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}
        if path in files:
            name, mime = files[path]
            return self.send((ROOT / 'static' / name).read_bytes(), mime)
        return self.json({'error': 'Not found'}, 404)

    def do_POST(self):
        if not self.valid_host() or self.headers.get('X-Desk-Token') != TOKEN:
            return self.json({'error': 'Reload the app before retrying.'}, 403)
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
            return self.json({'error': 'Cross-origin requests are not allowed.'}, 403)
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 45 * 1024 * 1024:
                raise ValueError('Request too large or empty.')
            req = json.loads(self.rfile.read(length))
            if self.path == '/api/analyze':
                return self.json(audio.analyze(audio.decode(req)))
            if self.path == '/api/process':
                output, report = audio.process(audio.decode(req), req.get('settings'), req.get('name'))
                return self.json({'data': base64.b64encode(output).decode() if output else None, 'report': report})
            if self.path == '/api/export':
                data, manifest = audio.export(req['files'])
                return self.json({'data': base64.b64encode(data).decode(), 'manifest': manifest})
            self.json({'error': 'Not found'}, 404)
        except (ValueError, KeyError, TypeError) as e:
            self.json({'error': str(e)}, 400)
        except Exception as e:
            self.json({'error': f'Processing failed ({type(e).__name__}); no success claimed.'}, 500)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8765'))
    server = HTTPServer(('127.0.0.1', port), Handler)
    server.timeout = 60
    print(f'Audio Loudness Desk: http://127.0.0.1:{port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
