#!/bin/sh
# Read-only audit: does not install packages or run lifecycle scripts.
set -u
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../../../.." && pwd)
cd "$repo_root" || exit 2
audit_output=${1:-/tmp/zarix-dependency-recheck-20261013}
mkdir -p "$audit_output" || exit 2
audit_cache=$(mktemp -d /tmp/zarix-dependency-cache.XXXXXX) || exit 2
capture() {
  name=$1
  shift
  "$@" > "$audit_output/$name.stdout.log" 2> "$audit_output/$name.stderr.log"
  code=$?
  printf '%s\t%s\n' "$name" "$code" >> "$audit_output/exit-codes.tsv"
}
node --version > "$audit_output/node-version.txt"
npm --version > "$audit_output/npm-version.txt"
capture audit-full npm audit --json --cache "$audit_cache"
capture audit-production npm audit --omit=dev --json --cache "$audit_cache"
capture installed-tree npm ls braces micromatch fast-glob chokidar tailwindcss eslint-config-next @next/eslint-plugin-next --all --json
capture production-tree npm ls --omit=dev braces micromatch fast-glob chokidar tailwindcss eslint-config-next @next/eslint-plugin-next --all --json
capture registry-braces npm view braces dist-tags versions --json --cache "$audit_cache"
capture registry-micromatch npm view micromatch@latest version dependencies --json --cache "$audit_cache"
capture registry-fast-glob npm view fast-glob@latest version dependencies --json --cache "$audit_cache"
capture registry-tailwindcss-3 npm view tailwindcss@3.4.19 version dependencies --json --cache "$audit_cache"
capture registry-tailwindcss-versions npm view tailwindcss versions --json --cache "$audit_cache"
capture registry-tailwindcss-latest npm view tailwindcss@latest version dependencies --json --cache "$audit_cache"
capture registry-next-eslint-latest npm view @next/eslint-plugin-next@latest version dependencies --json --cache "$audit_cache"
capture remediation-dry-run npm audit fix --dry-run --ignore-scripts --json --cache "$audit_cache"
printf 'Evidence: %s\n' "$audit_output"
