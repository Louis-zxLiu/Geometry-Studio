export type ScreeningStartRequestLike = {
  sceneNames: string[];
  startIndex: number;
  poolSize: number;
  animation: string;
};

export type ScreeningSessionStateLike = {
  active?: boolean;
  sceneNames?: string[];
  currentIndex?: number;
  currentSceneName?: string;
  poolSize?: number;
  animation?: string;
};

export type ScreeningStopResultLike = {
  handled?: boolean;
  message?: string;
};

type BridgeAppCompat = {
  GetScreeningState?: () => Promise<ScreeningSessionStateLike>;
  NextScreeningPage?: () => Promise<ScreeningSessionStateLike>;
  StartScreening?: (request: ScreeningStartRequestLike) => Promise<ScreeningSessionStateLike>;
  StopScreening?: () => Promise<ScreeningStopResultLike>;
};

export async function getScreeningState() {
  return callBridge("GetScreeningState", (app) => app.GetScreeningState?.());
}

export async function startScreening(request: ScreeningStartRequestLike) {
  return callBridge("StartScreening", (app) => app.StartScreening?.(request));
}

export async function nextScreeningPage() {
  return callBridge("NextScreeningPage", (app) => app.NextScreeningPage?.());
}

export async function stopScreening() {
  return callBridge("StopScreening", (app) => app.StopScreening?.());
}

function callBridge<T>(name: keyof BridgeAppCompat, call: (app: BridgeAppCompat) => Promise<T> | undefined) {
  const result = call(getBridgeApp());
  if (result) {
    return result;
  }

  throw new Error(`当前运行中的后端版本还不支持 ${String(name)}，请重启应用后再试`);
}

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
