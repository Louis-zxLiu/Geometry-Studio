package optimize

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"plotkitycat/internal/ai/provider"
	"plotkitycat/internal/ai/repair"
)

type PromptLoader interface {
	Load(name string) string
}

type Service struct {
	router  *provider.Router
	prompts PromptLoader
}

func NewService(router *provider.Router, prompts PromptLoader) *Service {
	return &Service{
		router:  router,
		prompts: prompts,
	}
}

func (s *Service) OptimizeCode(ctx context.Context, request Request) (Result, error) {
	raw, err := s.router.Chat(ctx, provider.ChatRequest{
		Settings:     request.Settings,
		SystemPrompt: strings.TrimSpace(s.prompts.Load(resolvePromptPath(request.Settings.Mode))),
		UserPrompt:   buildUserPrompt(request),
	})
	if err != nil {
		return Result{}, err
	}

	patch := repair.StripFence(raw)
	if strings.TrimSpace(patch) == "" {
		return Result{}, fmt.Errorf("AI 优化没有返回可用补丁")
	}

	return Result{
		Patch:  patch,
		Source: string(request.Settings.Mode),
	}, nil
}

func resolvePromptPath(mode provider.ServiceMode) string {
	filename := "custom.txt"
	if mode == provider.ModeSubscription {
		filename = "subscription.txt"
	}

	return filepath.Join("optimize", filename)
}

func buildUserPrompt(request Request) string {
	return strings.Join([]string{
		fmt.Sprintf("场景名：%s", request.SceneName),
		"",
		"用户微调要求：",
		strings.TrimSpace(request.Instruction),
		"",
		"完整源代码：",
		"```python",
		request.CurrentCode,
		"```",
	}, "\n")
}
