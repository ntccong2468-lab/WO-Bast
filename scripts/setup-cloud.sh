#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export npm_config_cache=/workspace/.vn-pochta-tools/npm
export ELECTRON_CACHE=/workspace/.vn-pochta-tools/electron
export ELECTRON_GET_USE_PROXY=1
npm ci
node node_modules/electron/install.js --no
# The driver ships verified Node-API prebuilds in its npm package: no ABI rebuild needed.
if ! command -v Xvfb >/dev/null && [ ! -x /workspace/.vn-pochta-tools/xvfb/usr/bin/Xvfb ]; then
  task_apt=$(mktemp -d /tmp/vn-pochta-apt.XXXXXX)
  trap 'rm -rf "$task_apt"' EXIT
  mkdir -p "$task_apt/lists/partial" "$task_apt/cache/archives/partial" /workspace/.vn-pochta-tools/xvfb
  printf '%s\n' 'deb https://deb.debian.org/debian trixie main' > "$task_apt/sources.list"
  opts=(-o "Dir::Etc::sourcelist=$task_apt/sources.list" -o Dir::Etc::sourceparts=- -o "Dir::State::lists=$task_apt/lists" -o "Dir::Cache=$task_apt/cache")
  /usr/bin/apt-get "${opts[@]}" update
  (cd "$task_apt" && /usr/bin/apt-get "${opts[@]}" download xvfb)
  for package in "$task_apt"/*.deb; do dpkg-deb -x "$package" /workspace/.vn-pochta-tools/xvfb; done
fi
npm run typecheck
npm run build
