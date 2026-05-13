package session

import "mole/internal/terminal"

// WslTmuxBackend adapts a tmux runtime hosted inside WSL.
type WslTmuxBackend struct{}

func NewWslTmuxBackend() SessionBackend {
	return WslTmuxBackend{}
}

func (WslTmuxBackend) ID() string {
	return BackendIDWslTmux
}

func (WslTmuxBackend) EnsureAvailable() error {
	return EnsureWslTmuxAvailable()
}

func (WslTmuxBackend) Create(name string, env map[string]string, command string) error {
	return CreateWslTmuxSession(name, env, command)
}

func (WslTmuxBackend) List() ([]RuntimeSessionInfo, error) {
	wslSessions, err := ListWslTmuxSessions()
	if err != nil {
		return nil, err
	}

	result := make([]RuntimeSessionInfo, 0, len(wslSessions))
	for _, sess := range wslSessions {
		result = append(result, RuntimeSessionInfo{
			Name:     sess.Name,
			Attached: sess.Attached,
			Windows:  sess.Windows,
		})
	}

	return result, nil
}

func (WslTmuxBackend) Kill(name string) error {
	return KillWslTmuxSession(name)
}

func (WslTmuxBackend) Detach(name string) error {
	return DetachWslTmuxSessionClients(name)
}

func (WslTmuxBackend) IsAlive(name string) bool {
	return IsWslTmuxSessionAlive(name)
}

func (WslTmuxBackend) SyncEnv(name string, env map[string]string) error {
	return SyncWslTmuxSessionEnv(name, env)
}

func (WslTmuxBackend) BuildAttachSpec(name string, env map[string]string, den string) (terminal.LaunchSpec, error) {
	return buildWslTmuxAttachLaunchSpec(name, env)
}
