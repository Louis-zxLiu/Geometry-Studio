package bridge

import (
	"errors"
	"fmt"
	"os"

	filestore "plotkitycat/internal/files/store"
	"plotkitycat/internal/runner"
	"plotkitycat/internal/workspaces"
)

func (a *App) BootstrapWorkspace() (WorkspaceSnapshot, error) {
	snapshot, err := a.workspaceSnapshot("")
	if err != nil {
		return WorkspaceSnapshot{}, err
	}

	if len(snapshot.Scripts) > 0 {
		return snapshot, nil
	}

	filename, err := a.fileStore.CreateScript("示例函数图.py")
	if err != nil {
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot(filename)
}

func (a *App) workspaceSnapshot(preferredFile string) (WorkspaceSnapshot, error) {
	scripts, err := a.fileStore.ListScripts()
	if err != nil {
		return WorkspaceSnapshot{}, err
	}

	currentFile := resolveCurrentFile(scripts, preferredFile)
	document := ScriptDocument{}
	if currentFile != "" {
		code, err := a.fileStore.ReadScript(currentFile)
		if err != nil {
			return WorkspaceSnapshot{}, err
		}
		note, err := a.fileStore.ReadNote(currentFile)
		if err != nil {
			return WorkspaceSnapshot{}, err
		}

		document = ScriptDocument{
			Filename:     currentFile,
			Code:         code,
			NoteMarkdown: note.Markdown,
			NoteImages:   mapNoteImages(note.Images),
		}
	}

	workspaceItems, err := a.workspaceManager.List()
	if err != nil {
		return WorkspaceSnapshot{}, err
	}
	currentWorkspace, err := a.workspaceManager.CurrentName()
	if err != nil {
		return WorkspaceSnapshot{}, err
	}

	snapshot := WorkspaceSnapshot{
		Scripts:          scripts,
		CurrentFile:      currentFile,
		Document:         document,
		Workspaces:       mapWorkspaces(workspaceItems),
		CurrentWorkspace: currentWorkspace,
	}

	a.emit(EventScriptsLoaded, EventPayload{
		Filename: currentFile,
		Message:  fmt.Sprintf("%d scripts loaded", len(scripts)),
	})

	return snapshot, nil
}

func (a *App) GetScriptList() ([]string, error) {
	scripts, err := a.fileStore.ListScripts()
	if err == nil {
		a.emit(EventScriptsLoaded, EventPayload{
			Message: fmt.Sprintf("%d scripts loaded", len(scripts)),
		})
	}

	return scripts, err
}

func (a *App) SwitchWorkspace(name string) (WorkspaceSnapshot, error) {
	if err := a.workspaceManager.Switch(name); err != nil {
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot("")
}

func (a *App) CreateWorkspace(name string) (WorkspaceSnapshot, error) {
	workspace, err := a.workspaceManager.Create(name)
	if err != nil {
		return WorkspaceSnapshot{}, err
	}

	sceneName, err := a.fileStore.CreateScript(workspace.Name)
	if err != nil {
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot(sceneName)
}

func (a *App) RenameWorkspace(oldName string, newName string) (WorkspaceSnapshot, error) {
	if _, err := a.workspaceManager.Rename(oldName, newName); err != nil {
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot("")
}

func (a *App) DeleteWorkspace(name string) (WorkspaceSnapshot, error) {
	if err := a.workspaceManager.Delete(name); err != nil {
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot("")
}

func (a *App) GetScriptContent(filename string) (ScriptDocument, error) {
	code, err := a.fileStore.ReadScript(filename)
	if err != nil {
		return ScriptDocument{}, err
	}
	note, err := a.fileStore.ReadNote(filename)
	if err != nil {
		return ScriptDocument{}, err
	}

	return ScriptDocument{
		Filename:     filename,
		Code:         code,
		NoteMarkdown: note.Markdown,
		NoteImages:   mapNoteImages(note.Images),
	}, nil
}

func (a *App) CreateScript(filename string) (ScriptDocument, error) {
	createdName, err := a.fileStore.CreateScript(filename)
	if err != nil {
		return ScriptDocument{}, err
	}

	code, err := a.fileStore.ReadScript(createdName)
	if err != nil {
		return ScriptDocument{}, err
	}
	note, err := a.fileStore.ReadNote(createdName)
	if err != nil {
		return ScriptDocument{}, err
	}

	return ScriptDocument{
		Filename:     createdName,
		Code:         code,
		NoteMarkdown: note.Markdown,
		NoteImages:   mapNoteImages(note.Images),
	}, nil
}

func (a *App) RefreshWorkspace(currentFile string) (WorkspaceSnapshot, error) {
	return a.workspaceSnapshot(currentFile)
}

func (a *App) ReorderScripts(scripts []string, currentFile string) (WorkspaceSnapshot, error) {
	if err := a.fileStore.ReorderScripts(scripts); err != nil {
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot(currentFile)
}

func (a *App) RenameScript(oldFilename string, newFilename string) (WorkspaceSnapshot, error) {
	renamedName, err := a.fileStore.RenameScript(oldFilename, newFilename)
	if err != nil {
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot(renamedName)
}

func (a *App) DeleteScript(filename string) (WorkspaceSnapshot, error) {
	if err := a.fileStore.DeleteScript(filename); err != nil {
		if os.IsNotExist(err) {
			return a.workspaceSnapshot("")
		}
		return WorkspaceSnapshot{}, err
	}

	return a.workspaceSnapshot("")
}

func (a *App) SaveScript(filename string, code string) error {
	savedName, err := a.fileStore.SaveScript(filename, code)
	if err != nil {
		return err
	}

	a.emit(EventScriptSaved, EventPayload{
		Filename: savedName,
		Message:  "script saved",
	})

	return nil
}

func (a *App) GetScriptNote(filename string) (NoteDocument, error) {
	note, err := a.fileStore.ReadNote(filename)
	if err != nil {
		return NoteDocument{}, err
	}

	return NoteDocument{
		Markdown: note.Markdown,
		Images:   mapNoteImages(note.Images),
	}, nil
}

func (a *App) SaveScriptNote(filename string, markdown string) error {
	return a.fileStore.SaveNote(filename, markdown)
}

func (a *App) AddScriptNoteImages(filename string, images []NoteImageInput) (NoteDocument, error) {
	nextImages := make([]filestore.NoteImage, 0, len(images))
	for _, image := range images {
		nextImages = append(nextImages, filestore.NoteImage{
			Name:    image.Name,
			Alt:     image.Alt,
			DataURL: image.DataURL,
		})
	}

	note, err := a.fileStore.AddNoteImages(filename, nextImages)
	if err != nil {
		return NoteDocument{}, err
	}

	return NoteDocument{
		Markdown: note.Markdown,
		Images:   mapNoteImages(note.Images),
	}, nil
}

func (a *App) RemoveScriptNoteImage(filename string, relativePath string) (NoteDocument, error) {
	note, err := a.fileStore.RemoveNoteImage(filename, relativePath)
	if err != nil {
		return NoteDocument{}, err
	}

	return NoteDocument{
		Markdown: note.Markdown,
		Images:   mapNoteImages(note.Images),
	}, nil
}

func (a *App) SaveAndRun(filename string, code string) error {
	if err := a.requireContext(); err != nil {
		return err
	}

	environment, err := a.GetEnvironmentStatus()
	if err != nil {
		return err
	}
	if !environment.Ready {
		return errors.New(environment.Summary)
	}

	savedName, err := a.fileStore.SaveScript(filename, code)
	if err != nil {
		return err
	}

	a.emit(EventScriptSaved, EventPayload{
		Filename: savedName,
		Message:  "script saved before run",
	})

	return a.runner.Run(savedName, runner.Request{
		OnStart: func() {
			a.emit(EventRunStarted, EventPayload{
				Filename: savedName,
				Message:  "python process started",
			})
		},
		OnFinish: func() {
			a.emit(EventRunFinished, EventPayload{
				Filename: savedName,
				Message:  "python process finished",
			})
		},
		OnStop: func() {
			a.emit(EventRunStopped, EventPayload{
				Filename: savedName,
				Message:  "python process stopped",
			})
		},
		OnError: func(runErr error) {
			var pythonErr *runner.RunError
			if errors.As(runErr, &pythonErr) {
				a.emit(EventRunFailed, RunErrorPayload{
					Filename:  savedName,
					ErrorType: pythonErr.Type,
					Traceback: pythonErr.Traceback,
					Error:     pythonErr.Error(),
				})
				return
			}

			a.emit(EventRunFailed, RunErrorPayload{
				Filename: savedName,
				Error:    runErr.Error(),
			})
		},
	})
}

func (a *App) StopCurrentRun() (RunControlResult, error) {
	handled, err := a.runner.Stop()
	if err != nil {
		return RunControlResult{}, err
	}
	if !handled {
		return RunControlResult{
			Handled: false,
			Message: "当前没有正在运行的 Python 进程",
		}, nil
	}

	return RunControlResult{
		Handled: true,
		Message: "已发送终止当前 Python 进程的请求",
	}, nil
}

func resolveCurrentFile(scripts []string, preferredFile string) string {
	if len(scripts) == 0 {
		return ""
	}

	for _, script := range scripts {
		if script == preferredFile {
			return preferredFile
		}
	}

	return scripts[0]
}

func mapNoteImages(images []filestore.NoteImage) []NoteImage {
	mapped := make([]NoteImage, 0, len(images))
	for _, image := range images {
		mapped = append(mapped, NoteImage{
			Name:         image.Name,
			Alt:          image.Alt,
			DataURL:      image.DataURL,
			RelativePath: image.RelativePath,
		})
	}

	return mapped
}

func mapWorkspaces(items []workspaces.Workspace) []WorkspaceInfo {
	mapped := make([]WorkspaceInfo, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, WorkspaceInfo{
			Name:       item.Name,
			SceneCount: item.SceneCount,
		})
	}

	return mapped
}
