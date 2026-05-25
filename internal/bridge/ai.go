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
		Kind:        ai.GenerationKind(request.Kind),
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

func (a *App) RepairCodeFromRunError(request AIRepairRequest) (AIRepairResult, error) {
	if request.CurrentCode == "" {
		return AIRepairResult{}, errors.New("当前代码为空，无法进行 AI 修复")
	}
	if request.ErrorText == "" {
		return AIRepairResult{}, errors.New("缺少运行错误信息，无法进行 AI 修复")
	}

	result, err := a.aiService.Repair(a.ctx, ai.RepairRequest{
		SceneName:   request.SceneName,
		CurrentCode: request.CurrentCode,
		ErrorText:   request.ErrorText,
		Settings: ai.ProviderSettings{
			Mode:  ai.ServiceMode(request.Settings.Mode),
			URL:   request.Settings.URL,
			Key:   request.Settings.Key,
			Model: request.Settings.Model,
		},
	})
	if err != nil {
		return AIRepairResult{}, err
	}

	return AIRepairResult{
		Patch:  result.Patch,
		Source: result.Source,
	}, nil
}

func (a *App) OptimizeCode(request AIOptimizeRequest) (AIOptimizeResult, error) {
	if request.CurrentCode == "" {
		return AIOptimizeResult{}, errors.New("当前代码为空，无法进行 AI 优化")
	}
	if request.Instruction == "" {
		return AIOptimizeResult{}, errors.New("请输入想让 AI 微调的内容")
	}

	result, err := a.aiService.Optimize(a.ctx, ai.OptimizeRequest{
		SceneName:   request.SceneName,
		CurrentCode: request.CurrentCode,
		Instruction: request.Instruction,
		Settings: ai.ProviderSettings{
			Mode:  ai.ServiceMode(request.Settings.Mode),
			URL:   request.Settings.URL,
			Key:   request.Settings.Key,
			Model: request.Settings.Model,
		},
	})
	if err != nil {
		return AIOptimizeResult{}, err
	}

	return AIOptimizeResult{
		Patch:  result.Patch,
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
