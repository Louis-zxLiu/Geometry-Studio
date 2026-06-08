package workflow

import (
	"context"
	"sync"

	"plotkitycat/internal/aicode/runstate"
)

type RunnerCallbacks struct {
	OnError  func(error)
	OnFinish func()
	OnReady  func()
	OnStart  func()
	OnStop   func()
}

type Executor interface {
	Execute(ctx context.Context, sceneName string, code string) runstate.ExecutionResult
	Stop() error
}

type RunnerExecutor struct {
	ensureReady func() error
	saveScene   func(sceneName string, code string) error
	startRun    func(sceneName string, callbacks RunnerCallbacks) error
	stopRun     func() error
}

func NewRunnerExecutor(
	ensureReady func() error,
	saveScene func(sceneName string, code string) error,
	startRun func(sceneName string, callbacks RunnerCallbacks) error,
	stopRun func() error,
) *RunnerExecutor {
	return &RunnerExecutor{
		ensureReady: ensureReady,
		saveScene:   saveScene,
		startRun:    startRun,
		stopRun:     stopRun,
	}
}

func (e *RunnerExecutor) Execute(ctx context.Context, sceneName string, code string) runstate.ExecutionResult {
	if err := e.ensureReady(); err != nil {
		return runstate.ExecutionResult{
			Status:    runstate.ExecutionStatusFailed,
			ErrorText: err.Error(),
		}
	}
	if err := e.saveScene(sceneName, code); err != nil {
		return runstate.ExecutionResult{
			Status:    runstate.ExecutionStatusFailed,
			ErrorText: err.Error(),
		}
	}

	resultCh := make(chan runstate.ExecutionResult, 1)
	var once sync.Once
	complete := func(result runstate.ExecutionResult) {
		once.Do(func() {
			resultCh <- result
		})
	}

	if err := e.startRun(sceneName, RunnerCallbacks{
		OnReady: func() {
			complete(runstate.ExecutionResult{Status: runstate.ExecutionStatusReady})
		},
		OnFinish: func() {
			complete(runstate.ExecutionResult{Status: runstate.ExecutionStatusFinished})
		},
		OnStop: func() {
			complete(runstate.ExecutionResult{
				Status:    runstate.ExecutionStatusInterrupted,
				ErrorText: "已中断 AI 检查",
			})
		},
		OnError: func(err error) {
			complete(runstate.ExecutionResult{
				Status:    runstate.ExecutionStatusFailed,
				ErrorText: err.Error(),
			})
		},
	}); err != nil {
		return runstate.ExecutionResult{
			Status:    runstate.ExecutionStatusFailed,
			ErrorText: err.Error(),
		}
	}

	select {
	case result := <-resultCh:
		return result
	case <-ctx.Done():
		if err := e.stopRun(); err != nil {
			complete(runstate.ExecutionResult{
				Status:    runstate.ExecutionStatusFailed,
				ErrorText: err.Error(),
			})
		} else {
			complete(runstate.ExecutionResult{
				Status:    runstate.ExecutionStatusInterrupted,
				ErrorText: "已中断 AI 检查",
			})
		}
		return <-resultCh
	}
}

func (e *RunnerExecutor) Stop() error {
	return e.stopRun()
}
