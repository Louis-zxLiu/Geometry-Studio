package bridge

import (
	"plotkitycat/internal/aicode/patch"
	"plotkitycat/internal/aicode/runstate"
	"plotkitycat/internal/aicode/workflow"
)

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

type ImportWorkspaceResult struct {
	Cancelled          bool              `json:"cancelled"`
	ImportedWorkspaces []string          `json:"importedWorkspaces"`
	Workspace          WorkspaceSnapshot `json:"workspace"`
}

type RunControlResult struct {
	Handled bool   `json:"handled"`
	Message string `json:"message"`
}

type ScreeningStartRequest struct {
	SceneNames []string `json:"sceneNames"`
	StartIndex int      `json:"startIndex"`
	PoolSize   int      `json:"poolSize"`
	Animation  string   `json:"animation"`
}

type ScreeningSessionState struct {
	Active           bool     `json:"active"`
	SceneNames       []string `json:"sceneNames"`
	CurrentIndex     int      `json:"currentIndex"`
	CurrentSceneName string   `json:"currentSceneName"`
	PoolSize         int      `json:"poolSize"`
	Animation        string   `json:"animation"`
}

type ScreeningStopResult struct {
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

type ChangedLineRange = patch.ChangedLineRange

type AIWorkflowRequest struct {
	Kind        string             `json:"kind"`
	SceneName   string             `json:"sceneName"`
	CurrentCode string             `json:"currentCode"`
	Instruction string             `json:"instruction"`
	ErrorText   string             `json:"errorText"`
	Selection   AISelectionPayload `json:"selection"`
	MaxAttempts int                `json:"maxAttempts"`
	Settings    AIProviderSettings `json:"settings"`
}

type AIWorkflowSession struct {
	SessionID string `json:"sessionId"`
	State     string `json:"state"`
}

type AIWorkflowStateChangedEvent = workflow.StateChangedEvent

type AIWorkflowCodeAppliedEvent = workflow.CodeAppliedEvent

type AIWorkflowSucceededEvent = workflow.SucceededEvent

type AIWorkflowInterruptedEvent = workflow.InterruptedEvent

type AIWorkflowFailedEvent struct {
	SessionID  string               `json:"sessionId"`
	SceneName  string               `json:"sceneName"`
	Kind       runstate.FailureKind `json:"kind"`
	ErrorText  string               `json:"errorText"`
	Repairable bool                 `json:"repairable"`
	Attempt    int                  `json:"attempt"`
}

type AIAskRequest struct {
	SceneName   string             `json:"sceneName"`
	CurrentCode string             `json:"currentCode"`
	ContextKind string             `json:"contextKind"`
	Question    string             `json:"question"`
	Selection   AISelectionPayload `json:"selection"`
	Settings    AIProviderSettings `json:"settings"`
}

type AIAskResult struct {
	Answer string `json:"answer"`
	Source string `json:"source"`
}

type GeometryWorkflowRequest struct {
	SceneName    string             `json:"sceneName"`
	ImageDataURL string             `json:"imageDataUrl"`
	ProblemText  string             `json:"problemText"`
	CurrentCode  string             `json:"currentCode"`
	Settings     AIProviderSettings `json:"settings"`
	MaxAttempts  int                `json:"maxAttempts"`
}

type GeometryWorkflowRepairRequest struct {
	SceneName   string                 `json:"sceneName"`
	CurrentCode string                 `json:"currentCode"`
	ErrorText   string                 `json:"errorText"`
	Diagnostics []string               `json:"diagnostics"`
	Result      GeometryWorkflowResult `json:"result"`
	Settings    AIProviderSettings     `json:"settings"`
	MaxAttempts int                    `json:"maxAttempts"`
}

type GeometryWorkflowSession struct {
	SessionID string `json:"sessionId"`
	State     string `json:"state"`
}

type GeometryEntity struct {
	ID         string            `json:"id"`
	Type       string            `json:"type"`
	Label      string            `json:"label"`
	Attributes map[string]string `json:"attributes"`
}

type GeometryConstraint struct {
	Type       string   `json:"type"`
	Args       []string `json:"args"`
	Text       string   `json:"text"`
	Confidence float64  `json:"confidence"`
}

type GeometrySpec struct {
	ProblemText       string               `json:"problemText"`
	GoalText          string               `json:"goalText"`
	Entities          []GeometryEntity     `json:"entities"`
	Constraints       []GeometryConstraint `json:"constraints"`
	ConstructionHints []string             `json:"constructionHints"`
	Confidence        float64              `json:"confidence"`
}

type GeometryPoint struct {
	ID    string  `json:"id"`
	Label string  `json:"label"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Fixed bool    `json:"fixed"`
}

type GeometrySegment struct {
	ID    string `json:"id"`
	From  string `json:"from"`
	To    string `json:"to"`
	Label string `json:"label"`
	Style string `json:"style"`
}

type GeometryCircle struct {
	ID      string  `json:"id"`
	Center  string  `json:"center"`
	Radius  float64 `json:"radius"`
	Through string  `json:"through"`
	Label   string  `json:"label"`
	Style   string  `json:"style"`
}

type GeometryArc struct {
	ID     string  `json:"id"`
	Center string  `json:"center"`
	Start  string  `json:"start"`
	End    string  `json:"end"`
	Radius float64 `json:"radius"`
	Label  string  `json:"label"`
	Style  string  `json:"style"`
}

type GeometryPolygon struct {
	ID     string   `json:"id"`
	Points []string `json:"points"`
	Label  string   `json:"label"`
	Fill   string   `json:"fill"`
}

type GeometryControl struct {
	ID      string  `json:"id"`
	Label   string  `json:"label"`
	Kind    string  `json:"kind"`
	Min     float64 `json:"min"`
	Max     float64 `json:"max"`
	Value   float64 `json:"value"`
	Step    float64 `json:"step"`
	Target  string  `json:"target"`
	Binding string  `json:"binding"`
}

type GeometryMeasurement struct {
	ID    string   `json:"id"`
	Label string   `json:"label"`
	Kind  string   `json:"kind"`
	Args  []string `json:"args"`
	Value string   `json:"value"`
}

type GeometryAnnotation struct {
	ID   string  `json:"id"`
	Text string  `json:"text"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type GeometryProofStep struct {
	ID      string   `json:"id"`
	Claim   string   `json:"claim"`
	Reason  string   `json:"reason"`
	Depends []string `json:"depends"`
}

type GeometryScene struct {
	Version      int                   `json:"version"`
	Title        string                `json:"title"`
	SourceImage  string                `json:"sourceImage"`
	Points       []GeometryPoint       `json:"points"`
	Segments     []GeometrySegment     `json:"segments"`
	Circles      []GeometryCircle      `json:"circles"`
	Arcs         []GeometryArc         `json:"arcs"`
	Polygons     []GeometryPolygon     `json:"polygons"`
	Controls     []GeometryControl     `json:"controls"`
	Measurements []GeometryMeasurement `json:"measurements"`
	Constraints  []GeometryConstraint  `json:"constraints"`
	Annotations  []GeometryAnnotation  `json:"annotations"`
	ProofSteps   []GeometryProofStep   `json:"proofSteps"`
}

type GeometryConstruction struct {
	Version            int              `json:"version"`
	DSLCode            string           `json:"dslCode"`
	Objects            []map[string]any `json:"objects"`
	Constraints        []map[string]any `json:"constraints"`
	ConstructionIntent []map[string]any `json:"constructionIntent"`
	Solution           map[string]any   `json:"solution"`
	Validation         map[string]any   `json:"validation"`
	ReviewStatus       string           `json:"reviewStatus"`
	SpecFingerprint    string           `json:"specFingerprint"`
	Diagnostics        []string         `json:"diagnostics"`
}

type GeometrySceneDocument struct {
	Scene              GeometryScene `json:"scene"`
	SourceImageDataURL string        `json:"sourceImageDataUrl"`
}

type GeometryWorkflowResult struct {
	Code          string               `json:"code"`
	NoteMarkdown  string               `json:"noteMarkdown"`
	ProofMarkdown string               `json:"proofMarkdown"`
	Spec          GeometrySpec         `json:"spec"`
	Construction  GeometryConstruction `json:"construction"`
	Scene         GeometryScene        `json:"scene"`
	Diagnostics   []string             `json:"diagnostics"`
}

type GeometryWorkflowProgressEvent struct {
	SessionID       string         `json:"sessionId"`
	SceneName       string         `json:"sceneName"`
	Stage           string         `json:"stage"`
	AgentName       string         `json:"agentName"`
	Title           string         `json:"title"`
	Description     string         `json:"description"`
	Message         string         `json:"message"`
	Status          string         `json:"status"`
	EventKind       string         `json:"eventKind"`
	Attempt         int            `json:"attempt"`
	ArtifactTitle   string         `json:"artifactTitle"`
	ArtifactSummary string         `json:"artifactSummary"`
	ArtifactDetail  string         `json:"artifactDetail"`
	ArtifactData    map[string]any `json:"artifactData"`
}

type GeometryWorkflowReviewRequiredEvent struct {
	SessionID         string               `json:"sessionId"`
	SceneName         string               `json:"sceneName"`
	Spec              GeometrySpec         `json:"spec"`
	ConstructionDraft GeometryConstruction `json:"constructionDraft"`
	ValidationSummary map[string]any       `json:"validationSummary"`
}

type GeometryWorkflowPreviewUpdatedEvent struct {
	SessionID string        `json:"sessionId"`
	SceneName string        `json:"sceneName"`
	Scene     GeometryScene `json:"scene"`
}

type GeometryWorkflowCodeAppliedEvent struct {
	SessionID string                 `json:"sessionId"`
	SceneName string                 `json:"sceneName"`
	Code      string                 `json:"code"`
	Result    GeometryWorkflowResult `json:"result"`
}

type GeometryWorkflowSucceededEvent struct {
	SessionID string                 `json:"sessionId"`
	SceneName string                 `json:"sceneName"`
	Result    GeometryWorkflowResult `json:"result"`
}

type GeometryWorkflowFailedEvent struct {
	SessionID   string                 `json:"sessionId"`
	SceneName   string                 `json:"sceneName"`
	ErrorText   string                 `json:"errorText"`
	Diagnostics []string               `json:"diagnostics"`
	Repairable  bool                   `json:"repairable"`
	Result      GeometryWorkflowResult `json:"result"`
}

type GeometryWorkflowInterruptedEvent struct {
	SessionID string `json:"sessionId"`
	SceneName string `json:"sceneName"`
	Message   string `json:"message"`
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

type DesignCardPlacement struct {
	CardID    string `json:"cardId"`
	AfterLine int    `json:"afterLine"`
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
