package ai

import (
	"embed"
	"io/fs"
	"os"
	"path"
	"path/filepath"
)

//go:embed prompts/*.txt prompts/design/*.txt prompts/repair/*.txt
var embeddedPrompts embed.FS

type PromptRepository struct {
	basePath string
	fsys     fs.FS
}

type PromptTemplate struct {
	Name    string
	Content string
	Source  string
}

func NewPromptRepository(basePath string) *PromptRepository {
	return &PromptRepository{
		basePath: basePath,
		fsys:     embeddedPrompts,
	}
}

func (r *PromptRepository) Load(name string) string {
	return r.LoadResolved(name).Content
}

func (r *PromptRepository) LoadResolved(name string) PromptTemplate {
	if strings := loadPromptFromDisk(r.basePath, name); strings != "" {
		return PromptTemplate{
			Name:    name,
			Content: strings,
			Source:  "disk",
		}
	}

	content, err := fs.ReadFile(r.fsys, path.Join("prompts", filepath.ToSlash(name)))
	if err != nil {
		return PromptTemplate{
			Name:   name,
			Source: "missing",
		}
	}

	return PromptTemplate{
		Name:    name,
		Content: string(content),
		Source:  "embedded",
	}
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
