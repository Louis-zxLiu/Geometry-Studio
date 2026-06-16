export type ScreeningZoomRectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ScreeningZoomStatusLike = {
  available?: boolean;
  running?: boolean;
  helperPath?: string;
  targetHwnd?: string;
};

type BridgeAppCompat = {
  ClearScreeningZoomSourceRect?: () => Promise<void>;
  GetScreeningZoomStatus?: () => Promise<ScreeningZoomStatusLike>;
  SetScreeningZoomSourceRect?: (rect: ScreeningZoomRectLike) => Promise<void>;
};

export async function getScreeningZoomStatus() {
  return callBridge("GetScreeningZoomStatus", (app) => app.GetScreeningZoomStatus?.());
}

export async function setScreeningZoomSourceRect(rect: ScreeningZoomRectLike) {
  return callBridge("SetScreeningZoomSourceRect", (app) => app.SetScreeningZoomSourceRect?.(rect));
}

export async function clearScreeningZoomSourceRect() {
  return callBridge("ClearScreeningZoomSourceRect", (app) => app.ClearScreeningZoomSourceRect?.());
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
