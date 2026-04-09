package session

import (
	"os"
	"path/filepath"
	"testing"
)

func resolveTestPath(t *testing.T, path string) string {
	t.Helper()

	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return filepath.Clean(path)
	}

	return filepath.Clean(resolved)
}

func TestDefaultSessionWorkingDirPrefersUserHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	got := defaultSessionWorkingDir()
	if resolveTestPath(t, got) != resolveTestPath(t, home) {
		t.Fatalf("defaultSessionWorkingDir() = %q, want %q", got, home)
	}
}

func TestDefaultSessionWorkingDirFallsBackWhenHomeIsMissing(t *testing.T) {
	cwd := t.TempDir()
	missingHome := filepath.Join(t.TempDir(), "missing-home")
	t.Setenv("HOME", missingHome)

	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() failed: %v", err)
	}
	defer func() {
		_ = os.Chdir(originalWD)
	}()

	if err := os.Chdir(cwd); err != nil {
		t.Fatalf("Chdir(%q) failed: %v", cwd, err)
	}

	got := defaultSessionWorkingDir()
	if resolveTestPath(t, got) != resolveTestPath(t, cwd) {
		t.Fatalf("defaultSessionWorkingDir() = %q, want %q", got, cwd)
	}
}
