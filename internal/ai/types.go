package ai

import "context"

type ServiceMode string

const (
	ModeCustom       ServiceMode = "custom"
	ModeSubscription ServiceMode = "subscription"
)

type ProviderSettings struct {
	Mode  ServiceMode
	URL   string
	Key   string
	Model string
}

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

type GenerationRequest struct {
	SceneName   string
	CurrentCode string
	Settings    ProviderSettings
	Selection   SelectionPayload
}

type GenerationResult struct {
	Code   string
	Source string
}

type SubscriptionSession struct {
	Token    string
	BaseURL  string
	Model    string
	DeviceID string
}

type SubscriptionSessionProvider interface {
	Session(context.Context, bool) (SubscriptionSession, error)
}
