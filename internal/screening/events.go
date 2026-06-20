package screening

import (
	"fmt"
	"os"
)

func (s *Service) emitStateChange() {
	if s.callbacks.OnStateChanged == nil {
		return
	}
	s.callbacks.OnStateChanged(s.State())
}

func (s *Service) emitStopped(state SessionState) {
	if s.callbacks.OnStopped != nil {
		s.callbacks.OnStopped(state)
		return
	}
	if s.callbacks.OnStateChanged != nil {
		s.callbacks.OnStateChanged(state)
	}
}

func (s *Service) emitError(err error) {
	if err == nil || s.callbacks.OnError == nil {
		return
	}
	s.callbacks.OnError(err)
}

func (s *Service) debugf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[screening] "+format+"\n", args...)
}

func (s *Service) emitContextMenu(sceneHwnd, ownerHwnd uintptr) {
	s.debugf("emitContextMenu scene=%#x owner=%#x hasCb=%v", sceneHwnd, ownerHwnd, s.callbacks.OnContextMenu != nil)
	if s.callbacks.OnContextMenu != nil {
		s.callbacks.OnContextMenu(sceneHwnd, ownerHwnd)
	}
}
