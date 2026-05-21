//go:build darwin

package integration

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// Supported returns true on macOS (the only platform with menu bar integrations).
func Supported() bool {
	return true
}

// ensureMoleOnPath creates a symlink at /usr/local/bin/mole so xbar/SwiftBar
// plugin scripts can invoke the mole CLI.
func ensureMoleOnPath() error {
	if _, err := exec.LookPath("mole"); err == nil {
		return nil // already on PATH
	}

	if _, err := os.Stat("/usr/local/bin"); os.IsNotExist(err) {
		return nil // /usr/local/bin doesn't exist, skip
	}

	target, err := os.Executable()
	if err != nil {
		return nil // can't determine current binary, skip
	}

	// Only create symlink if target is an app bundle binary (GUI mode),
	// or the mole CLI binary itself.
	if _, err := os.Stat("/usr/local/bin/mole"); err == nil {
		// Already exists, check if it points to the right place
		existing, readErr := os.Readlink("/usr/local/bin/mole")
		if readErr == nil && existing == target {
			return nil
		}
		// Remove stale symlink before creating new one
		_ = os.Remove("/usr/local/bin/mole")
	}

	return os.Symlink(target, "/usr/local/bin/mole")
}

// detectBrew checks if Homebrew is available on PATH.
func detectBrew() bool {
	_, err := exec.LookPath("brew")
	return err == nil
}

// detectApp checks if any of the given app paths exist (macOS .app bundles).
func detectApp(paths []string) bool {
	for _, p := range paths {
		info, err := os.Stat(p)
		if err == nil && info.IsDir() {
			return true
		}
	}
	return false
}

// installToolApp installs a tool via brew cask, or opens the download page as fallback.
func installToolApp(integ Integration) error {
	if detectBrew() {
		cmd := exec.Command("brew", "install", "--cask", integ.InstallCmd)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("brew install --cask %s failed: %w", integ.InstallCmd, err)
		}
		return nil
	}

	// No Homebrew: open the GitHub releases page as a download fallback.
	return openDownloadPage(integ.ID)
}

// openApp launches the external tool using macOS open command.
func openApp(integ Integration) error {
	if len(integ.DetectPaths) == 0 {
		return fmt.Errorf("no app path known for %s", integ.ID)
	}

	appPath := integ.DetectPaths[0]
	cmd := exec.Command("open", "-a", filepath.Base(appPath))
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to open %s: %w", integ.Name, err)
	}
	return nil
}

// openDownloadPage opens the GitHub release page for the tool.
func openDownloadPage(id string) error {
	urls := map[string]string{
		"swiftbar": "https://github.com/swiftbar/SwiftBar/releases",
		"xbar":     "https://github.com/matryer/xbar/releases",
	}

	url, ok := urls[id]
	if !ok {
		return fmt.Errorf("no download URL for integration: %s", id)
	}

	cmd := exec.Command("open", url)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to open download page: %w", err)
	}
	return nil
}
