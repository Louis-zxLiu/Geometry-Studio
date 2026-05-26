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
