package session

import "mole/internal/terminal"

const (
	BackendIDTmux       = "tmux"
	BackendIDWslTmux    = "wsl-tmux"
	BackendIDPowerShell = "powershell"
)

// RuntimeSessionInfo describes live session state as reported by a backend.
// It intentionally avoids naming tmux so future backends can reuse it.
type RuntimeSessionInfo struct {
	Name     string
	Attached int
	Windows  int
}

// SessionBackend owns the runtime session lifecycle for a platform/backend pair.
// The current implementation uses tmux, but the manager should not depend on
// tmux directly anymore.
type SessionBackend interface {
	ID() string
	EnsureAvailable() error
	Create(name string, env map[string]string, command string, cwd string, runCommand bool) error
	List() ([]RuntimeSessionInfo, error)
	Kill(name string) error
	Detach(name string) error
	IsAlive(name string) bool
	SyncEnv(name string, env map[string]string) error
	BuildAttachSpec(name string, env map[string]string, den string, cwd string) (terminal.LaunchSpec, error)
	// SessionCwd returns the live working directory of the session, or "" if unknown.
	SessionCwd(name string) string
}

// SessionHealthBackend optionally reports deeper runtime health than mere existence.
// Backends that do not implement this are treated as healthy whenever IsAlive returns true.
type SessionHealthBackend interface {
	IsHealthy(name string) bool
}
