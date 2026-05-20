package windowmetrics

type Size struct {
	Width  int
	Height int
}

func InitialWindowSize() Size {
	size := workAreaSize()
	if size.Width <= 0 || size.Height <= 0 {
		return fallbackSize()
	}

	width := clamp(int(float64(size.Width)*0.80), 1180, 1720)
	height := clamp(int(float64(size.Height)*0.82), 760, 1180)

	return Size{
		Width:  width,
		Height: height,
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
