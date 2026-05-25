package optimize

import "plotkitycat/internal/ai/provider"

type Request struct {
	SceneName   string
	CurrentCode string
	Instruction string
	Settings    provider.Settings
}

type Result struct {
	Patch  string
	Source string
}
