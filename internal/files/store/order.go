package store

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func (s *Store) sortScenesBySavedOrder(dir string, scenes []string) ([]string, error) {
	manifest, err := s.readSceneOrder(dir)
	if err != nil {
		return nil, err
	}

	ordered := mergeSceneOrder(scenes, manifest.Scenes)
	if !equalSceneLists(ordered, manifest.Scenes) {
		if err := s.writeSceneOrder(dir, ordered); err != nil {
			return nil, err
		}
	}

	return ordered, nil
}

func (s *Store) appendSceneOrder(dir string, sceneName string) error {
	manifest, err := s.readSceneOrder(dir)
	if err != nil {
		return err
	}

	manifest.Scenes = dedupeSceneNames(append(manifest.Scenes, sceneName))
	return s.writeSceneOrder(dir, manifest.Scenes)
}

func (s *Store) renameSceneOrder(dir string, oldName string, newName string) error {
	manifest, err := s.readSceneOrder(dir)
	if err != nil {
		return err
	}

	next := make([]string, 0, len(manifest.Scenes))
	replaced := false
	for _, scene := range manifest.Scenes {
		if scene == oldName {
			if !replaced {
				next = append(next, newName)
				replaced = true
			}
			continue
		}
		if scene == newName {
			continue
		}
		next = append(next, scene)
	}
	if !replaced {
		next = append(next, newName)
	}

	return s.writeSceneOrder(dir, next)
}

func (s *Store) removeSceneOrder(dir string, sceneName string) error {
	manifest, err := s.readSceneOrder(dir)
	if err != nil {
		return err
	}

	next := make([]string, 0, len(manifest.Scenes))
	for _, scene := range manifest.Scenes {
		if scene != sceneName {
			next = append(next, scene)
		}
	}

	return s.writeSceneOrder(dir, next)
}

func (s *Store) readSceneOrder(dir string) (sceneOrderManifest, error) {
	path := filepath.Join(dir, sceneOrderFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return sceneOrderManifest{}, nil
		}
		return sceneOrderManifest{}, err
	}

	var manifest sceneOrderManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return sceneOrderManifest{}, err
	}

	return manifest, nil
}

func (s *Store) writeSceneOrder(dir string, scenes []string) error {
	manifest := sceneOrderManifest{Scenes: dedupeSceneNames(scenes)}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(dir, sceneOrderFile), data, 0o644)
}

func mergeSceneOrder(existingScenes []string, requestedOrder []string) []string {
	existingSet := make(map[string]struct{}, len(existingScenes))
	for _, scene := range existingScenes {
		existingSet[scene] = struct{}{}
	}

	ordered := make([]string, 0, len(existingScenes))
	seen := make(map[string]struct{}, len(existingScenes))
	for _, scene := range requestedOrder {
		if _, exists := existingSet[scene]; !exists {
			continue
		}
		if _, alreadySeen := seen[scene]; alreadySeen {
			continue
		}
		ordered = append(ordered, scene)
		seen[scene] = struct{}{}
	}

	for _, scene := range existingScenes {
		if _, alreadySeen := seen[scene]; alreadySeen {
			continue
		}
		ordered = append(ordered, scene)
	}

	return ordered
}

func dedupeSceneNames(scenes []string) []string {
	deduped := make([]string, 0, len(scenes))
	seen := make(map[string]struct{}, len(scenes))
	for _, scene := range scenes {
		if scene == "" {
			continue
		}
		if _, exists := seen[scene]; exists {
			continue
		}
		seen[scene] = struct{}{}
		deduped = append(deduped, scene)
	}

	return deduped
}

func equalSceneLists(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}

	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}

	return true
}
