package bridge

import (
	"errors"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type PackageTransferResult struct {
	Path      string `json:"path"`
	SceneName string `json:"sceneName"`
}

type WorkspacePackageTransferResult struct {
	Path       string   `json:"path"`
	Workspaces []string `json:"workspaces"`
}

func (a *App) ExportScenePackage(sceneName string) (PackageTransferResult, error) {
	if err := a.requireContext(); err != nil {
		return PackageTransferResult{}, err
	}
	if a.runner.IsRunning() {
		return PackageTransferResult{}, errors.New("请先停止当前 Python 进程，再导出场景")
	}
	if strings.TrimSpace(sceneName) == "" {
		return PackageTransferResult{}, errors.New("当前没有可导出的场景")
	}

	targetPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出 PlotKityCat 场景包",
		DefaultFilename: sceneName + ".pkc",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PlotKityCat Package (*.pkc)",
				Pattern:     "*.pkc",
			},
		},
	})
	if err != nil {
		return PackageTransferResult{}, err
	}
	if targetPath == "" {
		return PackageTransferResult{}, nil
	}
	if !strings.EqualFold(filepath.Ext(targetPath), ".pkc") {
		targetPath += ".pkc"
	}

	if err := a.fileStore.ExportScenePackage(sceneName, targetPath); err != nil {
		return PackageTransferResult{}, err
	}

	return PackageTransferResult{
		Path:      targetPath,
		SceneName: sceneName,
	}, nil
}

func (a *App) ImportScenePackage() (ImportSceneResult, error) {
	if err := a.requireContext(); err != nil {
		return ImportSceneResult{}, err
	}
	if a.runner.IsRunning() {
		return ImportSceneResult{}, errors.New("请先停止当前 Python 进程，再导入场景")
	}

	archivePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "导入 PlotKityCat 场景包",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PlotKityCat Package (*.pkc)",
				Pattern:     "*.pkc",
			},
		},
	})
	if err != nil {
		return ImportSceneResult{}, err
	}
	if archivePath == "" {
		return ImportSceneResult{Cancelled: true}, nil
	}

	return a.importScenePackageFromPath(archivePath)
}

func (a *App) ImportScenePackageFromPath(archivePath string) (ImportSceneResult, error) {
	if err := a.requireContext(); err != nil {
		return ImportSceneResult{}, err
	}
	if a.runner.IsRunning() {
		return ImportSceneResult{}, errors.New("请先停止当前 Python 进程，再导入场景")
	}
	if strings.TrimSpace(archivePath) == "" {
		return ImportSceneResult{}, errors.New("未选择 .pkc 场景包")
	}
	if !strings.EqualFold(filepath.Ext(archivePath), ".pkc") {
		return ImportSceneResult{}, errors.New("只能导入 .pkc 场景包")
	}

	return a.importScenePackageFromPath(archivePath)
}

func (a *App) importScenePackageFromPath(archivePath string) (ImportSceneResult, error) {
	sceneName, err := a.fileStore.ImportScenePackage(archivePath)
	if err != nil {
		return ImportSceneResult{}, err
	}

	workspace, err := a.workspaceSnapshot(sceneName)
	if err != nil {
		return ImportSceneResult{}, err
	}

	return ImportSceneResult{
		Cancelled: false,
		Workspace: workspace,
	}, nil
}

func (a *App) ExportWorkspacePackage(workspaceNames []string) (WorkspacePackageTransferResult, error) {
	if err := a.requireContext(); err != nil {
		return WorkspacePackageTransferResult{}, err
	}
	if a.runner.IsRunning() {
		return WorkspacePackageTransferResult{}, errors.New("请先停止当前 Python 进程，再导出工作区")
	}
	if len(workspaceNames) == 0 {
		return WorkspacePackageTransferResult{}, errors.New("请选择至少一个工作区")
	}

	defaultFilename := "plotkitycat-workspaces.pkcw"
	if len(workspaceNames) == 1 && strings.TrimSpace(workspaceNames[0]) != "" {
		defaultFilename = workspaceNames[0] + ".pkcw"
	}

	targetPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出 PlotKityCat 工作区包",
		DefaultFilename: defaultFilename,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PlotKityCat Workspace Package (*.pkcw)",
				Pattern:     "*.pkcw",
			},
		},
	})
	if err != nil {
		return WorkspacePackageTransferResult{}, err
	}
	if targetPath == "" {
		return WorkspacePackageTransferResult{}, nil
	}
	if !strings.EqualFold(filepath.Ext(targetPath), ".pkcw") {
		targetPath += ".pkcw"
	}

	if err := a.fileStore.ExportWorkspacePackage(workspaceNames, targetPath); err != nil {
		return WorkspacePackageTransferResult{}, err
	}

	return WorkspacePackageTransferResult{
		Path:       targetPath,
		Workspaces: workspaceNames,
	}, nil
}

func (a *App) ImportWorkspacePackage() (ImportWorkspaceResult, error) {
	if err := a.requireContext(); err != nil {
		return ImportWorkspaceResult{}, err
	}
	if a.runner.IsRunning() {
		return ImportWorkspaceResult{}, errors.New("请先停止当前 Python 进程，再导入工作区")
	}

	archivePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "导入 PlotKityCat 工作区包",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PlotKityCat Workspace Package (*.pkcw)",
				Pattern:     "*.pkcw",
			},
		},
	})
	if err != nil {
		return ImportWorkspaceResult{}, err
	}
	if archivePath == "" {
		return ImportWorkspaceResult{Cancelled: true}, nil
	}
	if !strings.EqualFold(filepath.Ext(archivePath), ".pkcw") {
		return ImportWorkspaceResult{}, errors.New("只能导入 .pkcw 工作区包")
	}

	imported, err := a.fileStore.ImportWorkspacePackage(archivePath)
	if err != nil {
		return ImportWorkspaceResult{}, err
	}
	if len(imported) == 0 {
		return ImportWorkspaceResult{}, errors.New(".pkcw 工作区包中没有可导入的工作区")
	}
	if err := a.workspaceManager.Switch(imported[0]); err != nil {
		return ImportWorkspaceResult{}, err
	}

	workspace, err := a.workspaceSnapshot("")
	if err != nil {
		return ImportWorkspaceResult{}, err
	}

	return ImportWorkspaceResult{
		Cancelled:          false,
		ImportedWorkspaces: imported,
		Workspace:          workspace,
	}, nil
}
