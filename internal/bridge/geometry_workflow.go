package bridge

import (
	"bufio"
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"plotkitycat/internal/aicode/runstate"
	"plotkitycat/internal/aicode/workflow"
	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
	"plotkitycat/internal/runner"
	"plotkitycat/internal/scriptsafety"
)

//go:embed geometry_agent.py
var geometryAgentSource string

type geometryWorkflowService struct {
	app     *App
	counter uint64

	mu     sync.Mutex
	active *geometryWorkflowEntry
}

type geometryWorkflowEntry struct {
	cancel  context.CancelFunc
	cmd     *exec.Cmd
	request GeometryWorkflowRequest
	session GeometryWorkflowSession
	stdin   io.WriteCloser
	stopped bool
	writeMu sync.Mutex
}

type geometryAgentSettings struct {
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
	Model   string `json:"model"`
	Mode    string `json:"mode"`
}

type geometryAgentRequest struct {
	SceneName    string                `json:"sceneName"`
	ImageDataURL string                `json:"imageDataUrl"`
	ProblemText  string                `json:"problemText"`
	CurrentCode  string                `json:"currentCode"`
	MaxAttempts  int                   `json:"maxAttempts"`
	Settings     geometryAgentSettings `json:"settings"`
}

type geometryAgentCommand struct {
	Type        string                `json:"type"`
	SessionID   string                `json:"sessionId"`
	Request     *geometryAgentRequest `json:"request,omitempty"`
	Spec        *GeometrySpec         `json:"spec,omitempty"`
	ProbeResult *geometryProbeResult  `json:"probeResult,omitempty"`
}

type geometryAgentEvent struct {
	Type          string                 `json:"type"`
	SessionID     string                 `json:"sessionId"`
	SceneName     string                 `json:"sceneName"`
	Stage         string                 `json:"stage"`
	Message       string                 `json:"message"`
	Attempt       int                    `json:"attempt"`
	Spec          GeometrySpec           `json:"spec"`
	Scene         GeometryScene          `json:"scene"`
	Code          string                 `json:"code"`
	NoteMarkdown  string                 `json:"noteMarkdown"`
	ProofMarkdown string                 `json:"proofMarkdown"`
	Result        GeometryWorkflowResult `json:"result"`
	ErrorText     string                 `json:"errorText"`
	Diagnostics   []string               `json:"diagnostics"`
}

type geometryProbeResult struct {
	OK         bool   `json:"ok"`
	ErrorText  string `json:"errorText"`
	Repairable bool   `json:"repairable"`
}

func newGeometryWorkflowService(app *App) *geometryWorkflowService {
	return &geometryWorkflowService{app: app}
}

func (s *geometryWorkflowService) Start(ctx context.Context, request GeometryWorkflowRequest) (GeometryWorkflowSession, error) {
	if strings.TrimSpace(request.SceneName) == "" {
		return GeometryWorkflowSession{}, errors.New("sceneName is required")
	}
	if strings.TrimSpace(request.ImageDataURL) == "" && strings.TrimSpace(request.ProblemText) == "" {
		return GeometryWorkflowSession{}, errors.New("please provide a geometry screenshot or problem text")
	}
	if request.MaxAttempts <= 0 {
		request.MaxAttempts = 5
	}

	settings, err := s.resolveSettings(ctx, request.Settings)
	if err != nil {
		return GeometryWorkflowSession{}, err
	}

	session := GeometryWorkflowSession{
		SessionID: fmt.Sprintf("geom-%d", atomic.AddUint64(&s.counter, 1)),
		State:     "working",
	}

	runCtx, cancel := context.WithCancel(context.Background())
	entry := &geometryWorkflowEntry{
		cancel:  cancel,
		request: request,
		session: session,
	}

	s.mu.Lock()
	if s.active != nil {
		s.mu.Unlock()
		cancel()
		return GeometryWorkflowSession{}, errors.New("a geometry workflow is already running")
	}
	s.active = entry
	s.mu.Unlock()

	if err := s.startAgentProcess(runCtx, entry, settings); err != nil {
		s.clearActive(session.SessionID)
		cancel()
		return GeometryWorkflowSession{}, err
	}

	return session, nil
}

func (s *geometryWorkflowService) Resume(sessionID string, spec GeometrySpec) error {
	entry, err := s.requireActive(sessionID)
	if err != nil {
		return err
	}

	return entry.write(geometryAgentCommand{
		Type:      "resume_review",
		SessionID: sessionID,
		Spec:      &spec,
	})
}

func (s *geometryWorkflowService) Stop(sessionID string) error {
	s.mu.Lock()
	entry := s.active
	if entry == nil || (sessionID != "" && entry.session.SessionID != sessionID) {
		s.mu.Unlock()
		if sessionID == "" {
			return nil
		}
		return errors.New("geometry workflow session not found")
	}
	s.active = nil
	entry.stopped = true
	s.mu.Unlock()

	_ = entry.write(geometryAgentCommand{Type: "stop", SessionID: entry.session.SessionID})
	_ = entry.stdin.Close()
	entry.cancel()
	_, _ = s.app.runner.Stop()
	if entry.cmd != nil && entry.cmd.Process != nil {
		_ = entry.cmd.Process.Kill()
	}

	s.app.emit(EventGeometryInterrupted, GeometryWorkflowInterruptedEvent{
		SessionID: entry.session.SessionID,
		SceneName: entry.request.SceneName,
		Message:   "Geometry workflow stopped",
	})
	return nil
}

func (s *geometryWorkflowService) requireActive(sessionID string) (*geometryWorkflowEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == nil || s.active.session.SessionID != sessionID {
		return nil, errors.New("geometry workflow session not found")
	}
	return s.active, nil
}

func (s *geometryWorkflowService) clearActive(sessionID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == nil || s.active.session.SessionID != sessionID {
		return false
	}
	s.active = nil
	return true
}

func (s *geometryWorkflowService) resolveSettings(ctx context.Context, settings AIProviderSettings) (geometryAgentSettings, error) {
	mode := strings.TrimSpace(settings.Mode)
	if mode == "" {
		mode = "custom"
	}

	if mode == "subscription" {
		if s.app.subscriptionService == nil {
			return geometryAgentSettings{}, errors.New("subscription service is not ready")
		}
		session, err := s.app.subscriptionService.Session(ctx, false)
		if err != nil {
			return geometryAgentSettings{}, err
		}
		resolved := geometryAgentSettings{
			BaseURL: session.BaseURL,
			APIKey:  session.Token,
			Model:   firstNonEmpty(session.Model, settings.Model),
			Mode:    "subscription",
		}
		return validateGeometryAgentSettings(resolved)
	}

	resolved := geometryAgentSettings{
		BaseURL: strings.TrimSpace(settings.URL),
		APIKey:  strings.TrimSpace(settings.Key),
		Model:   strings.TrimSpace(settings.Model),
		Mode:    "custom",
	}
	return validateGeometryAgentSettings(resolved)
}

func validateGeometryAgentSettings(settings geometryAgentSettings) (geometryAgentSettings, error) {
	if strings.TrimSpace(settings.BaseURL) == "" || strings.TrimSpace(settings.APIKey) == "" || strings.TrimSpace(settings.Model) == "" {
		return geometryAgentSettings{}, errors.New("geometry workflow needs an OpenAI-compatible multimodal model URL, key, and model")
	}
	return settings, nil
}

func (s *geometryWorkflowService) startAgentProcess(ctx context.Context, entry *geometryWorkflowEntry, settings geometryAgentSettings) error {
	python, args, err := runner.ResolvePythonCommand()
	if err != nil {
		return err
	}

	agentPath, err := writeEmbeddedGeometryAgent()
	if err != nil {
		return err
	}

	cmdArgs := append([]string{}, args...)
	cmdArgs = append(cmdArgs, "-u", agentPath)
	cmd := exec.CommandContext(ctx, python, cmdArgs...)
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()

	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		return err
	}
	cmd.Env = append(runner.BuildPythonEnv(runtimeDir), "PYTHONIOENCODING=utf-8")

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	entry.cmd = cmd
	entry.stdin = stdin

	if err := cmd.Start(); err != nil {
		return err
	}

	go s.readAgentEvents(ctx, entry, stdout, &stderr, agentPath)

	return entry.write(geometryAgentCommand{
		Type:      "start",
		SessionID: entry.session.SessionID,
		Request: &geometryAgentRequest{
			SceneName:    entry.request.SceneName,
			ImageDataURL: entry.request.ImageDataURL,
			ProblemText:  entry.request.ProblemText,
			CurrentCode:  entry.request.CurrentCode,
			MaxAttempts:  entry.request.MaxAttempts,
			Settings:     settings,
		},
	})
}

func writeEmbeddedGeometryAgent() (string, error) {
	file, err := os.CreateTemp("", "geometry-studio-agent-*.py")
	if err != nil {
		return "", err
	}
	path := file.Name()
	if _, err := file.WriteString(geometryAgentSource); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return "", err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func (s *geometryWorkflowService) readAgentEvents(ctx context.Context, entry *geometryWorkflowEntry, stdout io.Reader, stderr *bytes.Buffer, agentPath string) {
	defer os.Remove(agentPath)

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	terminal := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var event geometryAgentEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			s.app.emit(EventGeometryProgress, GeometryWorkflowProgressEvent{
				SessionID: entry.session.SessionID,
				SceneName: entry.request.SceneName,
				Stage:     "agent_output",
				Message:   line,
			})
			continue
		}
		if event.SessionID == "" {
			event.SessionID = entry.session.SessionID
		}
		if event.SceneName == "" {
			event.SceneName = entry.request.SceneName
		}

		if s.handleAgentEvent(ctx, entry, event) {
			terminal = true
			break
		}
	}

	waitErr := entry.cmd.Wait()
	if terminal {
		return
	}
	if entry.stopped || ctx.Err() != nil {
		return
	}
	message := strings.TrimSpace(stderr.String())
	if message == "" && waitErr != nil {
		message = waitErr.Error()
	}
	if message == "" {
		message = "Geometry agent exited before completing the workflow"
	}
	s.finishFailed(entry.session.SessionID, entry.request.SceneName, message, nil)
}

func (s *geometryWorkflowService) handleAgentEvent(ctx context.Context, entry *geometryWorkflowEntry, event geometryAgentEvent) bool {
	switch event.Type {
	case "progress":
		s.app.emit(EventGeometryProgress, GeometryWorkflowProgressEvent{
			SessionID: event.SessionID,
			SceneName: event.SceneName,
			Stage:     event.Stage,
			Message:   event.Message,
			Attempt:   event.Attempt,
		})
	case "review_required":
		s.app.emit(EventGeometryReview, GeometryWorkflowReviewRequiredEvent{
			SessionID: event.SessionID,
			SceneName: event.SceneName,
			Spec:      normalizeGeometrySpec(event.Spec),
		})
	case "preview_updated":
		s.app.emit(EventGeometryPreview, GeometryWorkflowPreviewUpdatedEvent{
			SessionID: event.SessionID,
			SceneName: event.SceneName,
			Scene:     normalizeGeometryScene(event.Scene),
		})
	case "runtime_probe":
		result := s.probeGeneratedCode(ctx, event.SceneName, event.Code)
		_ = entry.write(geometryAgentCommand{
			Type:        "probe_result",
			SessionID:   event.SessionID,
			ProbeResult: &result,
		})
	case "succeeded":
		result := event.Result
		if result.Code == "" {
			result.Code = event.Code
		}
		if result.NoteMarkdown == "" {
			result.NoteMarkdown = event.NoteMarkdown
		}
		if result.Diagnostics == nil {
			result.Diagnostics = event.Diagnostics
		}
		if isEmptyGeometrySpec(result.Spec) {
			result.Spec = event.Spec
		}
		if isEmptyGeometryScene(result.Scene) {
			result.Scene = event.Scene
		}
		persistedResult, err := s.persistGeometryResult(event.SceneName, entry.request.ImageDataURL, result)
		if err != nil {
			s.finishFailed(event.SessionID, event.SceneName, err.Error(), result.Diagnostics)
			return true
		}
		s.finishSucceeded(event.SessionID, event.SceneName, persistedResult)
		return true
	case "failed":
		s.finishFailed(event.SessionID, event.SceneName, firstNonEmpty(event.ErrorText, event.Message), event.Diagnostics)
		return true
	case "interrupted":
		s.finishInterrupted(event.SessionID, event.SceneName, firstNonEmpty(event.Message, "Geometry workflow interrupted"))
		return true
	}
	return false
}

func (s *geometryWorkflowService) probeGeneratedCode(ctx context.Context, sceneName string, code string) geometryProbeResult {
	if err := scriptsafety.Validate(code); err != nil {
		return geometryProbeResult{
			OK:         false,
			ErrorText:  err.Error(),
			Repairable: true,
		}
	}

	executor := workflow.NewRunnerExecutor(
		newAIWorkflowEnvironmentGuard(s.app).EnsureReady,
		newAIWorkflowSceneSaver(s.app).SaveScene,
		newAIWorkflowRunnerAdapter(s.app).StartRun,
		newAIWorkflowRunnerAdapter(s.app).StopRun,
	)
	failure := runstate.NormalizeExecutionResult(executor.Execute(ctx, sceneName, code))
	if failure == nil {
		return geometryProbeResult{OK: true}
	}
	return geometryProbeResult{
		OK:         false,
		ErrorText:  failure.ErrorText,
		Repairable: failure.Repairable,
	}
}

func (s *geometryWorkflowService) persistGeometryResult(sceneName string, imageDataURL string, result GeometryWorkflowResult) (GeometryWorkflowResult, error) {
	if strings.TrimSpace(result.Code) == "" {
		return result, errors.New("geometry agent returned empty code")
	}
	if err := scriptsafety.Validate(result.Code); err != nil {
		return result, err
	}
	if _, err := s.app.fileStore.SaveScript(sceneName, result.Code); err != nil {
		return result, err
	}

	noteMarkdown := strings.TrimSpace(result.NoteMarkdown)
	imageRel, err := s.persistSourceImage(sceneName, imageDataURL)
	if err != nil {
		return result, err
	}
	result.Scene = normalizeGeometryScene(result.Scene)
	if imageRel != "" {
		result.Scene.SourceImage = imageRel
	}
	if imageRel != "" && !strings.Contains(noteMarkdown, imageRel) {
		if noteMarkdown != "" {
			noteMarkdown += "\n\n"
		}
		noteMarkdown += fmt.Sprintf("![题目原图](%s)\n", imageRel)
	}
	if strings.TrimSpace(result.ProofMarkdown) != "" && !strings.Contains(noteMarkdown, strings.TrimSpace(result.ProofMarkdown)) {
		if noteMarkdown != "" {
			noteMarkdown += "\n\n"
		}
		noteMarkdown += "## 教学证明\n\n" + strings.TrimSpace(result.ProofMarkdown) + "\n"
	}
	result.NoteMarkdown = strings.TrimSpace(noteMarkdown) + "\n"
	if err := s.app.fileStore.SaveNote(sceneName, result.NoteMarkdown); err != nil {
		return result, err
	}

	sceneDir, err := s.app.fileStore.SceneDir(sceneName)
	if err != nil {
		return result, err
	}
	specBytes, err := json.MarshalIndent(normalizeGeometrySpec(result.Spec), "", "  ")
	if err != nil {
		return result, err
	}
	if err := os.WriteFile(filepath.Join(sceneDir, "geometry-spec.json"), specBytes, 0o644); err != nil {
		return result, err
	}
	sceneBytes, err := json.MarshalIndent(result.Scene, "", "  ")
	if err != nil {
		return result, err
	}
	if err := os.WriteFile(filepath.Join(sceneDir, "geometry-scene.json"), sceneBytes, 0o644); err != nil {
		return result, err
	}
	return result, nil
}

func (s *geometryWorkflowService) persistSourceImage(sceneName string, imageDataURL string) (string, error) {
	if strings.TrimSpace(imageDataURL) == "" {
		return "", nil
	}
	data, extension, err := decodeGeometryDataURL(imageDataURL)
	if err != nil {
		return "", err
	}
	sceneDir, err := s.app.fileStore.SceneDir(sceneName)
	if err != nil {
		return "", err
	}
	if extension == "" {
		extension = ".png"
	}
	assetsDir := filepath.Join(sceneDir, "assets")
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		return "", err
	}
	filename := "geometry-source" + extension
	if err := os.WriteFile(filepath.Join(assetsDir, filename), data, 0o644); err != nil {
		return "", err
	}
	return filepath.ToSlash(filepath.Join("assets", filename)), nil
}

func (a *App) GetGeometryScene(sceneName string) (GeometrySceneDocument, error) {
	if a.fileStore == nil {
		return GeometrySceneDocument{}, errors.New("file store is not ready")
	}
	sceneDir, err := a.fileStore.SceneDir(sceneName)
	if err != nil {
		return GeometrySceneDocument{}, err
	}
	content, err := os.ReadFile(filepath.Join(sceneDir, "geometry-scene.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return GeometrySceneDocument{
				Scene: normalizeGeometryScene(GeometryScene{}),
			}, nil
		}
		return GeometrySceneDocument{}, err
	}
	var scene GeometryScene
	if err := json.Unmarshal(content, &scene); err != nil {
		return GeometrySceneDocument{}, err
	}
	scene = normalizeGeometryScene(scene)
	document := GeometrySceneDocument{Scene: scene}
	if strings.TrimSpace(scene.SourceImage) != "" {
		dataURL, err := readGeometryAssetDataURL(sceneDir, scene.SourceImage)
		if err != nil {
			return GeometrySceneDocument{}, err
		}
		document.SourceImageDataURL = dataURL
	}
	return document, nil
}

func readGeometryAssetDataURL(sceneDir string, relativePath string) (string, error) {
	cleanRelative := filepath.Clean(filepath.FromSlash(relativePath))
	if cleanRelative == "." || cleanRelative == "" {
		return "", nil
	}
	fullPath := filepath.Join(sceneDir, cleanRelative)
	cleanSceneDir := filepath.Clean(sceneDir)
	cleanFullPath := filepath.Clean(fullPath)
	if cleanFullPath != cleanSceneDir && !strings.HasPrefix(cleanFullPath, cleanSceneDir+string(filepath.Separator)) {
		return "", errors.New("geometry scene source image escapes scene directory")
	}
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	mediaType := mime.TypeByExtension(strings.ToLower(filepath.Ext(fullPath)))
	if mediaType == "" {
		mediaType = http.DetectContentType(sniffGeometryBytes(data))
	}
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func sniffGeometryBytes(data []byte) []byte {
	if len(data) <= 512 {
		return data
	}
	return bytes.Clone(data[:512])
}

func decodeGeometryDataURL(dataURL string) ([]byte, string, error) {
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return nil, "", errors.New("invalid image data URL")
	}
	header := strings.ToLower(parts[0])
	if !strings.Contains(header, ";base64") {
		return nil, "", errors.New("image data URL must be base64 encoded")
	}
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, "", err
	}
	extension := ".png"
	switch {
	case strings.Contains(header, "image/jpeg") || strings.Contains(header, "image/jpg"):
		extension = ".jpg"
	case strings.Contains(header, "image/webp"):
		extension = ".webp"
	case strings.Contains(header, "image/gif"):
		extension = ".gif"
	}
	return data, extension, nil
}

func (s *geometryWorkflowService) finishSucceeded(sessionID string, sceneName string, result GeometryWorkflowResult) {
	if !s.clearActive(sessionID) {
		return
	}
	result.Spec = normalizeGeometrySpec(result.Spec)
	s.app.emit(EventGeometryApplied, GeometryWorkflowCodeAppliedEvent{
		SessionID: sessionID,
		SceneName: sceneName,
		Code:      result.Code,
		Result:    result,
	})
	s.app.emit(EventGeometrySucceeded, GeometryWorkflowSucceededEvent{
		SessionID: sessionID,
		SceneName: sceneName,
		Result:    result,
	})
}

func (s *geometryWorkflowService) finishFailed(sessionID string, sceneName string, errorText string, diagnostics []string) {
	if !s.clearActive(sessionID) {
		return
	}
	s.app.emit(EventGeometryFailed, GeometryWorkflowFailedEvent{
		SessionID:   sessionID,
		SceneName:   sceneName,
		ErrorText:   firstNonEmpty(errorText, "Geometry workflow failed"),
		Diagnostics: diagnostics,
	})
}

func (s *geometryWorkflowService) finishInterrupted(sessionID string, sceneName string, message string) {
	if !s.clearActive(sessionID) {
		return
	}
	s.app.emit(EventGeometryInterrupted, GeometryWorkflowInterruptedEvent{
		SessionID: sessionID,
		SceneName: sceneName,
		Message:   message,
	})
}

func normalizeGeometrySpec(spec GeometrySpec) GeometrySpec {
	if spec.Entities == nil {
		spec.Entities = []GeometryEntity{}
	}
	if spec.Constraints == nil {
		spec.Constraints = []GeometryConstraint{}
	}
	if spec.ConstructionHints == nil {
		spec.ConstructionHints = []string{}
	}
	for index := range spec.Entities {
		if spec.Entities[index].Attributes == nil {
			spec.Entities[index].Attributes = map[string]string{}
		}
	}
	for index := range spec.Constraints {
		if spec.Constraints[index].Args == nil {
			spec.Constraints[index].Args = []string{}
		}
	}
	return spec
}

func isEmptyGeometrySpec(spec GeometrySpec) bool {
	return spec.ProblemText == "" &&
		spec.GoalText == "" &&
		len(spec.Entities) == 0 &&
		len(spec.Constraints) == 0 &&
		len(spec.ConstructionHints) == 0 &&
		spec.Confidence == 0
}

func normalizeGeometryScene(scene GeometryScene) GeometryScene {
	if scene.Version <= 0 {
		scene.Version = 1
	}
	if scene.Points == nil {
		scene.Points = []GeometryPoint{}
	}
	if scene.Segments == nil {
		scene.Segments = []GeometrySegment{}
	}
	if scene.Circles == nil {
		scene.Circles = []GeometryCircle{}
	}
	if scene.Polygons == nil {
		scene.Polygons = []GeometryPolygon{}
	}
	if scene.Controls == nil {
		scene.Controls = []GeometryControl{}
	}
	if scene.Measurements == nil {
		scene.Measurements = []GeometryMeasurement{}
	}
	if scene.Constraints == nil {
		scene.Constraints = []GeometryConstraint{}
	}
	if scene.Annotations == nil {
		scene.Annotations = []GeometryAnnotation{}
	}
	if scene.ProofSteps == nil {
		scene.ProofSteps = []GeometryProofStep{}
	}
	for index := range scene.Polygons {
		if scene.Polygons[index].Points == nil {
			scene.Polygons[index].Points = []string{}
		}
	}
	for index := range scene.Measurements {
		if scene.Measurements[index].Args == nil {
			scene.Measurements[index].Args = []string{}
		}
	}
	for index := range scene.Constraints {
		if scene.Constraints[index].Args == nil {
			scene.Constraints[index].Args = []string{}
		}
	}
	for index := range scene.ProofSteps {
		if scene.ProofSteps[index].Depends == nil {
			scene.ProofSteps[index].Depends = []string{}
		}
	}
	return scene
}

func isEmptyGeometryScene(scene GeometryScene) bool {
	return scene.Title == "" &&
		scene.SourceImage == "" &&
		len(scene.Points) == 0 &&
		len(scene.Segments) == 0 &&
		len(scene.Circles) == 0 &&
		len(scene.Polygons) == 0 &&
		len(scene.Controls) == 0 &&
		len(scene.Measurements) == 0 &&
		len(scene.Constraints) == 0 &&
		len(scene.Annotations) == 0 &&
		len(scene.ProofSteps) == 0
}

func (e *geometryWorkflowEntry) write(command geometryAgentCommand) error {
	if e == nil || e.stdin == nil {
		return errors.New("geometry agent is not running")
	}
	e.writeMu.Lock()
	defer e.writeMu.Unlock()
	return json.NewEncoder(e.stdin).Encode(command)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (a *App) StartGeometryWorkflow(request GeometryWorkflowRequest) (GeometryWorkflowSession, error) {
	if err := a.requireContext(); err != nil {
		return GeometryWorkflowSession{}, err
	}
	if a.geometryWorkflow == nil {
		return GeometryWorkflowSession{}, errors.New("geometry workflow service is not ready")
	}
	return a.geometryWorkflow.Start(a.ctx, request)
}

func (a *App) ResumeGeometryWorkflow(sessionID string, reviewedSpec GeometrySpec) error {
	if a.geometryWorkflow == nil {
		return errors.New("geometry workflow service is not ready")
	}
	return a.geometryWorkflow.Resume(sessionID, reviewedSpec)
}

func (a *App) StopGeometryWorkflow(sessionID string) error {
	if a.geometryWorkflow == nil {
		return errors.New("geometry workflow service is not ready")
	}
	return a.geometryWorkflow.Stop(sessionID)
}
