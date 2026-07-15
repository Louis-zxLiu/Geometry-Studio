package generation

import (
	"context"
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
		SystemPrompt: prompting.BuildSystemPrompt(s.prompts.Load(resolvePromptPath(request.Settings.Mode))),
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

func resolvePromptPath(mode provider.ServiceMode) string {
	filename := "custom.txt"
	if mode == provider.ModeSubscription {
		filename = "subscription.txt"
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
		return sanitizeMatplotlibTextSymbols(trimmed)
	}

	content := trimmed[fenceStart+3:]
	if lineBreak := strings.Index(content, "\n"); lineBreak >= 0 {
		content = content[lineBreak+1:]
	} else {
		return ""
	}

	end := strings.Index(content, "```")
	if end < 0 {
		return sanitizeMatplotlibTextSymbols(strings.TrimSpace(content))
	}

	return sanitizeMatplotlibTextSymbols(strings.TrimSpace(content[:end]))
}

func sanitizeMatplotlibTextSymbols(code string) string {
	replacer := strings.NewReplacer(
		`\u2713`, "正确",
		`\U00002713`, "正确",
		"✓", "正确",
		`\u2714`, "通过",
		`\U00002714`, "通过",
		"✔", "通过",
		`\u2705`, "通过",
		`\U00002705`, "通过",
		"✅", "通过",
		`\u2717`, "错误",
		`\U00002717`, "错误",
		"✗", "错误",
		`\u2718`, "错误",
		`\U00002718`, "错误",
		"✘", "错误",
		`\u274c`, "错误",
		`\U0000274C`, "错误",
		`\U0000274c`, "错误",
		"❌", "错误",
		`\u2611`, "是",
		`\U00002611`, "是",
		"☑", "是",
		`\u2612`, "否",
		`\U00002612`, "否",
		"☒", "否",
		`\ufe0f`, "",
		"\ufe0f", "",
	)
	return replacer.Replace(code)
}
