package ai

import (
	"context"

	"plotkitycat/internal/ai/openai"
	"plotkitycat/internal/ai/prompting"
	"plotkitycat/internal/subscription"
)

type SubscriptionGenerator struct {
	client              *openai.Client
	prompts             *PromptRepository
	subscriptionService *subscription.Service
}

func NewSubscriptionGenerator(prompts *PromptRepository, subscriptionService *subscription.Service) *SubscriptionGenerator {
	return &SubscriptionGenerator{
		client:              openai.NewClient(),
		prompts:             prompts,
		subscriptionService: subscriptionService,
	}
}

func (g *SubscriptionGenerator) Generate(ctx context.Context, request GenerationRequest) (string, error) {
	if g.subscriptionService == nil {
		return "", errSubscriptionServiceUnavailable
	}

	session, err := g.subscriptionService.Session(ctx, false)
	if err != nil {
		return "", err
	}

	promptItems := mapPromptItems(request.Selection.Items)
	promptTemplate := g.loadPrompt(resolvePromptPath(ModeSubscription, request.Kind))
	return g.client.Generate(ctx, openai.Request{
		BaseURL:      session.BaseURL,
		APIKey:       session.Token,
		Model:        firstNonEmptyString(session.Model, request.Settings.Model),
		SystemPrompt: prompting.BuildSystemPrompt(promptTemplate),
		UserPrompt: prompting.BuildUserPrompt(prompting.Request{
			SceneName:   request.SceneName,
			CurrentCode: request.CurrentCode,
			Selection:   promptItems,
		}),
		Images: prompting.ExtractImageDataURLs(promptItems),
	})
}

func (g *SubscriptionGenerator) loadPrompt(name string) string {
	if g.prompts == nil {
		return ""
	}

	return g.prompts.Load(name)
}
