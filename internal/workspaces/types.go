package workspaces

const (
	DefaultName    = "工作区_01"
	sceneMainFile  = "main.py"
	sceneNoteFile  = "note.md"
	sceneAssetsDir = "assets"
)

type Workspace struct {
	Name       string `json:"name"`
	SceneCount int    `json:"sceneCount"`
}
