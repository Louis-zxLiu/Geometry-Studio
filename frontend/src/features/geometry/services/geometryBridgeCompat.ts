import type {
  GeometrySpec,
  GeometryWorkflowRequest,
  GeometryWorkflowSession,
} from "./geometryTypes";

type BridgeAppCompat = {
  ResumeGeometryWorkflow?: (sessionId: string, reviewedSpec: GeometrySpec) => Promise<void>;
  StartGeometryWorkflow?: (request: GeometryWorkflowRequest) => Promise<GeometryWorkflowSession>;
  StopGeometryWorkflow?: (sessionId: string) => Promise<void>;
};

export async function startGeometryWorkflow(
  request: GeometryWorkflowRequest,
): Promise<GeometryWorkflowSession> {
  return callBridge("StartGeometryWorkflow", (app) => app.StartGeometryWorkflow?.(request));
}

export async function resumeGeometryWorkflow(
  sessionId: string,
  reviewedSpec: GeometrySpec,
): Promise<void> {
  return callBridge("ResumeGeometryWorkflow", (app) =>
    app.ResumeGeometryWorkflow?.(sessionId, reviewedSpec),
  );
}

export async function stopGeometryWorkflow(sessionId: string): Promise<void> {
  return callBridge("StopGeometryWorkflow", (app) => app.StopGeometryWorkflow?.(sessionId));
}

function callBridge<T>(
  name: keyof BridgeAppCompat,
  call: (app: BridgeAppCompat) => Promise<T> | undefined,
): Promise<T> {
  const result = call(getBridgeApp());
  if (result) {
    return result;
  }

  throw new Error(`当前运行中的后端版本还不支持 ${String(name)}，请重启应用后再试。`);
}

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
