package ai

import (
	"context"
	"path/filepath"

	"plotkitycat/internal/subscription"
)

type Service struct {
	router  *Router
	cleaner *Cleaner
}

func NewService(subscriptionService *subscription.Service) *Service {
	prompts := NewPromptRepository(filepath.Join("internal", "ai", "prompts"))
	return &Service{
		router: NewRouter(
			NewCustomGenerator(prompts),
			NewSubscriptionGenerator(prompts, subscriptionService),
		),
		cleaner: NewCleaner(),
	}
}

func (s *Service) Generate(ctx context.Context, request GenerationRequest) (GenerationResult, error) {
	raw, err := s.router.Route(ctx, request)
	if err != nil {
		return GenerationResult{}, err
	}

	return GenerationResult{
		Code:   s.cleaner.ExtractCode(raw),
		Source: string(request.Settings.Mode),
	}, nil
}
