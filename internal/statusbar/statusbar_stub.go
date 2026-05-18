//go:build !(darwin && cgo)

package statusbar

// SessionItem represents a session entry in the status bar menu.
type SessionItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Den  string `json:"den"`
}

func Init(buildMenu func() []SessionItem, openDashboard func(), quitApp func(), attachSession func(sessionID string)) {
}
