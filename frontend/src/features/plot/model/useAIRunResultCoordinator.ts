import type { AICodeRunResult } from "../../aiExecution/model/useAICodeExecutionLoop";

type UseAIRunResultCoordinatorOptions = {
  onManualRunError: (message: string) => void;
};

export function useAIRunResultCoordinator(options: UseAIRunResultCoordinatorOptions) {
  let pendingAICodeRunResolve:
    | ((result: AICodeRunResult) => void)
    | null = null;

  function settlePendingAICodeRun(result: AICodeRunResult) {
    if (!pendingAICodeRunResolve) {
      return false;
    }

    const resolve = pendingAICodeRunResolve;
    pendingAICodeRunResolve = null;
    resolve(result);
    return true;
  }

  function createPendingAICodeRun() {
    if (pendingAICodeRunResolve) {
      throw new Error("AI 检查正在进行中");
    }

    return new Promise<AICodeRunResult>((resolve) => {
      pendingAICodeRunResolve = resolve;
    });
  }

  function handleRunFinished() {
    settlePendingAICodeRun({
      ok: false,
      errorText: "Python 进程已结束，但没有弹出可视化窗口",
      reason: "failed",
    });
  }

  function handleRunReady() {
    settlePendingAICodeRun({ ok: true });
  }

  function handleRunStopped() {
    settlePendingAICodeRun({
      ok: false,
      errorText: "已中断 AI 检查",
      reason: "stopped",
    });
  }

  function handleRunFailed(message: string) {
    if (
      settlePendingAICodeRun({
        ok: false,
        errorText: message,
        reason: "failed",
      })
    ) {
      return;
    }

    options.onManualRunError(message);
  }

  return {
    createPendingAICodeRun,
    handleRunFailed,
    handleRunFinished,
    handleRunReady,
    handleRunStopped,
    settlePendingAICodeRun,
  };
}
