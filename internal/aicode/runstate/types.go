package runstate

type FailureKind string

const (
	FailureKindRunError    FailureKind = "run_error"
	FailureKindInterrupted FailureKind = "interrupted"
	FailureKindNoReady     FailureKind = "no_ready"
	FailureKindAIError     FailureKind = "ai_error"
	FailureKindPatchError  FailureKind = "patch_error"
)

type ExecutionStatus string

const (
	ExecutionStatusReady       ExecutionStatus = "ready"
	ExecutionStatusFailed      ExecutionStatus = "failed"
	ExecutionStatusFinished    ExecutionStatus = "finished"
	ExecutionStatusInterrupted ExecutionStatus = "interrupted"
)

type ExecutionResult struct {
	Status    ExecutionStatus
	ErrorText string
}

type NormalizedRunFailure struct {
	Kind       FailureKind `json:"kind"`
	ErrorText  string      `json:"errorText"`
	Repairable bool        `json:"repairable"`
}
