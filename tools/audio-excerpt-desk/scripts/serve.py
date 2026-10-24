import http.server
import pathlib
class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.split('?')[0] == '/demo.wav':
            return str(pathlib.Path('data/demo.wav').resolve())
        return super().translate_path(path)
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='web', **kwargs)
print('Audio Excerpt Desk: http://127.0.0.1:18765', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', 18765), Handler).serve_forever()
