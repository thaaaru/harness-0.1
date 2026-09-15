#!/usr/bin/env bash
set -euo pipefail

readonly REQUIRED_NODE_MAJOR=22

main() {
  local initial_path="$PATH"
  local project_root
  project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  require_command node
  require_command pnpm
  require_supported_node

  cd "$project_root"

  export PNPM_HOME="${PNPM_HOME:-$(derive_pnpm_home)}"
  export PATH="$PNPM_HOME:$PATH"

  pnpm install --frozen-lockfile
  pnpm link --global
  tekassure install-browser
  print_next_step "$initial_path"
}


print_next_step() {
  local initial_path="$1"

  if [[ ":$initial_path:" == *":$PNPM_HOME:"* ]]; then
    printf '\nTekAssure is ready. Try: tekassure --help\n'
    return
  fi

  printf '\nTekAssure is installed. Open a new terminal, or run:\n'
  printf '  export PNPM_HOME=%q\n' "$PNPM_HOME"
  printf '  export PATH="$PNPM_HOME:$PATH"\n'
  printf 'Then try: tekassure --help\n'
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '%s is required but was not found on PATH.\n' "$command_name" >&2
    exit 1
  fi
}

require_supported_node() {
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"

  if ((node_major < REQUIRED_NODE_MAJOR)); then
    printf 'TekAssure requires Node.js %s or later; found %s.\n' "$REQUIRED_NODE_MAJOR" "$node_major" >&2
    exit 1
  fi
}

derive_pnpm_home() {
  local global_root
  global_root="$(pnpm root --global)"

  if [[ -z "$global_root" ]]; then
    printf 'Unable to determine pnpm global directory.\n' >&2
    exit 1
  fi

  dirname "$(dirname "$(dirname "$global_root")")"
}

main "$@"
