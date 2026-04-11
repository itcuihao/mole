package session

import (
	"os"
	"path/filepath"
	"strings"
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

func TestTmuxExecutableFallsBackToKnownLocations(t *testing.T) {
	fakeDir := t.TempDir()
	fakeTmux := filepath.Join(fakeDir, "tmux")
	if err := os.WriteFile(fakeTmux, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatalf("WriteFile(%q) failed: %v", fakeTmux, err)
	}

	originalCandidates := tmuxExecutableCandidates
	tmuxExecutableCandidates = []string{fakeTmux}
	defer func() {
		tmuxExecutableCandidates = originalCandidates
	}()

	t.Setenv("PATH", "")

	got, err := tmuxExecutable()
	if err != nil {
		t.Fatalf("tmuxExecutable() returned error: %v", err)
	}
	if got != fakeTmux {
		t.Fatalf("tmuxExecutable() = %q, want %q", got, fakeTmux)
	}

	pathEntries := filepath.SplitList(os.Getenv("PATH"))
	if len(pathEntries) == 0 || filepath.Clean(pathEntries[0]) != filepath.Clean(fakeDir) {
		t.Fatalf("PATH = %q, want first entry %q", os.Getenv("PATH"), fakeDir)
	}
}

func TestBuildTmuxEnvScriptContentUsesResolvedBinary(t *testing.T) {
	script := buildTmuxEnvScriptContent(map[string]string{"FOO": "bar"}, "echo hi", "/opt/homebrew/bin/tmux")

	if !strings.Contains(script, "'/opt/homebrew/bin/tmux' display-message -p '#S'") {
		t.Fatalf("buildTmuxEnvScriptContent() missing absolute tmux path in display-message: %q", script)
	}
	if !strings.Contains(script, "'/opt/homebrew/bin/tmux' setenv -t \"$_session\" MOLE_CMD_RAN 1") {
		t.Fatalf("buildTmuxEnvScriptContent() missing absolute tmux path in setenv: %q", script)
	}
}

func TestBuildTmuxAttachShellCommandUsesResolvedBinary(t *testing.T) {
	got := buildTmuxAttachShellCommand("/opt/homebrew/bin/tmux", "mole-demo", "")
	want := "exec '/opt/homebrew/bin/tmux' attach -t 'mole-demo'"
	if got != want {
		t.Fatalf("buildTmuxAttachShellCommand() = %q, want %q", got, want)
	}
}
