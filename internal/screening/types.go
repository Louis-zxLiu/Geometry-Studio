package screening

type Animation string

const (
	AnimationCrossfade Animation = "crossfade"
	AnimationSlideLeft Animation = "slide-left"
)

type StartRequest struct {
	SceneNames []string
	StartIndex int
	PoolSize   int
	Animation  Animation
}

type StopResult struct {
	Handled bool
	Message string
}

type SessionState struct {
	Active           bool     `json:"active"`
	SceneNames       []string `json:"sceneNames"`
	CurrentIndex     int      `json:"currentIndex"`
	CurrentSceneName string   `json:"currentSceneName"`
	PoolSize         int      `json:"poolSize"`
	Animation        string   `json:"animation"`
}
