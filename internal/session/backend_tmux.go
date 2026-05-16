package session

import "mole/internal/terminal"

// TmuxBackend adapts the existing tmux runtime implementation to SessionBackend.
type TmuxBackend struct{}

// NewTmuxBackend returns the default backend used by Mole today.
func NewTmuxBackend() SessionBackend {
	return TmuxBackend{}
}

func (TmuxBackend) ID() string {
	return BackendIDTmux
}

func (TmuxBackend) EnsureAvailable() error {
	if TmuxAvailable() {
		return nil
	}
	return ErrTmuxUnavailable
}

func (TmuxBackend) Create(name string, env map[string]string, command string, cwd string, runCommand bool) error {
	return CreateTmuxSession(name, env, command, cwd, runCommand)
}

func (TmuxBackend) List() ([]RuntimeSessionInfo, error) {
	tmuxSessions, err := ListTmuxSessions()
	if err != nil {
		return nil, err
	}

	result := make([]RuntimeSessionInfo, 0, len(tmuxSessions))
	for _, sess := range tmuxSessions {
		result = append(result, RuntimeSessionInfo{
			Name:     sess.Name,
			Attached: sess.Attached,
			Windows:  sess.Windows,
		})
	}

	return result, nil
}

func (TmuxBackend) Kill(name string) error {
	return KillTmuxSession(name)
}

func (TmuxBackend) Detach(name string) error {
	return DetachTmuxSessionClients(name)
}

func (TmuxBackend) IsAlive(name string) bool {
	return IsTmuxSessionAlive(name)
}

func (TmuxBackend) IsHealthy(name string) bool {
	return IsTmuxSessionHealthy(name)
}

func (TmuxBackend) SyncEnv(name string, env map[string]string) error {
	return SyncTmuxSessionEnv(name, env)
}

func (TmuxBackend) BuildAttachSpec(name string, env map[string]string, den string) (terminal.LaunchSpec, error) {
	return buildTmuxAttachLaunchSpec(name, env, den)
}
