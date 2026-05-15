package bridge

const (
	EventAppReady            = "app:ready"
	EventAppError            = "app:error"
	EventEnvironmentStatus   = "env:status"
	EventEnvironmentProgress = "env:progress"
	EventScriptsLoaded       = "scripts:loaded"
	EventScriptSaved         = "script:saved"
	EventRunStarted          = "run:started"
	EventRunFinished         = "run:finished"
	EventRunStopped          = "run:stopped"
	EventRunFailed           = "run:failed"
)

type EventPayload struct {
	Filename string `json:"filename,omitempty"`
	Message  string `json:"message,omitempty"`
}

type RunErrorPayload struct {
	Filename  string `json:"filename"`
	ErrorType string `json:"errorType"`
	Traceback string `json:"traceback"`
	Error     string `json:"error"`
}
