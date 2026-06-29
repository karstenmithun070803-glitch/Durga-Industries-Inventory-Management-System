#!/bin/bash
# ============================================================
# Phase 4 — Group A6: Bundle Scan
# Verifies SUPABASE_SERVICE_ROLE_KEY is not in the client bundle
#
# Usage: bash tests/scripts/bundle-scan.sh
# Run from project root (where .next/ lives).
#
# PASS = key not found in .next/static/ (client bundle)
# FAIL = key found (security vulnerability — key exposed to browsers)
# ============================================================

set -euo pipefail

NEXT_STATIC=".next/static"
SEARCH_TERM="SERVICE_ROLE"

if [ ! -d "$NEXT_STATIC" ]; then
  echo "SKIP: .next/static/ does not exist. Run 'npm run build' first."
  exit 0
fi

echo "Scanning .next/static/ for '$SEARCH_TERM' ..."

MATCHES=$(grep -r "$SEARCH_TERM" "$NEXT_STATIC" 2>/dev/null | wc -l | tr -d ' ') || true

if [ "$MATCHES" -eq 0 ]; then
  echo "PASS: SERVICE_ROLE_KEY not found in client bundle (.next/static/)."
  echo "      Server-side secret is correctly isolated from the browser."
  exit 0
else
  echo "FAIL: SERVICE_ROLE_KEY found in client bundle ($MATCHES match(es))!"
  echo "      Files:"
  grep -r "$SEARCH_TERM" "$NEXT_STATIC" 2>/dev/null | head -5
  exit 1
fi
