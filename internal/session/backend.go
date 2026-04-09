package session

const (
	BackendIDTmux = "tmux"
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
	Create(name string, env map[string]string, command string) error
	List() ([]RuntimeSessionInfo, error)
	Kill(name string) error
	IsAlive(name string) bool
	SyncEnv(name string, env map[string]string) error
}
