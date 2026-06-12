import { computed, onMounted, onUnmounted, ref, type Ref } from "vue";
import { EventsOn } from "../../../../wailsjs/runtime/runtime";
import { getErrorMessage } from "../../../lib/errors";
import {
  getScreeningState,
  nextScreeningPage,
  startScreening,
  stopScreening,
  type ScreeningSessionStateLike,
} from "../services/screeningBridgeCompat";

type ScreeningWorkspaceOptions = {
  currentFile: Ref<string>;
  onError: (message: string) => void;
  scripts: Ref<string[]>;
};

type ScreeningDialogItem = {
  sceneName: string;
  order: number | null;
};

export function useScreeningWorkspace(options: ScreeningWorkspaceOptions) {
  const isDialogOpen = ref(false);
  const isStarting = ref(false);
  const isStopping = ref(false);
  const isActive = ref(false);
  const currentSceneName = ref("");
  const currentIndex = ref(0);
  const selectedScenes = ref<string[]>([]);
  const cleanupEvents: Array<() => void> = [];

  const dialogItems = computed<ScreeningDialogItem[]>(() =>
    options.scripts.value.map((sceneName) => {
      const index = selectedScenes.value.indexOf(sceneName);
      return {
        sceneName,
        order: index >= 0 ? index + 1 : null,
      };
    }),
  );
  const canStart = computed(() => selectedScenes.value.length > 0 && !isStarting.value);

  function openDialog() {
    seedSelection();
    isDialogOpen.value = true;
  }

  function triggerScreeningAction() {
    if (isActive.value) {
      void endScreening();
      return;
    }
    openDialog();
  }

  function closeDialog() {
    if (isStarting.value) {
      return;
    }
    isDialogOpen.value = false;
  }

  function seedSelection() {
    const current = options.currentFile.value;
    const scripts = options.scripts.value;
    if (!current && scripts.length === 0) {
      selectedScenes.value = [];
      return;
    }

    selectedScenes.value = scripts.includes(current) ? [current] : scripts.slice(0, 1);
  }

  function toggleScene(sceneName: string) {
    const index = selectedScenes.value.indexOf(sceneName);
    if (index >= 0) {
      if (selectedScenes.value.length === 1) {
        return;
      }
      selectedScenes.value = selectedScenes.value.filter((item) => item !== sceneName);
      return;
    }

    selectedScenes.value = [...selectedScenes.value, sceneName];
  }

  async function beginScreening() {
    if (!canStart.value) {
      return;
    }

    isStarting.value = true;
    try {
      const state = await startScreening({
        sceneNames: selectedScenes.value,
        startIndex: 0,
        poolSize: 3,
        animation: "crossfade",
      });
      applyState(state);
      isDialogOpen.value = false;
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      isStarting.value = false;
    }
  }

  async function endScreening() {
    if (isStopping.value) {
      return;
    }

    isStopping.value = true;
    try {
      await stopScreening();
      applyState({ active: false, sceneNames: [] });
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      isStopping.value = false;
    }
  }

  async function goNext() {
    try {
      applyState(await nextScreeningPage());
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  function applyState(state?: ScreeningSessionStateLike) {
    isActive.value = !!state?.active;
    currentSceneName.value =
      typeof state?.currentSceneName === "string" ? state.currentSceneName : "";
    currentIndex.value = typeof state?.currentIndex === "number" ? state.currentIndex : 0;
  }

  async function hydrateState() {
    try {
      applyState(await getScreeningState());
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  onMounted(() => {
    cleanupEvents.push(
      EventsOn("screening:state", (...payload) => {
        applyState(payload[0] as ScreeningSessionStateLike | undefined);
      }),
    );
    void hydrateState();
  });

  onUnmounted(() => {
    cleanupEvents.forEach((cleanup) => cleanup());
    cleanupEvents.length = 0;
  });

  return {
    beginScreening,
    canStartScreening: canStart,
    closeScreeningDialog: closeDialog,
    currentScreeningIndex: currentIndex,
    currentScreeningSceneName: currentSceneName,
    goToNextScreeningPage: goNext,
    isScreeningActive: isActive,
    isScreeningDialogOpen: isDialogOpen,
    isStartingScreening: isStarting,
    isStoppingScreening: isStopping,
    openScreeningDialog: openDialog,
    triggerScreeningAction,
    screeningDialogItems: dialogItems,
    selectedScreeningScenes: selectedScenes,
    stopScreening: endScreening,
    toggleScreeningScene: toggleScene,
  };
}
