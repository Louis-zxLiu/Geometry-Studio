package ai

import (
	"embed"
	"io/fs"
	"os"
	"path"
	"path/filepath"
)

//go:embed prompts/generate/*.txt prompts/optimize/*.txt
var embeddedPrompts embed.FS

type PromptRepository struct {
	basePath string
	fsys     fs.FS
}

func NewPromptRepository(basePath string) *PromptRepository {
	return &PromptRepository{
		basePath: basePath,
		fsys:     embeddedPrompts,
	}
}

func (r *PromptRepository) Load(name string) string {
	if content := loadPromptFromDisk(r.basePath, name); content != "" {
		return content
	}

	content, err := fs.ReadFile(r.fsys, path.Join("prompts", filepath.ToSlash(name)))
	if err != nil {
		return ""
	}

	return string(content)
}

func loadPromptFromDisk(basePath string, name string) string {
	if basePath == "" {
		return ""
	}

	content, err := os.ReadFile(filepath.Join(basePath, name))
	if err != nil {
		return ""
	}

	return string(content)
}
