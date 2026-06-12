package screening

import (
	"sync"

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
	sceneName string
	index     int
	process   *sceneProcess
	hwnd      uintptr
	ready     bool
}

type Service struct {
	mu            sync.Mutex
	workspaces    *workspaces.Manager
	runner        runController
	callbacks     Callbacks
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
	return &Service{
		workspaces: workspaces,
		runner:     runner,
		callbacks:  callbacks,
		pool:       map[string]*poolEntry{},
	}
}

func (s *Service) State() SessionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stateLocked()
}

func (s *Service) Next() (SessionState, error) {
	return s.navigate(1)
}

func (s *Service) Previous() (SessionState, error) {
	return s.navigate(-1)
}
