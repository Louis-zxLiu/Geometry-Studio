package ai

import (
	"context"

	"plotkitycat/internal/ai/openai"
	"plotkitycat/internal/ai/prompting"
)

type CustomGenerator struct {
	client  *openai.Client
	prompts *PromptRepository
}

func NewCustomGenerator(prompts *PromptRepository) *CustomGenerator {
	return &CustomGenerator{
		client:  openai.NewClient(),
		prompts: prompts,
	}
}

func (g *CustomGenerator) Generate(ctx context.Context, request GenerationRequest) (string, error) {
	promptTemplate := g.loadPrompt("custom.txt")
	promptItems := mapPromptItems(request.Selection.Items)
	return g.client.Generate(ctx, openai.Request{
		BaseURL:      request.Settings.URL,
		APIKey:       request.Settings.Key,
		Model:        request.Settings.Model,
		SystemPrompt: prompting.BuildSystemPrompt(promptTemplate),
		UserPrompt: prompting.BuildUserPrompt(prompting.Request{
			SceneName:   request.SceneName,
			CurrentCode: request.CurrentCode,
			Prompt:      promptTemplate,
			Selection:   promptItems,
		}),
		Images: prompting.ExtractImageDataURLs(promptItems),
	})
}

func (g *CustomGenerator) loadPrompt(name string) string {
	if g.prompts == nil {
		return ""
	}

	return g.prompts.Load(name)
}
