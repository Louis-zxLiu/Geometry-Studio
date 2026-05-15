package ai

import (
	"os"
	"path/filepath"
)

type PromptRepository struct {
	basePath string
}

func NewPromptRepository(basePath string) *PromptRepository {
	return &PromptRepository{basePath: basePath}
}

func (r *PromptRepository) Load(name string) string {
	if r.basePath == "" {
		return ""
	}

	content, err := os.ReadFile(filepath.Join(r.basePath, name))
	if err != nil {
		return ""
	}

	return string(content)
}
