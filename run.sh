#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -n "${AUDIO_DESK_PYTHON:-}" ]; then
  exec "$AUDIO_DESK_PYTHON" app.py
elif [ -x .venv/bin/python ]; then
  exec .venv/bin/python app.py
else
  exec python3 app.py
fi
