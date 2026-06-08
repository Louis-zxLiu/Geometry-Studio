package bridge

import "plotkitycat/internal/aicode/workflow"

type aiWorkflowEventSink struct {
	app *App
}

func newAIWorkflowEventSink(app *App) aiWorkflowEventSink {
	return aiWorkflowEventSink{app: app}
}

func (s aiWorkflowEventSink) Started(session workflow.Session) {
	s.app.emit(EventAIWorkflowStarted, AIWorkflowSession{
		SessionID: session.ID,
		State:     string(session.State),
	})
}

func (s aiWorkflowEventSink) StateChanged(event workflow.StateChangedEvent) {
	s.app.emit(EventAIWorkflowState, event)
}

func (s aiWorkflowEventSink) CodeApplied(event workflow.CodeAppliedEvent) {
	s.app.emit(EventAIWorkflowApplied, event)
}

func (s aiWorkflowEventSink) Succeeded(event workflow.SucceededEvent) {
	s.app.emit(EventAIWorkflowSucceeded, event)
}

func (s aiWorkflowEventSink) Failed(event workflow.FailedEvent) {
	s.app.emit(EventAIWorkflowFailed, AIWorkflowFailedEvent{
		SessionID:  event.SessionID,
		SceneName:  event.SceneName,
		Kind:       event.Kind,
		ErrorText:  event.ErrorText,
		Repairable: event.Repairable,
		Attempt:    event.Attempt,
	})
}

func (s aiWorkflowEventSink) Interrupted(event workflow.InterruptedEvent) {
	s.app.emit(EventAIWorkflowStopped, event)
}
