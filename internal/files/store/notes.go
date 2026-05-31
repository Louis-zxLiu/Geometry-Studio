package store

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (s *Store) ReadNote(sceneName string) (NoteDocument, error) {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return NoteDocument{}, err
	}

	notePath := filepath.Join(scenePath, sceneNoteFile)
	markdownBytes, err := os.ReadFile(notePath)
	if err != nil && !os.IsNotExist(err) {
		return NoteDocument{}, err
	}

	assetsDir := filepath.Join(scenePath, sceneAssetsDir)
	images, err := s.readNoteImages(assetsDir)
	if err != nil {
		return NoteDocument{}, err
	}

	return NoteDocument{
		Markdown: string(markdownBytes),
		Images:   images,
	}, nil
}

func (s *Store) SaveNote(sceneName string, markdown string) error {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Join(scenePath, sceneAssetsDir), 0o755); err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(scenePath, sceneNoteFile), []byte(markdown), 0o644)
}

func (s *Store) AddNoteImages(sceneName string, images []NoteImage) (NoteDocument, error) {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return NoteDocument{}, err
	}

	assetsDir := filepath.Join(scenePath, sceneAssetsDir)
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		return NoteDocument{}, err
	}

	notePath := filepath.Join(scenePath, sceneNoteFile)
	markdownBytes, err := os.ReadFile(notePath)
	if err != nil && !os.IsNotExist(err) {
		return NoteDocument{}, err
	}

	insertedReferences := make([]string, 0, len(images))
	for _, image := range images {
		if strings.TrimSpace(image.DataURL) == "" {
			continue
		}

		data, extension, err := decodeDataURL(image.DataURL)
		if err != nil {
			return NoteDocument{}, err
		}

		filename := s.nextAssetFilename(assetsDir, image.Name, extension)
		if err := os.WriteFile(filepath.Join(assetsDir, filename), data, 0o644); err != nil {
			return NoteDocument{}, err
		}

		alt := strings.TrimSpace(image.Alt)
		if alt == "" {
			alt = stripExtension(filename)
		}
		insertedReferences = append(insertedReferences, fmt.Sprintf("![%s](%s)", alt, filepath.ToSlash(filepath.Join(sceneAssetsDir, filename))))
	}

	if len(insertedReferences) > 0 {
		nextMarkdown := appendImageReferences(string(markdownBytes), insertedReferences)
		if err := os.WriteFile(notePath, []byte(nextMarkdown), 0o644); err != nil {
			return NoteDocument{}, err
		}
	}

	return s.ReadNote(sceneName)
}

func (s *Store) RemoveNoteImage(sceneName string, relativePath string) (NoteDocument, error) {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return NoteDocument{}, err
	}

	targetPath, err := s.resolveAssetPath(scenePath, relativePath)
	if err != nil {
		return NoteDocument{}, err
	}

	if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		return NoteDocument{}, err
	}

	return s.ReadNote(sceneName)
}

func (s *Store) readNoteImages(assetsDir string) ([]NoteImage, error) {
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(assetsDir)
	if err != nil {
		return nil, err
	}

	type orderedImage struct {
		name  string
		image NoteImage
	}

	ordered := make([]orderedImage, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		filename := entry.Name()
		filePath := filepath.Join(assetsDir, filename)
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, err
		}

		ordered = append(ordered, orderedImage{
			name: filename,
			image: NoteImage{
				Name:         filename,
				Alt:          stripExtension(filename),
				RelativePath: filepath.ToSlash(filepath.Join(sceneAssetsDir, filename)),
				DataURL:      encodeDataURL(filename, data),
			},
		})
	}

	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].name < ordered[j].name
	})

	images := make([]NoteImage, 0, len(ordered))
	for _, item := range ordered {
		images = append(images, item.image)
	}

	return images, nil
}

func (s *Store) nextAssetFilename(assetsDir string, originalName string, extension string) string {
	base := sanitizeAssetName(originalName)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if base == "" {
		base = "image"
	}

	if extension == "" {
		extension = strings.ToLower(filepath.Ext(originalName))
	}
	if extension == "" {
		extension = ".png"
	}
	if !strings.HasPrefix(extension, ".") {
		extension = "." + extension
	}

	for index := 1; ; index++ {
		filename := fmt.Sprintf("%03d-%s%s", index, base, extension)
		if _, err := os.Stat(filepath.Join(assetsDir, filename)); os.IsNotExist(err) {
			return filename
		}
	}
}

func (s *Store) resolveAssetPath(scenePath string, relativePath string) (string, error) {
	cleanRelative := filepath.Clean(filepath.FromSlash(relativePath))
	if cleanRelative == "." || cleanRelative == "" {
		return "", fmt.Errorf("asset path is empty")
	}

	assetsPrefix := sceneAssetsDir + string(filepath.Separator)
	if cleanRelative != sceneAssetsDir && !strings.HasPrefix(cleanRelative, assetsPrefix) {
		return "", fmt.Errorf("asset path must stay inside assets directory")
	}

	fullPath := filepath.Join(scenePath, cleanRelative)
	assetsRoot := filepath.Join(scenePath, sceneAssetsDir)
	relativeToAssets, err := filepath.Rel(assetsRoot, fullPath)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(relativeToAssets, "..") {
		return "", fmt.Errorf("asset path escapes assets directory")
	}

	return fullPath, nil
}
