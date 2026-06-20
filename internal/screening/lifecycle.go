package screening

import (
	"errors"
	"time"

	"plotkitycat/internal/windowctrl"
)

func (s *Service) Start(request StartRequest) (SessionState, error) {
	sceneNames, startIndex, poolSize, animation, err := normalizeStartRequest(request)
	if err != nil {
		return SessionState{}, err
	}

	if err := s.stopRegularRun(); err != nil {
		return SessionState{}, err
	}

	if _, err := s.Stop(); err != nil {
		return SessionState{}, err
	}

	s.activateSession(sceneNames, startIndex, poolSize, animation)
	state := s.State()

	s.installContextMenuHook()

	if err := s.createPool(); err != nil {
		_, _ = s.Stop()
		return SessionState{}, err
	}
	if s.scheduler != nil {
		s.scheduler.requestLayout(120 * time.Millisecond)
	}

	s.emitStateChange()
	return state, nil
}

func (s *Service) Stop() (StopResult, error) {
	entries, state, shouldStop, alreadyStopping := s.deactivateSession()
	if alreadyStopping {
		return StopResult{Handled: true, Message: "正在停止放映会话"}, nil
	}
	if !shouldStop {
		return StopResult{Handled: false, Message: "当前没有放映会话"}, nil
	}

	for _, entry := range entries {
		if entry.hwnd != 0 {
			_ = windowctrl.CloseWindow(entry.hwnd)
		}
		if entry.process != nil {
			_ = entry.process.stop()
		}
	}

	s.mu.Lock()
	s.stopping = false
	s.mu.Unlock()
	s.uninstallContextMenuHook()
	s.emitStopped(state)

	return StopResult{
		Handled: true,
		Message: "放映已停止",
	}, nil
}

func (s *Service) stopRegularRun() error {
	if s.runner == nil || !s.runner.IsRunning() {
		return nil
	}

	handled, err := s.runner.Stop()
	if err != nil {
		return err
	}
	if !handled {
		return nil
	}

	deadline := time.Now().Add(5 * time.Second)
	for s.runner.IsRunning() && time.Now().Before(deadline) {
		time.Sleep(120 * time.Millisecond)
	}
	if s.runner.IsRunning() {
		return errors.New("停止当前运行超时，无法进入放映模式")
	}
	return nil
}

func (s *Service) activateSession(sceneNames []string, startIndex int, poolSize int, animation Animation) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.active = true
	s.stopping = false
	s.sceneNames = sceneNames
	s.currentIndex = startIndex
	s.poolSize = poolSize
	s.animation = animation
	s.pool = map[string]*poolEntry{}
}

func (s *Service) deactivateSession() (entries []*poolEntry, state SessionState, shouldStop bool, alreadyStopping bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.active && len(s.pool) == 0 {
		return nil, SessionState{}, false, false
	}
	if s.stopping {
		return nil, SessionState{}, false, true
	}

	s.stopping = true
	entries = make([]*poolEntry, 0, len(s.pool))
	for _, entry := range s.pool {
		entries = append(entries, entry)
	}
	s.pool = map[string]*poolEntry{}
	s.active = false
	s.sceneNames = nil
	s.currentIndex = 0
	s.navInProgress = false

	return entries, s.stateLocked(), true, false
}
