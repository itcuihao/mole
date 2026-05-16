#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_NAME="Mole"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build/bin"
DIST_DIR="${ROOT_DIR}/dist"

VERSION=""
WITH_NSIS=1
SKIP_NPM_CI=0
USE_GIT_HASH=0

usage() {
	cat <<'EOF'
Usage: ./scripts/build-windows.sh [options]

Build Windows artifacts on local machine (tested for macOS host).

Options:
  --version <value>   Version in output filename (default: git describe / dev)
  --git-hash          Use commit hash instead of tag for version (e.g. 0.1.10-abc1234)
  --no-nsis           Build without NSIS installer generation
  --skip-npm-ci       Skip frontend dependency install step
  --help              Show this help

Examples:
  ./scripts/build-windows.sh
  ./scripts/build-windows.sh --version v0.1.10
  ./scripts/build-windows.sh --no-nsis
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

	if git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		if [ "${USE_GIT_HASH}" = "1" ]; then
			# Use latest tag + commit count + short hash (e.g. 0.1.10-3-abc1234)
			local tag
			tag="$(git -C "${ROOT_DIR}" describe --tags --abbrev=0 2>/dev/null || echo "0.0.0")"
			local count
			count="$(git -C "${ROOT_DIR}" rev-list --count "${tag}..HEAD" 2>/dev/null || echo "0")"
			local hash
			hash="$(git -C "${ROOT_DIR}" rev-parse --short HEAD)"
			if [ "${count}" = "0" ]; then
				VERSION="${tag}"
			else
				VERSION="${tag}-${count}-g${hash}"
			fi
		else
			VERSION="$(git -C "${ROOT_DIR}" describe --tags --always --dirty)"
		fi
	else
		VERSION="dev"
	fi
}

install_frontend_deps_if_needed() {
	if [ "${SKIP_NPM_CI}" = "1" ]; then
		log_info "Skipping frontend dependency installation (--skip-npm-ci)"
		return
	fi

	if [ ! -d "${ROOT_DIR}/frontend/node_modules" ] || [ "${ROOT_DIR}/frontend/package-lock.json" -nt "${ROOT_DIR}/frontend/node_modules" ]; then
		log_info "Installing frontend dependencies (npm ci)"
		(
			cd "${ROOT_DIR}/frontend"
			npm ci
		)
	else
		log_info "Frontend dependencies look up to date"
	fi
}

build_windows_binary() {
	local -a args
	args=(-platform windows/amd64 -o "${APP_NAME}.exe")
	if [ "${WITH_NSIS}" = "1" ]; then
		args=(-nsis "${args[@]}")
	fi

	log_info "Running: wails build ${args[*]}"
	(
		cd "${ROOT_DIR}"
		wails build "${args[@]}"
	)
}

collect_candidates() {
	local path
	CANDIDATES=()
	while IFS= read -r path; do
		[ -n "${path}" ] || continue
		CANDIDATES+=("${path}")
	done < <(find "${BUILD_DIR}" -type f \( -name '*.exe' -o -iname "${APP_NAME}" \))
}

select_portable_exe() {
	local candidate
	local base

	PORTABLE_EXE=""
	INSTALLER_EXE=""

	for candidate in "${CANDIDATES[@]}"; do
		base="$(basename "${candidate}")"
		if echo "${base}" | grep -Eiq 'installer|setup|uninstall'; then
			if [ -z "${INSTALLER_EXE}" ]; then
				INSTALLER_EXE="${candidate}"
			fi
			continue
		fi
		PORTABLE_EXE="${candidate}"
		break
	done

	if [ -z "${PORTABLE_EXE}" ] && [ "${#CANDIDATES[@]}" -gt 0 ]; then
		PORTABLE_EXE="${CANDIDATES[0]}"
	fi
}

package_artifacts() {
	local portable_zip
	local archive_base

	[ -d "${BUILD_DIR}" ] || log_error "Build output directory not found: ${BUILD_DIR}"

	collect_candidates
	if [ "${#CANDIDATES[@]}" -eq 0 ]; then
		log_warn "Files under ${BUILD_DIR}:"
		find "${BUILD_DIR}" -maxdepth 3 -type f | sed 's|^|  - |'
		log_error "No Windows executable candidate found under ${BUILD_DIR}"
	fi

	select_portable_exe
	[ -n "${PORTABLE_EXE}" ] || log_error "Failed to choose portable executable candidate"

	rm -rf "${DIST_DIR}"
	mkdir -p "${DIST_DIR}"

	archive_base="${APP_NAME}-${VERSION}-windows-amd64"
	portable_zip="${DIST_DIR}/${archive_base}.zip"

	log_info "Selected portable executable: ${PORTABLE_EXE}"
	ditto -c -k --sequesterRsrc --keepParent "${PORTABLE_EXE}" "${portable_zip}"
	log_success "Packaged $(basename "${portable_zip}")"

	if [ -n "${INSTALLER_EXE}" ]; then
		cp "${INSTALLER_EXE}" "${DIST_DIR}/$(basename "${INSTALLER_EXE}")"
		log_success "Copied installer $(basename "${INSTALLER_EXE}")"
	else
		log_info "No installer candidate found (this can be normal)"
	fi
}

write_checksums() {
	local checksum_file
	local file
	local hash
	local name

	checksum_file="${DIST_DIR}/SHA256SUMS-windows"
	rm -f "${checksum_file}"

	for file in "${DIST_DIR}"/*; do
		[ -f "${file}" ] || continue
		name="$(basename "${file}")"
		if [ "${name}" = "SHA256SUMS-windows" ]; then
			continue
		fi
		hash="$(shasum -a 256 "${file}" | awk '{print $1}')"
		printf "%s  %s\n" "${hash}" "${name}" >> "${checksum_file}"
	done

	log_success "Generated $(basename "${checksum_file}")"
}

print_summary() {
	log_info "Final files under dist/"
	find "${DIST_DIR}" -maxdepth 1 -type f -exec ls -lh {} \;
}

parse_args() {
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--version)
				[ "$#" -ge 2 ] || log_error "--version requires a value"
				VERSION="$2"
				shift 2
				;;
			--git-hash)
				USE_GIT_HASH=1
				shift
				;;
			--no-nsis)
				WITH_NSIS=0
				shift
				;;
			--skip-npm-ci)
				SKIP_NPM_CI=1
				shift
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
	parse_args "$@"
	resolve_version

	ensure_command wails
	ensure_command npm
	ensure_command ditto
	ensure_command shasum

	copy_app_icon
	install_frontend_deps_if_needed
	build_windows_binary
	package_artifacts
	write_checksums
	print_summary

	log_success "Windows artifacts are ready in ${DIST_DIR}"
}

main "$@"
