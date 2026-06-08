package operations

import (
	"context"
	"errors"
	"fmt"

	"plotkitycat/internal/ai"
	"plotkitycat/internal/aicode/patch"
	"plotkitycat/internal/aicode/runstate"
)

const (
	KindOptimize  = "optimize"
	KindRepair    = "repair"
	KindVisualize = "visualize"
)

type BuildRequest struct {
	Kind        string
	SceneName   string
	CurrentCode string
	Instruction string
	ErrorText   string
	Selection   ai.SelectionPayload
	Settings    ai.ProviderSettings
	Attempt     int
	LastFailure *runstate.NormalizedRunFailure
}

type BuildResult struct {
	Code          string
	ChangedRanges []patch.ChangedLineRange
	Source        string
}

type BuildErrorKind string

const (
	BuildErrorKindAI    BuildErrorKind = "ai"
	BuildErrorKindPatch BuildErrorKind = "patch"
)

type BuildError struct {
	Kind BuildErrorKind
	Err  error
}

func (e *BuildError) Error() string {
	return e.Err.Error()
}

func (e *BuildError) Unwrap() error {
	return e.Err
}

type Service struct {
	aiService *ai.Service
}

func NewService(aiService *ai.Service) *Service {
	return &Service{aiService: aiService}
}

func (s *Service) Build(ctx context.Context, request BuildRequest) (BuildResult, error) {
	if request.Attempt <= 0 {
		return BuildResult{}, &BuildError{
			Kind: BuildErrorKindAI,
			Err:  errors.New("invalid workflow attempt"),
		}
	}

	if request.Attempt > 1 {
		return s.buildRepair(ctx, request.SceneName, request.CurrentCode, request.repairErrorText(), request.Settings)
	}

	switch request.Kind {
	case KindOptimize:
		return s.buildOptimize(ctx, request)
	case KindRepair:
		return s.buildRepair(ctx, request.SceneName, request.CurrentCode, request.repairErrorText(), request.Settings)
	case KindVisualize:
		return s.buildVisualize(ctx, request)
	default:
		return BuildResult{}, &BuildError{
			Kind: BuildErrorKindAI,
			Err:  fmt.Errorf("unsupported AI workflow kind: %s", request.Kind),
		}
	}
}

func (s *Service) buildOptimize(ctx context.Context, request BuildRequest) (BuildResult, error) {
	if request.CurrentCode == "" {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: errors.New("当前代码为空，无法进行 AI 优化")}
	}
	if request.Instruction == "" {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: errors.New("请输入想让 AI 微调的内容")}
	}

	result, err := s.aiService.Optimize(ctx, ai.OptimizeRequest{
		SceneName:   request.SceneName,
		CurrentCode: request.CurrentCode,
		Instruction: request.Instruction,
		Settings:    request.Settings,
	})
	if err != nil {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: err}
	}

	applied, err := patch.ApplyRepairPatch(request.CurrentCode, result.Patch)
	if err != nil {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindPatch, Err: err}
	}

	return BuildResult{
		Code:          applied.Code,
		ChangedRanges: applied.ChangedRanges,
		Source:        result.Source,
	}, nil
}

func (s *Service) buildRepair(ctx context.Context, sceneName string, currentCode string, errorText string, settings ai.ProviderSettings) (BuildResult, error) {
	if currentCode == "" {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: errors.New("当前代码为空，无法进行 AI 修复")}
	}
	if errorText == "" {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: errors.New("缺少运行错误信息，无法进行 AI 修复")}
	}

	result, err := s.aiService.Repair(ctx, ai.RepairRequest{
		SceneName:   sceneName,
		CurrentCode: currentCode,
		ErrorText:   errorText,
		Settings:    settings,
	})
	if err != nil {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: err}
	}

	applied, err := patch.ApplyRepairPatch(currentCode, result.Patch)
	if err != nil {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindPatch, Err: err}
	}

	return BuildResult{
		Code:          applied.Code,
		ChangedRanges: applied.ChangedRanges,
		Source:        result.Source,
	}, nil
}

func (s *Service) buildVisualize(ctx context.Context, request BuildRequest) (BuildResult, error) {
	if len(request.Selection.Items) == 0 {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: errors.New("请先在笔记区选择文字或图片")}
	}

	result, err := s.aiService.Generate(ctx, ai.GenerationRequest{
		Kind:        ai.GenerationKindVisualize,
		SceneName:   request.SceneName,
		CurrentCode: request.CurrentCode,
		Settings:    request.Settings,
		Selection:   request.Selection,
	})
	if err != nil {
		return BuildResult{}, &BuildError{Kind: BuildErrorKindAI, Err: err}
	}

	applied := patch.ApplyGeneratedCode(request.CurrentCode, result.Code)
	return BuildResult{
		Code:          applied.Code,
		ChangedRanges: applied.ChangedRanges,
		Source:        result.Source,
	}, nil
}

func (r BuildRequest) repairErrorText() string {
	if r.Attempt > 1 && r.LastFailure != nil {
		return r.LastFailure.ErrorText
	}

	return r.ErrorText
}
