package paths

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindAppRootFromBuildBinUsesProjectRoot(t *testing.T) {
	root := t.TempDir()
	touch(t, filepath.Join(root, "go.mod"))
	touch(t, filepath.Join(root, "wails.json"))
	buildBin := filepath.Join(root, "build", "bin")
	if err := os.MkdirAll(buildBin, 0o755); err != nil {
		t.Fatalf("MkdirAll(buildBin) error = %v", err)
	}

	got := findAppRoot(buildBin)
	if got != root {
		t.Fatalf("findAppRoot(buildBin) = %q, want %q", got, root)
	}
}

func TestFindAppRootCanUseRuntimeRoot(t *testing.T) {
	root := t.TempDir()
	touch(t, filepath.Join(root, "runtime", "Scripts", "python.exe"))
	buildBin := filepath.Join(root, "build", "bin")
	if err := os.MkdirAll(buildBin, 0o755); err != nil {
		t.Fatalf("MkdirAll(buildBin) error = %v", err)
	}

	got := findAppRoot(buildBin)
	if got != root {
		t.Fatalf("findAppRoot(buildBin) = %q, want %q", got, root)
	}
}

func touch(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte{}, 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}
