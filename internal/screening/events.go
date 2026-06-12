package screening

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
