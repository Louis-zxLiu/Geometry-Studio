package ai

import "plotkitycat/internal/ai/prompting"

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
