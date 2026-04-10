//go:build !darwin || !cgo

package tray

// SessionInfo holds session data for display in tray menu.
type SessionInfo struct {
	SessionID   string
	Name        string
	ProfileName string
	Attached    bool
	Alive       bool
}

// Callbacks holds function pointers for tray menu actions.
type Callbacks struct {
	OnShowWindow func()
	OnNewSession func()
	OnAttach     func(sessionID string)
	OnQuit       func()
	GetSessions  func() []SessionInfo
}

// Run is a no-op on platforms where the native tray is not implemented yet.
func Run(cb Callbacks) {
}
