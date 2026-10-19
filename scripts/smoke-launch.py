#!/usr/bin/env python3
"""Exercise the documented launcher without leaving a server running."""
import os, signal, subprocess, time, urllib.request
port = '4338'
p = subprocess.Popen(['./launch.sh'], env={**os.environ, 'PORT': port}, start_new_session=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
try:
    for _ in range(100):
        if p.poll() is not None:
            raise RuntimeError(p.stdout.read().decode())
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1) as r:
                assert b'Video Excerpt Desk' in r.read()
            print('One-command launch served the browser interface successfully')
            break
        except (OSError, TimeoutError):
            time.sleep(.2)
    else:
        raise RuntimeError('Launch timed out')
finally:
    if p.poll() is None:
        os.killpg(p.pid, signal.SIGTERM)
    p.wait(timeout=10)
