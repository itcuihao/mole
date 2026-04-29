package session

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const wslTmuxTimeout = 10 * time.Second

var (
	ErrWslUnavailable     = errors.New("wsl is not installed or not available in PATH")
	ErrWslTmuxUnavailable = errors.New("tmux is not installed inside WSL")
)

func WslAvailable() bool {
	_, err := exec.LookPath("wsl.exe")
	return err == nil
}

func EnsureWslTmuxAvailable() error {
	if !WslAvailable() {
		return ErrWslUnavailable
	}
	if !WslTmuxAvailable() {
		return ErrWslTmuxUnavailable
	}
	return nil
}

func WslTmuxAvailable() bool {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "wsl.exe", "sh", "-lc", "command -v tmux >/dev/null 2>&1")
	return cmd.Run() == nil
}

func SyncWslTmuxSessionEnv(name string, env map[string]string) error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	for key, value := range env {
		script := fmt.Sprintf("tmux setenv -t %s %s %s", shellQuote(name), shellQuote(key), shellQuote(value))
		if output, err := runWslShellCommandContext(ctx, script); err != nil {
			return fmt.Errorf("wsl tmux setenv failed for %q: %s: %w", key, strings.TrimSpace(string(output)), err)
		}
	}

	return nil
}

func EnableWslTmuxMouse(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	script := fmt.Sprintf("tmux set-option -t %s mouse on", shellQuote(name))
	if output, err := runWslShellCommandContext(ctx, script); err != nil {
		return fmt.Errorf("wsl tmux set-option mouse failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return nil
}

func buildWslTmuxMouseEnableShellCommand(session string) string {
	return fmt.Sprintf("tmux set-option -t %s mouse on >/dev/null 2>&1", shellQuote(session))
}

func detectWslUserShell() string {
	output, err := runWslShellCommand(`printf '%s' "${SHELL:-/bin/bash}"`)
	if err != nil {
		return "/bin/bash"
	}

	userShell := strings.TrimSpace(string(output))
	if userShell == "" {
		return "/bin/bash"
	}
	return userShell
}

func CreateWslTmuxSession(name string, env map[string]string, command string) error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	envScript := buildTmuxEnvScriptContent(env, command, "tmux")
	userShell := detectWslUserShell()
	runnerShell := "/bin/sh"
	runnerFlag := "-lc"
	shellCmd := fmt.Sprintf(". \"$tmp_script\" && exec %s", shellQuote(userShell))

	outerScript := fmt.Sprintf(
		"tmp_script=$(mktemp \"${TMPDIR:-/tmp}/mole-env-%s.XXXXXX.sh\") || exit 1\ncat > \"$tmp_script\" <<'MOLE_EOF'\n%s\nMOLE_EOF\nchmod 600 \"$tmp_script\"\ntmux new-session -d -s %s %s %s %s",
		name,
		envScript,
		shellQuote(name),
		shellQuote(runnerShell),
		shellQuote(runnerFlag),
		shellQuote(shellCmd),
	)

	output, err := runWslShellCommandContext(ctx, outerScript)
	if err != nil {
		return fmt.Errorf("wsl tmux new-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	if err := SyncWslTmuxSessionEnv(name, env); err != nil {
		fmt.Printf("⚠️ failed to sync WSL tmux session env for %s: %v\n", name, err)
	}
	if err := EnableWslTmuxMouse(name); err != nil {
		fmt.Printf("⚠️ failed to enable WSL tmux mouse for %s: %v\n", name, err)
	}

	if command != "" {
		fmt.Printf("✅ Startup command will auto-run on first WSL shell: %s\n", command)
	}

	return nil
}

func ListWslTmuxSessions() ([]TmuxSessionInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	output, err := runWslShellCommandContext(ctx, "tmux list-sessions -F '#{session_name}:#{session_attached}:#{session_windows}'")
	if err != nil {
		if isNoTmuxServerOutput(string(output), err) {
			return make([]TmuxSessionInfo, 0), nil
		}
		return make([]TmuxSessionInfo, 0), err
	}

	return parseTmuxSessionList(string(output)), nil
}

func KillWslTmuxSession(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	output, err := runWslShellCommandContext(ctx, fmt.Sprintf("tmux kill-session -t %s", shellQuote(name)))
	if err != nil {
		return fmt.Errorf("wsl tmux kill-session failed: %s: %w", strings.TrimSpace(string(output)), err)
	}
	return nil
}

func IsWslTmuxSessionAlive(name string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	output, err := runWslShellCommandContext(ctx, fmt.Sprintf("tmux has-session -t %s", shellQuote(name)))
	return err == nil && len(output) == 0
}

func runWslShellCommand(script string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()
	return runWslShellCommandContext(ctx, script)
}

func runWslShellCommandContext(ctx context.Context, script string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "wsl.exe", "sh", "-lc", script)
	return cmd.CombinedOutput()
}
