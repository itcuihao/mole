package session

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"mole/internal/config"
)

const tmuxTimeout = 5 * time.Second

var ErrTmuxUnavailable = errors.New("tmux is not installed or not available in PATH")
var tmuxExecutableCandidates = []string{
	"/opt/homebrew/bin/tmux",
	"/usr/local/bin/tmux",
	"/opt/homebrew/opt/tmux/bin/tmux",
	"/usr/local/opt/tmux/bin/tmux",
	"/usr/bin/tmux",
	"/bin/tmux",
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func prependPathDir(dir string) {
	if dir == "" {
		return
	}

	current := filepath.SplitList(os.Getenv("PATH"))
	for _, entry := range current {
		if filepath.Clean(entry) == filepath.Clean(dir) {
			return
		}
	}

	pathValue := dir
	if existing := os.Getenv("PATH"); existing != "" {
		pathValue = dir + string(os.PathListSeparator) + existing
	}

	_ = os.Setenv("PATH", pathValue)
}

func tmuxExecutable() (string, error) {
	if resolved, err := exec.LookPath("tmux"); err == nil {
		return resolved, nil
	}

	for _, candidate := range tmuxExecutableCandidates {
		info, err := os.Stat(candidate)
		if err != nil || info.IsDir() {
			continue
		}

		prependPathDir(filepath.Dir(candidate))
		return candidate, nil
	}

	return "", ErrTmuxUnavailable
}

func defaultSessionWorkingDir() string {
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		if info, statErr := os.Stat(home); statErr == nil && info.IsDir() {
			return home
		}
	}

	if wd, err := os.Getwd(); err == nil && wd != "" {
		return wd
	}

	return "/"
}

// SyncTmuxSessionEnv refreshes tmux session-level environment variables so any
// new panes or windows created after attach inherit the latest profile values.
func SyncTmuxSessionEnv(name string, env map[string]string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	tmuxPath, err := tmuxExecutable()
	if err != nil {
		return err
	}

	for key, value := range env {
		cmd := exec.CommandContext(ctx, tmuxPath, "setenv", "-t", name, key, value)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("tmux setenv failed for %q: %s: %w", key, strings.TrimSpace(string(output)), err)
		}
	}

	return nil
}

func EnableTmuxMouse(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	tmuxPath, err := tmuxExecutable()
	if err != nil {
		return err
	}

	commands := [][]string{
		{"set-option", "-t", name, "mouse", "on"},
		{"set-option", "-s", "set-clipboard", "on"},
		{"set-option", "-t", name, "set-titles", "on"},
		{"set-option", "-t", name, "set-titles-string", "Mole: " + name},
		{"bind-key", "-T", "copy-mode-vi", "MouseDragEnd1Pane", "send-keys", "-X", "copy-pipe-and-cancel", "pbcopy"},
		{"bind-key", "-T", "copy-mode", "MouseDragEnd1Pane", "send-keys", "-X", "copy-pipe-and-cancel", "pbcopy"},
	}

	for _, args := range commands {
		cmd := exec.CommandContext(ctx, tmuxPath, args...)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("tmux %s failed: %s: %w", strings.Join(args, " "), strings.TrimSpace(string(output)), err)
		}
	}

	return nil
}

func buildTmuxMouseEnableShellCommand(tmuxPath, session string) string {
	commands := []string{
		fmt.Sprintf("%s set-option -t %s mouse on >/dev/null 2>&1", shellQuote(tmuxPath), shellQuote(session)),
		fmt.Sprintf("%s set-option -s set-clipboard on >/dev/null 2>&1", shellQuote(tmuxPath)),
		fmt.Sprintf("%s set-option -t %s set-titles on >/dev/null 2>&1", shellQuote(tmuxPath), shellQuote(session)),
		fmt.Sprintf("%s set-option -t %s set-titles-string %s >/dev/null 2>&1", shellQuote(tmuxPath), shellQuote(session), shellQuote("Mole: "+session)),
		fmt.Sprintf("%s bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel %s >/dev/null 2>&1", shellQuote(tmuxPath), shellQuote("pbcopy")),
		fmt.Sprintf("%s bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel %s >/dev/null 2>&1", shellQuote(tmuxPath), shellQuote("pbcopy")),
	}
	return strings.Join(commands, "; ")
}

func buildTmuxEnvScriptContent(env map[string]string, command, tmuxPath string) string {
	var envCmds strings.Builder
	envCmds.WriteString("# Mole environment variables\n")

	keys := make([]string, 0, len(env))
	for key := range env {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		envCmds.WriteString(fmt.Sprintf("export %s=%s\n", key, shellQuote(env[key])))
	}

	if command != "" {
		envCmds.WriteString("\n# Auto-run startup command (once per session)\n")
		envCmds.WriteString("# Check tmux session-level environment variable\n")
		envCmds.WriteString("if [ -n \"$TMUX\" ]; then\n")
		envCmds.WriteString(fmt.Sprintf("  _session=$(%s display-message -p '#S')\n", shellQuote(tmuxPath)))
		envCmds.WriteString(fmt.Sprintf("  _ran=$(%s showenv -t \"$_session\" MOLE_CMD_RAN 2>/dev/null | cut -d= -f2)\n", shellQuote(tmuxPath)))
		envCmds.WriteString("  if [ -z \"$_ran\" ]; then\n")
		envCmds.WriteString(fmt.Sprintf("    %s setenv -t \"$_session\" MOLE_CMD_RAN 1\n", shellQuote(tmuxPath)))
		envCmds.WriteString(fmt.Sprintf("    echo '🚀 Running startup command: %s'\n", strings.ReplaceAll(command, "'", "'\\''")))
		envCmds.WriteString(fmt.Sprintf("    %s || true\n", command))
		envCmds.WriteString("  fi\n")
		envCmds.WriteString("fi\n")
	}

	return envCmds.String()
}

// TmuxSessionInfo holds live status from tmux.
type TmuxSessionInfo struct {
	Name     string
	Attached int
	Windows  int
}

// TmuxAvailable checks if tmux is installed.
func TmuxAvailable() bool {
	_, err := tmuxExecutable()
	return err == nil
}

// CreateTmuxSession creates a new detached tmux session with environment variables.
// If command is non-empty, runs that command; otherwise starts an interactive shell.
func CreateTmuxSession(name string, env map[string]string, command string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	tmuxPath, err := tmuxExecutable()
	if err != nil {
		return err
	}

	// Create a temporary env script file
	envScriptPath := filepath.Join(config.Dir(), fmt.Sprintf(".mole-env-%s.sh", name))
	if err := os.WriteFile(envScriptPath, []byte(buildTmuxEnvScriptContent(env, command, tmuxPath)), 0600); err != nil {
		return fmt.Errorf("failed to create env script: %w", err)
	}

	// Determine user's preferred shell.
	userShell := os.Getenv("SHELL")
	if userShell == "" {
		userShell = "/bin/bash"
	}
	if strings.Contains(userShell, "/") {
		if _, err := os.Stat(userShell); err != nil {
			userShell = "/bin/bash"
		}
	} else if resolved, err := exec.LookPath(userShell); err == nil {
		userShell = resolved
	} else {
		userShell = "/bin/bash"
	}

	// Bootstrap the tmux pane with a POSIX-compatible shell so env loading
	// works even when the user's login shell is fish-like.
	runnerShell := "/bin/bash"
	runnerFlag := "-lc"
	if _, err := os.Stat(runnerShell); err != nil {
		runnerShell = "/bin/sh"
		runnerFlag = "-c"
	}

	shellCmd := fmt.Sprintf(". %s; exec %s", shellQuote(envScriptPath), shellQuote(userShell))
	startDir := defaultSessionWorkingDir()

	// Use a stable default working directory instead of inheriting Mole's process
	// cwd, which is often the repo root in development.
	args := []string{"new-session", "-d", "-c", startDir, "-s", name, runnerShell, runnerFlag, shellCmd}

	cmd := exec.CommandContext(ctx, tmuxPath, args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		os.Remove(envScriptPath) // cleanup on failure
		return fmt.Errorf("tmux new-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	// Set environment variables at tmux session level for new windows/panes.
	if err := SyncTmuxSessionEnv(name, env); err != nil {
		fmt.Printf("⚠️ failed to sync tmux session env for %s: %v\n", name, err)
	}
	if err := EnableTmuxMouse(name); err != nil {
		fmt.Printf("⚠️ failed to enable tmux mouse for %s: %v\n", name, err)
	}

	if command != "" {
		fmt.Printf("✅ Startup command will auto-run on first shell: %s\n", command)
	}

	return nil
}

// ListTmuxSessions returns info about all running tmux sessions.
func ListTmuxSessions() ([]TmuxSessionInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	tmuxPath, err := tmuxExecutable()
	if err != nil {
		return make([]TmuxSessionInfo, 0), err
	}

	cmd := exec.CommandContext(ctx, tmuxPath, "list-sessions", "-F", "#{session_name}:#{session_attached}:#{session_windows}")
	output, err := cmd.Output()
	if err != nil {
		if isNoTmuxServerOutput(string(output), err) {
			return make([]TmuxSessionInfo, 0), nil
		}
		return make([]TmuxSessionInfo, 0), err
	}

	return parseTmuxSessionList(string(output)), nil
}

func parseTmuxSessionList(output string) []TmuxSessionInfo {
	sessions := make([]TmuxSessionInfo, 0)
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 3)
		if len(parts) != 3 {
			continue
		}
		attached, _ := strconv.Atoi(parts[1])
		windows, _ := strconv.Atoi(parts[2])
		sessions = append(sessions, TmuxSessionInfo{
			Name:     parts[0],
			Attached: attached,
			Windows:  windows,
		})
	}
	return sessions
}

func isNoTmuxServerOutput(output string, err error) bool {
	return strings.Contains(output, "no server") || strings.Contains(err.Error(), "exit status 1")
}

// KillTmuxSession terminates a tmux session.
func KillTmuxSession(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	tmuxPath, err := tmuxExecutable()
	if err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, tmuxPath, "kill-session", "-t", name)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("tmux kill-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

// DetachTmuxSessionClients detaches all attached clients from a tmux session
// while keeping the session alive.
func DetachTmuxSessionClients(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	tmuxPath, err := tmuxExecutable()
	if err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, tmuxPath, "detach-client", "-s", name)
	if output, err := cmd.CombinedOutput(); err != nil {
		if isNoTmuxServerOutput(string(output), err) || strings.Contains(string(output), "no current client") {
			return nil
		}
		return fmt.Errorf("tmux detach-client failed: %s: %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

// IsTmuxSessionAlive checks if a tmux session exists.
func IsTmuxSessionAlive(name string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	tmuxPath, err := tmuxExecutable()
	if err != nil {
		return false
	}

	cmd := exec.CommandContext(ctx, tmuxPath, "has-session", "-t", name)
	return cmd.Run() == nil
}
