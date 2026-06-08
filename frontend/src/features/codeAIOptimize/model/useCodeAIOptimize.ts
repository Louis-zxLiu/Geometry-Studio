import { computed, ref, watch, type Ref } from "vue";
import {
  createCodeAIVersion,
  listCodeAIVersions,
} from "../services/codeVersionBridgeCompat";
import type { CodeAIVersion } from "../../ai/services/aiTypes";
import { getErrorMessage } from "../../../lib/errors";

export type { CodeAIVersion };

export type CodeAIOptimizeCloseReason =
  | "outside-left-pointer"
  | "escape"
  | "open-dialog"
  | "manual"
  | "unknown";

type CloseContext = {
  button?: number;
  eventType?: string;
  reason?: CodeAIOptimizeCloseReason;
  target?: string;
};

type UseCodeAIOptimizeOptions = {
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  onError: (message: string) => void;
  startWorkflow: (payload: { instruction: string }) => Promise<boolean>;
};

export function useCodeAIOptimize(options: UseCodeAIOptimizeOptions) {
  const isDialogOpen = ref(false);
  const contextMenu = ref<{ x: number; y: number } | null>(null);
  const versions = ref<CodeAIVersion[]>([]);
  const activeVersionId = ref("");

  const activeVersion = computed(
    () => versions.value.find((version) => version.id === activeVersionId.value) ?? null,
  );

  function openContextMenu(position: { x: number; y: number }) {
    if (
      !options.currentFile.value
    ) {
      return;
    }

    contextMenu.value = position;
  }

  function closeContextMenu(_context: CloseContext = {}) {
    contextMenu.value = null;
  }

  function openDialog() {
    closeContextMenu({ reason: "open-dialog" });
    if (!options.currentFile.value) {
      return;
    }

    isDialogOpen.value = true;
  }

  function closeDialog() {
    isDialogOpen.value = false;
  }

  async function submitOptimization(prompt: string) {
    const instruction = prompt.trim();
    if (!instruction || !options.currentFile.value) {
      return;
    }

    isDialogOpen.value = false;
    try {
      await ensureInitialVersion();
      const succeeded = await options.startWorkflow({ instruction });
      if (!succeeded) {
        return;
      }

      const version = await createCodeAIVersion({
        sceneName: options.currentFile.value,
        note: instruction,
        code: options.codeContent.value,
      });
      versions.value = [...versions.value, version];
      activeVersionId.value = version.id;
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  function selectVersion(id: string) {
    const version = versions.value.find((item) => item.id === id);
    if (!version) {
      return;
    }

    activeVersionId.value = version.id;
    options.codeContent.value = version.code;
  }

  async function reloadVersions(sceneName = options.currentFile.value) {
    if (!sceneName) {
      versions.value = [];
      activeVersionId.value = "";
      return;
    }

    try {
      const nextVersions = await listCodeAIVersions(sceneName);
      versions.value = nextVersions;
      activeVersionId.value =
        nextVersions.length > 0 ? nextVersions[nextVersions.length - 1].id : "";
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  async function ensureInitialVersion() {
    if (versions.value.length > 0 || !options.currentFile.value) {
      return;
    }

    const version = await createCodeAIVersion({
      sceneName: options.currentFile.value,
      note: "初始版本",
      code: options.codeContent.value,
    });
    versions.value = [version];
    activeVersionId.value = version.id;
  }

  watch(
    options.currentFile,
    (sceneName) => {
      void reloadVersions(sceneName);
    },
    { immediate: true },
  );

  return {
    activeVersion,
    activeVersionId,
    closeContextMenu,
    closeDialog,
    contextMenu,
    isDialogOpen,
    openContextMenu,
    openDialog,
    reloadVersions,
    selectVersion,
    submitOptimization,
    versions,
  };
}
