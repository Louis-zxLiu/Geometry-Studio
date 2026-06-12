package screening

import (
	"sync"
	"time"

	"plotkitycat/internal/workspaces"
)

type runController interface {
	IsRunning() bool
	Stop() (bool, error)
}

type Callbacks struct {
	OnError        func(error)
	OnStateChanged func(SessionState)
	OnStopped      func(SessionState)
}

type poolEntry struct {
	sceneName    string
	index        int
	process      *sceneProcess
	hwnd         uintptr
	windowReady  bool
	frameReady   bool
	frameReadyAt time.Time
	activatedAt  time.Time
	stackedBelow uintptr
}

type Service struct {
	mu            sync.Mutex
	workspaces    *workspaces.Manager
	runner        runController
	callbacks     Callbacks
	scheduler     *scheduler
	active        bool
	sceneNames    []string
	currentIndex  int
	poolSize      int
	animation     Animation
	pool          map[string]*poolEntry
	navInProgress bool
	stopping      bool
}

func NewService(workspaces *workspaces.Manager, runner runController, callbacks Callbacks) *Service {
	service := &Service{
		workspaces: workspaces,
		runner:     runner,
		callbacks:  callbacks,
		pool:       map[string]*poolEntry{},
	}
	service.scheduler = newScheduler(service)
	return service
}

func (s *Service) State() SessionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stateLocked()
}

func (s *Service) Next() (SessionState, error) {
	if s.scheduler != nil {
		s.scheduler.requestNext()
	}
	return s.State(), nil
}

func (s *Service) Previous() (SessionState, error) {
	if s.scheduler != nil {
		s.scheduler.requestPrevious()
	}
	return s.State(), nil
}
