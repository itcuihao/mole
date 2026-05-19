//go:build !darwin

package integration

import "fmt"

// detectBrew returns false on non-darwin platforms (Homebrew is macOS-only).
func detectBrew() bool {
	return false
}

// detectApp returns false on non-darwin platforms.
func detectApp(paths []string) bool {
	return false
}

// installToolApp is not supported on non-darwin platforms.
func installToolApp(integ Integration) error {
	return fmt.Errorf("external tool integration is only supported on macOS")
}

// openApp is not supported on non-darwin platforms.
func openApp(integ Integration) error {
	return fmt.Errorf("external tool integration is only supported on macOS")
}