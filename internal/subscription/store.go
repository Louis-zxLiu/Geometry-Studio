package subscription

import (
	"encoding/json"
	"os"
	"path/filepath"

	"plotkitycat/internal/paths"
)

type Store struct{}

func NewStore() *Store {
	return &Store{}
}

func (s *Store) Load() (CacheState, error) {
	path, err := s.filePath()
	if err != nil {
		return CacheState{}, err
	}

	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return CacheState{}, nil
		}

		return CacheState{}, err
	}

	var state CacheState
	if err := json.Unmarshal(content, &state); err != nil {
		return CacheState{}, err
	}

	return state, nil
}

func (s *Store) Save(state CacheState) error {
	path, err := s.filePath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	content, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, content, 0o644)
}

func (s *Store) filePath() (string, error) {
	dir, err := paths.ConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(dir, "subscription.json"), nil
}
