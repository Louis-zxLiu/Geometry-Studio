package main

import (
	"embed"
	"fmt"

	"plotkitycat/internal/bridge"
	"plotkitycat/internal/instancelock"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	lock, err := instancelock.Acquire()
	if err != nil {
		panic(fmt.Errorf("PlotKityCat is already running: %w", err))
	}
	defer lock.Release()

	app := bridge.NewApp()

	err = wails.Run(&options.App{
		Title:  "PlotKityCat",
		Width:  1440,
		Height: 900,
		Assets: assets,
		Bind: []interface{}{
			app,
		},
		OnStartup:  app.Startup,
		OnShutdown: app.Shutdown,
	})
	if err != nil {
		panic(err)
	}
}
