package env

import (
	"os"

	"plotkitycat/internal/paths"
)

type Manager struct{}

type Progress struct {
	Stage   string `json:"stage"`
	Message string `json:"message"`
	Percent int    `json:"percent"`
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) EnsureReady(onProgress func(Progress)) error {
	scriptsDir, err := paths.ScriptsDir()
	if err != nil {
		return err
	}

	reportProgress(onProgress, Progress{
		Stage:   "preparing",
		Message: "Preparing workspace",
		Percent: 6,
	})

	if err := os.MkdirAll(scriptsDir, 0o755); err != nil {
		return err
	}

	return m.ensureRuntimeExtracted(onProgress)
}

func (m *Manager) Status() (Status, error) {
	return EvaluateStatus(DefaultRequirements())
}

func (m *Manager) Rebuild(onProgress func(Progress)) error {
	archivePath, err := paths.RuntimeArchivePath()
	if err != nil {
		return err
	}
	if _, err := os.Stat(archivePath); err != nil {
		return err
	}

	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		return err
	}

	reportProgress(onProgress, Progress{
		Stage:   "rebuilding",
		Message: "Rebuilding runtime",
		Percent: 8,
	})

	if err := os.RemoveAll(runtimeDir); err != nil {
		return err
	}

	return m.ensureRuntimeExtracted(onProgress)
}

func reportProgress(onProgress func(Progress), progress Progress) {
	if onProgress == nil {
		return
	}

	onProgress(progress)
}
