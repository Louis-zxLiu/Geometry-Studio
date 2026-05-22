package generation

import "plotkitycat/internal/ai/provider"

type Kind string

const (
	KindVisualize Kind = "visualize"
	KindDesign    Kind = "design"
)

type SelectionItem struct {
	Kind         string
	Text         string
	Name         string
	Alt          string
	DataURL      string
	RelativePath string
}

type SelectionPayload struct {
	Items []SelectionItem
}

type Request struct {
	Kind        Kind
	SceneName   string
	CurrentCode string
	Settings    provider.Settings
	Selection   SelectionPayload
}

type Result struct {
	Code   string
	Source string
}
