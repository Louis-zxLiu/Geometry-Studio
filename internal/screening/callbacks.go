package screening

import (
	"fmt"
	"time"

	"plotkitycat/internal/windowctrl"
)

func (s *Service) onProcessWindowReady(sceneName string) {
	s.debugf("window-ready received scene=%s", sceneName)
	entry := s.getPoolEntry(sceneName)
	if entry == nil || entry.process == nil {
		s.debugf("window-ready ignored scene=%s reason=missing-entry", sceneName)
		return
	}

	hwnd, err := windowctrl.FindWindowByPID(entry.process.pid, 8*time.Second)
	if err != nil {
		s.emitError(fmt.Errorf("未找到 %s 的窗口: %w", sceneName, err))
		return
	}

	if err := windowctrl.PrepareStackedWindow(hwnd); err != nil {
		s.emitError(fmt.Errorf("准备 %s 放映窗口失败: %w", sceneName, err))
		return
	}

	s.markEntryWindowReady(sceneName, hwnd)
	s.debugf("window prepared scene=%s pid=%d hwnd=%#x", sceneName, entry.process.pid, hwnd)
	if s.scheduler != nil {
		s.debugf("window-ready enqueued layout scene=%s", sceneName)
		s.scheduler.requestLayout(140 * time.Millisecond)
	}
	s.emitStateChange()
}

func (s *Service) onProcessFrameReady(sceneName string) {
	s.debugf("frame-ready received scene=%s", sceneName)
	s.markEntryFrameReady(sceneName)
	if s.scheduler != nil {
		s.debugf("frame-ready enqueued layout scene=%s", sceneName)
		s.scheduler.requestLayout(220 * time.Millisecond)
	}
	s.emitStateChange()
}

func (s *Service) onProcessExited(sceneName string) {
	s.mu.Lock()
	if _, exists := s.pool[sceneName]; exists {
		delete(s.pool, sceneName)
	}
	active := s.active
	s.mu.Unlock()

	if active {
		s.debugf("process exited while active scene=%s triggering reconcile", sceneName)
		_ = s.reconcilePool()
	}
}

func (s *Service) getPoolEntry(sceneName string) *poolEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pool[sceneName]
}

func (s *Service) markEntryWindowReady(sceneName string, hwnd uintptr) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.pool[sceneName]
	if entry != nil {
		entry.hwnd = hwnd
		entry.windowReady = true
		entry.activatedAt = time.Time{}
		entry.stackedBelow = 0
	}
}

func (s *Service) markEntryFrameReady(sceneName string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.pool[sceneName]
	if entry != nil {
		entry.frameReady = true
		if entry.frameReadyAt.IsZero() {
			entry.frameReadyAt = time.Now()
		}
	}
}
