package bridge

import (
	"errors"

	"plotkitycat/internal/ai"
)

func (a *App) GenerateCodeFromSelection(request AIGenerationRequest) (AIGenerationResult, error) {
	if len(request.Selection.Items) == 0 {
		return AIGenerationResult{}, errors.New("请先在笔记区选择文字或图片")
	}

	result, err := a.aiService.Generate(a.ctx, ai.GenerationRequest{
		SceneName:   request.SceneName,
		CurrentCode: request.CurrentCode,
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
		return AIGenerationResult{}, err
	}

	return AIGenerationResult{
		Code:   result.Code,
		Source: result.Source,
	}, nil
}

func mapAISelectionItems(items []AISelectionItem) []ai.SelectionItem {
	mapped := make([]ai.SelectionItem, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, ai.SelectionItem{
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
