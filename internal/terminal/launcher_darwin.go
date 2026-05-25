//go:build darwin

package terminal

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	iTermGroupWindowMu    sync.Mutex
	iTermGroupWindowByDen = make(map[string]int)

	iTermTabWindowMu   sync.Mutex
	iTermTabByBurrowID = make(map[string]string)
)

func getITermGroupWindowID(group string) int {
	iTermGroupWindowMu.Lock()
	defer iTermGroupWindowMu.Unlock()
	return iTermGroupWindowByDen[group]
}

func setITermGroupWindowID(group string, windowID int) {
	if group == "" || windowID <= 0 {
		return
	}
	iTermGroupWindowMu.Lock()
	iTermGroupWindowByDen[group] = windowID
	iTermGroupWindowMu.Unlock()
}

func clearITermGroupWindowID(group string) {
	iTermGroupWindowMu.Lock()
	delete(iTermGroupWindowByDen, group)
	iTermGroupWindowMu.Unlock()
}

func launchOnPlatform(terminal TerminalApp, spec LaunchSpec) error {
	switch terminal.ID {
	case TerminalApple:
		return launchTerminalApp(spec.CommandText)
	case TerminalITerm2:
		return launchITerm2(spec)
	case TerminalGhostty:
		return launchGhostty(terminal, spec)
	case TerminalRio:
		return launchRio(spec)
	case TerminalWarp:
		return launchWarp(spec)
	case TerminalAlacritty:
		return launchWithScript("Alacritty", spec)
	case TerminalKitty:
		return launchWithScript("kitty", spec)
	default:
		return launchGeneric(terminal.AppPath, spec.CommandText)
	}
}

func closeGroupedWindowOnPlatform(terminal TerminalApp, group string) error {
	switch terminal.ID {
	case TerminalITerm2:
		return closeITerm2GroupedWindow(group)
	default:
		return ErrCloseGroupedWindowUnsupported
	}
}

func focusGroupedWindowOnPlatform(terminal TerminalApp, group string) (bool, error) {
	switch terminal.ID {
	case TerminalITerm2:
		return focusITerm2GroupedWindow(group)
	default:
		return false, ErrFocusGroupedWindowUnsupported
	}
}

func focusBurrowOnPlatform(terminal TerminalApp, burrowID string) (bool, error) {
	switch terminal.ID {
	case TerminalITerm2:
		return focusITerm2Tab(burrowID)
	default:
		return false, ErrFocusGroupedWindowUnsupported
	}
}

func runOsaScriptWithArg(scriptLines []string, arg string) ([]byte, error) {
	args := make([]string, 0, len(scriptLines)*2+1)
	for _, line := range scriptLines {
		args = append(args, "-e", line)
	}
	args = append(args, arg)

	cmd := exec.Command("osascript", args...)
	return cmd.CombinedOutput()
}

func runOsaScript(scriptLines []string) ([]byte, error) {
	args := make([]string, 0, len(scriptLines)*2)
	for _, line := range scriptLines {
		args = append(args, "-e", line)
	}

	cmd := exec.Command("osascript", args...)
	return cmd.CombinedOutput()
}

func escapeAppleScript(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

// writeTempLaunchScript writes commandText to a temp .sh file in the mole config dir
// and returns its path. The file is created with executable permission.
func writeTempLaunchScript(commandText string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home dir: %w", err)
	}
	dir := filepath.Join(home, ".config", "mole")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("cannot create config dir: %w", err)
	}

	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("cannot generate random name: %w", err)
	}
	name := fmt.Sprintf(".mole-launch-%s.sh", hex.EncodeToString(b))
	path := filepath.Join(dir, name)

	content := "#!/bin/sh\n" + commandText + "\n"
	if err := os.WriteFile(path, []byte(content), 0o700); err != nil {
		return "", fmt.Errorf("cannot write launch script: %w", err)
	}
	return path, nil
}

// cleanupOldLaunchScripts removes .mole-launch-*.sh files older than 1 hour.
func cleanupOldLaunchScripts() {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	dir := filepath.Join(home, ".config", "mole")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-1 * time.Hour)
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), ".mole-launch-") || !strings.HasSuffix(e.Name(), ".sh") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			os.Remove(filepath.Join(dir, e.Name()))
		}
	}
}

// launchWithScript writes a temp script and opens the app with -e /bin/bash <script>.
func launchWithScript(appName string, spec LaunchSpec) error {
	cleanupOldLaunchScripts()

	scriptPath, err := writeTempLaunchScript(spec.CommandText)
	if err != nil {
		return fmt.Errorf("%s: failed to write launch script: %w", appName, err)
	}

	cmd := exec.Command("open", "-n", "-a", appName, "--args", "-e", "/bin/bash", scriptPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s failed: %s: %w", appName, string(output), err)
	}
	return nil
}

func launchTerminalApp(commandText string) error {
	log.Printf("🚀 Launching Terminal.app with command: %s", commandText)
	output, err := runOsaScriptWithArg([]string{
		`on run argv`,
		`set commandText to item 1 of argv`,
		`tell application "Terminal"`,
		`activate`,
		`do script commandText`,
		`end tell`,
		`end run`,
	}, commandText)
	if err != nil {
		log.Printf("❌ Terminal.app error: %v | Output: %s", err, string(output))
		return fmt.Errorf("Terminal.app failed: %s: %w", string(output), err)
	}
	return nil
}

func launchITerm2(spec LaunchSpec) error {
	group := strings.TrimSpace(spec.Den)
	log.Printf("🚀 Launching iTerm2 (group=%q) with command: %s", group, spec.CommandText)

	if group == "" {
		// No den — create new window (existing behavior)
		output, err := runOsaScriptWithArg([]string{
			`on run argv`,
			`set commandText to item 1 of argv`,
			`tell application "iTerm"`,
			`activate`,
			`create window with default profile`,
			`tell current session of current window`,
			`write text commandText`,
			`end tell`,
			`end tell`,
			`end run`,
		}, spec.CommandText)
		if err != nil {
			log.Printf("❌ iTerm2 error: %v | Output: %s", err, string(output))
			return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
		}
		return nil
	}

	// Den set — find or create window, then create tab
	windowName := "Mole: " + group
	hintedWindowID := getITermGroupWindowID(group)
	script := fmt.Sprintf(`
		set windowName to "%s"
		set commandText to "%s"
		set hintedWindowID to %d
		set targetWindow to missing value
		set createdWindow to false
		tell application "iTerm"
			activate
			if hintedWindowID > 0 then
				try
					repeat with w in windows
						if id of w is hintedWindowID then
							try
								if name of w is windowName then
									set targetWindow to w
									exit repeat
								end if
							end try
						end if
					end repeat
				end try
			end if
			if targetWindow is missing value then
				repeat with w in windows
					try
						if name of w is windowName then
							set targetWindow to w
							exit repeat
						end if
					end try
				end repeat
			end if
			if targetWindow is missing value then
				set targetWindow to (create window with default profile)
				set createdWindow to true
				-- Some iTerm2 versions/configs reject writing window name (-10006).
				-- Title customization is best-effort and must not block attaching.
				try
					set name of targetWindow to windowName
				end try
			end if
			tell targetWindow
				if createdWindow then
					set targetSession to current session of current tab
				else
					set newTab to (create tab with default profile)
					set targetSession to current session of newTab
				end if
				tell targetSession
					write text commandText
				end tell
			end tell
			return (id of targetWindow as string) & ":" & (id of targetSession as string)
		end tell
	`, escapeAppleScript(windowName), escapeAppleScript(spec.CommandText), hintedWindowID)

	output, err := runOsaScript([]string{script})
	if err != nil {
		log.Printf("❌ iTerm2 error: %v | Output: %s", err, string(output))
		return fmt.Errorf("iTerm2 failed: %s: %w", string(output), err)
	}
	outStr := strings.TrimSpace(string(output))
	parts := strings.SplitN(outStr, ":", 2)
	if len(parts) > 0 {
		if windowID, parseErr := strconv.Atoi(parts[0]); parseErr == nil {
			setITermGroupWindowID(group, windowID)
		} else {
			log.Printf("⚠️ iTerm2 group window id parse failed (group=%q, output=%q): %v", group, outStr, parseErr)
		}
	}
	if len(parts) == 2 && spec.BurrowID != "" {
		iTermTabWindowMu.Lock()
		iTermTabByBurrowID[spec.BurrowID] = parts[1]
		iTermTabWindowMu.Unlock()
	}
	return nil
}

func closeITerm2GroupedWindow(group string) error {
	windowName := "Mole: " + group
	hintedWindowID := getITermGroupWindowID(group)
	script := fmt.Sprintf(`
		set windowName to "%s"
		set hintedWindowID to %d
		set targetWindow to missing value
		tell application "iTerm"
			if hintedWindowID > 0 then
				try
					repeat with w in windows
						if id of w is hintedWindowID then
							try
								if name of w is windowName then
									set targetWindow to w
									exit repeat
								end if
							end try
						end if
					end repeat
				end try
			end if
			if targetWindow is missing value then
				repeat with w in windows
					try
						if name of w is windowName then
							set targetWindow to w
							exit repeat
						end if
					end try
				end repeat
			end if
			if targetWindow is missing value then
				return "notfound"
			end if
			close targetWindow
			return "closed"
		end tell
	`, escapeAppleScript(windowName), hintedWindowID)

	output, err := runOsaScript([]string{script})
	if err != nil {
		return fmt.Errorf("iTerm2 close window failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	status := strings.TrimSpace(string(output))
	switch status {
	case "closed", "notfound":
		clearITermGroupWindowID(group)
		return nil
	default:
		clearITermGroupWindowID(group)
		return nil
	}
}

func focusITerm2GroupedWindow(group string) (bool, error) {
	windowName := "Mole: " + group
	hintedWindowID := getITermGroupWindowID(group)
	script := fmt.Sprintf(`
		set windowName to "%s"
		set hintedWindowID to %d
		set targetWindow to missing value
		tell application "iTerm"
			activate
			if hintedWindowID > 0 then
				try
					repeat with w in windows
						if id of w is hintedWindowID then
							try
								if name of w is windowName then
									set targetWindow to w
									exit repeat
								end if
							end try
						end if
					end repeat
				end try
			end if
			if targetWindow is missing value then
				repeat with w in windows
					try
						if name of w is windowName then
							set targetWindow to w
							exit repeat
						end if
					end try
				end repeat
			end if
			if targetWindow is missing value then
				return "notfound"
			end if
			select targetWindow
			return id of targetWindow
		end tell
	`, escapeAppleScript(windowName), hintedWindowID)

	output, err := runOsaScript([]string{script})
	if err != nil {
		return false, fmt.Errorf("iTerm2 focus window failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	result := strings.TrimSpace(string(output))
	if result == "notfound" || result == "" {
		clearITermGroupWindowID(group)
		return false, nil
	}

	windowID, parseErr := strconv.Atoi(result)
	if parseErr != nil {
		log.Printf("⚠️ iTerm2 focus result parse failed (group=%q, output=%q): %v", group, result, parseErr)
		return true, nil
	}

	setITermGroupWindowID(group, windowID)
	return true, nil
}

func focusITerm2Tab(burrowID string) (bool, error) {
	iTermTabWindowMu.Lock()
	sessionID := iTermTabByBurrowID[burrowID]
	iTermTabWindowMu.Unlock()

	if sessionID == "" {
		return false, nil
	}

	script := fmt.Sprintf(`
		set targetSessionID to "%s"
		set foundSession to false
		tell application "iTerm"
			activate
			repeat with w in windows
				repeat with t in tabs of w
					repeat with s in sessions of t
						if id of s is targetSessionID then
							select w
							select t
							select s
							set foundSession to true
							exit repeat
						end if
					end repeat
					if foundSession then exit repeat
				end repeat
				if foundSession then exit repeat
			end repeat
			if foundSession then
				return "focused"
			else
				return "notfound"
			end if
		end tell
	`, escapeAppleScript(sessionID))

	output, err := runOsaScript([]string{script})
	if err != nil {
		return false, fmt.Errorf("iTerm2 focus tab failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	if strings.TrimSpace(string(output)) == "notfound" {
		iTermTabWindowMu.Lock()
		delete(iTermTabByBurrowID, burrowID)
		iTermTabWindowMu.Unlock()
		return false, nil
	}

	return true, nil
}

func launchGhostty(terminal TerminalApp, spec LaunchSpec) error {
	group := strings.TrimSpace(spec.Den)
	log.Printf("🚀 Launching Ghostty (group=%q) with command: %s", group, spec.CommandText)

	// Launch Ghostty binary directly instead of going through `open --args`,
	// which splits long shell commands into separate tokens (causing extra tabs).
	ghosttyBin := filepath.Join(terminal.AppPath, "Contents", "MacOS", "ghostty")
	if _, err := os.Stat(ghosttyBin); err != nil {
		// Fallback: try PATH lookup for non-standard installs (e.g. Homebrew).
		if found, lookErr := exec.LookPath("ghostty"); lookErr == nil {
			ghosttyBin = found
		} else {
			return fmt.Errorf("Ghostty binary not found at %s and not in PATH: %w", ghosttyBin, err)
		}
	}

	args := []string{}
	if windowID := ghosttyWindowIDForDen(group); windowID != "" {
		args = append(args, "--window-id="+windowID)
	}
	args = append(args, "-e")
	args = append(args, spec.ExecArgs...)
	cmd := exec.Command(ghosttyBin, args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Ghostty failed: %s: %w", string(output), err)
	}
	return nil
}

func launchRio(spec LaunchSpec) error {
	log.Printf("🚀 Launching Rio with command: %s", spec.CommandText)
	return launchWithScript("Rio", spec)
}

func launchWarp(spec LaunchSpec) error {
	log.Printf("🚀 Launching Warp with command: %s", spec.CommandText)

	// Resolve tmux path: prefer LookPath, then common install locations, then bare "tmux".
	tmuxPath := ""
	if resolved, err := exec.LookPath("tmux"); err == nil {
		tmuxPath = resolved
	}
	if tmuxPath == "" {
		for _, candidate := range []string{"/opt/homebrew/bin/tmux", "/usr/local/bin/tmux"} {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				tmuxPath = candidate
				break
			}
		}
	}
	if tmuxPath == "" {
		tmuxPath = "tmux"
	}

	// Extract session name from ExecArgs — the last arg is shellQuoted(tmuxPath); the
	// attach target follows "attach -d -t" in the shell command (ExecArgs[2]).
	sessionName := extractSessionFromShellCommand(spec.ExecArgs)
	if sessionName == "" {
		log.Printf("⚠️ Warp: could not extract session name, using clipboard fallback")
		_ = exec.Command("open", "-n", "-a", "Warp").Start()
		copyToClipboard(spec.ClipboardText)
		return nil
	}

	// Step 1: Open Warp via URI scheme with workspace path.
	cleanAttachCmd := fmt.Sprintf("%s attach -d -t '%s'", tmuxPath, sessionName)
	log.Printf("📋 Warp paste command: %s", cleanAttachCmd)

	warpURI := "warp://action/new_window"
	if spec.Cwd != "" {
		warpURI = "warp://action/new_window?" + url.Values{"path": {spec.Cwd}}.Encode()
	}
	_ = exec.Command("open", warpURI).Start()

	// Step 2: Single-fire paste with try-wrapped AppleScript.
	escapedCmd := strings.ReplaceAll(cleanAttachCmd, `\`, `\\`)
	escapedCmd = strings.ReplaceAll(escapedCmd, `"`, `\"`)
	pureScript := fmt.Sprintf(`
		set the clipboard to "%s"
		delay 0.1
		tell application "Warp" to activate
		tell application "System Events"
			try
				set frontmost of process "Warp" to true
				delay 0.2
				key code 9 using command down
				delay 0.6
				keystroke return
				delay 0.15
				key code 36
			end try
		end tell
	`, escapedCmd)

	go func() {
		time.Sleep(1500 * time.Millisecond)
		_ = exec.Command("osascript", "-e", pureScript).Run()
		log.Println("🎉 Warp paste and enter done")
	}()

	return nil
}

// extractSessionFromShellCommand parses the tmux session name from ExecArgs.
// ExecArgs layout: [runnerShell, runnerFlag, shellCommand, shellQuote(tmuxPath)]
// shellCommand contains "... attach -d -t 'session'".
func extractSessionFromShellCommand(args []string) string {
	if len(args) < 3 {
		return ""
	}
	shellCmd := args[2]
	// Look for " attach -d -t " or " attach -t " marker.
	for _, marker := range []string{" attach -d -t ", " attach -t "} {
		_, rest, found := strings.Cut(shellCmd, marker)
		if !found {
			continue
		}
		rest = strings.TrimSpace(rest)
		// Session name is shellQuoted: 'name' or 'name'\''s'
		if len(rest) >= 2 && rest[0] == '\'' {
			end := strings.Index(rest[1:], "'")
			if end >= 0 {
				return rest[1 : end+1]
			}
		}
	}
	return ""
}

func launchGeneric(appPath, commandText string) error {
	copyToClipboard(commandText)

	cmd := exec.Command("open", appPath)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("generic launch failed: %w", err)
	}
	return nil
}

func copyToClipboard(text string) {
	cmd := exec.Command("bash", "-c", fmt.Sprintf("echo -n %q | pbcopy", text))
	_ = cmd.Run()
}
