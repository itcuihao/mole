package main

import (
	"context"
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "Mole",
		Width:  900,
		Height: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour:  &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		HideWindowOnClose: true,
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
		// Debug: options.Debug{
		// 	OpenInspectorOnStartup: true,
		// },
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
