package screening

import (
	"fmt"
	"time"

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
		s.debugf("create-pool ensure index=%d scene=%s", index, s.sceneNameAt(index))
		if err := s.ensureEntry(index); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) ensureEntry(index int) error {
	s.mu.Lock()
	if !s.active || index < 0 || index >= len(s.sceneNames) {
		s.mu.Unlock()
		return nil
	}

	sceneName := s.sceneNames[index]
	if _, exists := s.pool[sceneName]; exists {
		s.debugf("ensure-entry skip existing scene=%s index=%d", sceneName, index)
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	process, err := launchSceneProcess(s.workspaces, sceneName, processCallbacks{
		onWindowReady: func() {
			s.onProcessWindowReady(sceneName)
		},
		onFrameReady: func() {
			s.onProcessFrameReady(sceneName)
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
	s.debugf("ensure-entry launched scene=%s index=%d", sceneName, index)

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
	s.debugf("ensure-entry registered scene=%s index=%d", sceneName, index)
	return nil
}

func (s *Service) reconcilePool() error {
	s.mu.Lock()
	if !s.active {
		s.mu.Unlock()
		return nil
	}
	missingIndices := make([]int, 0)

	for index := range s.sceneNames {
		if index < 0 || index >= len(s.sceneNames) {
			continue
		}
		sceneName := s.sceneNames[index]
		if _, exists := s.pool[sceneName]; !exists {
			s.debugf("reconcile mark-missing scene=%s index=%d", sceneName, index)
			missingIndices = append(missingIndices, index)
		}
	}
	s.mu.Unlock()

	for _, index := range missingIndices {
		if err := s.ensureEntry(index); err != nil {
			return err
		}
	}
	if s.scheduler != nil {
		s.scheduler.requestLayout(120 * time.Millisecond)
	}
	return nil
}

func (s *Service) releaseEntry(entry *poolEntry) {
	if entry == nil {
		return
	}
	s.debugf("release-entry scene=%s hwnd=%#x pid=%d", entry.sceneName, entry.hwnd, entryPID(entry))
	if entry.hwnd != 0 {
		_ = windowctrl.SendWindowToPoolLayer(entry.hwnd)
	}
	s.markEntryStackedBelow(entry.sceneName, 0)
	go func(entry *poolEntry) {
		time.Sleep(1500 * time.Millisecond)
		if entry.hwnd != 0 {
			_ = windowctrl.MinimizeWindow(entry.hwnd)
		}
		time.Sleep(120 * time.Millisecond)
		if entry.hwnd != 0 {
			_ = windowctrl.CloseWindow(entry.hwnd)
		}
		if entry.process != nil {
			_ = entry.process.stop()
		}
		s.debugf("release-entry completed scene=%s", entry.sceneName)
	}(entry)
}

func (s *Service) sceneNameAt(index int) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if index < 0 || index >= len(s.sceneNames) {
		return ""
	}
	return s.sceneNames[index]
}

func entryPID(entry *poolEntry) int {
	if entry == nil || entry.process == nil {
		return 0
	}
	return entry.process.pid
}
