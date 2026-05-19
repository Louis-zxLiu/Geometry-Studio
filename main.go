package main

import (
	"embed"
	"fmt"
	"os"

	"plotkitycat/internal/bridge"
	"plotkitycat/internal/instancelock"
	"plotkitycat/internal/startupdiag"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	defer func() {
		if recovered := recover(); recovered != nil {
			err := fmt.Errorf("%v", recovered)
			startupdiag.ShowStartupError("PlotKityCat Startup Error", startupdiag.StartupErrorMessage(err))
			os.Exit(1)
		}
	}()

	lock, err := instancelock.Acquire()
	if err != nil {
		startErr := fmt.Errorf("failed to acquire single-instance lock on 127.0.0.1:49152: %w", err)
		startupdiag.ShowStartupError("PlotKityCat Startup Error", startupdiag.StartupErrorMessage(startErr))
		panic(startErr)
	}
	defer lock.Release()

	app := bridge.NewApp()

	err = wails.Run(&options.App{
		Title:     "PlotKityCat",
		Width:     1440,
		Height:    900,
		Frameless: true,
		MinWidth:  1180,
		MinHeight: 760,
		Assets:    assets,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			IsZoomControlEnabled: false,
			ZoomFactor:           1.0,
			DisablePinchZoom:     true,
		},
		OnStartup:  app.Startup,
		OnShutdown: app.Shutdown,
	})
	if err != nil {
		startupdiag.ShowStartupError("PlotKityCat Startup Error", startupdiag.StartupErrorMessage(err))
		os.Exit(1)
	}
}
