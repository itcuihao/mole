package session

import (
	"runtime"

	"mole/internal/inventory"
	"mole/internal/profile"
)

// NewPlatformManager creates a session manager with a platform-aware default backend.
func NewPlatformManager(storePath string, profileMgr *profile.Manager, invMgr *inventory.Manager) *Manager {
	defaultBackend, extraBackends := platformBackends()
	return NewManagerWithBackends(storePath, profileMgr, invMgr, defaultBackend, extraBackends...)
}

func platformBackends() (SessionBackend, []SessionBackend) {
	tmuxBackend := NewTmuxBackend()
	wslTmuxBackend := NewWslTmuxBackend()

	switch runtime.GOOS {
	case "windows":
		return wslTmuxBackend, []SessionBackend{tmuxBackend}
	default:
		return tmuxBackend, []SessionBackend{wslTmuxBackend}
	}
}
