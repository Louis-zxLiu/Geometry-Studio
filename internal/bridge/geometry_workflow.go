package bridge

import (
	"bufio"
	"bytes"
	"context"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
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

//go:embed geometry_agent.py geometry_agent_lib/*.py
var geometryAgentFiles embed.FS

type geometryAgentRuntime struct {
	dir       string
	agentPath string
}

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
	SceneName           string                `json:"sceneName"`
	ImageDataURL        string                `json:"imageDataUrl"`
	ProblemText         string                `json:"problemText"`
	CurrentCode         string                `json:"currentCode"`
	DynamicConstruction bool                  `json:"dynamicConstruction"`
	MaxAttempts         int                   `json:"maxAttempts"`
	RunMode             string                `json:"runMode"`
	QualityMode         string                `json:"qualityMode"`
	BenchmarkProblem    map[string]any        `json:"benchmarkProblem"`
	RenderImageDir      string                `json:"renderImageDir"`
	Settings            geometryAgentSettings `json:"settings"`
	ErrorText           string                `json:"errorText"`
	Diagnostics         []string              `json:"diagnostics"`
	Spec                GeometrySpec          `json:"spec"`
	Construction        GeometryConstruction  `json:"construction"`
	Scene               GeometryScene         `json:"scene"`
	NoteMarkdown        string                `json:"noteMarkdown"`
	ProofMarkdown       string                `json:"proofMarkdown"`
}

type geometryAgentCommand struct {
	Type        string                `json:"type"`
	SessionID   string                `json:"sessionId"`
	Request     *geometryAgentRequest `json:"request,omitempty"`
	Spec        *GeometrySpec         `json:"spec,omitempty"`
	ProbeResult *geometryProbeResult  `json:"probeResult,omitempty"`
}

type geometryAgentEvent struct {
	Type                string                 `json:"type"`
	SessionID           string                 `json:"sessionId"`
	SceneName           string                 `json:"sceneName"`
	Stage               string                 `json:"stage"`
	AgentName           string                 `json:"agentName"`
	Title               string                 `json:"title"`
	Description         string                 `json:"description"`
	Message             string                 `json:"message"`
	Status              string                 `json:"status"`
	EventKind           string                 `json:"eventKind"`
	Attempt             int                    `json:"attempt"`
	ArtifactTitle       string                 `json:"artifactTitle"`
	ArtifactSummary     string                 `json:"artifactSummary"`
	ArtifactDetail      string                 `json:"artifactDetail"`
	ArtifactData        map[string]any         `json:"artifactData"`
	Spec                GeometrySpec           `json:"spec"`
	Construction        GeometryConstruction   `json:"construction"`
	ConstructionDraft   GeometryConstruction   `json:"constructionDraft"`
	ValidationSummary   map[string]any         `json:"validationSummary"`
	Scene               GeometryScene          `json:"scene"`
	AttemptHistory      []map[string]any       `json:"attemptHistory"`
	SourceImageDataURL  string                 `json:"sourceImageDataUrl"`
	Code                string                 `json:"code"`
	NoteMarkdown        string                 `json:"noteMarkdown"`
	ProofMarkdown       string                 `json:"proofMarkdown"`
	Result              GeometryWorkflowResult `json:"result"`
	ErrorText           string                 `json:"errorText"`
	Diagnostics         []string               `json:"diagnostics"`
	Repairable          bool                   `json:"repairable"`
	DynamicConstruction bool                   `json:"dynamicConstruction"`
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
	if strings.TrimSpace(request.RunMode) == "" {
		request.RunMode = "interactive"
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

func (s *geometryWorkflowService) Repair(ctx context.Context, request GeometryWorkflowRepairRequest) (GeometryWorkflowSession, error) {
	if strings.TrimSpace(request.SceneName) == "" {
		return GeometryWorkflowSession{}, errors.New("sceneName is required")
	}
	if strings.TrimSpace(request.CurrentCode) == "" && strings.TrimSpace(request.Result.Code) == "" {
		return GeometryWorkflowSession{}, errors.New("geometry repair needs current code")
	}
	if request.MaxAttempts <= 0 {
		request.MaxAttempts = 3
	}

	settings, err := s.resolveSettings(ctx, request.Settings)
	if err != nil {
		return GeometryWorkflowSession{}, err
	}

	session := GeometryWorkflowSession{
		SessionID: fmt.Sprintf("geom-%d", atomic.AddUint64(&s.counter, 1)),
		State:     "repairing",
	}

	entryRequest := GeometryWorkflowRequest{
		SceneName:   request.SceneName,
		CurrentCode: firstNonEmpty(request.CurrentCode, request.Result.Code),
		Settings:    request.Settings,
		MaxAttempts: request.MaxAttempts,
	}
	runCtx, cancel := context.WithCancel(context.Background())
	entry := &geometryWorkflowEntry{
		cancel:  cancel,
		request: entryRequest,
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

	if err := s.startRepairAgentProcess(runCtx, entry, request, settings); err != nil {
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
	return s.startAgentProcessWithRequest(ctx, entry, "start", &geometryAgentRequest{
		SceneName:           entry.request.SceneName,
		ImageDataURL:        entry.request.ImageDataURL,
		ProblemText:         entry.request.ProblemText,
		CurrentCode:         entry.request.CurrentCode,
		DynamicConstruction: entry.request.DynamicConstruction,
		MaxAttempts:         entry.request.MaxAttempts,
		RunMode:             entry.request.RunMode,
		QualityMode:         entry.request.QualityMode,
		BenchmarkProblem:    entry.request.BenchmarkProblem,
		RenderImageDir:      entry.request.RenderImageDir,
		Settings:            settings,
	})
}

func (s *geometryWorkflowService) startRepairAgentProcess(ctx context.Context, entry *geometryWorkflowEntry, request GeometryWorkflowRepairRequest, settings geometryAgentSettings) error {
	result := s.hydrateGeometryRepairResult(request.SceneName, firstNonEmpty(request.CurrentCode, request.Result.Code), request.Result)
	return s.startAgentProcessWithRequest(ctx, entry, "repair", &geometryAgentRequest{
		SceneName:     request.SceneName,
		CurrentCode:   firstNonEmpty(request.CurrentCode, result.Code),
		MaxAttempts:   request.MaxAttempts,
		Settings:      settings,
		ErrorText:     request.ErrorText,
		Diagnostics:   request.Diagnostics,
		Spec:          normalizeGeometrySpec(result.Spec),
		Construction:  normalizeGeometryConstruction(result.Construction),
		Scene:         normalizeGeometryScene(result.Scene),
		NoteMarkdown:  result.NoteMarkdown,
		ProofMarkdown: result.ProofMarkdown,
	})
}

func (s *geometryWorkflowService) startAgentProcessWithRequest(ctx context.Context, entry *geometryWorkflowEntry, commandType string, request *geometryAgentRequest) error {
	python, args, err := runner.ResolvePythonCommand()
	if err != nil {
		return err
	}

	agentRuntime, err := writeEmbeddedGeometryAgent()
	if err != nil {
		return err
	}

	cmdArgs := append([]string{}, args...)
	cmdArgs = append(cmdArgs, "-u", agentRuntime.agentPath)
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

	go s.readAgentEvents(ctx, entry, stdout, &stderr, agentRuntime)

	return entry.write(geometryAgentCommand{
		Type:      commandType,
		SessionID: entry.session.SessionID,
		Request:   request,
	})
}

func writeEmbeddedGeometryAgent() (geometryAgentRuntime, error) {
	dir, err := os.MkdirTemp("", "geometry-studio-agent-*")
	if err != nil {
		return geometryAgentRuntime{}, err
	}
	if err := fs.WalkDir(geometryAgentFiles, ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		target := filepath.Join(dir, filepath.FromSlash(path))
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		content, err := geometryAgentFiles.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, content, 0o644)
	}); err != nil {
		_ = os.RemoveAll(dir)
		return geometryAgentRuntime{}, err
	}
	return geometryAgentRuntime{
		dir:       dir,
		agentPath: filepath.Join(dir, "geometry_agent.py"),
	}, nil
}

func (s *geometryWorkflowService) readAgentEvents(ctx context.Context, entry *geometryWorkflowEntry, stdout io.Reader, stderr *bytes.Buffer, agentRuntime geometryAgentRuntime) {
	defer os.RemoveAll(agentRuntime.dir)

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
				Message:   redactGeometrySensitiveText(line),
				Status:    "running",
				EventKind: "log",
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
	message = redactGeometrySensitiveText(message)
	s.finishFailed(entry.session.SessionID, entry.request.SceneName, message, nil, false, GeometryWorkflowResult{})
}

func (s *geometryWorkflowService) handleAgentEvent(ctx context.Context, entry *geometryWorkflowEntry, event geometryAgentEvent) bool {
	switch event.Type {
	case "progress":
		s.app.emit(EventGeometryProgress, GeometryWorkflowProgressEvent{
			SessionID:       event.SessionID,
			SceneName:       event.SceneName,
			Stage:           event.Stage,
			AgentName:       event.AgentName,
			Title:           event.Title,
			Description:     event.Description,
			Message:         event.Message,
			Status:          event.Status,
			EventKind:       event.EventKind,
			Attempt:         event.Attempt,
			ArtifactTitle:   event.ArtifactTitle,
			ArtifactSummary: event.ArtifactSummary,
			ArtifactDetail:  event.ArtifactDetail,
			ArtifactData:    event.ArtifactData,
		})
	case "review_required":
		s.app.emit(EventGeometryReview, GeometryWorkflowReviewRequiredEvent{
			SessionID:          event.SessionID,
			SceneName:          event.SceneName,
			Spec:               normalizeGeometrySpec(event.Spec),
			ConstructionDraft:  normalizeGeometryConstruction(event.ConstructionDraft),
			ValidationSummary:  normalizeGeometryMap(event.ValidationSummary),
			Scene:              normalizeGeometryScene(event.Scene),
			AttemptHistory:     normalizeGeometryAttemptHistory(event.AttemptHistory),
			SourceImageDataURL: event.SourceImageDataURL,
		})
	case "preview_updated":
		s.app.emit(EventGeometryPreview, GeometryWorkflowPreviewUpdatedEvent{
			SessionID: event.SessionID,
			SceneName: event.SceneName,
			Scene:     normalizeGeometryScene(event.Scene),
		})
	case "runtime_probe":
		result := s.probeGeneratedCode(ctx, event.SceneName, event.Code, event.DynamicConstruction)
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
		if isEmptyGeometryConstruction(result.Construction) {
			result.Construction = event.Construction
		}
		if isEmptyGeometryScene(result.Scene) {
			result.Scene = event.Scene
		}
		persistedResult, err := s.persistGeometryResult(event.SceneName, entry.request.ImageDataURL, result)
		if err != nil {
			s.finishFailed(event.SessionID, event.SceneName, err.Error(), result.Diagnostics, isRepairableGeometryResult(result), result)
			return true
		}
		s.finishSucceeded(event.SessionID, event.SceneName, persistedResult)
		return true
	case "failed":
		s.finishFailed(event.SessionID, event.SceneName, firstNonEmpty(event.ErrorText, event.Message), event.Diagnostics, event.Repairable || isRepairableGeometryResult(event.Result), event.Result)
		return true
	case "interrupted":
		s.finishInterrupted(event.SessionID, event.SceneName, firstNonEmpty(event.Message, "Geometry workflow interrupted"))
		return true
	}
	return false
}

func (s *geometryWorkflowService) probeGeneratedCode(ctx context.Context, sceneName string, code string, dynamicConstruction bool) geometryProbeResult {
	if err := scriptsafety.Validate(code); err != nil {
		return geometryProbeResult{
			OK:         false,
			ErrorText:  err.Error(),
			Repairable: true,
		}
	}
	if dynamicConstruction && !codeHasDynamicGeometryControl(code) {
		return geometryProbeResult{
			OK:         false,
			ErrorText:  "动态构象模式要求生成的 Matplotlib 代码至少包含一个 Slider 控件，请保留参数化构造和滑块交互。",
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

var dynamicGeometryControlPattern = regexp.MustCompile(`(?i)(\bSlider\s*\(|matplotlib\.widgets\.Slider\b)`)

func codeHasDynamicGeometryControl(code string) bool {
	return dynamicGeometryControlPattern.MatchString(code)
}

var geometrySensitiveTextPatterns = []struct {
	pattern     *regexp.Regexp
	replacement string
}{
	{regexp.MustCompile(`sk-[A-Za-z0-9_\-]{12,}`), "sk-***redacted***"},
	{regexp.MustCompile(`(?i)(bearer\s+)[A-Za-z0-9._\-]{12,}`), "${1}***redacted***"},
	{regexp.MustCompile(`(?i)(api[_-]?key["'\s:=]+)[A-Za-z0-9._\-]{8,}`), "${1}***redacted***"},
	{regexp.MustCompile(`(?i)([a-z][a-z0-9+.-]*://)[^/@\s]+:[^/@\s]+@`), "${1}***redacted***@"},
}

func redactGeometrySensitiveText(value string) string {
	redacted := value
	for _, item := range geometrySensitiveTextPatterns {
		redacted = item.pattern.ReplaceAllString(redacted, item.replacement)
	}
	return redacted
}

func redactGeometryDiagnostics(values []string) []string {
	if values == nil {
		return nil
	}
	redacted := make([]string, len(values))
	for index, value := range values {
		redacted[index] = redactGeometrySensitiveText(value)
	}
	return redacted
}

func (s *geometryWorkflowService) hydrateGeometryRepairResult(sceneName string, currentCode string, result GeometryWorkflowResult) GeometryWorkflowResult {
	if strings.TrimSpace(result.Code) == "" {
		result.Code = currentCode
	}
	if isEmptyGeometrySpec(result.Spec) {
		if spec, err := s.readGeometrySpec(sceneName); err == nil {
			result.Spec = spec
		}
	}
	if isEmptyGeometryScene(result.Scene) {
		if scene, err := s.readGeometryScene(sceneName); err == nil {
			result.Scene = scene
		}
	}
	if isEmptyGeometryConstruction(result.Construction) {
		if construction, err := s.readGeometryConstruction(sceneName); err == nil {
			result.Construction = construction
		}
	}
	if strings.TrimSpace(result.NoteMarkdown) == "" && s.app.fileStore != nil {
		if note, err := s.app.fileStore.ReadNote(sceneName); err == nil {
			result.NoteMarkdown = note.Markdown
		}
	}
	return result
}

func (s *geometryWorkflowService) readGeometrySpec(sceneName string) (GeometrySpec, error) {
	if s.app.fileStore == nil {
		return GeometrySpec{}, errors.New("file store is not ready")
	}
	sceneDir, err := s.app.fileStore.SceneDir(sceneName)
	if err != nil {
		return GeometrySpec{}, err
	}
	content, err := os.ReadFile(filepath.Join(sceneDir, "geometry-spec.json"))
	if err != nil {
		return GeometrySpec{}, err
	}
	var spec GeometrySpec
	if err := json.Unmarshal(content, &spec); err != nil {
		return GeometrySpec{}, err
	}
	return normalizeGeometrySpec(spec), nil
}

func (s *geometryWorkflowService) readGeometryScene(sceneName string) (GeometryScene, error) {
	if s.app.fileStore == nil {
		return GeometryScene{}, errors.New("file store is not ready")
	}
	sceneDir, err := s.app.fileStore.SceneDir(sceneName)
	if err != nil {
		return GeometryScene{}, err
	}
	content, err := os.ReadFile(filepath.Join(sceneDir, "geometry-scene.json"))
	if err != nil {
		return GeometryScene{}, err
	}
	var scene GeometryScene
	if err := json.Unmarshal(content, &scene); err != nil {
		return GeometryScene{}, err
	}
	return normalizeGeometryScene(scene), nil
}

func (s *geometryWorkflowService) readGeometryConstruction(sceneName string) (GeometryConstruction, error) {
	if s.app.fileStore == nil {
		return GeometryConstruction{}, errors.New("file store is not ready")
	}
	sceneDir, err := s.app.fileStore.SceneDir(sceneName)
	if err != nil {
		return GeometryConstruction{}, err
	}
	content, err := os.ReadFile(filepath.Join(sceneDir, "geometry-construction.json"))
	if err != nil {
		return GeometryConstruction{}, err
	}
	var construction GeometryConstruction
	if err := json.Unmarshal(content, &construction); err != nil {
		return GeometryConstruction{}, err
	}
	return normalizeGeometryConstruction(construction), nil
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
	result.Construction = normalizeGeometryConstruction(result.Construction)
	result.Scene = normalizeGeometryScene(result.Scene)
	result = normalizeGeometryWorkflowResult(result)
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
	constructionBytes, err := json.MarshalIndent(result.Construction, "", "  ")
	if err != nil {
		return result, err
	}
	if err := os.WriteFile(filepath.Join(sceneDir, "geometry-construction.json"), constructionBytes, 0o644); err != nil {
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
	result.Construction = normalizeGeometryConstruction(result.Construction)
	result.Scene = normalizeGeometryScene(result.Scene)
	result = normalizeGeometryWorkflowResult(result)
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

func (s *geometryWorkflowService) finishFailed(sessionID string, sceneName string, errorText string, diagnostics []string, repairable bool, result GeometryWorkflowResult) {
	if !s.clearActive(sessionID) {
		return
	}
	errorText = redactGeometrySensitiveText(errorText)
	diagnostics = redactGeometryDiagnostics(diagnostics)
	if result.Diagnostics == nil {
		result.Diagnostics = diagnostics
	}
	result.Spec = normalizeGeometrySpec(result.Spec)
	result.Construction = normalizeGeometryConstruction(result.Construction)
	result.Scene = normalizeGeometryScene(result.Scene)
	result = normalizeGeometryWorkflowResult(result)
	s.app.emit(EventGeometryFailed, GeometryWorkflowFailedEvent{
		SessionID:   sessionID,
		SceneName:   sceneName,
		ErrorText:   firstNonEmpty(errorText, "Geometry workflow failed"),
		Diagnostics: diagnostics,
		Repairable:  repairable,
		Result:      result,
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

func normalizeGeometryConstruction(construction GeometryConstruction) GeometryConstruction {
	if construction.Version <= 0 {
		construction.Version = 1
	}
	if construction.Objects == nil {
		construction.Objects = []map[string]any{}
	}
	if construction.Constraints == nil {
		construction.Constraints = []map[string]any{}
	}
	if construction.ConstructionIntent == nil {
		construction.ConstructionIntent = []map[string]any{}
	}
	if construction.Solution == nil {
		construction.Solution = map[string]any{}
	}
	if construction.Validation == nil {
		construction.Validation = map[string]any{}
	}
	if construction.Diagnostics == nil {
		construction.Diagnostics = []string{}
	}
	if construction.MissingObjects == nil {
		construction.MissingObjects = map[string]any{}
	}
	if construction.FailedConditions == nil {
		construction.FailedConditions = []any{}
	}
	if construction.AttemptHistory == nil {
		construction.AttemptHistory = []map[string]any{}
	}
	return construction
}

func normalizeGeometryWorkflowResult(result GeometryWorkflowResult) GeometryWorkflowResult {
	result.ValidationSummary = normalizeGeometryMap(result.ValidationSummary)
	if result.MissingObjects == nil {
		result.MissingObjects = map[string]any{}
	}
	if result.FailedConditions == nil {
		result.FailedConditions = []any{}
	}
	if result.ObjectScore == 0 && result.Construction.ObjectScore != 0 {
		result.ObjectScore = result.Construction.ObjectScore
	}
	if result.ConditionScore == 0 && result.Construction.ConditionScore != 0 {
		result.ConditionScore = result.Construction.ConditionScore
	}
	if result.TotalScore == 0 && result.Construction.TotalScore != 0 {
		result.TotalScore = result.Construction.TotalScore
	}
	if len(result.MissingObjects) == 0 && len(result.Construction.MissingObjects) > 0 {
		result.MissingObjects = result.Construction.MissingObjects
	}
	if len(result.FailedConditions) == 0 && len(result.Construction.FailedConditions) > 0 {
		result.FailedConditions = result.Construction.FailedConditions
	}
	if result.Iterations == 0 && result.Construction.Iterations != 0 {
		result.Iterations = result.Construction.Iterations
	}
	return result
}

func normalizeGeometryMap(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return value
}

func normalizeGeometryAttemptHistory(value []map[string]any) []map[string]any {
	if value == nil {
		return []map[string]any{}
	}
	return value
}

func isEmptyGeometrySpec(spec GeometrySpec) bool {
	return spec.ProblemText == "" &&
		spec.GoalText == "" &&
		len(spec.Entities) == 0 &&
		len(spec.Constraints) == 0 &&
		len(spec.ConstructionHints) == 0 &&
		spec.Confidence == 0
}

func isEmptyGeometryConstruction(construction GeometryConstruction) bool {
	return construction.DSLCode == "" &&
		len(construction.Objects) == 0 &&
		len(construction.Constraints) == 0 &&
		len(construction.ConstructionIntent) == 0 &&
		len(construction.Solution) == 0 &&
		len(construction.Validation) == 0 &&
		construction.ReviewStatus == "" &&
		construction.SpecFingerprint == "" &&
		len(construction.Diagnostics) == 0 &&
		construction.ObjectScore == 0 &&
		construction.ConditionScore == 0 &&
		construction.TotalScore == 0 &&
		len(construction.MissingObjects) == 0 &&
		len(construction.FailedConditions) == 0 &&
		construction.Iterations == 0 &&
		len(construction.AttemptHistory) == 0
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
	if scene.Arcs == nil {
		scene.Arcs = []GeometryArc{}
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
		len(scene.Arcs) == 0 &&
		len(scene.Polygons) == 0 &&
		len(scene.Controls) == 0 &&
		len(scene.Measurements) == 0 &&
		len(scene.Constraints) == 0 &&
		len(scene.Annotations) == 0 &&
		len(scene.ProofSteps) == 0
}

func isRepairableGeometryResult(result GeometryWorkflowResult) bool {
	return strings.TrimSpace(result.Code) != "" && !isEmptyGeometryScene(result.Scene)
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

func (a *App) RepairGeometryWorkflow(request GeometryWorkflowRepairRequest) (GeometryWorkflowSession, error) {
	if err := a.requireContext(); err != nil {
		return GeometryWorkflowSession{}, err
	}
	if a.geometryWorkflow == nil {
		return GeometryWorkflowSession{}, errors.New("geometry workflow service is not ready")
	}
	return a.geometryWorkflow.Repair(a.ctx, request)
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
