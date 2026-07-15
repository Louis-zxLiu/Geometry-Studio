package bridge

import (
	"errors"

	"plotkitycat/internal/ai"
)

func (a *App) AskAI(request AIAskRequest) (AIAskResult, error) {
	if err := a.requireContext(); err != nil {
		return AIAskResult{}, err
	}
	if a.aiService == nil {
		return AIAskResult{}, errors.New("AI service is not ready")
	}

	result, err := a.aiService.Ask(a.ctx, ai.AskRequest{
		SceneName:   request.SceneName,
		CurrentCode: request.CurrentCode,
		ContextKind: request.ContextKind,
		Question:    request.Question,
		Settings: ai.ProviderSettings{
			Mode:  ai.ServiceMode(request.Settings.Mode),
			URL:   request.Settings.URL,
			Key:   request.Settings.Key,
			Model: request.Settings.Model,
		},
		Selection: ai.SelectionPayload{
			Items: mapAISelectionItems(request.Selection.Items),
		},
	})
	if err != nil {
		return AIAskResult{}, err
	}

	return AIAskResult{
		Answer: result.Answer,
		Source: result.Source,
	}, nil
}
