package screeningzoom

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"sync"

	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
)

type Service struct {
	mu            sync.Mutex
	helperPath    string
	helperMissing bool
	cmd           *exec.Cmd
	stdin         io.WriteCloser
	targetHWND    uintptr
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) SetTargetWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.targetHWND == hwnd && s.cmd != nil {
		return nil
	}

	if err := s.ensureProcessLocked(hwnd); err != nil {
		return err
	}
	if s.cmd == nil {
		s.targetHWND = hwnd
		return nil
	}

	s.targetHWND = hwnd
	return s.sendLocked(command{
		Type:       "set-target",
		TargetHWND: uint64(hwnd),
	})
}

func (s *Service) SetSourceRect(rect Rect) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureProcessLocked(s.targetHWND); err != nil {
		return err
	}
	if s.cmd == nil {
		return nil
	}

	rectCopy := rect
	return s.sendLocked(command{
		Type: "set-source-rect",
		Rect: &rectCopy,
	})
}

func (s *Service) ClearSourceRect() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureProcessLocked(s.targetHWND); err != nil {
		return err
	}
	if s.cmd == nil {
		return nil
	}

	return s.sendLocked(command{Type: "clear-source-rect"})
}

func (s *Service) Status() (Status, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	helperPath, err := s.helperPathLocked()
	if err != nil {
		return Status{}, err
	}

	return Status{
		Available:  helperPath != "",
		Running:    s.cmd != nil,
		HelperPath: helperPath,
		TargetHWND: s.targetHWND,
	}, nil
}

func (s *Service) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var errs []error
	if s.stdin != nil {
		if err := s.sendLocked(command{Type: "exit"}); err != nil {
			errs = append(errs, err)
		}
		if err := s.stdin.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if s.cmd != nil && s.cmd.Process != nil {
		if err := s.cmd.Process.Kill(); err != nil {
			errs = append(errs, err)
		}
	}

	s.cmd = nil
	s.stdin = nil
	s.targetHWND = 0

	return errors.Join(errs...)
}

func (s *Service) ensureProcessLocked(initialTarget uintptr) error {
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

	cmd := exec.Command(
		helperPath,
		"--plotkitycat",
		"--control-mode=stdin-json",
		"--target-hwnd="+strconv.FormatUint(uint64(initialTarget), 10),
	)
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("create screeningzoom stdin pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		return fmt.Errorf("start screeningzoom helper: %w", err)
	}

	s.cmd = cmd
	s.stdin = stdin
	go func(process *exec.Cmd) {
		_ = process.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.cmd == process {
			s.cmd = nil
			s.stdin = nil
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

func (s *Service) sendLocked(payload command) error {
	if s.stdin == nil {
		return nil
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	_, err = s.stdin.Write(data)
	return err
}
