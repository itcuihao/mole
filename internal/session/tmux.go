package session

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"mole/internal/config"
)

const tmuxTimeout = 5 * time.Second

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
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

	for key, value := range env {
		cmd := exec.CommandContext(ctx, "tmux", "setenv", "-t", name, key, value)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("tmux setenv failed for %q: %s: %w", key, strings.TrimSpace(string(output)), err)
		}
	}

	return nil
}

// TmuxSessionInfo holds live status from tmux.
type TmuxSessionInfo struct {
	Name     string
	Attached int
	Windows  int
}

// TmuxAvailable checks if tmux is installed.
func TmuxAvailable() bool {
	_, err := exec.LookPath("tmux")
	return err == nil
}

// CreateTmuxSession creates a new detached tmux session with environment variables.
// If command is non-empty, runs that command; otherwise starts an interactive shell.
func CreateTmuxSession(name string, env map[string]string, command string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	// Create a temporary env script file
	envScriptPath := filepath.Join(config.Dir(), fmt.Sprintf(".mole-env-%s.sh", name))
	var envCmds strings.Builder
	envCmds.WriteString("# Mole environment variables\n")
	for k, v := range env {
		envCmds.WriteString(fmt.Sprintf("export %s=%s\n", k, shellQuote(v)))
	}

	// Add startup command to env script (only runs once per session)
	if command != "" {
		envCmds.WriteString("\n# Auto-run startup command (once per session)\n")
		envCmds.WriteString("# Check tmux session-level environment variable\n")
		envCmds.WriteString("if [ -n \"$TMUX\" ]; then\n")
		envCmds.WriteString("  _session=$(tmux display-message -p '#S')\n")
		envCmds.WriteString("  _ran=$(tmux showenv -t \"$_session\" MOLE_CMD_RAN 2>/dev/null | cut -d= -f2)\n")
		envCmds.WriteString("  if [ -z \"$_ran\" ]; then\n")
		envCmds.WriteString("    tmux setenv -t \"$_session\" MOLE_CMD_RAN 1\n")
		envCmds.WriteString(fmt.Sprintf("    echo '🚀 Running startup command: %s'\n", strings.ReplaceAll(command, "'", "'\\''")))
		envCmds.WriteString(fmt.Sprintf("    %s\n", command))
		envCmds.WriteString("  fi\n")
		envCmds.WriteString("fi\n")
	}

	if err := os.WriteFile(envScriptPath, []byte(envCmds.String()), 0600); err != nil {
		return fmt.Errorf("failed to create env script: %w", err)
	}

	// Determine user's preferred shell.
	userShell := os.Getenv("SHELL")
	if userShell == "" {
		userShell = "/bin/zsh"
	}
	if strings.Contains(userShell, "/") {
		if _, err := os.Stat(userShell); err != nil {
			userShell = "/bin/zsh"
		}
	} else if resolved, err := exec.LookPath(userShell); err == nil {
		userShell = resolved
	} else {
		userShell = "/bin/zsh"
	}

	// Bootstrap the tmux pane with a POSIX-compatible shell so env loading
	// works even when the user's login shell is fish-like.
	runnerShell := "/bin/zsh"
	runnerFlag := "-lc"
	if _, err := os.Stat(runnerShell); err != nil {
		runnerShell = "/bin/sh"
		runnerFlag = "-c"
	}

	shellCmd := fmt.Sprintf(". %s && exec %s", shellQuote(envScriptPath), shellQuote(userShell))
	startDir := defaultSessionWorkingDir()

	// Use a stable default working directory instead of inheriting Mole's process
	// cwd, which is often the repo root in development.
	args := []string{"new-session", "-d", "-c", startDir, "-s", name, runnerShell, runnerFlag, shellCmd}

	cmd := exec.CommandContext(ctx, "tmux", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		os.Remove(envScriptPath) // cleanup on failure
		return fmt.Errorf("tmux new-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	// Set environment variables at tmux session level for new windows/panes.
	if err := SyncTmuxSessionEnv(name, env); err != nil {
		fmt.Printf("⚠️ failed to sync tmux session env for %s: %v\n", name, err)
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

	cmd := exec.CommandContext(ctx, "tmux", "list-sessions", "-F", "#{session_name}:#{session_attached}:#{session_windows}")
	output, err := cmd.Output()
	if err != nil {
		// "no server running" means no sessions
		if strings.Contains(string(output), "no server") || strings.Contains(err.Error(), "exit status 1") {
			return make([]TmuxSessionInfo, 0), nil
		}
		return make([]TmuxSessionInfo, 0), err
	}

	sessions := make([]TmuxSessionInfo, 0)
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
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
	return sessions, nil
}

// KillTmuxSession terminates a tmux session.
func KillTmuxSession(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "kill-session", "-t", name)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("tmux kill-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

// IsTmuxSessionAlive checks if a tmux session exists.
func IsTmuxSessionAlive(name string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), tmuxTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "has-session", "-t", name)
	return cmd.Run() == nil
}
