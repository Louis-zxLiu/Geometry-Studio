package files

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"plotkitycat/internal/workspaces"
)

const (
	sceneMainFile   = "main.py"
	sceneNoteFile   = "note.md"
	sceneAssetsDir  = "assets"
	defaultMimeType = "application/octet-stream"
)

type NoteImage struct {
	Alt          string
	DataURL      string
	Name         string
	RelativePath string
}

type NoteDocument struct {
	Images   []NoteImage
	Markdown string
}

type Store struct {
	workspaces *workspaces.Manager
}

func NewStore(workspaceManager *workspaces.Manager) *Store {
	return &Store{workspaces: workspaceManager}
}

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
	return scenes, nil
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

	return newName, nil
}

func (s *Store) DeleteScript(sceneName string) error {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return err
	}

	return os.RemoveAll(scenePath)
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

func normalizeSceneName(name string) string {
	sanitized := sanitizeAssetName(name)
	if strings.EqualFold(filepath.Ext(sanitized), ".py") {
		sanitized = strings.TrimSuffix(sanitized, filepath.Ext(sanitized))
	}
	sanitized = strings.TrimSpace(sanitized)
	if sanitized == "" {
		return "untitled"
	}

	return sanitized
}

func sanitizeAssetName(name string) string {
	replacer := strings.NewReplacer(
		"<", "",
		">", "",
		":", "",
		"\"", "",
		"/", "",
		"\\", "",
		"|", "",
		"?", "",
		"*", "",
	)

	name = strings.TrimSpace(replacer.Replace(name))
	if name == "" {
		return "untitled"
	}

	return name
}

func defaultScriptTemplate(sceneName string) string {
	return "import matplotlib.pyplot as plt\n\nplt.rcParams.update({\n    \"text.usetex\": False,\n    \"font.family\": \"SimSun\",\n    \"mathtext.fontset\": \"stix\",\n    \"axes.unicode_minus\": False,\n    \"font.size\": 12\n})\n\n\nif __name__ == \"__main__\":\n    plt.figure(dpi=120)\n    plt.title(\"" + sceneName + "\")\n    plt.show()\n"
}

func stripExtension(filename string) string {
	return strings.TrimSuffix(filename, filepath.Ext(filename))
}

func appendImageReferences(markdown string, references []string) string {
	trimmed := strings.TrimRight(markdown, "\r\n")
	if trimmed == "" {
		return strings.Join(references, "\n\n")
	}

	return trimmed + "\n\n" + strings.Join(references, "\n\n")
}

func decodeDataURL(dataURL string) ([]byte, string, error) {
	if !strings.HasPrefix(dataURL, "data:") {
		return nil, "", fmt.Errorf("unsupported image payload")
	}

	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return nil, "", fmt.Errorf("invalid data URL")
	}

	header := parts[0]
	payload := parts[1]
	if !strings.HasSuffix(header, ";base64") {
		return nil, "", fmt.Errorf("only base64 image payloads are supported")
	}

	mediaType := strings.TrimPrefix(strings.TrimSuffix(header, ";base64"), "data:")
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", err
	}

	return data, extensionFromMediaType(mediaType), nil
}

func encodeDataURL(filename string, data []byte) string {
	mediaType := mime.TypeByExtension(strings.ToLower(filepath.Ext(filename)))
	if mediaType == "" {
		mediaType = http.DetectContentType(sniffBytes(data))
	}
	if mediaType == "" {
		mediaType = defaultMimeType
	}

	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func extensionFromMediaType(mediaType string) string {
	extensions, err := mime.ExtensionsByType(mediaType)
	if err == nil && len(extensions) > 0 {
		return strings.ToLower(extensions[0])
	}

	switch mediaType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	default:
		return ""
	}
}

func sniffBytes(data []byte) []byte {
	if len(data) <= 512 {
		return data
	}

	return bytes.Clone(data[:512])
}
