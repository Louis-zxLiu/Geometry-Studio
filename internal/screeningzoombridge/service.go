package screeningzoombridge

import "plotkitycat/internal/screeningzoom"

type Controller struct {
	zoom *screeningzoom.Service
}

func NewController(zoom *screeningzoom.Service) *Controller {
	return &Controller{zoom: zoom}
}

func (c *Controller) UpdateTargetWindow(hwnd uintptr) error {
	if c == nil || c.zoom == nil {
		return nil
	}
	return c.zoom.SetTargetWindow(hwnd)
}

func (c *Controller) UpdateSourceRect(rect screeningzoom.Rect) error {
	if c == nil || c.zoom == nil {
		return nil
	}
	return c.zoom.SetSourceRect(rect)
}

func (c *Controller) ClearSourceRect() error {
	if c == nil || c.zoom == nil {
		return nil
	}
	return c.zoom.ClearSourceRect()
}

func (c *Controller) Status() (screeningzoom.Status, error) {
	if c == nil || c.zoom == nil {
		return screeningzoom.Status{}, nil
	}
	return c.zoom.Status()
}

func (c *Controller) Stop() error {
	if c == nil || c.zoom == nil {
		return nil
	}
	return c.zoom.Stop()
}
