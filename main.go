package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	"sort"

	"mole/internal/config"
	"mole/internal/session"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	log.Println("🦔 [Mole Main] 启动 Wails 原生菜单架构...")
	app := NewApp()

	// 构建顶部菜单栏
	appMenu := menu.NewMenu()

	// macOS 规范：第一列必须是应用自身的名字（About、Services、Quit 等）
	appMenu.Append(menu.AppMenu())

	// Mole 专属菜单
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
			sessID := sess.ID // 闭包捕获
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

	err := wails.Run(&options.App{
		Title:             "Mole",
		Width:             900,
		Height:            600,
		HideWindowOnClose: true,
		Menu:              appMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup: func(ctx context.Context) {
			setApplicationIcon(appIconData)
			app.startup(ctx)
		},
		OnDomReady: func(ctx context.Context) {
			app.domReady(ctx)
		},
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
			About: &mac.AboutInfo{
				Title:   "Mole",
				Message: "A session manager for hosts and profiles.",
				Icon:    appIconData,
			},
		},
	})

	if err != nil {
		log.Fatal("Error:", err)
	}
}

// loadSessions reads sessions directly from sessions.json.
func loadSessions() []session.Session {
	store := session.NewStore(config.SessionsPath())
	sessions, err := store.List()
	if err != nil {
		log.Printf("⚠️ 加载 sessions.json 失败: %v", err)
		return nil
	}
	return sessions
}
