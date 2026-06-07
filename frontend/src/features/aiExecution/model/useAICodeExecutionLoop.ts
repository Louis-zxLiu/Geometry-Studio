import { getErrorMessage } from "../../../lib/errors";
import type { Ref } from "vue";

export type AICodeRunResult =
  | { ok: true }
  | { ok: false; errorText: string; reason: "failed" | "stopped" };

type UseAICodeExecutionLoopOptions = {
  currentFile: Ref<string>;
  isRunning: Ref<boolean>;
  clearRunError: () => void;
  maxRepairAttempts?: number;
  onFailure: (result: { message: string; repairable: boolean }) => void;
  onInterrupted: () => void;
  repairCodeWithError: (errorText: string) => Promise<unknown>;
  runCurrentCodeAndWait: () => Promise<AICodeRunResult>;
};

export function useAICodeExecutionLoop(options: UseAICodeExecutionLoopOptions) {
  const maxRepairAttempts = options.maxRepairAttempts ?? 8;

  async function execute() {
    if (options.isRunning.value || !options.currentFile.value) {
      return false;
    }

    try {
      for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
        const runResult = await options.runCurrentCodeAndWait();
        if (runResult.ok) {
          options.clearRunError();
          return true;
        }

        if (runResult.reason === "stopped") {
          options.onInterrupted();
          return false;
        }

        if (attempt === maxRepairAttempts) {
          options.onFailure({ message: runResult.errorText, repairable: true });
          return false;
        }

        await options.repairCodeWithError(runResult.errorText);
      }
    } catch (error) {
      options.onFailure({ message: getErrorMessage(error), repairable: false });
      return false;
    }

    return false;
  }

  return {
    execute,
  };
}
