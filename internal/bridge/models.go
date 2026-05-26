package bridge

type ScriptDocument struct {
	Filename     string      `json:"filename"`
	Code         string      `json:"code"`
	NoteMarkdown string      `json:"noteMarkdown"`
	NoteImages   []NoteImage `json:"noteImages"`
}

type NoteImage struct {
	Name         string `json:"name"`
	Alt          string `json:"alt"`
	DataURL      string `json:"dataUrl"`
	RelativePath string `json:"relativePath"`
}

type NoteDocument struct {
	Markdown string      `json:"markdown"`
	Images   []NoteImage `json:"images"`
}

type NoteImageInput struct {
	Name    string `json:"name"`
	Alt     string `json:"alt"`
	DataURL string `json:"dataUrl"`
}

type EnvironmentCheckItem struct {
	Key          string `json:"key"`
	Label        string `json:"label"`
	RelativePath string `json:"relativePath"`
	Category     string `json:"category"`
	Status       string `json:"status"`
	Message      string `json:"message"`
	Exists       bool   `json:"exists"`
}

type EnvironmentStatus struct {
	Ready                bool                   `json:"ready"`
	Code                 string                 `json:"code"`
	Severity             string                 `json:"severity"`
	RuntimeDir           string                 `json:"runtimeDir"`
	Summary              string                 `json:"summary"`
	RecommendedAction    string                 `json:"recommendedAction"`
	CheckedAt            string                 `json:"checkedAt"`
	Items                []EnvironmentCheckItem `json:"items"`
	Missing              []string               `json:"missing"`
	CanRebuild           bool                   `json:"canRebuild"`
	RuntimeArchivePath   string                 `json:"runtimeArchivePath"`
	RuntimeArchiveExists bool                   `json:"runtimeArchiveExists"`
}

type InitProgress struct {
	Stage   string `json:"stage"`
	Message string `json:"message"`
	Percent int    `json:"percent"`
}

type WorkspaceSnapshot struct {
	Scripts          []string        `json:"scripts"`
	CurrentFile      string          `json:"currentFile"`
	Document         ScriptDocument  `json:"document"`
	Workspaces       []WorkspaceInfo `json:"workspaces"`
	CurrentWorkspace string          `json:"currentWorkspace"`
}

type WorkspaceInfo struct {
	Name       string `json:"name"`
	SceneCount int    `json:"sceneCount"`
}

type InitSnapshot struct {
	Environment EnvironmentStatus `json:"environment"`
	Workspace   WorkspaceSnapshot `json:"workspace"`
}

type ImportSceneResult struct {
	Cancelled bool              `json:"cancelled"`
	Workspace WorkspaceSnapshot `json:"workspace"`
}

type RunControlResult struct {
	Handled bool   `json:"handled"`
	Message string `json:"message"`
}

type AIProviderSettings struct {
	Mode  string `json:"mode"`
	URL   string `json:"url"`
	Key   string `json:"key"`
	Model string `json:"model"`
}

type AISelectionItem struct {
	Kind         string `json:"kind"`
	Text         string `json:"text"`
	Name         string `json:"name"`
	Alt          string `json:"alt"`
	DataURL      string `json:"dataUrl"`
	RelativePath string `json:"relativePath"`
}

type AISelectionPayload struct {
	Items []AISelectionItem `json:"items"`
}

type AIGenerationRequest struct {
	Kind        string             `json:"kind"`
	SceneName   string             `json:"sceneName"`
	CurrentCode string             `json:"currentCode"`
	Settings    AIProviderSettings `json:"settings"`
	Selection   AISelectionPayload `json:"selection"`
}

type AIGenerationResult struct {
	Code   string `json:"code"`
	Source string `json:"source"`
}

type AIRepairRequest struct {
	SceneName   string             `json:"sceneName"`
	CurrentCode string             `json:"currentCode"`
	ErrorText   string             `json:"errorText"`
	Settings    AIProviderSettings `json:"settings"`
}

type AIRepairResult struct {
	Patch  string `json:"patch"`
	Source string `json:"source"`
}

type AIOptimizeRequest struct {
	SceneName   string             `json:"sceneName"`
	CurrentCode string             `json:"currentCode"`
	Instruction string             `json:"instruction"`
	Settings    AIProviderSettings `json:"settings"`
}

type AIOptimizeResult struct {
	Patch  string `json:"patch"`
	Source string `json:"source"`
}

type AIDesignCardGenerationRequest struct {
	SceneName string             `json:"sceneName"`
	Settings  AIProviderSettings `json:"settings"`
	Selection AISelectionPayload `json:"selection"`
}

type AIDesignCardOptimizeRequest struct {
	SceneName   string             `json:"sceneName"`
	CardID      string             `json:"cardId"`
	Instruction string             `json:"instruction"`
	Settings    AIProviderSettings `json:"settings"`
}

type DesignCard struct {
	ID        string `json:"id"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	Title     string `json:"title"`
	Order     int    `json:"order"`
	Plan      string `json:"plan"`
	SVG       string `json:"svg"`
}

type DesignCardVersion struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Note      string `json:"note"`
	Plan      string `json:"plan"`
	SVG       string `json:"svg"`
	CreatedAt int64  `json:"createdAt"`
}

type AIDesignCardResult struct {
	Card   DesignCard `json:"card"`
	Source string     `json:"source"`
}

type CodeAIVersion struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Note      string `json:"note"`
	Code      string `json:"code"`
	CreatedAt int64  `json:"createdAt"`
}

type CreateCodeAIVersionRequest struct {
	SceneName string `json:"sceneName"`
	Note      string `json:"note"`
	Code      string `json:"code"`
}

type SubscriptionStatus struct {
	Status        string `json:"status"`
	Activated     bool   `json:"activated"`
	DeviceID      string `json:"deviceId"`
	ExpireAt      string `json:"expireAt"`
	LastCheckedAt string `json:"lastCheckedAt"`
	Message       string `json:"message"`
	Model         string `json:"model"`
	BaseURL       string `json:"baseUrl"`
}

type SubscriptionPurchaseResult struct {
	Configured bool   `json:"configured"`
	URL        string `json:"url"`
	DeviceID   string `json:"deviceId"`
	Message    string `json:"message"`
}

type UpdateStatus struct {
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	Notes           string `json:"notes"`
	PublishedAt     string `json:"publishedAt"`
	LastCheckedAt   string `json:"lastCheckedAt"`
	Message         string `json:"message"`
	UpdateAvailable bool   `json:"updateAvailable"`
	Downloaded      bool   `json:"downloaded"`
	ReadyToInstall  bool   `json:"readyToInstall"`
}
