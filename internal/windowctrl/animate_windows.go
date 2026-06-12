//go:build windows

package windowctrl

import (
	"errors"
	"math"
	"time"
)

func AnimateTransition(from uintptr, to uintptr, animation Animation) error {
	if to == 0 {
		return errors.New("invalid target window handle")
	}
	switch animation {
	case AnimationSlideLeft:
		return slideLeftTransition(from, to)
	default:
		return crossfadeTransition(from, to)
	}
}

func AnimateExit(from uintptr, animation Animation) error {
	if from == 0 {
		return nil
	}
	switch animation {
	case AnimationSlideLeft:
		return fadeOutOnlyTransition(from)
	default:
		return fadeOutOnlyTransition(from)
	}
}

func crossfadeTransition(from uintptr, to uintptr) error {
	if from != 0 {
		if err := StackWindowBelow(to, from); err != nil {
			return err
		}
	} else if err := ActivateWindow(to); err != nil {
		return err
	}

	if from == 0 {
		time.Sleep(160 * time.Millisecond)
		return nil
	}

	if err := fadeOutOnlyTransition(from); err != nil {
		return err
	}

	_ = StackWindowBelow(from, to)
	return nil
}

func fadeOutOnlyTransition(from uintptr) error {
	const (
		steps       = 20
		duration    = 420 * time.Millisecond
		tailHold    = 110 * time.Millisecond
		fullOpacity = 255
	)
	for step := 0; step <= steps; step++ {
		progress := easeInOut(float64(step) / float64(steps))
		alpha := byte(math.Round(float64(fullOpacity) * (1 - progress)))
		if err := setWindowOpacity(from, alpha); err != nil {
			return err
		}
		time.Sleep(duration / steps)
	}

	if err := setWindowOpacity(from, 0); err != nil {
		return err
	}
	time.Sleep(tailHold)
	return nil
}

func slideLeftTransition(from uintptr, to uintptr) error {
	targetBounds, err := monitorBounds(to)
	if err != nil {
		return err
	}
	width := targetBounds.Right - targetBounds.Left
	if width <= 0 {
		return ActivateWindow(to)
	}

	startBounds := rect{
		Left:   targetBounds.Left + width,
		Top:    targetBounds.Top,
		Right:  targetBounds.Right + width,
		Bottom: targetBounds.Bottom,
	}

	if err := setWindowBounds(to, startBounds, hwndTop, swPShow); err != nil {
		return err
	}
	if err := showWindow(to); err != nil {
		return err
	}
	if err := bringWindowToFront(to); err != nil {
		return err
	}

	const (
		steps    = 28
		duration = 480 * time.Millisecond
	)
	for step := 0; step <= steps; step++ {
		progress := easeInOut(float64(step) / float64(steps))
		offset := int32(math.Round(float64(width) * (1 - progress)))
		toBounds := rect{
			Left:   targetBounds.Left + offset,
			Top:    targetBounds.Top,
			Right:  targetBounds.Right + offset,
			Bottom: targetBounds.Bottom,
		}
		if err := setWindowBounds(to, toBounds, hwndTop, 0); err != nil {
			return err
		}
		if from != 0 {
			fromOffset := int32(math.Round(float64(width) * progress * 0.18))
			fromBounds := rect{
				Left:   targetBounds.Left - fromOffset,
				Top:    targetBounds.Top,
				Right:  targetBounds.Right - fromOffset,
				Bottom: targetBounds.Bottom,
			}
			if err := setWindowBounds(from, fromBounds, hwndTop, 0); err != nil {
				return err
			}
		}
		time.Sleep(duration / steps)
	}

	if err := setWindowBounds(to, targetBounds, hwndTop, 0); err != nil {
		return err
	}
	if from != 0 {
		_ = setWindowBounds(from, targetBounds, hwndTop, 0)
		_ = StackWindowBelow(from, to)
	}
	time.Sleep(80 * time.Millisecond)
	return nil
}

func easeInOut(progress float64) float64 {
	if progress <= 0 {
		return 0
	}
	if progress >= 1 {
		return 1
	}
	return 0.5 - 0.5*math.Cos(math.Pi*progress)
}
