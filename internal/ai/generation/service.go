package generation

import (
	"context"
	"path/filepath"
	"strings"

	"plotkitycat/internal/ai/prompting"
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

func (s *Service) GenerateCode(ctx context.Context, request Request) (Result, error) {
	promptItems := mapPromptItems(request.Selection.Items)
	raw, err := s.router.Chat(ctx, provider.ChatRequest{
		Settings:     request.Settings,
		SystemPrompt: prompting.BuildSystemPrompt(s.prompts.Load(resolvePromptPath(request.Settings.Mode, request.Kind))),
		UserPrompt: prompting.BuildUserPrompt(prompting.Request{
			SceneName:   request.SceneName,
			CurrentCode: request.CurrentCode,
			Selection:   promptItems,
		}),
		Images: prompting.ExtractImageDataURLs(promptItems),
	})
	if err != nil {
		return Result{}, err
	}

	return Result{
		Code:   extractCode(raw),
		Source: string(request.Settings.Mode),
	}, nil
}

func normalizeKind(kind Kind) Kind {
	if kind == KindDesign {
		return KindDesign
	}

	return KindVisualize
}

func resolvePromptPath(mode provider.ServiceMode, kind Kind) string {
	filename := "custom.txt"
	if mode == provider.ModeSubscription {
		filename = "subscription.txt"
	}

	if normalizeKind(kind) == KindDesign {
		return filepath.Join("design", filename)
	}

	return filename
}

func mapPromptItems(items []SelectionItem) []prompting.SelectionItem {
	mapped := make([]prompting.SelectionItem, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, prompting.SelectionItem{
			Kind:         item.Kind,
			Text:         item.Text,
			Name:         item.Name,
			Alt:          item.Alt,
			DataURL:      item.DataURL,
			RelativePath: item.RelativePath,
		})
	}

	return mapped
}

func extractCode(raw string) string {
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
