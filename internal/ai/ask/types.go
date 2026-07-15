package ask

import "plotkitycat/internal/ai/provider"

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
	SceneName   string
	CurrentCode string
	ContextKind string
	Question    string
	Settings    provider.Settings
	Selection   SelectionPayload
}

type Result struct {
	Answer string
	Source string
}
