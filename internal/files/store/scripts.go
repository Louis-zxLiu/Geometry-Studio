package store

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (s *Store) ListScripts() ([]string, error) {
	dir, err := s.ensureScriptsDir()
	if err != nil {
		return nil, err
	}

	if err := s.migrateLegacyScripts(dir); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var scenes []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		sceneName := entry.Name()
		if _, err := os.Stat(filepath.Join(dir, sceneName, sceneMainFile)); err == nil {
			scenes = append(scenes, sceneName)
		}
	}

	sort.Strings(scenes)
	return s.sortScenesBySavedOrder(dir, scenes)
}

func (s *Store) ReadScript(sceneName string) (string, error) {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return "", err
	}

	content, err := os.ReadFile(filepath.Join(scenePath, sceneMainFile))
	if err != nil {
		return "", err
	}

	return string(content), nil
}

func (s *Store) CreateScript(sceneName string) (string, error) {
	name := normalizeSceneName(sceneName)
	scenePath, err := s.scenePath(name)
	if err != nil {
		return "", err
	}

	if _, err := os.Stat(scenePath); err == nil {
		return name, nil
	} else if !os.IsNotExist(err) {
		return "", err
	}

	if err := os.MkdirAll(filepath.Join(scenePath, sceneAssetsDir), 0o755); err != nil {
		return "", err
	}

	if err := os.WriteFile(filepath.Join(scenePath, sceneMainFile), []byte(defaultScriptTemplate(name)), 0o644); err != nil {
		return "", err
	}

	if err := os.WriteFile(filepath.Join(scenePath, sceneNoteFile), []byte(""), 0o644); err != nil {
		return "", err
	}

	if err := s.appendSceneOrder(filepath.Dir(scenePath), name); err != nil {
		return "", err
	}

	return name, nil
}

func (s *Store) SaveScript(sceneName string, code string) (string, error) {
	name := normalizeSceneName(sceneName)
	scenePath, err := s.scenePath(name)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(scenePath, 0o755); err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Join(scenePath, sceneAssetsDir), 0o755); err != nil {
		return "", err
	}

	if err := os.WriteFile(filepath.Join(scenePath, sceneMainFile), []byte(code), 0o644); err != nil {
		return "", err
	}

	if _, err := os.Stat(filepath.Join(scenePath, sceneNoteFile)); os.IsNotExist(err) {
		if err := os.WriteFile(filepath.Join(scenePath, sceneNoteFile), []byte(""), 0o644); err != nil {
			return "", err
		}
	}

	return name, nil
}

func (s *Store) RenameScript(oldSceneName string, newSceneName string) (string, error) {
	oldName := normalizeSceneName(oldSceneName)
	newName := normalizeSceneName(newSceneName)
	if oldName == newName {
		return newName, nil
	}

	oldPath, err := s.scenePath(oldName)
	if err != nil {
		return "", err
	}

	newPath, err := s.scenePath(newName)
	if err != nil {
		return "", err
	}

	if _, err := os.Stat(oldPath); err != nil {
		return "", err
	}

	if _, err := os.Stat(newPath); err == nil {
		return "", fmt.Errorf("scene %q already exists", newName)
	} else if !os.IsNotExist(err) {
		return "", err
	}

	if err := os.Rename(oldPath, newPath); err != nil {
		return "", err
	}

	dir, err := s.ensureScriptsDir()
	if err != nil {
		return "", err
	}
	if err := s.renameSceneOrder(dir, oldName, newName); err != nil {
		return "", err
	}

	return newName, nil
}

func (s *Store) DeleteScript(sceneName string) error {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return err
	}

	if err := os.RemoveAll(scenePath); err != nil {
		return err
	}

	dir, err := s.ensureScriptsDir()
	if err != nil {
		return err
	}

	return s.removeSceneOrder(dir, normalizeSceneName(sceneName))
}

func (s *Store) ReorderScripts(scenes []string) error {
	dir, err := s.ensureScriptsDir()
	if err != nil {
		return err
	}

	existingScenes, err := s.ListScripts()
	if err != nil {
		return err
	}

	return s.writeSceneOrder(dir, mergeSceneOrder(existingScenes, scenes))
}

func (s *Store) SceneMainPath(sceneName string) (string, error) {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return "", err
	}

	return filepath.Join(scenePath, sceneMainFile), nil
}

func (s *Store) SceneDir(sceneName string) (string, error) {
	return s.scenePath(sceneName)
}

func (s *Store) ensureScriptsDir() (string, error) {
	dir, err := s.workspaces.CurrentDir()
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	return dir, nil
}

func (s *Store) scenePath(sceneName string) (string, error) {
	dir, err := s.ensureScriptsDir()
	if err != nil {
		return "", err
	}

	name := normalizeSceneName(sceneName)
	if name == "" {
		return "", fmt.Errorf("scene name is empty")
	}

	return filepath.Join(dir, name), nil
}

func (s *Store) migrateLegacyScripts(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".py") {
			continue
		}

		oldPath := filepath.Join(dir, entry.Name())
		sceneName := normalizeSceneName(strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		scenePath := filepath.Join(dir, sceneName)
		scenePath = s.nextScenePath(dir, scenePath)

		if err := os.MkdirAll(filepath.Join(scenePath, sceneAssetsDir), 0o755); err != nil {
			return err
		}

		if err := os.Rename(oldPath, filepath.Join(scenePath, sceneMainFile)); err != nil {
			return err
		}

		if err := os.WriteFile(filepath.Join(scenePath, sceneNoteFile), []byte(""), 0o644); err != nil {
			return err
		}

		if err := s.appendSceneOrder(dir, filepath.Base(scenePath)); err != nil {
			return err
		}
	}

	return nil
}

func (s *Store) nextScenePath(root string, initialPath string) string {
	if _, err := os.Stat(initialPath); os.IsNotExist(err) {
		return initialPath
	}

	baseName := filepath.Base(initialPath)
	for index := 2; ; index++ {
		nextPath := filepath.Join(root, fmt.Sprintf("%s 副本%d", baseName, index))
		if _, err := os.Stat(nextPath); os.IsNotExist(err) {
			return nextPath
		}
	}
}
