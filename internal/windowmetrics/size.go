package windowmetrics

type Size struct {
	Width  int
	Height int
}

const (
	sidebarWidth             = 345
	minEditorWorkspaceWidth  = 520
	minNotebookWorkspaceWidth = 400
	windowHorizontalReserve  = 24
	minWindowWidth           = sidebarWidth + minEditorWorkspaceWidth + minNotebookWorkspaceWidth + windowHorizontalReserve
	minWindowHeight          = 760
	maxWindowWidth           = 1720
	maxWindowHeight          = 1180
)

func InitialWindowSize() Size {
	size := workAreaSize()
	if size.Width <= 0 || size.Height <= 0 {
		return fallbackSize()
	}

	width := clamp(maxInt(int(float64(size.Width)*0.86), minWindowWidth), minWindowWidth, maxWindowWidth)
	height := clamp(int(float64(size.Height)*0.82), minWindowHeight, maxWindowHeight)

	return Size{
		Width:  width,
		Height: height,
	}
}

func MinimumWindowSize() Size {
	return Size{
		Width:  minWindowWidth,
		Height: minWindowHeight,
	}
}

func fallbackSize() Size {
	return Size{
		Width:  1440,
		Height: 900,
	}
}

func clamp(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
