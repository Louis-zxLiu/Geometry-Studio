package pythonruntime

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveStandaloneRuntime(t *testing.T) {
	root := t.TempDir()
	touch(t, filepath.Join(root, "python.exe"))
	mkdir(t, filepath.Join(root, "Lib", "site-packages", "PyQt5", "Qt5", "bin"))
	mkdir(t, filepath.Join(root, "Lib", "site-packages", "PyQt5", "Qt5", "plugins", "platforms"))

	info, err := Resolve(root)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	if info.Layout != LayoutStandalone {
		t.Fatalf("Layout = %q, want %q", info.Layout, LayoutStandalone)
	}
	if got := filepath.Base(info.Python); got != "python.exe" {
		t.Fatalf("Python basename = %q, want python.exe", got)
	}
	if len(info.SitePackages) != 1 {
		t.Fatalf("SitePackages length = %d, want 1", len(info.SitePackages))
	}
	if info.QtPlatformsDir == "" {
		t.Fatalf("QtPlatformsDir is empty")
	}
}

func TestResolveVirtualEnvRuntime(t *testing.T) {
	root := t.TempDir()
	touch(t, filepath.Join(root, "Scripts", "python.exe"))
	mkdir(t, filepath.Join(root, "Lib", "site-packages", "numpy"))

	info, err := Resolve(root)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	if info.Layout != LayoutVirtualEnv {
		t.Fatalf("Layout = %q, want %q", info.Layout, LayoutVirtualEnv)
	}
	if got := filepath.ToSlash(PythonRelativePath(info)); got != "Scripts/python.exe" {
		t.Fatalf("PythonRelativePath = %q, want Scripts/python.exe", got)
	}
	if relativePath, exists := ModulePathExists(info, "numpy"); !exists || relativePath != "Lib/site-packages/numpy" {
		t.Fatalf("ModulePathExists(numpy) = %q, %t", relativePath, exists)
	}
}

func TestResolveMissingRuntime(t *testing.T) {
	_, err := Resolve(t.TempDir())
	if err == nil {
		t.Fatalf("Resolve() error = nil, want missing runtime error")
	}
	if !strings.Contains(err.Error(), "Scripts/python.exe") {
		t.Fatalf("Resolve() error = %q, want venv hint", err.Error())
	}
}

func TestBuildEnvPrependsRuntimePaths(t *testing.T) {
	root := t.TempDir()
	mkdir(t, filepath.Join(root, "Scripts"))
	mkdir(t, filepath.Join(root, "Lib", "site-packages"))
	mkdir(t, filepath.Join(root, "Lib", "site-packages", "PyQt5", "Qt5", "bin"))
	mkdir(t, filepath.Join(root, "Lib", "site-packages", "PyQt5", "Qt5", "plugins", "platforms"))

	info := Describe(root)
	env := BuildEnv(info)

	pathValue := envValue(env, "PATH")
	if !strings.Contains(pathValue, filepath.Join(root, "Scripts")) {
		t.Fatalf("PATH = %q, want Scripts directory", pathValue)
	}
	if got := envValue(env, "MPLBACKEND"); got != "Qt5Agg" {
		t.Fatalf("MPLBACKEND = %q, want Qt5Agg", got)
	}
	if got := envValue(env, "QT_QPA_PLATFORM_PLUGIN_PATH"); got == "" {
		t.Fatalf("QT_QPA_PLATFORM_PLUGIN_PATH is empty")
	}
	if got := envValue(env, "PYTHONPATH"); !strings.Contains(got, filepath.Join(root, "Lib", "site-packages")) {
		t.Fatalf("PYTHONPATH = %q, want site-packages", got)
	}
}

func touch(t *testing.T, path string) {
	t.Helper()
	mkdir(t, filepath.Dir(path))
	if err := os.WriteFile(path, []byte{}, 0o755); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}

func mkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", path, err)
	}
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) || strings.EqualFold(entry[:min(len(entry), len(prefix))], prefix) {
			parts := strings.SplitN(entry, "=", 2)
			if len(parts) == 2 {
				return parts[1]
			}
		}
	}
	return ""
}
