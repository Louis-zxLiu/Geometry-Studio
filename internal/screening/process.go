package screening

import (
	"bufio"
	"bytes"
	"log"
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
	onError       func(error)
	onExited      func()
	onWindowReady func()
	onFrameReady  func()
	onNext        func()
	onPrev        func()
	onStop        func()
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
		"PLOTKITYCAT_SCREENING_WINDOW_READY_SENTINEL="+screeningWindowReadySentinel,
		"PLOTKITYCAT_SCREENING_FRAME_READY_SENTINEL="+screeningFrameReadySentinel,
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
	logScreeningf("process started scene=%s pid=%d dir=%s", sceneName, process.pid, sceneDir)
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
	logScreeningf("process stop requested scene=%s pid=%d", p.sceneName, p.cmd.Process.Pid)
	return runner.KillProcessTree(p.cmd.Process.Pid)
}

func (p *sceneProcess) watchStdout(stdoutPipe interface {
	Read([]byte) (int, error)
}, callbacks processCallbacks) {
	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			token := strings.TrimSpace(scanner.Text())
			logScreeningf("process stdout scene=%s pid=%d token=%s", p.sceneName, p.pid, token)
			switch token {
			case screeningWindowReadySentinel:
				if callbacks.onWindowReady != nil {
					callbacks.onWindowReady()
				}
			case screeningFrameReadySentinel:
				if callbacks.onFrameReady != nil {
					callbacks.onFrameReady()
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
		logScreeningf("process exited scene=%s pid=%d stopRequested=%t err=%v", p.sceneName, p.pid, p.stopRequested, waitErr)
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

func logScreeningf(format string, args ...any) {
	log.Printf("[screening] "+format, args...)
}
