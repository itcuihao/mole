package session

import (
	"context"
	"errors"
	"fmt"
	"os"
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
		return fmt.Errorf("%w. Install WSL first: `wsl --install`", ErrWslUnavailable)
	}

	if err := ensureWslDistroReady(); err != nil {
		return err
	}

	if !WslTmuxAvailable() {
		verifyCmd := "wsl.exe sh -lc \"command -v tmux && tmux -V\""
		if distro := configuredWslDistro(); distro != "" {
			verifyCmd = fmt.Sprintf("wsl.exe -d %s sh -lc \"command -v tmux && tmux -V\"", distro)
		}
		return fmt.Errorf(
			"%w%s. Open WSL and install tmux, for example: `sudo apt update && sudo apt install -y tmux`. Verify with `%s`",
			ErrWslTmuxUnavailable,
			wslDistroHint(),
			verifyCmd,
		)
	}

	return nil
}

func WslTmuxAvailable() bool {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	cmd := wslCommandContext(ctx, "sh", "-lc", "command -v tmux >/dev/null 2>&1")
	return cmd.Run() == nil
}

func ensureWslDistroReady() error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	cmd := wslCommandContext(ctx, "sh", "-lc", "echo ready")
	output, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}

	trimmed := strings.TrimSpace(string(output))
	lower := strings.ToLower(trimmed)
	if strings.Contains(lower, "wsl has no installed distributions") ||
		strings.Contains(lower, "there is no distribution with the supplied name") ||
		strings.Contains(lower, "windows subsystem for linux has no installed distributions") {
		return fmt.Errorf("wsl is installed but no distro is initialized. Run `wsl --install -d Ubuntu` and open it once to finish setup")
	}

	if trimmed != "" {
		return fmt.Errorf("wsl is not ready: %s", trimmed)
	}
	return fmt.Errorf("wsl is not ready: %w", err)
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
	return enableWslTmuxSession(name, tmuxMouseEnabled())
}

func enableWslTmuxSession(name string, mouseOn bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	mouseVal := "off"
	if mouseOn {
		mouseVal = "on"
	}

	commands := []string{
		fmt.Sprintf("tmux set-option -t %s mouse %s", shellQuote(name), mouseVal),
		fmt.Sprintf("tmux set-option -t %s escape-time 10", shellQuote(name)),
		fmt.Sprintf("tmux set-option -t %s history-limit 50000", shellQuote(name)),
		fmt.Sprintf("tmux set-option -t %s set-titles on", shellQuote(name)),
		fmt.Sprintf("tmux set-option -t %s set-titles-string %s", shellQuote(name), shellQuote("Mole: "+name)),
		fmt.Sprintf("tmux set-option -t %s set-clipboard on", shellQuote(name)),
	}
	if mouseOn {
		commands = append(commands,
			"tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'clip.exe'",
			"tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'clip.exe'",
		)
	}

	for _, script := range commands {
		if output, err := runWslShellCommandContext(ctx, script); err != nil {
			return fmt.Errorf("wsl %s failed: %s: %w", script, strings.TrimSpace(string(output)), err)
		}
	}

	return nil
}

func buildWslTmuxMouseEnableShellCommand(session string) string {
	return buildWslTmuxConfigureShellCommand(session, tmuxMouseEnabled())
}

func buildWslTmuxConfigureShellCommand(session string, mouseOn bool) string {
	mouseVal := "off"
	if mouseOn {
		mouseVal = "on"
	}
	commands := []string{
		fmt.Sprintf("tmux set-option -t %s mouse %s >/dev/null 2>&1", shellQuote(session), mouseVal),
		fmt.Sprintf("tmux set-option -t %s escape-time 10 >/dev/null 2>&1", shellQuote(session)),
		fmt.Sprintf("tmux set-option -t %s history-limit 50000 >/dev/null 2>&1", shellQuote(session)),
		fmt.Sprintf("tmux set-option -t %s set-titles on >/dev/null 2>&1", shellQuote(session)),
		fmt.Sprintf("tmux set-option -t %s set-titles-string %s >/dev/null 2>&1", shellQuote(session), shellQuote("Mole: "+session)),
		fmt.Sprintf("tmux set-option -t %s set-clipboard on >/dev/null 2>&1", shellQuote(session)),
	}
	if mouseOn {
		commands = append(commands,
			"tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'clip.exe' >/dev/null 2>&1",
			"tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'clip.exe' >/dev/null 2>&1",
		)
	}
	return strings.Join(commands, "; ")
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

func CreateWslTmuxSession(name string, env map[string]string, command string, cwd string, runCommand bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	envScript := buildTmuxEnvScriptContent(env, command, "tmux")
	userShell := detectWslUserShell()
	runnerShell := "/bin/sh"
	runnerFlag := "-lc"
	shellCmd := fmt.Sprintf(". \"$tmp_script\" && exec %s", shellQuote(userShell))

	cwdArg := ""
	if trimmed := strings.TrimSpace(cwd); trimmed != "" {
		cwdArg = " -c " + shellQuote(trimmed)
	}

	outerScript := fmt.Sprintf(
		"tmp_script=$(mktemp \"${TMPDIR:-/tmp}/mole-env-%s.XXXXXX.sh\") || exit 1\ncat > \"$tmp_script\" <<'MOLE_EOF'\n%s\nMOLE_EOF\nchmod 600 \"$tmp_script\"\ntmux new-session -d%s -s %s %s %s %s",
		name,
		envScript,
		cwdArg,
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
		if runCommand {
			fmt.Printf("✅ Startup command will auto-run on first WSL shell: %s\n", command)
		} else {
			// Don't pre-set MOLE_CMD_RAN — the env script's own guard will
			// run the command once on first attach, then set MOLE_CMD_RAN itself.
			fmt.Printf("⏸️  Startup command deferred until first attach: %s\n", command)
		}
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

func DetachWslTmuxSessionClients(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), wslTmuxTimeout)
	defer cancel()

	output, err := runWslShellCommandContext(ctx, fmt.Sprintf("tmux detach-client -s %s", shellQuote(name)))
	if err != nil {
		trimmed := strings.TrimSpace(string(output))
		if isNoTmuxServerOutput(string(output), err) || strings.Contains(trimmed, "no current client") {
			return nil
		}
		return fmt.Errorf("wsl tmux detach-client failed: %s: %w", trimmed, err)
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
	// Feed script over stdin instead of argv to avoid Windows CreateProcess
	// argument-length/encoding edge cases for large env payloads.
	cmd := wslCommandContext(ctx, "sh", "-s")
	cmd.Stdin = strings.NewReader(script)
	return cmd.CombinedOutput()
}

func configuredWslDistro() string {
	return strings.TrimSpace(os.Getenv("MOLE_WSL_DISTRO"))
}

func wslDistroHint() string {
	if distro := configuredWslDistro(); distro != "" {
		return fmt.Sprintf(" (target distro: %s)", distro)
	}
	return ""
}

func wslCommandContext(ctx context.Context, args ...string) *exec.Cmd {
	cmdArgs := make([]string, 0, len(args)+2)
	if distro := configuredWslDistro(); distro != "" {
		cmdArgs = append(cmdArgs, "-d", distro)
	}
	cmdArgs = append(cmdArgs, args...)
	return exec.CommandContext(ctx, "wsl.exe", cmdArgs...)
}
