package screening

import (
	"fmt"
	"time"

	"plotkitycat/internal/windowctrl"
)

func (s *Service) onProcessReady(sceneName string) {
	entry := s.getPoolEntry(sceneName)
	if entry == nil || entry.process == nil {
		return
	}

	hwnd, err := windowctrl.FindWindowByPID(entry.process.pid, 8*time.Second)
	if err != nil {
		s.emitError(fmt.Errorf("未找到 %s 的窗口: %w", sceneName, err))
		return
	}

	_ = windowctrl.PreparePresentationWindow(hwnd)

	isCurrent := s.markEntryReady(sceneName, hwnd)
	if !isCurrent {
		_ = windowctrl.HideWindow(hwnd)
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
		_ = s.reconcilePool()
	}
}

func (s *Service) getPoolEntry(sceneName string) *poolEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pool[sceneName]
}

func (s *Service) markEntryReady(sceneName string, hwnd uintptr) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	currentScene := ""
	if s.currentIndex >= 0 && s.currentIndex < len(s.sceneNames) {
		currentScene = s.sceneNames[s.currentIndex]
	}
	entry := s.pool[sceneName]
	if entry != nil {
		entry.hwnd = hwnd
		entry.ready = true
	}

	return currentScene == sceneName
}
