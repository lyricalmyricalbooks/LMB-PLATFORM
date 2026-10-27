#!/bin/bash
# Installs deps in Claude Code on the web so `npm test` / `npm run build` work.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
# react/react-dom are optional peers here; install them explicitly without touching package.json.
npm install --no-audit --no-fund --legacy-peer-deps
npm install --no-save --no-audit --no-fund react@18.3.1 react-dom@18.3.1
