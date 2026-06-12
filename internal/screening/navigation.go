package screening

import (
	"errors"
	"fmt"
	"time"

	"plotkitycat/internal/windowctrl"
)

func (s *Service) navigate(delta int) (SessionState, error) {
	targetIndex, state, ready, err := s.beginNavigation(delta)
	if err != nil || !ready {
		return state, err
	}

	defer s.finishNavigation()

	if err := s.ensureEntry(targetIndex); err != nil {
		return SessionState{}, err
	}

	fromEntry, toEntry, animation := s.navigationContext(targetIndex)
	if toEntry == nil {
		return SessionState{}, errors.New("目标场景尚未准备完成")
	}
	if err := s.waitUntilReady(toEntry.sceneName, 8*time.Second); err != nil {
		return SessionState{}, err
	}

	if err := windowctrl.AnimateTransition(entryWindow(fromEntry), entryWindow(toEntry), windowctrl.Animation(animation)); err != nil {
		return SessionState{}, err
	}

	s.mu.Lock()
	s.currentIndex = targetIndex
	state = s.stateLocked()
	s.mu.Unlock()

	if err := s.reconcilePool(); err != nil {
		return state, err
	}

	s.emitStateChange()
	return state, nil
}

func (s *Service) beginNavigation(delta int) (targetIndex int, state SessionState, ready bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active {
		return 0, SessionState{}, false, errors.New("当前没有放映会话")
	}
	if s.navInProgress {
		return 0, s.stateLocked(), false, nil
	}

	targetIndex = s.currentIndex + delta
	if targetIndex < 0 || targetIndex >= len(s.sceneNames) {
		return 0, s.stateLocked(), false, nil
	}

	s.navInProgress = true
	return targetIndex, SessionState{}, true, nil
}

func (s *Service) finishNavigation() {
	s.mu.Lock()
	s.navInProgress = false
	s.mu.Unlock()
}

func (s *Service) navigationContext(targetIndex int) (*poolEntry, *poolEntry, Animation) {
	s.mu.Lock()
	defer s.mu.Unlock()

	fromScene := ""
	if s.currentIndex >= 0 && s.currentIndex < len(s.sceneNames) {
		fromScene = s.sceneNames[s.currentIndex]
	}
	toScene := s.sceneNames[targetIndex]

	return s.pool[fromScene], s.pool[toScene], s.animation
}

func (s *Service) syncVisibleWindow() error {
	currentScene, currentEntry, entries := s.visibleWindowContext()
	if currentEntry == nil {
		return nil
	}
	if err := s.waitUntilReady(currentScene, 8*time.Second); err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.sceneName == currentScene {
			if err := windowctrl.PreparePresentationWindow(entry.hwnd); err != nil {
				return err
			}
			continue
		}
		if entry.hwnd != 0 {
			_ = windowctrl.HideWindow(entry.hwnd)
		}
	}

	return nil
}

func (s *Service) visibleWindowContext() (string, *poolEntry, []*poolEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active || s.currentIndex < 0 || s.currentIndex >= len(s.sceneNames) {
		return "", nil, nil
	}

	currentScene := s.sceneNames[s.currentIndex]
	entries := make([]*poolEntry, 0, len(s.pool))
	var currentEntry *poolEntry
	for _, entry := range s.pool {
		entries = append(entries, entry)
		if entry.sceneName == currentScene {
			currentEntry = entry
		}
	}

	return currentScene, currentEntry, entries
}

func (s *Service) waitUntilReady(sceneName string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		entry := s.pool[sceneName]
		ready := entry != nil && entry.ready && entry.hwnd != 0
		s.mu.Unlock()
		if ready {
			return nil
		}
		time.Sleep(120 * time.Millisecond)
	}
	return fmt.Errorf("场景 %s 窗口准备超时", sceneName)
}
