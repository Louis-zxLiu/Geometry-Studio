package repair

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"plotkitycat/internal/ai/provider"
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

func (s *Service) RepairCode(ctx context.Context, request Request) (Result, error) {
	raw, err := s.router.Chat(ctx, provider.ChatRequest{
		Settings:     request.Settings,
		SystemPrompt: strings.TrimSpace(s.prompts.Load(resolvePromptPath(request.Settings.Mode))),
		UserPrompt:   buildUserPrompt(request),
	})
	if err != nil {
		return Result{}, err
	}

	patch := stripFence(raw)
	if strings.TrimSpace(patch) == "" {
		return Result{}, fmt.Errorf("AI 修复没有返回可用补丁")
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

	return filepath.Join("repair", filename)
}

func buildUserPrompt(request Request) string {
	return strings.Join([]string{
		fmt.Sprintf("场景名：%s", request.SceneName),
		"",
		"运行错误：",
		strings.TrimSpace(request.ErrorText),
		"",
		"完整源代码：",
		"```python",
		request.CurrentCode,
		"```",
	}, "\n")
}

func stripFence(raw string) string {
	trimmed := strings.TrimSpace(raw)
	fenceStart := strings.Index(trimmed, "```")
	if fenceStart < 0 {
		return trimmed
	}

	content := trimmed[fenceStart+3:]
	if lineBreak := strings.Index(content, "\n"); lineBreak >= 0 {
		content = content[lineBreak+1:]
	} else {
		return ""
	}

	end := strings.Index(content, "```")
	if end < 0 {
		return strings.TrimSpace(content)
	}

	return strings.TrimSpace(content[:end])
}
