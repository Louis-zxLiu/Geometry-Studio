import { computed, ref, watch, type Ref } from "vue";
import {
  createCodeAIVersion,
  listCodeAIVersions,
  optimizeCode,
} from "../../ai/services/aiBridgeCompat";
import type { AIProviderSettings, CodeAIVersion } from "../../ai/services/aiTypes";
import { applyRepairPatch, type ChangedLineRange } from "../../aiRepair/services/repairPatch";
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

type AIActivityStatus = {
  isAIGenerating: Ref<boolean>;
  startChecking: () => void;
  startWorking: () => void;
  start: () => void;
  stop: () => void;
};

type UseCodeAIOptimizeOptions = {
  aiActivity: AIActivityStatus;
  aiSettings: Ref<AIProviderSettings>;
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  executeAICodeLoop: () => Promise<boolean>;
  isRunning: Ref<boolean>;
  onApplied: (ranges: ChangedLineRange[]) => void;
  onError: (message: string) => void;
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
      options.aiActivity.isAIGenerating.value ||
      options.isRunning.value ||
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
    if (
      !instruction ||
      options.aiActivity.isAIGenerating.value ||
      options.isRunning.value ||
      !options.currentFile.value
    ) {
      return;
    }

    isDialogOpen.value = false;
    options.aiActivity.startWorking();
    try {
      await ensureInitialVersion();
      const result = await optimizeCode({
        sceneName: options.currentFile.value,
        currentCode: options.codeContent.value,
        instruction,
        settings: options.aiSettings.value,
      });
      const applied = applyRepairPatch(options.codeContent.value, result.patch);
      options.codeContent.value = applied.code;
      options.onApplied(applied.changedRanges);
      options.aiActivity.startChecking();
      const succeeded = await options.executeAICodeLoop();
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
    } finally {
      options.aiActivity.stop();
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
      activeVersionId.value = nextVersions.at(-1)?.id ?? "";
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
