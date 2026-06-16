package bridge

import (
	"strconv"

	"plotkitycat/internal/screeningzoom"
)

func (a *App) GetScreeningZoomStatus() (ScreeningZoomStatus, error) {
	if a.screeningZoomBridge == nil {
		return ScreeningZoomStatus{}, nil
	}

	status, err := a.screeningZoomBridge.Status()
	if err != nil {
		return ScreeningZoomStatus{}, err
	}

	return ScreeningZoomStatus{
		Available:  status.Available,
		Running:    status.Running,
		HelperPath: status.HelperPath,
		TargetHWND: strconv.FormatUint(uint64(status.TargetHWND), 10),
	}, nil
}

func (a *App) SetScreeningZoomSourceRect(rect ScreeningZoomRect) error {
	if a.screeningZoomBridge == nil {
		return nil
	}
	return a.screeningZoomBridge.UpdateSourceRect(screeningzoom.Rect{
		Left:   rect.Left,
		Top:    rect.Top,
		Right:  rect.Right,
		Bottom: rect.Bottom,
	})
}

func (a *App) ClearScreeningZoomSourceRect() error {
	if a.screeningZoomBridge == nil {
		return nil
	}
	return a.screeningZoomBridge.ClearSourceRect()
}
