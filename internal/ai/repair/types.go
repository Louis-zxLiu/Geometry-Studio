package repair

import "plotkitycat/internal/ai/provider"

type Request struct {
	SceneName   string
	CurrentCode string
	ErrorText   string
	Settings    provider.Settings
}

type Result struct {
	Patch  string
	Source string
}
