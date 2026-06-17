package session

import (
	"errors"
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
	wants := []string{
		"'/opt/homebrew/bin/tmux' set-option -t 'mole-demo' mouse on >/dev/null 2>&1",
		"'/opt/homebrew/bin/tmux' set-option -t 'mole-demo' escape-time 10 >/dev/null 2>&1",
		"'/opt/homebrew/bin/tmux' set-option -t 'mole-demo' history-limit 50000 >/dev/null 2>&1",
		"'/opt/homebrew/bin/tmux' set-option -t 'mole-demo' set-titles on >/dev/null 2>&1",
		"'/opt/homebrew/bin/tmux' set-option -t 'mole-demo' set-titles-string 'Mole: mole-demo' >/dev/null 2>&1",
		// set-clipboard must be scoped to this session (-t), not global (-s),
		// so we don't pollute other tmux sessions the user may run.
		"'/opt/homebrew/bin/tmux' set-option -t 'mole-demo' set-clipboard on >/dev/null 2>&1",
		"'/opt/homebrew/bin/tmux' bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'pbcopy' >/dev/null 2>&1",
		"'/opt/homebrew/bin/tmux' bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'pbcopy' >/dev/null 2>&1",
		"exec '/opt/homebrew/bin/tmux' attach -d -t 'mole-demo'",
	}
	for _, want := range wants {
		if !strings.Contains(got, want) {
			t.Fatalf("buildTmuxAttachShellCommand() missing %q: %q", want, got)
		}
	}
}

func TestBuildWslTmuxAttachShellCommandEnablesMouseBeforeAttach(t *testing.T) {
	got := buildWslTmuxAttachShellCommand("mole-demo", map[string]string{"FOO": "bar"})

	if !strings.Contains(got, "export FOO='bar'") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing env export: %q", got)
	}
	if !strings.Contains(got, "tmux set-option -t 'mole-demo' mouse on >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing mouse enable command: %q", got)
	}
	if !strings.Contains(got, "tmux set-option -t 'mole-demo' escape-time 10 >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing escape-time command: %q", got)
	}
	if !strings.Contains(got, "tmux set-option -t 'mole-demo' history-limit 50000 >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing history-limit command: %q", got)
	}
	if !strings.Contains(got, "tmux set-option -t 'mole-demo' set-clipboard on >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing session-scoped set-clipboard command: %q", got)
	}
	if !strings.Contains(got, "tmux set-option -t 'mole-demo' set-titles on >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing set-titles command: %q", got)
	}
	if !strings.Contains(got, "tmux set-option -t 'mole-demo' set-titles-string 'Mole: mole-demo' >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing set-titles-string command: %q", got)
	}
	if !strings.Contains(got, "tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'clip.exe' >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing vi mouse-copy binding: %q", got)
	}
	if !strings.Contains(got, "tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'clip.exe' >/dev/null 2>&1") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing emacs mouse-copy binding: %q", got)
	}
	if !strings.Contains(got, "exec tmux attach -d -t 'mole-demo'") {
		t.Fatalf("buildWslTmuxAttachShellCommand() missing attach command: %q", got)
	}
}

// When mouse is disabled, the configure command must NOT bind copy-mode keys
// (they only make sense with mouse on) and must write `mouse off`.
func TestBuildTmuxConfigureShellCommandMouseOff(t *testing.T) {
	got := buildTmuxConfigureShellCommand("/opt/homebrew/bin/tmux", "mole-demo", false)

	if !strings.Contains(got, "set-option -t 'mole-demo' mouse off >/dev/null 2>&1") {
		t.Fatalf("expected mouse off in configure script, got: %q", got)
	}
	if strings.Contains(got, "bind-key -T copy-mode") {
		t.Fatalf("mouse off must not install copy-mode bindings, got: %q", got)
	}
	// set-clipboard is independent of mouse — it should still be there.
	if !strings.Contains(got, "set-option -t 'mole-demo' set-clipboard on") {
		t.Fatalf("set-clipboard should remain on regardless of mouse state, got: %q", got)
	}
}

func TestIsNoTmuxServerOutput(t *testing.T) {
	cases := []struct {
		name   string
		output string
		err    error
		want   bool
	}{
		// True positives — these are the messages tmux actually emits when
		// it cannot reach a server.
		{
			name:   "no server running on socket",
			output: "no server running on /tmp/tmux-1000/default\n",
			err:    errors.New("exit status 1"),
			want:   true,
		},
		{
			name:   "failed to connect to server",
			output: "failed to connect to server\n",
			err:    errors.New("exit status 1"),
			want:   true,
		},
		{
			name:   "server exited unexpectedly",
			output: "server exited unexpectedly\n",
			err:    errors.New("exit status 1"),
			want:   true,
		},
		{
			name:   "missing socket file",
			output: "connect /tmp/tmux-1000/default (No such file or directory)\n",
			err:    errors.New("exit status 1"),
			want:   true,
		},

		// True negatives — genuine errors that must NOT be silently swallowed
		// as "no server". Each of these previously matched the old
		// `exit status 1` substring and broke List/Detach semantics.
		{
			name:   "session does not exist",
			output: "can't find session: foo\n",
			err:    errors.New("exit status 1"),
			want:   false,
		},
		{
			name:   "duplicate session",
			output: "duplicate session: foo\n",
			err:    errors.New("exit status 1"),
			want:   false,
		},
		{
			name:   "unknown option",
			output: "unknown option: -x\n",
			err:    errors.New("exit status 1"),
			want:   false,
		},
		{
			name:   "empty output, exit status 1",
			output: "",
			err:    errors.New("exit status 1"),
			want:   false,
		},

		// No error means there is nothing to interpret.
		{
			name:   "nil error",
			output: "",
			err:    nil,
			want:   false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isNoTmuxServerOutput(tc.output, tc.err)
			if got != tc.want {
				t.Fatalf("isNoTmuxServerOutput(%q, %v) = %v, want %v",
					tc.output, tc.err, got, tc.want)
			}
		})
	}
}
