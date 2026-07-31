#!/usr/bin/env bash
# Delete the old Flask app after Supabase migration is verified.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Workspace: $ROOT"
echo "Will remove: legacy-flask/, scripts/migrate-from-flask/export/, .pytest_cache/"
echo
echo "After this, the repo should only contain: web/ supabase/ scripts/ docs/ README.md LICENSE"
echo

if [[ "${1:-}" != "--force" ]]; then
  read -r -p "Type DELETE LEGACY to permanently remove the Flask app: " answer
  if [[ "$answer" != "DELETE LEGACY" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

rm -rf legacy-flask scripts/migrate-from-flask/export .pytest_cache
echo "Removed legacy Flask app."
ls -1
