package workflow

import (
	"plotkitycat/internal/ai"
	"plotkitycat/internal/aicode/patch"
	"plotkitycat/internal/aicode/runstate"
)

type WorkflowState string

const (
	WorkflowStateIdle        WorkflowState = "idle"
	WorkflowStateWorking     WorkflowState = "working"
	WorkflowStateChecking    WorkflowState = "checking"
	WorkflowStateSucceeded   WorkflowState = "succeeded"
	WorkflowStateFailed      WorkflowState = "failed"
	WorkflowStateInterrupted WorkflowState = "interrupted"
)

type Request struct {
	Kind        string
	SceneName   string
	CurrentCode string
	Instruction string
	ErrorText   string
	Selection   ai.SelectionPayload
	MaxAttempts int
	Settings    ai.ProviderSettings
}

type Session struct {
	ID          string        `json:"sessionId"`
	SceneName   string        `json:"sceneName"`
	Kind        string        `json:"kind"`
	Attempts    int           `json:"attempts"`
	MaxAttempts int           `json:"maxAttempts"`
	State       WorkflowState `json:"state"`
	Stopped     bool          `json:"stopped"`
}

type StateChangedEvent struct {
	SessionID string        `json:"sessionId"`
	State     WorkflowState `json:"state"`
	Attempt   int           `json:"attempt"`
}

type CodeAppliedEvent struct {
	SessionID     string                   `json:"sessionId"`
	SceneName     string                   `json:"sceneName"`
	Code          string                   `json:"code"`
	ChangedRanges []patch.ChangedLineRange `json:"changedRanges"`
	Attempt       int                      `json:"attempt"`
}

type FailedEvent struct {
	SessionID  string               `json:"sessionId"`
	SceneName  string               `json:"sceneName"`
	Kind       runstate.FailureKind `json:"kind"`
	ErrorText  string               `json:"errorText"`
	Repairable bool                 `json:"repairable"`
	Attempt    int                  `json:"attempt"`
}

type SucceededEvent struct {
	SessionID string `json:"sessionId"`
	SceneName string `json:"sceneName"`
	Attempt   int    `json:"attempt"`
}

type InterruptedEvent struct {
	SessionID string `json:"sessionId"`
	SceneName string `json:"sceneName"`
	Attempt   int    `json:"attempt"`
	Message   string `json:"message"`
}

type EventSink interface {
	Started(Session)
	StateChanged(StateChangedEvent)
	CodeApplied(CodeAppliedEvent)
	Succeeded(SucceededEvent)
	Failed(FailedEvent)
	Interrupted(InterruptedEvent)
}
