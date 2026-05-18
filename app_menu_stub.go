//go:build !darwin

package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
)

func buildAppMenu(app *App) *menu.Menu {
	// Windows/Linux: 不设置菜单栏
	return nil
}

func applyPlatformOptions(opts *options.App, appIconData []byte) {
}
