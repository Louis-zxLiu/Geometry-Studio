package workspaces

import (
	"os"
	"path/filepath"
	"sort"

	"plotkitycat/internal/paths"
)

func scriptsRoot() (string, error) {
	return paths.ScriptsDir()
}

func ensureRoot() (string, error) {
	root, err := scriptsRoot()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	return root, nil
}

func listWorkspaces(root string) ([]Workspace, error) {
	names, err := listWorkspaceNames(root)
	if err != nil {
		return nil, err
	}

	items := make([]Workspace, 0, len(names))
	for _, name := range names {
		count, err := countScenes(filepath.Join(root, name))
		if err != nil {
			return nil, err
		}
		items = append(items, Workspace{Name: name, SceneCount: count})
	}
	return items, nil
}

func listWorkspaceNames(root string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(root, entry.Name())
		if isSceneDir(path) {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	return names, nil
}

func chooseInitialWorkspace(names []string) string {
	if contains(names, DefaultName) {
		return DefaultName
	}
	return names[0]
}

func countScenes(workspaceDir string) (int, error) {
	entries, err := os.ReadDir(workspaceDir)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, entry := range entries {
		if entry.IsDir() && isSceneDir(filepath.Join(workspaceDir, entry.Name())) {
			count++
		}
	}
	return count, nil
}

func isSceneDir(path string) bool {
	info, err := os.Stat(filepath.Join(path, sceneMainFile))
	return err == nil && !info.IsDir()
}
