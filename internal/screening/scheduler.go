package screening

import (
	"sync"
	"time"
)

type schedulerCommandKind string

const (
	schedulerCommandLayout schedulerCommandKind = "layout"
	schedulerCommandNext   schedulerCommandKind = "next"
	schedulerCommandPrev   schedulerCommandKind = "prev"
)

type schedulerCommand struct {
	kind schedulerCommandKind
	at   time.Time
}

type scheduler struct {
	mu            sync.Mutex
	service       *Service
	ch            chan schedulerCommand
	layoutPending bool
	navPending    bool
	navExecuting  bool
}

func newScheduler(service *Service) *scheduler {
	s := &scheduler{
		service: service,
		ch:      make(chan schedulerCommand, 32),
	}
	go s.run()
	return s
}

func (s *scheduler) enqueue(kind schedulerCommandKind, delay time.Duration) {
	if !s.markPending(kind) {
		return
	}
	cmd := schedulerCommand{
		kind: kind,
		at:   time.Now().Add(delay),
	}
	select {
	case s.ch <- cmd:
	default:
		go func() {
			s.ch <- cmd
		}()
	}
}

func (s *scheduler) markPending(kind schedulerCommandKind) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch kind {
	case schedulerCommandLayout:
		if s.layoutPending {
			s.service.debugf("scheduler drop duplicate layout request")
			return false
		}
		s.layoutPending = true
		return true
	case schedulerCommandNext, schedulerCommandPrev:
		if s.navPending || s.navExecuting {
			s.service.debugf("scheduler drop navigation request kind=%s pending=%t executing=%t", kind, s.navPending, s.navExecuting)
			return false
		}
		s.navPending = true
		return true
	default:
		return true
	}
}

func (s *scheduler) begin(kind schedulerCommandKind) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch kind {
	case schedulerCommandLayout:
		s.layoutPending = false
	case schedulerCommandNext, schedulerCommandPrev:
		s.navPending = false
		s.navExecuting = true
	}
}

func (s *scheduler) end(kind schedulerCommandKind) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch kind {
	case schedulerCommandNext, schedulerCommandPrev:
		s.navExecuting = false
	}
}

func (s *scheduler) run() {
	for cmd := range s.ch {
		wait := time.Until(cmd.at)
		if wait > 0 {
			time.Sleep(wait)
		}
		s.begin(cmd.kind)
		s.service.handleSchedulerCommand(cmd)
		s.end(cmd.kind)
	}
}

func (s *scheduler) requestLayout(delay time.Duration) {
	s.enqueue(schedulerCommandLayout, delay)
}

func (s *scheduler) requestNext() {
	s.enqueue(schedulerCommandNext, 0)
}

func (s *scheduler) requestPrevious() {
	s.enqueue(schedulerCommandPrev, 0)
}
