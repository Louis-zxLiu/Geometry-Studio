package screeningzoom

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"unsafe"

	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
)

type Service struct {
	mu             sync.Mutex
	helperPath     string
	helperMissing  bool
	cmd            *exec.Cmd
	liveZoomActive bool
	drawActive     bool
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
	s.liveZoomActive = false
	s.drawActive = false
	return nil
}

func (s *Service) LiveZoomActive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.liveZoomActive
}

func (s *Service) ToggleLiveZoom() error {
	if err := s.sendZoomitHotkey(zoomitHotkeyLiveZoom); err != nil {
		return err
	}
	s.mu.Lock()
	s.liveZoomActive = !s.liveZoomActive
	s.drawActive = false
	s.mu.Unlock()
	return nil
}

func (s *Service) ToggleDraw() error {
	if err := s.sendZoomitHotkey(zoomitHotkeyDraw); err != nil {
		return err
	}
	s.mu.Lock()
	s.drawActive = !s.drawActive
	s.mu.Unlock()
	return nil
}

// DrawActive reports whether ZoomIt pen/draw mode is currently on. The global
// mouse hook consults this during screening: a right-click while draw mode is
// active is consumed by ZoomIt's fullscreen capture window and cannot pop our
// own menu, so instead of showing a menu (which would never appear) we exit
// draw mode directly.
func (s *Service) DrawActive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.drawActive
}

// ExitDraw turns draw mode off (if on) by re-sending the draw hotkey. Returns
// whether it actually toggled.
func (s *Service) ExitDraw() bool {
	s.mu.Lock()
	wasActive := s.drawActive
	s.mu.Unlock()
	if !wasActive {
		return false
	}
	if err := s.ToggleDraw(); err != nil {
		return false
	}
	return true
}

func (s *Service) ShowContextMenu(ownerHwnd uintptr) string {
	s.mu.Lock()
	liveActive := s.liveZoomActive
	drawActive := s.drawActive
	s.mu.Unlock()
	return showZoomitContextMenu(ownerHwnd, liveActive, drawActive)
}

// ---- internal --------------------------------------------------------------

const (
	zoomitHotkeyBase     = 0x5A00
	zoomitHotkeyLiveZoom = zoomitHotkeyBase + 1 // 0x5A01
	zoomitHotkeyDraw     = zoomitHotkeyBase + 2 // 0x5A02
)

var (
	libUser32        = syscall.NewLazyDLL("user32.dll")
	procFindWindowW  = libUser32.NewProc("FindWindowW")
	procPostMessageW = libUser32.NewProc("PostMessageW")
)

const (
	WM_HOTKEY = 0x0312
)

func (s *Service) findZoomitWindow() (uintptr, error) {
	className, _ := syscall.UTF16PtrFromString("ZoomItOwner")
	hwnd, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(className)), 0)
	if hwnd == 0 {
		return 0, fmt.Errorf("zoomit 进程未运行")
	}
	return hwnd, nil
}

func (s *Service) sendZoomitHotkey(id uintptr) error {
	hwnd, err := s.findZoomitWindow()
	if err != nil {
		return err
	}
	procPostMessageW.Call(hwnd, WM_HOTKEY, id, 0)
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

	_ = ensureZoomitSettings()

	cmd := exec.Command(helperPath)
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start zoomit helper: %w", err)
	}

	s.cmd = cmd
	s.liveZoomActive = false
	s.drawActive = false
	go func(process *exec.Cmd) {
		_ = process.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.cmd == process {
			s.cmd = nil
			s.liveZoomActive = false
			s.drawActive = false
		}
	}(cmd)

	return nil
}

func (s *Service) helperPathLocked() (string, error) {
	if s.helperPath != "" || s.helperMissing {
		return s.helperPath, nil
	}

	helperPath, err := paths.ScreeningZoomExecutablePath()
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

func zoomitSettingsDir() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("APPDATA 环境变量未设置")
	}
	dir := filepath.Join(appData, "zoomit")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

func ensureZoomitSettings() error {
	dir, err := zoomitSettingsDir()
	if err != nil {
		return err
	}

	settings := map[string]interface{}{
		"autoStart":      false,
		"penWidth":       5,
		"zoomHotkey":     map[string]int{"mods": 0, "vk": 0},
		"liveZoomHotkey": map[string]int{"mods": 0, "vk": 0},
		"drawHotkey":     map[string]int{"mods": 0, "vk": 0},
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(dir, "settings.json"), data, 0644)
}
