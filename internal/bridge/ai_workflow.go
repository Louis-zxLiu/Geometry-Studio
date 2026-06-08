package bridge

import (
	"errors"

	"plotkitycat/internal/ai"
	"plotkitycat/internal/aicode/workflow"
)

func (a *App) StartAIWorkflow(request AIWorkflowRequest) (AIWorkflowSession, error) {
	if a.aiWorkflow == nil {
		return AIWorkflowSession{}, errors.New("AI workflow service is not ready")
	}

	session, err := a.aiWorkflow.Start(workflow.Request{
		Kind:        request.Kind,
		SceneName:   request.SceneName,
		CurrentCode: request.CurrentCode,
		Instruction: request.Instruction,
		ErrorText:   request.ErrorText,
		Selection: ai.SelectionPayload{
			Items: mapAISelectionItems(request.Selection.Items),
		},
		MaxAttempts: request.MaxAttempts,
		Settings: ai.ProviderSettings{
			Mode:  ai.ServiceMode(request.Settings.Mode),
			URL:   request.Settings.URL,
			Key:   request.Settings.Key,
			Model: request.Settings.Model,
		},
	})
	if err != nil {
		return AIWorkflowSession{}, err
	}

	return AIWorkflowSession{
		SessionID: session.ID,
		State:     string(session.State),
	}, nil
}

func (a *App) StopAIWorkflow(sessionID string) error {
	if a.aiWorkflow == nil {
		return errors.New("AI workflow service is not ready")
	}

	return a.aiWorkflow.Stop(sessionID)
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
