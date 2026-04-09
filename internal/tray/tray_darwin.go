package tray

import (
	_ "embed"
	"log"
	"sync"
	"time"

	"fyne.io/systray"
)

//go:embed icon.png
var iconData []byte

const maxSessionSlots = 10

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

type sessionSlot struct {
	item      *systray.MenuItem
	sessionID string
}

var (
	slots []sessionSlot
	mu    sync.Mutex
)

// Run starts the system tray. Blocks until quit, so call in a goroutine.
func Run(cb Callbacks) {
	systray.Run(func() {
		onReady(cb)
	}, func() {
		log.Println("[Tray] System tray exited")
	})
}

func onReady(cb Callbacks) {
	systray.SetIcon(iconData)
	systray.SetTooltip("Mole")

	mShow := systray.AddMenuItem("Show Window", "Show the configuration window")
	mNew := systray.AddMenuItem("New Session...", "Create a new session")
	systray.AddSeparator()

	// Pre-allocate session slots
	slots = make([]sessionSlot, maxSessionSlots)
	for i := range slots {
		slots[i].item = systray.AddMenuItem("", "")
		slots[i].item.Hide()
	}

	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit Mole", "Quit the application")

	// Start periodic session refresh
	go refreshLoop(cb)

	// Handle static menu events
	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				if cb.OnShowWindow != nil {
					cb.OnShowWindow()
				}
			case <-mNew.ClickedCh:
				if cb.OnNewSession != nil {
					cb.OnNewSession()
				}
			case <-mQuit.ClickedCh:
				if cb.OnQuit != nil {
					cb.OnQuit()
				}
				systray.Quit()
				return
			}
		}
	}()

	// Handle session slot clicks
	for i := range slots {
		idx := i
		go func() {
			for range slots[idx].item.ClickedCh {
				mu.Lock()
				sessionID := slots[idx].sessionID
				mu.Unlock()
				if sessionID != "" && cb.OnAttach != nil {
					cb.OnAttach(sessionID)
				}
			}
		}()
	}
}

func refreshLoop(cb Callbacks) {
	for {
		if cb.GetSessions != nil {
			sessions := cb.GetSessions()
			updateSlots(sessions)
		}
		time.Sleep(3 * time.Second)
	}
}

func updateSlots(sessions []SessionInfo) {
	mu.Lock()
	defer mu.Unlock()

	for i := range slots {
		if i < len(sessions) {
			s := sessions[i]
			status := "detached"
			if s.Attached {
				status = "attached"
			}
			title := s.Name
			if s.ProfileName != "" {
				title += " [" + s.ProfileName + "]"
			}
			title += " (" + status + ")"

			slots[i].item.SetTitle(title)
			slots[i].item.SetTooltip("Click to attach: " + s.Name)
			slots[i].sessionID = s.SessionID
			slots[i].item.Show()
		} else {
			slots[i].item.Hide()
			slots[i].sessionID = ""
		}
	}
}
