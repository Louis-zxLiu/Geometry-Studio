package windowmetrics

type Size struct {
	Width  int
	Height int
}

const (
	windowFrameReserve       = 32
	compactMinWindowWidth    = 960
	compactMinWindowHeight   = 560
	preferredMinWindowWidth  = 1100
	preferredMinWindowHeight = 680
	maxWindowWidth           = 1720
	maxWindowHeight          = 1180
)

func InitialWindowSize() Size {
	size := workAreaSize()
	if size.Width <= 0 || size.Height <= 0 {
		return fallbackSize()
	}

	availableWidth := maxInt(size.Width-windowFrameReserve, 0)
	availableHeight := maxInt(size.Height-windowFrameReserve, 0)
	width := fitToAvailable(availableWidth, int(float64(availableWidth)*0.9), compactMinWindowWidth, maxWindowWidth)
	height := fitToAvailable(availableHeight, int(float64(availableHeight)*0.88), compactMinWindowHeight, maxWindowHeight)

	return Size{
		Width:  width,
		Height: height,
	}
}

func MinimumWindowSize() Size {
	size := workAreaSize()
	if size.Width <= 0 || size.Height <= 0 {
		return Size{
			Width:  compactMinWindowWidth,
			Height: compactMinWindowHeight,
		}
	}

	availableWidth := maxInt(size.Width-windowFrameReserve, 0)
	availableHeight := maxInt(size.Height-windowFrameReserve, 0)

	return Size{
		Width:  fitToAvailable(availableWidth, preferredMinWindowWidth, compactMinWindowWidth, preferredMinWindowWidth),
		Height: fitToAvailable(availableHeight, preferredMinWindowHeight, compactMinWindowHeight, preferredMinWindowHeight),
	}
}

func fallbackSize() Size {
	return Size{
		Width:  1320,
		Height: 820,
	}
}

func fitToAvailable(available, preferred, compactMinimum, maximum int) int {
	if available <= 0 {
		return compactMinimum
	}

	if available <= compactMinimum {
		return available
	}

	return clamp(preferred, compactMinimum, minInt(available, maximum))
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

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}
