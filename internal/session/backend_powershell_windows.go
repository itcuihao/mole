//go:build windows

package session

import (
	"fmt"
	"sort"
	"strings"
	"sync"

	"mole/internal/terminal"
)

type powerShellRuntimeState struct {
	env        map[string]string
	command    string
	cwd        string
	runCommand bool
	attached   bool
	opened     bool
}

type powerShellRuntimeRegistry struct {
	mu    sync.RWMutex
	items map[string]powerShellRuntimeState
}

func newPowerShellRuntimeRegistry() *powerShellRuntimeRegistry {
	return &powerShellRuntimeRegistry{
		items: make(map[string]powerShellRuntimeState),
	}
}

func (r *powerShellRuntimeRegistry) set(name string, state powerShellRuntimeState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items[name] = state
}

func (r *powerShellRuntimeRegistry) get(name string) (powerShellRuntimeState, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	state, ok := r.items[name]
	return state, ok
}

func (r *powerShellRuntimeRegistry) delete(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.items, name)
}

func (r *powerShellRuntimeRegistry) list() map[string]powerShellRuntimeState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]powerShellRuntimeState, len(r.items))
	for k, v := range r.items {
		out[k] = v
	}
	return out
}

var powerShellRuntimes = newPowerShellRuntimeRegistry()

// PowerShellBackend provides a Windows-native runtime mode that does not depend on tmux/WSL.
// It tracks session intent in-memory and materializes it on Attach by launching PowerShell.
type PowerShellBackend struct{}

func NewPowerShellBackend() SessionBackend {
	return PowerShellBackend{}
}

func (PowerShellBackend) ID() string {
	return BackendIDPowerShell
}

func (PowerShellBackend) EnsureAvailable() error {
	// We intentionally do not hard fail on missing pwsh/powershell executable here.
	// Terminal launcher already performs executable checks against the selected terminal.
	return nil
}

func (PowerShellBackend) Create(name string, env map[string]string, command string, cwd string, runCommand bool) error {
	state := powerShellRuntimeState{
		env:        copyStringMap(env),
		command:    strings.TrimSpace(command),
		cwd:        strings.TrimSpace(cwd),
		runCommand: runCommand,
		attached:   false,
		opened:     false,
	}
	powerShellRuntimes.set(name, state)
	return nil
}

func (PowerShellBackend) List() ([]RuntimeSessionInfo, error) {
	items := powerShellRuntimes.list()
	result := make([]RuntimeSessionInfo, 0, len(items))
	for name, state := range items {
		attached := 0
		if state.attached {
			attached = 1
		}
		result = append(result, RuntimeSessionInfo{
			Name:     name,
			Attached: attached,
			Windows:  1,
		})
	}
	return result, nil
}

func (PowerShellBackend) Kill(name string) error {
	powerShellRuntimes.delete(name)
	return nil
}

func (PowerShellBackend) Detach(name string) error {
	state, ok := powerShellRuntimes.get(name)
	if !ok {
		return nil
	}
	state.attached = false
	powerShellRuntimes.set(name, state)
	return nil
}

func (PowerShellBackend) IsAlive(name string) bool {
	_, ok := powerShellRuntimes.get(name)
	return ok
}

func (PowerShellBackend) IsHealthy(name string) bool {
	return PowerShellBackend{}.IsAlive(name)
}

func (PowerShellBackend) SyncEnv(name string, env map[string]string) error {
	state, ok := powerShellRuntimes.get(name)
	if !ok {
		return nil
	}
	state.env = copyStringMap(env)
	powerShellRuntimes.set(name, state)
	return nil
}

func (PowerShellBackend) SessionCwd(string) string { return "" }

func (PowerShellBackend) BuildAttachSpec(name string, env map[string]string, den string, cwd string) (terminal.LaunchSpec, error) {
	state, ok := powerShellRuntimes.get(name)
	if !ok {
		return terminal.LaunchSpec{}, fmt.Errorf("powershell runtime %q not found", name)
	}

	if len(env) > 0 {
		state.env = copyStringMap(env)
	}

	shouldRunCommand := state.command != "" && (!state.opened || state.runCommand)
	script := buildPowerShellAttachScript(state.env, state.cwd, state.command, shouldRunCommand)

	state.runCommand = false
	state.opened = true
	state.attached = true
	powerShellRuntimes.set(name, state)

	return terminal.LaunchSpec{
		CommandText:   script,
		ClipboardText: script,
		Den:           den,
	}, nil
}

func buildPowerShellAttachScript(env map[string]string, cwd, command string, includeCommand bool) string {
	commands := make([]string, 0, len(env)+2)

	if len(env) > 0 {
		keys := make([]string, 0, len(env))
		for key := range env {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		for _, key := range keys {
			commands = append(commands, fmt.Sprintf("$env:%s = %s", key, quotePowerShellArgument(env[key])))
		}
	}

	if cwd = strings.TrimSpace(cwd); cwd != "" {
		commands = append(commands, fmt.Sprintf("Set-Location -LiteralPath %s", quotePowerShellArgument(cwd)))
	}

	if includeCommand && strings.TrimSpace(command) != "" {
		commands = append(commands, command)
	}

	// 使用 & { ... } 包裹命令块，防止特殊字符解析错误
	if len(commands) == 0 {
		return ""
	}
	return fmt.Sprintf("& { %s }", strings.Join(commands, "; "))
}

func quotePowerShellArgument(value string) string {
	escaped := strings.ReplaceAll(value, "'", "''")
	return "'" + escaped + "'"
}

func copyStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	out := make(map[string]string, len(values))
	for k, v := range values {
		out[k] = v
	}
	return out
}
