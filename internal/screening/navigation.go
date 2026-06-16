package screening

import (
	"errors"
	"fmt"
	"slices"
	"time"

	"plotkitycat/internal/windowctrl"
)

func (s *Service) handleSchedulerCommand(cmd schedulerCommand) {
	switch cmd.kind {
	case schedulerCommandLayout:
		s.debugf("scheduler layout tick")
		if err := s.syncVisibleWindow(); err != nil {
			s.debugf("scheduler layout skipped err=%v", err)
		}
	case schedulerCommandNext:
		s.debugf("scheduler next tick")
		if s.finishOnNextAtEnd() {
			return
		}
		if _, err := s.navigate(1); err != nil {
			s.debugf("scheduler next failed err=%v", err)
		}
	case schedulerCommandPrev:
		s.debugf("scheduler prev tick")
		if _, err := s.navigate(-1); err != nil {
			s.debugf("scheduler prev failed err=%v", err)
		}
	}
}

func (s *Service) finishOnNextAtEnd() bool {
	s.mu.Lock()
	atEnd := s.active && len(s.sceneNames) > 0 && s.currentIndex >= len(s.sceneNames)-1
	s.mu.Unlock()
	if !atEnd {
		return false
	}

	s.debugf("next-at-end finishing session")
	if err := s.finishSessionAfterFinalPage(); err != nil {
		s.debugf("next-at-end finish failed err=%v", err)
	}
	return true
}

func (s *Service) finishSessionAfterFinalPage() error {
	sceneName, entry, animation, entries, state, shouldStop, alreadyStopping := s.finalPageFinishContext()
	if alreadyStopping || !shouldStop {
		return nil
	}

	if entry != nil && entry.hwnd != 0 {
		s.debugf("final-page animate-exit scene=%s hwnd=%#x animation=%s", sceneName, entry.hwnd, animation)
		if err := windowctrl.AnimateExit(entry.hwnd, windowctrl.Animation(animation)); err != nil {
			return err
		}
	}

	for _, poolEntry := range entries {
		s.releaseEntryWithoutPooling(poolEntry)
	}

	s.mu.Lock()
	s.stopping = false
	s.mu.Unlock()
	s.emitStopped(state)
	s.debugf("final-page finish completed")
	return nil
}

func (s *Service) finalPageFinishContext() (string, *poolEntry, Animation, []*poolEntry, SessionState, bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active && len(s.pool) == 0 {
		return "", nil, "", nil, SessionState{}, false, false
	}
	if s.stopping {
		return "", nil, "", nil, SessionState{}, false, true
	}

	currentScene := ""
	if s.currentIndex >= 0 && s.currentIndex < len(s.sceneNames) {
		currentScene = s.sceneNames[s.currentIndex]
	}
	currentEntry := s.pool[currentScene]
	animation := s.animation

	s.stopping = true
	entries := make([]*poolEntry, 0, len(s.pool))
	for _, entry := range s.pool {
		entries = append(entries, entry)
	}
	s.pool = map[string]*poolEntry{}
	s.active = false
	s.sceneNames = nil
	s.currentIndex = 0
	s.navInProgress = false

	return currentScene, currentEntry, animation, entries, s.stateLocked(), true, false
}

func (s *Service) navigate(delta int) (SessionState, error) {
	targetIndex, state, ready, err := s.beginNavigation(delta)
	if err != nil || !ready {
		return state, err
	}
	s.debugf("navigate begin delta=%d targetIndex=%d", delta, targetIndex)

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
	s.debugf("navigate target ready from=%s to=%s fromHwnd=%#x toHwnd=%#x animation=%s", sceneNameOf(fromEntry), toEntry.sceneName, entryWindow(fromEntry), entryWindow(toEntry), animation)

	if err := windowctrl.AnimateTransition(entryWindow(fromEntry), entryWindow(toEntry), windowctrl.Animation(animation)); err != nil {
		return SessionState{}, err
	}
	s.markEntryActivated(toEntry.sceneName)
	s.emitTargetWindowChanged(toEntry.sceneName, toEntry.hwnd)
	if fromEntry != nil {
		s.markEntryStackedBelow(fromEntry.sceneName, entryWindow(toEntry))
	}

	s.mu.Lock()
	s.currentIndex = targetIndex
	state = s.stateLocked()
	s.mu.Unlock()

	if err := s.reconcilePool(); err != nil {
		return state, err
	}

	s.debugf("navigate committed current=%s index=%d", state.CurrentSceneName, state.CurrentIndex)
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
		s.debugf("navigate skipped reason=in-progress")
		return 0, s.stateLocked(), false, nil
	}

	targetIndex = s.currentIndex + delta
	if targetIndex < 0 || targetIndex >= len(s.sceneNames) {
		s.debugf("navigate skipped reason=out-of-range targetIndex=%d", targetIndex)
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
	s.debugf("sync-visible current=%s entries=%d", currentScene, len(entries))
	if err := s.waitUntilReady(currentScene, 8*time.Second); err != nil {
		return err
	}

	if s.needsActivation(currentEntry.sceneName) {
		if err := windowctrl.ActivateWindow(currentEntry.hwnd); err != nil {
			return err
		}
		s.markEntryActivated(currentEntry.sceneName)
		s.emitTargetWindowChanged(currentEntry.sceneName, currentEntry.hwnd)
		s.debugf("activate current scene=%s hwnd=%#x", currentEntry.sceneName, currentEntry.hwnd)
	}

	anchor := currentEntry.hwnd
	for _, entry := range orderedStackEntries(entries, currentScene) {
		if entry.hwnd == 0 || !entry.windowReady {
			continue
		}
		if !s.needsStackBelow(entry.sceneName, anchor) {
			anchor = entry.hwnd
			continue
		}
		if err := windowctrl.StackWindowBelow(entry.hwnd, anchor); err != nil {
			return err
		}
		s.markEntryStackedBelow(entry.sceneName, anchor)
		s.debugf("stack below scene=%s hwnd=%#x anchor=%#x", entry.sceneName, entry.hwnd, anchor)
		anchor = entry.hwnd
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
		ready := entry != nil &&
			entry.windowReady &&
			entry.frameReady &&
			entry.hwnd != 0 &&
			!entry.frameReadyAt.IsZero() &&
			time.Since(entry.frameReadyAt) >= 220*time.Millisecond
		s.mu.Unlock()
		if ready {
			s.debugf("wait-ready satisfied scene=%s hwnd=%#x warmFor=%s", sceneName, entry.hwnd, time.Since(entry.frameReadyAt).Round(10*time.Millisecond))
			return nil
		}
		time.Sleep(120 * time.Millisecond)
	}
	return fmt.Errorf("场景 %s 窗口准备超时", sceneName)
}

func (s *Service) markEntryActivated(sceneName string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.pool[sceneName]
	if entry != nil {
		entry.activatedAt = time.Now()
		entry.stackedBelow = 0
	}
}

func (s *Service) markEntryStackedBelow(sceneName string, anchor uintptr) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.pool[sceneName]
	if entry != nil {
		entry.stackedBelow = anchor
	}
}

func (s *Service) needsActivation(sceneName string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.pool[sceneName]
	return entry != nil && entry.activatedAt.IsZero()
}

func (s *Service) needsStackBelow(sceneName string, anchor uintptr) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.pool[sceneName]
	return entry != nil && entry.stackedBelow != anchor
}

func sceneNameOf(entry *poolEntry) string {
	if entry == nil {
		return ""
	}
	return entry.sceneName
}

func orderedStackEntries(entries []*poolEntry, currentScene string) []*poolEntry {
	ordered := make([]*poolEntry, 0, len(entries))
	for _, entry := range entries {
		if entry == nil || entry.sceneName == currentScene {
			continue
		}
		ordered = append(ordered, entry)
	}
	slices.SortFunc(ordered, func(a *poolEntry, b *poolEntry) int {
		return a.index - b.index
	})
	return ordered
}
