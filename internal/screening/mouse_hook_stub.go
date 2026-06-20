//go:build !windows

package screening

// no-op stubs: the global mouse hook is a Windows-only facility.

func (s *Service) installContextMenuHook() {}

func (s *Service) uninstallContextMenuHook() {}

func addSceneWindow(hwnd uintptr) {}

func removeSceneWindow(hwnd uintptr) {}
