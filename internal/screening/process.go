package screening

import (
	"bufio"
	"bytes"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
	"plotkitycat/internal/runner"
	"plotkitycat/internal/workspaces"
)

type processCallbacks struct {
	onError  func(error)
	onExited func()
	onReady  func()
	onNext   func()
	onPrev   func()
	onStop   func()
}

type sceneProcess struct {
	mu            sync.Mutex
	sceneName     string
	cmd           *exec.Cmd
	stderr        bytes.Buffer
	pid           int
	stopRequested bool
}

func launchSceneProcess(workspaceManager *workspaces.Manager, sceneName string, callbacks processCallbacks) (*sceneProcess, error) {
	python, args, err := runner.ResolvePythonCommand()
	if err != nil {
		return nil, err
	}

	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		return nil, err
	}

	scriptsDir, err := workspaceManager.CurrentDir()
	if err != nil {
		return nil, err
	}

	sceneDir := filepath.Join(scriptsDir, sceneName)
	scriptPath := filepath.Join(sceneDir, "main.py")
	cmd := exec.Command(python, append(args, "-c", screeningPythonBootstrap, scriptPath)...)
	cmd.Dir = sceneDir
	cmd.Env = append(runner.BuildPythonEnv(runtimeDir),
		"PLOTKITYCAT_SCREENING_READY_SENTINEL="+screeningReadySentinel,
		"PLOTKITYCAT_SCREENING_NEXT_SENTINEL="+screeningNextSentinel,
		"PLOTKITYCAT_SCREENING_PREV_SENTINEL="+screeningPrevSentinel,
		"PLOTKITYCAT_SCREENING_STOP_SENTINEL="+screeningStopSentinel,
	)
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()

	process := &sceneProcess{
		sceneName: sceneName,
		cmd:       cmd,
	}
	cmd.Stderr = &process.stderr

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	process.pid = cmd.Process.Pid
	process.watchStdout(stdoutPipe, callbacks)
	process.watchExit(callbacks)

	return process, nil
}

func (p *sceneProcess) stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.cmd == nil || p.cmd.Process == nil {
		return nil
	}

	p.stopRequested = true
	return runner.KillProcessTree(p.cmd.Process.Pid)
}

func (p *sceneProcess) watchStdout(stdoutPipe interface {
	Read([]byte) (int, error)
}, callbacks processCallbacks) {
	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			switch strings.TrimSpace(scanner.Text()) {
			case screeningReadySentinel:
				if callbacks.onReady != nil {
					callbacks.onReady()
				}
			case screeningNextSentinel:
				if callbacks.onNext != nil {
					callbacks.onNext()
				}
			case screeningPrevSentinel:
				if callbacks.onPrev != nil {
					callbacks.onPrev()
				}
			case screeningStopSentinel:
				if callbacks.onStop != nil {
					callbacks.onStop()
				}
			}
		}
	}()
}

func (p *sceneProcess) watchExit(callbacks processCallbacks) {
	go func() {
		waitErr := p.cmd.Wait()
		if callbacks.onExited != nil {
			callbacks.onExited()
		}

		p.mu.Lock()
		stopped := p.stopRequested
		stderrText := strings.TrimSpace(p.stderr.String())
		p.mu.Unlock()

		if stopped || waitErr == nil || callbacks.onError == nil {
			return
		}

		callbacks.onError(&runner.RunError{
			Type:      detectPythonErrorType(stderrText, waitErr),
			Traceback: tail(stderrText, 15),
			Err:       waitErr,
		})
	}()
}
