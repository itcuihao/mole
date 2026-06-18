#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_NAME="Mole"
DEFAULT_TARGETS="darwin/arm64,darwin/amd64"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build/bin"
DIST_DIR="${ROOT_DIR}/dist"
APP_BUNDLE_PATH="${BUILD_DIR}/${APP_NAME}.app"

VERSION=""
TARGETS="${DEFAULT_TARGETS}"

usage() {
	cat <<'EOF'
Usage: ./scripts/release.sh [options]

Build release archives into dist/ and generate SHA256SUMS.

Options:
  --version <value>   Release version to embed in filenames (default: git describe)
  --targets <list>    Comma-separated targets (default: darwin/arm64,darwin/amd64)
  --help              Show this help

Supported targets in this first release pipeline:
  darwin/arm64
  darwin/amd64
EOF
}

log_info() {
	echo -e "${BLUE}==>${NC} $1"
}

log_warn() {
	echo -e "${YELLOW}Warning:${NC} $1"
}

log_success() {
	echo -e "${GREEN}✓${NC} $1"
}

log_error() {
	echo -e "${RED}Error:${NC} $1" >&2
	exit 1
}

ensure_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		log_error "Missing required command: $1"
	fi
}

cleanup_stale_app_bundle() {
	mkdir -p "${BUILD_DIR}"

	while IFS= read -r bundle; do
		[ -z "${bundle}" ] && continue
		if [ "${bundle}" != "${APP_BUNDLE_PATH}" ]; then
			log_warn "Removing stale app bundle: ${bundle}"
			rm -rf "${bundle}"
		fi
	done < <(find "${BUILD_DIR}" -maxdepth 1 -type d -iname "${APP_NAME}.app" 2>/dev/null)
}

copy_app_icon() {
	if [ -f "${ROOT_DIR}/assets/appicon.png" ]; then
		mkdir -p "${ROOT_DIR}/build"
		cp "${ROOT_DIR}/assets/appicon.png" "${ROOT_DIR}/build/appicon.png"
	else
		log_warn "assets/appicon.png not found; using existing build icon if present"
	fi
}

resolve_version() {
	if [ -n "${VERSION}" ]; then
		return
	fi

	local version_file="${ROOT_DIR}/VERSION"
	if [ -f "${version_file}" ]; then
		VERSION="$(tr -d '[:space:]' < "${version_file}")"
		if [ -n "${VERSION}" ]; then
			return
		fi
	fi

	if git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		VERSION="$(git -C "${ROOT_DIR}" describe --tags --always --dirty)"
	else
		VERSION="dev"
	fi
}

label_for_target() {
	case "$1" in
		darwin/arm64)
			echo "macos-arm64"
			;;
		darwin/amd64)
			echo "macos-amd64"
			;;
		*)
			return 1
			;;
	esac
}

validate_target() {
	case "$1" in
		darwin/arm64|darwin/amd64)
			;;
		*)
			log_error "Unsupported target '$1'. Supported targets: darwin/arm64, darwin/amd64"
			;;
	esac
}

package_macos_bundle() {
	local archive_base="$1"
	local archive_path="${DIST_DIR}/${archive_base}.zip"

	[ -d "${APP_BUNDLE_PATH}" ] || log_error "Expected app bundle not found: ${APP_BUNDLE_PATH}"

	rm -f "${archive_path}"
	ditto -c -k --sequesterRsrc --keepParent "${APP_BUNDLE_PATH}" "${archive_path}"
	log_success "Packaged ${archive_path##*/}"
}

write_checksums() {
	local checksum_file="${DIST_DIR}/SHA256SUMS"
	local file
	local hash

	rm -f "${checksum_file}"
	touch "${checksum_file}"

	while IFS= read -r file; do
		[ -n "${file}" ] || continue

		if command -v shasum >/dev/null 2>&1; then
			hash="$(LC_ALL=C LANG=C shasum -a 256 "${DIST_DIR}/${file}" | awk '{print $1}')"
		elif command -v sha256sum >/dev/null 2>&1; then
			hash="$(LC_ALL=C LANG=C sha256sum "${DIST_DIR}/${file}" | awk '{print $1}')"
		else
			log_error "Missing checksum tool: shasum or sha256sum"
		fi

		printf "%s  %s\n" "${hash}" "${file}" >> "${checksum_file}"
	done < <(find "${DIST_DIR}" -maxdepth 1 -type f ! -name 'SHA256SUMS' -print | sed 's|.*/||' | sort)

	log_success "Generated SHA256SUMS"
}

build_target() {
	local target="$1"
	local skip_frontend="$2"
	local archive_label
	local archive_base
	local -a build_args

	archive_label="$(label_for_target "${target}")"
	archive_base="${APP_NAME}-${VERSION}-${archive_label}"

	log_info "Building ${target}"

	build_args=(-platform "${target}" -o "${APP_NAME}" -ldflags "-X main.Version=${VERSION}")
	if [ "${skip_frontend}" = "1" ]; then
		build_args=(-s "${build_args[@]}")
	fi

	(
		cd "${ROOT_DIR}"
		wails build "${build_args[@]}"
	)

	package_macos_bundle "${archive_base}"
}

update_cask_version() {
	local cask_path="${ROOT_DIR}/Casks/mole.rb"
	[ -f "${cask_path}" ] || return 0

	# Only refresh the version line. The sha256 line is rewritten by CI
	# (scripts/update-cask.sh) using the real release artifact hash; for
	# local builds we leave whatever is currently in the file.
	sed -i.bak -E \
		-e "s|^  version \".*\"|  version \"${VERSION}\"|" \
		"${cask_path}"
	rm -f "${cask_path}.bak"
	log_success "Updated Casks/mole.rb version to ${VERSION}"
}

parse_args() {
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--version)
				[ "$#" -ge 2 ] || log_error "--version requires a value"
				VERSION="$2"
				shift 2
				;;
			--targets)
				[ "$#" -ge 2 ] || log_error "--targets requires a value"
				TARGETS="$2"
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

main() {
	local first_build=1
	local target
	local normalized_targets

	parse_args "$@"
	resolve_version

	ensure_command wails
	ensure_command ditto
	ensure_command npm

	copy_app_icon
	cleanup_stale_app_bundle

	rm -rf "${DIST_DIR}"
	mkdir -p "${DIST_DIR}"

	normalized_targets="${TARGETS//,/ }"
	for target in ${normalized_targets}; do
		validate_target "${target}"
		build_target "${target}" "$((1 - first_build))"
		first_build=0
	done

	write_checksums
	update_cask_version

	log_success "Release artifacts are ready in ${DIST_DIR}"
}

main "$@"
