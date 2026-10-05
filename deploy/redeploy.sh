#!/usr/bin/env bash
# Rebuilds LocalDrop and restarts the systemd service.
# Run this from anywhere after pulling or editing code, to deploy the new version.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> Installing dependencies..."
npm run install:all

echo "==> Building backend and frontend..."
npm run build

echo "==> Restarting localdrop service..."
systemctl --user restart localdrop.service

sleep 1
systemctl --user status localdrop.service --no-pager
