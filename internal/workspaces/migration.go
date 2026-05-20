package workspaces

import (
	"os"
	"path/filepath"
	"strings"
)

func migrateLegacyScenes(root string) error {
	defaultPath := filepath.Join(root, DefaultName)
	if err := moveLegacyDefaultScene(root, defaultPath); err != nil {
		return err
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if isLegacyPythonFile(entry) {
			if err := moveLegacyPythonFile(root, defaultPath, entry.Name()); err != nil {
				return err
			}
			continue
		}
		if entry.IsDir() && entry.Name() != DefaultName {
			if err := moveLegacySceneDir(root, defaultPath, entry.Name()); err != nil {
				return err
			}
		}
	}

	return nil
}

func moveLegacyDefaultScene(root string, defaultPath string) error {
	if !isSceneDir(defaultPath) {
		return nil
	}

	legacyScenePath := nextAvailablePath(root, DefaultName+" 旧场景")
	if err := os.Rename(defaultPath, legacyScenePath); err != nil {
		return err
	}
	if err := os.MkdirAll(defaultPath, 0o755); err != nil {
		return err
	}
	return os.Rename(legacyScenePath, nextAvailablePath(defaultPath, DefaultName))
}

func moveLegacyPythonFile(root string, defaultPath string, filename string) error {
	if err := os.MkdirAll(defaultPath, 0o755); err != nil {
		return err
	}

	sceneName := strings.TrimSuffix(filename, filepath.Ext(filename))
	targetPath := nextAvailablePath(defaultPath, sceneName)
	if err := os.MkdirAll(targetPath, 0o755); err != nil {
		return err
	}
	if err := os.Rename(filepath.Join(root, filename), filepath.Join(targetPath, sceneMainFile)); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(targetPath, sceneAssetsDir), 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(targetPath, sceneNoteFile), []byte(""), 0o644)
}

func moveLegacySceneDir(root string, defaultPath string, name string) error {
	sourcePath := filepath.Join(root, name)
	if !isSceneDir(sourcePath) {
		return nil
	}
	if err := os.MkdirAll(defaultPath, 0o755); err != nil {
		return err
	}
	return os.Rename(sourcePath, nextAvailablePath(defaultPath, name))
}

func isLegacyPythonFile(entry os.DirEntry) bool {
	return !entry.IsDir() && strings.EqualFold(filepath.Ext(entry.Name()), ".py")
}
