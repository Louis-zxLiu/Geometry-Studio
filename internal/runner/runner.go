package runner

import (
	"bufio"
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
	"plotkitycat/internal/workspaces"
)

type Request struct {
	OnError  func(error)
	OnFinish func()
	OnReady  func()
	OnStart  func()
	OnStop   func()
}

type RunError struct {
	Type      string
	Traceback string
	Err       error
}

func (e *RunError) Error() string {
	if e.Traceback != "" {
		return e.Type + "\n" + e.Traceback
	}

	if e.Err != nil {
		return e.Type + ": " + e.Err.Error()
	}

	return e.Type
}

type Runner struct {
	mu         sync.Mutex
	running    bool
	stopping   bool
	cmd        *exec.Cmd
	workspaces *workspaces.Manager
}

const runReadySentinel = "__PLOTKITYCAT_RUN_READY__"

const pythonBootstrap = `
import os
import runpy
import sys

_PLOTKITYCAT_READY = False
_PLOTKITYCAT_SENTINEL = os.environ.get("PLOTKITYCAT_RUN_READY_SENTINEL", "__PLOTKITYCAT_RUN_READY__")

def _plotkitycat_emit_ready():
    global _PLOTKITYCAT_READY
    if _PLOTKITYCAT_READY:
        return
    _PLOTKITYCAT_READY = True
    print(_PLOTKITYCAT_SENTINEL, flush=True)

def _plotkitycat_patch_matplotlib():
    try:
        import matplotlib.pyplot as plt
    except Exception:
        return

    if getattr(plt, "_plotkitycat_ready_patched", False):
        return

    original_show = plt.show
    def wrapped_show(*args, **kwargs):
        _plotkitycat_emit_ready()
        return original_show(*args, **kwargs)
    plt.show = wrapped_show
    plt._plotkitycat_ready_patched = True
_plotkitycat_patch_matplotlib()
runpy.run_path(sys.argv[1], run_name="__main__")
`

func New(workspaceManager *workspaces.Manager) *Runner {
	return &Runner{workspaces: workspaceManager}
}

func (r *Runner) Run(sceneName string, req Request) error {
	r.mu.Lock()
	if r.running {
		r.mu.Unlock()
		return errors.New("a python script is already running")
	}

	python, args, err := resolvePythonCommand()
	if err != nil {
		r.mu.Unlock()
		return err
	}

	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		r.mu.Unlock()
		return err
	}

	scriptsDir, err := r.workspaces.CurrentDir()
	if err != nil {
		r.mu.Unlock()
		return err
	}

	sceneDir := filepath.Join(scriptsDir, sceneName)
	scriptPath := filepath.Join(sceneDir, "main.py")
	absScriptPath, err := filepath.Abs(scriptPath)
	if err != nil {
		r.mu.Unlock()
		return err
	}

	cmd := exec.Command(python, append(args, "-c", pythonBootstrap, absScriptPath)...)
	cmd.Dir = sceneDir
	cmd.Env = buildPythonEnv(runtimeDir)
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()

	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		r.mu.Unlock()
		return err
	}

	r.cmd = cmd
	r.running = true
	r.mu.Unlock()

	if err := cmd.Start(); err != nil {
		r.finish()
		return err
	}

	if req.OnStart != nil {
		req.OnStart()
	}

	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		buffer := make([]byte, 0, 64*1024)
		scanner.Buffer(buffer, 1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == runReadySentinel && req.OnReady != nil {
				req.OnReady()
			}
		}
	}()

	go func() {
		waitErr := cmd.Wait()
		output := strings.TrimSpace(stderr.String())
		stopped := r.finish()

		if stopped {
			if req.OnStop != nil {
				req.OnStop()
			}
			return
		}

		if waitErr != nil && req.OnError != nil {
			req.OnError(&RunError{
				Type:      detectPythonErrorType(output, waitErr),
				Traceback: tail(output, 15),
				Err:       waitErr,
			})
		}

		if waitErr == nil && req.OnFinish != nil {
			req.OnFinish()
		}
	}()

	return nil
}

func (r *Runner) Shutdown() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.cmd != nil && r.cmd.Process != nil {
		_ = killProcessTree(r.cmd.Process.Pid)
	}
}

func (r *Runner) Stop() (bool, error) {
	r.mu.Lock()
	if !r.running || r.cmd == nil || r.cmd.Process == nil {
		r.mu.Unlock()
		return false, nil
	}

	pid := r.cmd.Process.Pid
	r.stopping = true
	r.mu.Unlock()

	if err := killProcessTree(pid); err != nil {
		r.mu.Lock()
		r.stopping = false
		r.mu.Unlock()
		return false, err
	}

	return true, nil
}

func (r *Runner) IsRunning() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.running
}

func (r *Runner) finish() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	wasStopping := r.stopping
	r.running = false
	r.stopping = false
	r.cmd = nil
	return wasStopping
}

func resolvePythonCommand() (string, []string, error) {
	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		return "", nil, err
	}

	pythonPath := filepath.Join(runtimeDir, "python.exe")
	if _, err := os.Stat(pythonPath); err == nil {
		return pythonPath, nil, nil
	}

	pythonwPath := filepath.Join(runtimeDir, "pythonw.exe")
	if _, err := os.Stat(pythonwPath); err == nil {
		return pythonwPath, nil, nil
	}

	return "", nil, errors.New("python runtime not found; expected ./runtime/python.exe or ./runtime/pythonw.exe")
}

func buildPythonEnv(runtimeDir string) []string {
	env := append([]string{}, os.Environ()...)
	qtRoot := filepath.Join(runtimeDir, "Lib", "site-packages", "PyQt5", "Qt5")
	qtBinDir := filepath.Join(qtRoot, "bin")
	qtPluginsDir := filepath.Join(qtRoot, "plugins")
	qtPlatformsDir := filepath.Join(qtPluginsDir, "platforms")

	env = append(env,
		"MPLBACKEND=Qt5Agg",
		"PLOTKITYCAT_RUN_READY_SENTINEL="+runReadySentinel,
		"QT_QPA_PLATFORM_PLUGIN_PATH="+qtPlatformsDir,
		"QT_PLUGIN_PATH="+qtPluginsDir,
		"PATH="+qtBinDir+string(os.PathListSeparator)+os.Getenv("PATH"),
	)

	return env
}

func killProcessTree(pid int) error {
	if pid <= 0 {
		return nil
	}

	if runtime.GOOS == "windows" {
		cmd := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid))
		cmd.SysProcAttr = processutil.WithoutConsoleWindow()
		return cmd.Run()
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return err
	}

	return process.Kill()
}

func detectPythonErrorType(stderr string, fallback error) string {
	lines := strings.Split(strings.TrimSpace(stderr), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		if index := strings.Index(line, ":"); index > 0 {
			candidate := strings.TrimSpace(line[:index])
			if strings.HasSuffix(candidate, "Error") || strings.HasSuffix(candidate, "Exception") {
				return candidate
			}
		}
	}

	if fallback != nil {
		return fallback.Error()
	}

	return "PythonError"
}

func tail(input string, lines int) string {
	if input == "" {
		return ""
	}

	parts := strings.Split(input, "\n")
	if len(parts) <= lines {
		return input
	}

	return strings.Join(parts[len(parts)-lines:], "\n")
}
