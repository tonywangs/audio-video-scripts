#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm ci --cache /tmp/video-excerpt-npm; fi
npm run acquire
exec npm start
