//go:build !windows

package windowmetrics

func workAreaSize() Size {
	return Size{}
}
