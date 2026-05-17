//go:build !darwin || !cgo

package traymenu

// SessionInfo holds session data for display in the tray menu.
type SessionInfo struct {
	SessionID   string
	Name        string
	ProfileName string
	Den         string
	Terminal    string
	Attached    bool
	Alive       bool
}

// Callbacks holds function pointers for tray menu actions.
type Callbacks struct {
	OnShowWindow func()
	OnAttach     func(sessionID string)
	OnQuit       func()
	GetSessions  func() []SessionInfo
}

// Run is a no-op on platforms where the native tray is not implemented yet.
func Run(cb Callbacks) {
}
