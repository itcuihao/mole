#!/bin/bash
# Update Casks/mole.rb with a new version and (optionally) real SHA256 hashes.
#
# Usage:
#   # Arch-aware, real release hashes (used by CI):
#   ./scripts/update-cask.sh --version 0.1.16 --arm-sha <hex> --intel-sha <hex>
#
#   # Single hash (non-arch cask form, handy for quick local tests):
#   ./scripts/update-cask.sh --version 0.1.16 --sha256 <hex>
#
#   # No hash known — revert to :no_check (e.g. local dev builds):
#   ./scripts/update-cask.sh --version 0.1.16
#
# The script is idempotent: running it twice with the same args produces the
# same file content. Only the `version` and `sha256` lines are modified.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CASK_PATH="${ROOT_DIR}/Casks/mole.rb"

VERSION=""
ARM_SHA=""
INTEL_SHA=""
SINGLE_SHA=""

usage() {
	cat <<'EOF'
Usage: ./scripts/update-cask.sh --version <value> [--arm-sha <hex>] [--intel-sha <hex>] [--sha256 <hex>]

Options:
  --version <value>   Required. New version string (e.g. 0.1.16).
  --arm-sha <hex>     ARM64 zip SHA256 hex digest (lowercase, 64 chars).
  --intel-sha <hex>   Intel amd64 zip SHA256 hex digest (lowercase, 64 chars).
  --sha256 <hex>      Single SHA256 digest (non-arch form). Mutually exclusive
                      with --arm-sha/--intel-sha.
  --help              Show this help.
EOF
}

log_error() {
	echo "Error: $1" >&2
	exit 1
}

parse_args() {
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--version)
				[ "$#" -ge 2 ] || log_error "--version requires a value"
				VERSION="$2"
				shift 2
				;;
			--arm-sha)
				[ "$#" -ge 2 ] || log_error "--arm-sha requires a value"
				ARM_SHA="$2"
				shift 2
				;;
			--intel-sha)
				[ "$#" -ge 2 ] || log_error "--intel-sha requires a value"
				INTEL_SHA="$2"
				shift 2
				;;
			--sha256)
				[ "$#" -ge 2 ] || log_error "--sha256 requires a value"
				SINGLE_SHA="$2"
				shift 2
				;;
			--help|-h)
				usage
				exit 0
				;;
			*)
				log_error "Unknown option: $1"
				;;
		esac
	done
}

validate_hex() {
	local label="$1"
	local value="$2"
	if [ -z "${value}" ]; then
		return 0
	fi
	if ! echo "${value}" | grep -Eq '^[0-9a-fA-F]{64}$'; then
		log_error "${label} must be a 64-char hex SHA256 digest, got: ${value}"
	fi
}

build_sha256_line() {
	if [ -n "${ARM_SHA}" ] && [ -n "${INTEL_SHA}" ]; then
		printf '  sha256 arm: "%s", intel: "%s"' "${ARM_SHA}" "${INTEL_SHA}"
	elif [ -n "${SINGLE_SHA}" ]; then
		printf '  sha256 "%s"' "${SINGLE_SHA}"
	else
		printf '  sha256 :no_check'
	fi
}

main() {
	parse_args "$@"

	[ -n "${VERSION}" ] || { usage; log_error "--version is required"; }
	[ -f "${CASK_PATH}" ] || log_error "Cask file not found: ${CASK_PATH}"

	# Reject mixing single-hash and arch-aware modes.
	if [ -n "${SINGLE_SHA}" ] && { [ -n "${ARM_SHA}" ] || [ -n "${INTEL_SHA}" ]; }; then
		log_error "--sha256 cannot be combined with --arm-sha/--intel-sha"
	fi
	# Require both arch hashes if either is provided.
	if [ -n "${ARM_SHA}" ] && [ -z "${INTEL_SHA}" ]; then
		log_error "--arm-sha requires --intel-sha"
	fi
	if [ -n "${INTEL_SHA}" ] && [ -z "${ARM_SHA}" ]; then
		log_error "--intel-sha requires --arm-sha"
	fi

	validate_hex "arm-sha"  "${ARM_SHA}"
	validate_hex "intel-sha" "${INTEL_SHA}"
	validate_hex "sha256"   "${SINGLE_SHA}"

	local sha256_line
	sha256_line="$(build_sha256_line)"

	# macOS sed requires a backup suffix for -i; GNU sed does not. Use the
	# -i.bak + rm pattern for portability across macOS / Linux / CI.
	local tmp_backup="${CASK_PATH}.bak"
	sed -i.bak -E \
		-e "s|^  version \".*\"|  version \"${VERSION}\"|" \
		-e "s|^  sha256 .*|${sha256_line}|" \
		"${CASK_PATH}"
	rm -f "${tmp_backup}"

	echo "Updated ${CASK_PATH##*/}:"
	echo "  version \"${VERSION}\""
	echo "  ${sha256_line#  }"
}

main "$@"
