//go:build windows

package main

import (
	"fmt"
	"log"
	"sort"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func buildAppMenu(app *App) *menu.Menu {
	appMenu := menu.NewMenu()

	// Windows: 顶层菜单，不含 macOS 的 AppMenu（About/Services/Hide 等）
	moleMenu := appMenu.AddSubmenu("Mole")

	// 动态读取 sessions.json，渲染会话列表
	sessions := loadSessions()
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].Name < sessions[j].Name
	})

	if len(sessions) > 0 {
		for _, sess := range sessions {
			den := sess.Den
			if den == "" {
				den = "—"
			}
			label := fmt.Sprintf("%s   [Den: %s]", sess.Name, den)
			sessID := sess.ID
			moleMenu.AddText(label, nil, func(_ *menu.CallbackData) {
				log.Printf("🖱️ 顶栏触发 Attach: %s (%s)", sess.Name, sessID)
				if app.sessionMgr != nil {
					if _, err := app.sessionMgr.Attach(sessID); err != nil {
						log.Printf("Attach failed: %v", err)
					}
				}
			})
		}
		moleMenu.AddSeparator()
	}

	moleMenu.AddText("Open Dashboard", keys.CmdOrCtrl("d"), func(_ *menu.CallbackData) {
		log.Println("🖱️ 顶部菜单触发：唤醒主界面")
		if app.ctx != nil {
			runtime.Show(app.ctx)
			runtime.WindowShow(app.ctx)
			runtime.WindowUnminimise(app.ctx)
		}
	})

	moleMenu.AddSeparator()

	moleMenu.AddText("Quit Mole", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		log.Println("🖱️ 顶部菜单触发：退出")
		if app.ctx != nil {
			runtime.Quit(app.ctx)
		}
	})

	return appMenu
}

func applyPlatformOptions(opts *options.App, appIconData []byte) {
	// Windows: 无 Mac 特定选项，保持默认
}
