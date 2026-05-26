package ai

import "plotkitycat/internal/ai/provider"

type SelectionItem struct {
	Kind         string
	Text         string
	Name         string
	Alt          string
	DataURL      string
	RelativePath string
}

type GenerateRequest struct {
	SceneName string
	Selection []SelectionItem
	Settings  provider.Settings
}

type OptimizeRequest struct {
	SceneName   string
	CardID      string
	CurrentPlan string
	CurrentSVG  string
	Instruction string
	Settings    provider.Settings
}

type Result struct {
	Title  string
	Plan   string
	SVG    string
	Source string
}
