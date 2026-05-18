package main

import (
	"context"
	"embed"
	"log"

	"mole/internal/config"
	"mole/internal/session"
	// "mole/internal/statusbar"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	// "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	log.Println("🦔 [Mole Main] 启动 Wails 原生菜单架构...")
	app := NewApp()

	appMenu := buildAppMenu(app)

	opts := &options.App{
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
			// TODO: NSStatusItem via cgo — code preserved in internal/statusbar/
			// initStatusBar(app)
		},
		OnDomReady: func(ctx context.Context) {
			app.domReady(ctx)
		},
		Bind: []interface{}{
			app,
		},
	}

	applyPlatformOptions(opts, appIconData)

	err := wails.Run(opts)

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
