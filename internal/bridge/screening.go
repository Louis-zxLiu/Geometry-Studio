package bridge

import "plotkitycat/internal/screening"

func (a *App) StartScreening(request ScreeningStartRequest) (ScreeningSessionState, error) {
	state, err := a.screeningService.Start(screening.StartRequest{
		SceneNames: request.SceneNames,
		StartIndex: request.StartIndex,
		PoolSize:   request.PoolSize,
		Animation:  screening.Animation(request.Animation),
	})
	if err != nil {
		return ScreeningSessionState{}, err
	}

	return mapScreeningState(state), nil
}

func (a *App) NextScreeningPage() (ScreeningSessionState, error) {
	state, err := a.screeningService.Next()
	if err != nil {
		return ScreeningSessionState{}, err
	}

	return mapScreeningState(state), nil
}

func (a *App) PreviousScreeningPage() (ScreeningSessionState, error) {
	state, err := a.screeningService.Previous()
	if err != nil {
		return ScreeningSessionState{}, err
	}

	return mapScreeningState(state), nil
}

func (a *App) StopScreening() (ScreeningStopResult, error) {
	result, err := a.screeningService.Stop()
	if err != nil {
		return ScreeningStopResult{}, err
	}

	return ScreeningStopResult{
		Handled: result.Handled,
		Message: result.Message,
	}, nil
}

func (a *App) GetScreeningState() (ScreeningSessionState, error) {
	return mapScreeningState(a.screeningService.State()), nil
}
