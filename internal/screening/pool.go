package screening

import (
	"fmt"

	"plotkitycat/internal/windowctrl"
)

func (s *Service) createPool() error {
	s.mu.Lock()
	if !s.active {
		s.mu.Unlock()
		return errSessionInactive
	}
	indices := s.targetIndicesLocked()
	s.mu.Unlock()

	for _, index := range indices {
		if err := s.ensureEntry(index); err != nil {
			return err
		}
	}

	return s.syncVisibleWindow()
}

func (s *Service) ensureEntry(index int) error {
	s.mu.Lock()
	if !s.active || index < 0 || index >= len(s.sceneNames) {
		s.mu.Unlock()
		return nil
	}

	sceneName := s.sceneNames[index]
	if _, exists := s.pool[sceneName]; exists {
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	process, err := launchSceneProcess(s.workspaces, sceneName, processCallbacks{
		onReady: func() {
			s.onProcessReady(sceneName)
		},
		onNext: func() {
			_, _ = s.Next()
		},
		onPrev: func() {
			_, _ = s.Previous()
		},
		onStop: func() {
			_, _ = s.Stop()
		},
		onExited: func() {
			s.onProcessExited(sceneName)
		},
		onError: func(runErr error) {
			s.emitError(fmt.Errorf("%s 放映失败: %w", sceneName, runErr))
		},
	})
	if err != nil {
		return err
	}

	entry := &poolEntry{
		sceneName: sceneName,
		index:     index,
		process:   process,
	}

	s.mu.Lock()
	if !s.active {
		s.mu.Unlock()
		_ = process.stop()
		return nil
	}
	s.pool[sceneName] = entry
	s.mu.Unlock()
	return nil
}

func (s *Service) reconcilePool() error {
	s.mu.Lock()
	if !s.active {
		s.mu.Unlock()
		return nil
	}

	desiredScenes := s.desiredSceneSetLocked()
	extraEntries := make([]*poolEntry, 0)
	missingIndices := make([]int, 0)

	for sceneName, entry := range s.pool {
		if _, keep := desiredScenes[sceneName]; !keep {
			extraEntries = append(extraEntries, entry)
			delete(s.pool, sceneName)
		}
	}

	for _, index := range s.targetIndicesLocked() {
		if index < 0 || index >= len(s.sceneNames) {
			continue
		}
		sceneName := s.sceneNames[index]
		if _, exists := s.pool[sceneName]; !exists {
			missingIndices = append(missingIndices, index)
		}
	}
	s.mu.Unlock()

	for _, entry := range extraEntries {
		if entry.hwnd != 0 {
			_ = windowctrl.HideWindow(entry.hwnd)
			_ = windowctrl.CloseWindow(entry.hwnd)
		}
		if entry.process != nil {
			_ = entry.process.stop()
		}
	}

	for _, index := range missingIndices {
		if err := s.ensureEntry(index); err != nil {
			return err
		}
	}

	return s.syncVisibleWindow()
}

func (s *Service) desiredSceneSetLocked() map[string]struct{} {
	desiredScenes := map[string]struct{}{}
	for _, index := range s.targetIndicesLocked() {
		if index >= 0 && index < len(s.sceneNames) {
			desiredScenes[s.sceneNames[index]] = struct{}{}
		}
	}
	return desiredScenes
}
