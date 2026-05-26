import { computed, type Ref } from "vue";

export type ErrorHandler = (message: string) => void;
export type WorkspacePhase = "idle" | "syncing" | "creating" | "renaming" | "deleting";

export const createVisualDelayMs = 260;

export function computedPhase(target: WorkspacePhase, workspacePhase: Ref<WorkspacePhase>) {
  return computed(() => workspacePhase.value === target);
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function asString(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

export function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

export function wait(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

export function getTypingDuration(filename: string) {
  return Math.max(600, filename.length * 85);
}

export function getDeletingDuration(filename: string) {
  return Math.max(620, filename.length * 62);
}
