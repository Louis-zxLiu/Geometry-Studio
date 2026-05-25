package codeversions

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"plotkitycat/internal/files"
)

const (
	historyFile = ".ai-code-versions.json"
	maxVersions = 50
)

type Version struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Note      string `json:"note"`
	Code      string `json:"code"`
	CreatedAt int64  `json:"createdAt"`
}

type Store struct {
	files *files.Store
}

func NewStore(fileStore *files.Store) *Store {
	return &Store{files: fileStore}
}

func (s *Store) List(sceneName string) ([]Version, error) {
	versions, err := s.read(sceneName)
	if err != nil {
		return nil, err
	}

	sort.SliceStable(versions, func(i, j int) bool {
		return versions[i].CreatedAt < versions[j].CreatedAt
	})
	return versions, nil
}

func (s *Store) Create(sceneName string, note string, code string) (Version, error) {
	note = strings.TrimSpace(note)
	if note == "" {
		note = "AI 优化版本"
	}
	if strings.TrimSpace(code) == "" {
		return Version{}, fmt.Errorf("版本代码为空，已取消保存")
	}

	versions, err := s.read(sceneName)
	if err != nil {
		return Version{}, err
	}

	now := time.Now()
	version := Version{
		ID:        fmt.Sprintf("%d", now.UnixNano()),
		Label:     fmt.Sprintf("版本%02d", len(versions)+1),
		Note:      note,
		Code:      code,
		CreatedAt: now.UnixMilli(),
	}
	versions = append(versions, version)
	if len(versions) > maxVersions {
		versions = versions[len(versions)-maxVersions:]
		versions = relabel(versions)
	}

	if err := s.write(sceneName, versions); err != nil {
		return Version{}, err
	}

	return version, nil
}

func (s *Store) Delete(sceneName string, id string) ([]Version, error) {
	versions, err := s.read(sceneName)
	if err != nil {
		return nil, err
	}

	next := make([]Version, 0, len(versions))
	for _, version := range versions {
		if version.ID != id {
			next = append(next, version)
		}
	}

	next = relabel(next)
	if err := s.write(sceneName, next); err != nil {
		return nil, err
	}

	return next, nil
}

func (s *Store) read(sceneName string) ([]Version, error) {
	path, err := s.historyPath(sceneName)
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []Version{}, nil
	}
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(string(content)) == "" {
		return []Version{}, nil
	}

	var versions []Version
	if err := json.Unmarshal(content, &versions); err != nil {
		return nil, fmt.Errorf("读取 AI 优化历史失败: %w", err)
	}

	return versions, nil
}

func (s *Store) write(sceneName string, versions []Version) error {
	path, err := s.historyPath(sceneName)
	if err != nil {
		return err
	}

	content, err := json.MarshalIndent(relabel(versions), "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, append(content, '\n'), 0o644)
}

func (s *Store) historyPath(sceneName string) (string, error) {
	sceneDir, err := s.files.SceneDir(sceneName)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(sceneDir, 0o755); err != nil {
		return "", err
	}

	return filepath.Join(sceneDir, historyFile), nil
}

func relabel(versions []Version) []Version {
	next := make([]Version, len(versions))
	copy(next, versions)
	sort.SliceStable(next, func(i, j int) bool {
		return next[i].CreatedAt < next[j].CreatedAt
	})
	for index := range next {
		next[index].Label = fmt.Sprintf("版本%02d", index+1)
	}

	return next
}
