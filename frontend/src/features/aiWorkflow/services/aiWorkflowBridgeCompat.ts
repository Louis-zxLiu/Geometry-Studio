import type {
  AIWorkflowRequest,
  AIWorkflowSession,
} from "../../ai/services/aiTypes";

type BridgeAppCompat = {
  StartAIWorkflow?: (request: AIWorkflowRequest) => Promise<AIWorkflowSession>;
  StopAIWorkflow?: (sessionId: string) => Promise<void>;
};

export async function startAIWorkflow(
  request: AIWorkflowRequest,
): Promise<AIWorkflowSession> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.StartAIWorkflow === "function") {
    return bridgeApp.StartAIWorkflow(request);
  }

  throw new Error("当前运行中的后端版本还不支持 AI 工作流，请重启应用后再试");
}

export async function stopAIWorkflow(sessionId: string): Promise<void> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.StopAIWorkflow === "function") {
    await bridgeApp.StopAIWorkflow(sessionId);
    return;
  }

  throw new Error("当前运行中的后端版本还不支持停止 AI 工作流，请重启应用后再试");
}

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
