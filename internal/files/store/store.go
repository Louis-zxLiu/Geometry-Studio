package store

import "plotkitycat/internal/workspaces"

const (
	sceneMainFile   = "main.py"
	sceneNoteFile   = "note.md"
	sceneAssetsDir  = "assets"
	sceneOrderFile  = ".plotkitycat-scenes.json"
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

type sceneOrderManifest struct {
	Scenes []string `json:"scenes"`
}

func NewStore(workspaceManager *workspaces.Manager) *Store {
	return &Store{workspaces: workspaceManager}
}
