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
	OnContextMenu  func(sceneHwnd, ownerHwnd uintptr)

	// DrawActive reports whether the zoom helper's draw/pen mode is on. The
	// global mouse hook uses this to decide whether a right-click should pop
	// the context menu or instead exit draw mode directly (because in draw
	// mode ZoomIt owns the mouse and our menu could never be shown).
	DrawActive func() bool
	// ExitDraw turns draw mode off. Called by the hook on right-click while
	// DrawActive() is true.
	ExitDraw func()
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
	retiring      map[string]struct{}
	navInProgress bool
	stopping      bool
}

func NewService(workspaces *workspaces.Manager, runner runController, callbacks Callbacks) *Service {
	service := &Service{
		workspaces: workspaces,
		runner:     runner,
		callbacks:  callbacks,
		pool:       map[string]*poolEntry{},
		retiring:   map[string]struct{}{},
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
	return s.State(), nil
}
