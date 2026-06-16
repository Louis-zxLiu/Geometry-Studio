package screeningzoom

import (
	"fmt"
	"os/exec"
	"sync"

	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
)

type Service struct {
	mu            sync.Mutex
	helperPath    string
	helperMissing bool
	cmd           *exec.Cmd
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) EnsureStarted() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.ensureProcessLocked()
}

func (s *Service) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cmd != nil && s.cmd.Process != nil {
		if err := s.cmd.Process.Kill(); err != nil {
			return err
		}
	}

	s.cmd = nil
	return nil
}

func (s *Service) ensureProcessLocked() error {
	if s.cmd != nil {
		return nil
	}

	helperPath, err := s.helperPathLocked()
	if err != nil || helperPath == "" {
		return err
	}
	if s.helperMissing {
		return nil
	}

	cmd := exec.Command(helperPath, "--plotkitycat")
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start screeningzoom helper: %w", err)
	}

	s.cmd = cmd
	go func(process *exec.Cmd) {
		_ = process.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.cmd == process {
			s.cmd = nil
		}
	}(cmd)

	return nil
}

func (s *Service) helperPathLocked() (string, error) {
	if s.helperPath != "" || s.helperMissing {
		return s.helperPath, nil
	}

	helperPath, err := paths.ScreeningZoomHelperPath()
	if err != nil {
		return "", err
	}
	if helperPath == "" {
		s.helperMissing = true
		return "", nil
	}

	s.helperPath = helperPath
	return helperPath, nil
}
