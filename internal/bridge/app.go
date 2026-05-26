package bridge

import (
	"context"
	"errors"

	"plotkitycat/internal/ai"
	"plotkitycat/internal/codeversions"
	"plotkitycat/internal/designcards"
	designai "plotkitycat/internal/designcards/ai"
	"plotkitycat/internal/device"
	"plotkitycat/internal/env"
	"plotkitycat/internal/files"
	"plotkitycat/internal/runner"
	settingspkg "plotkitycat/internal/settings"
	"plotkitycat/internal/subscription"
	"plotkitycat/internal/updater"
	"plotkitycat/internal/workspaces"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx                 context.Context
	aiService           *ai.Service
	codeVersionStore    *codeversions.Store
	designCardService   *designcards.Service
	deviceService       *device.Service
	envManager          *env.Manager
	fileStore           *files.Store
	runner              *runner.Runner
	aiSettingsStore     *settingspkg.AIStore
	subscriptionService *subscription.Service
	updateService       *updater.Service
	workspaceManager    *workspaces.Manager
}

func NewApp() *App {
	deviceService := device.NewService()
	subscriptionService := subscription.NewService(deviceService)
	workspaceManager := workspaces.NewManager()
	fileStore := files.NewStore(workspaceManager)
	designCardStore := designcards.NewStore(fileStore)
	return &App{
		aiService:           ai.NewService(subscriptionService),
		codeVersionStore:    codeversions.NewStore(fileStore),
		designCardService:   designcards.NewService(designCardStore, designai.NewService(subscriptionService)),
		deviceService:       deviceService,
		envManager:          env.NewManager(workspaceManager),
		fileStore:           fileStore,
		runner:              runner.New(workspaceManager),
		aiSettingsStore:     settingspkg.NewAIStore(),
		subscriptionService: subscriptionService,
		updateService:       updater.NewService(),
		workspaceManager:    workspaceManager,
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) Shutdown(ctx context.Context) {
	a.runner.Shutdown()
}

func (a *App) emit(name string, payload any) {
	if a.ctx == nil {
		return
	}

	runtime.EventsEmit(a.ctx, name, payload)
}

func (a *App) requireContext() error {
	if a.ctx == nil {
		return errors.New("application context is not ready")
	}

	return nil
}

func (a *App) GetEnvironmentStatus() (EnvironmentStatus, error) {
	status, err := a.envManager.Status()
	if err != nil {
		return EnvironmentStatus{}, err
	}

	items := make([]EnvironmentCheckItem, 0, len(status.Items))
	for _, item := range status.Items {
		items = append(items, EnvironmentCheckItem{
			Key:          item.Key,
			Label:        item.Label,
			RelativePath: item.RelativePath,
			Category:     item.Category,
			Status:       item.Status,
			Message:      item.Message,
			Exists:       item.Exists,
		})
	}

	return EnvironmentStatus{
		Ready:                status.Ready,
		Code:                 status.Code,
		Severity:             status.Severity,
		RuntimeDir:           status.RuntimeDir,
		Summary:              status.Summary,
		RecommendedAction:    status.RecommendedAction,
		CheckedAt:            status.CheckedAt,
		Items:                items,
		Missing:              status.Missing,
		CanRebuild:           status.CanRebuild,
		RuntimeArchivePath:   status.RuntimeArchivePath,
		RuntimeArchiveExists: status.RuntimeArchiveExists,
	}, nil
}

func (a *App) InitializeApp() (InitSnapshot, error) {
	if err := a.requireContext(); err != nil {
		return InitSnapshot{}, err
	}

	err := a.envManager.EnsureReady(func(progress env.Progress) {
		a.emit(EventEnvironmentProgress, InitProgress{
			Stage:   progress.Stage,
			Message: progress.Message,
			Percent: progress.Percent,
		})
	})
	if err != nil {
		a.emit(EventAppError, EventPayload{
			Message: err.Error(),
		})
		return InitSnapshot{}, err
	}

	environment, err := a.GetEnvironmentStatus()
	if err != nil {
		return InitSnapshot{}, err
	}
	a.emit(EventEnvironmentStatus, environment)
	a.emit(EventAppReady, EventPayload{
		Message: "runtime ready",
	})

	workspace, err := a.BootstrapWorkspace()
	if err != nil {
		return InitSnapshot{}, err
	}

	return InitSnapshot{
		Environment: environment,
		Workspace:   workspace,
	}, nil
}

func (a *App) RebuildRuntime() (EnvironmentStatus, error) {
	if err := a.requireContext(); err != nil {
		return EnvironmentStatus{}, err
	}
	if a.runner.IsRunning() {
		return EnvironmentStatus{}, errors.New("请先停止当前 Python 进程，再重建 Runtime")
	}

	err := a.envManager.Rebuild(func(progress env.Progress) {
		a.emit(EventEnvironmentProgress, InitProgress{
			Stage:   progress.Stage,
			Message: progress.Message,
			Percent: progress.Percent,
		})
	})
	if err != nil {
		a.emit(EventAppError, EventPayload{
			Message: err.Error(),
		})
		return EnvironmentStatus{}, err
	}

	environment, err := a.GetEnvironmentStatus()
	if err != nil {
		return EnvironmentStatus{}, err
	}

	a.emit(EventEnvironmentStatus, environment)
	return environment, nil
}

func (a *App) GetSubscriptionStatus(force bool) (SubscriptionStatus, error) {
	if a.subscriptionService == nil {
		return SubscriptionStatus{
			Status:    "error",
			Message:   "订阅服务未初始化",
			Activated: false,
		}, nil
	}

	view, err := a.subscriptionService.Status(a.ctx, force)
	if err != nil {
		return SubscriptionStatus{}, err
	}

	return SubscriptionStatus{
		Status:        string(view.Status),
		Activated:     view.Activated,
		DeviceID:      view.DeviceID,
		ExpireAt:      view.ExpireAt,
		LastCheckedAt: view.LastCheckedAt,
		Message:       view.Message,
		Model:         view.Model,
		BaseURL:       view.BaseURL,
	}, nil
}

func (a *App) OpenSubscriptionPurchase() (SubscriptionPurchaseResult, error) {
	if err := a.requireContext(); err != nil {
		return SubscriptionPurchaseResult{}, err
	}
	if a.subscriptionService == nil {
		return SubscriptionPurchaseResult{
			Configured: false,
			Message:    "订阅服务未初始化",
		}, nil
	}

	link, err := a.subscriptionService.PurchaseLink()
	if err != nil {
		return SubscriptionPurchaseResult{}, err
	}
	if link.Configured && link.URL != "" {
		runtime.BrowserOpenURL(a.ctx, link.URL)
	}

	return SubscriptionPurchaseResult{
		Configured: link.Configured,
		URL:        link.URL,
		DeviceID:   link.DeviceID,
		Message:    link.Message,
	}, nil
}

func (a *App) GetAISettings() (AIProviderSettings, error) {
	if a.aiSettingsStore == nil {
		return AIProviderSettings{Mode: "custom"}, nil
	}

	value, err := a.aiSettingsStore.Load()
	if err != nil {
		return AIProviderSettings{}, err
	}

	return AIProviderSettings{
		Mode:  value.Mode,
		URL:   value.URL,
		Key:   value.Key,
		Model: value.Model,
	}, nil
}

func (a *App) SaveAISettings(settings AIProviderSettings) (AIProviderSettings, error) {
	if a.aiSettingsStore == nil {
		return settings, nil
	}

	value, err := a.aiSettingsStore.Save(settingspkg.AIProviderSettings{
		Mode:  settings.Mode,
		URL:   settings.URL,
		Key:   settings.Key,
		Model: settings.Model,
	})
	if err != nil {
		return AIProviderSettings{}, err
	}

	return AIProviderSettings{
		Mode:  value.Mode,
		URL:   value.URL,
		Key:   value.Key,
		Model: value.Model,
	}, nil
}

func (a *App) GetUpdateStatus() (UpdateStatus, error) {
	if a.updateService == nil {
		return UpdateStatus{}, nil
	}

	status, err := a.updateService.Status()
	if err != nil {
		return UpdateStatus{}, err
	}

	return mapUpdateStatus(status), nil
}

func (a *App) CheckForUpdates(force bool) (UpdateStatus, error) {
	if a.updateService == nil {
		return UpdateStatus{}, nil
	}

	status, err := a.updateService.Check(a.ctx, force)
	if err != nil {
		return UpdateStatus{}, err
	}

	return mapUpdateStatus(status), nil
}

func (a *App) DownloadUpdate() (UpdateStatus, error) {
	if a.updateService == nil {
		return UpdateStatus{}, nil
	}

	status, err := a.updateService.Download(a.ctx)
	if err != nil {
		return UpdateStatus{}, err
	}

	return mapUpdateStatus(status), nil
}

func (a *App) InstallUpdateAndRestart() error {
	if err := a.requireContext(); err != nil {
		return err
	}
	if a.runner != nil && a.runner.IsRunning() {
		return errors.New("请先停止当前 Python 进程，再安装更新")
	}
	if a.updateService == nil {
		return errors.New("更新服务未初始化")
	}

	return a.updateService.InstallAndRestart()
}

func mapUpdateStatus(status updater.Status) UpdateStatus {
	return UpdateStatus{
		CurrentVersion:  status.CurrentVersion,
		LatestVersion:   status.LatestVersion,
		Notes:           status.Notes,
		PublishedAt:     status.PublishedAt,
		LastCheckedAt:   status.LastCheckedAt,
		Message:         status.Message,
		UpdateAvailable: status.UpdateAvailable,
		Downloaded:      status.Downloaded,
		ReadyToInstall:  status.ReadyToInstall,
	}
}
