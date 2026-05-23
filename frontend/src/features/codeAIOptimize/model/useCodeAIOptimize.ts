import { computed, ref } from "vue";

export type CodeAIVersion = {
  id: string;
  label: string;
  note: string;
  code: string;
  createdAt: number;
};

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

export function useCodeAIOptimize(code: { value: string }, updateCode: (code: string) => void) {
  const isDialogOpen = ref(false);
  const contextMenu = ref<{ x: number; y: number } | null>(null);
  const versions = ref<CodeAIVersion[]>([]);
  const activeVersionId = ref("");

  const activeVersion = computed(
    () => versions.value.find((version) => version.id === activeVersionId.value) ?? null,
  );

  function openContextMenu(position: { x: number; y: number }) {
    contextMenu.value = position;
  }

  function closeContextMenu(_context: CloseContext = {}) {
    contextMenu.value = null;
  }

  function openDialog() {
    closeContextMenu({ reason: "open-dialog" });
    ensureInitialVersion();
    isDialogOpen.value = true;
  }

  function closeDialog() {
    isDialogOpen.value = false;
  }

  function submitOptimization(prompt: string) {
    const note = prompt.trim();
    if (!note) {
      return;
    }

    ensureInitialVersion();
    const nextVersion = createVersion(note, code.value);
    versions.value = [...versions.value, nextVersion];
    activeVersionId.value = nextVersion.id;
    isDialogOpen.value = false;
  }

  function selectVersion(id: string) {
    const version = versions.value.find((item) => item.id === id);
    if (!version) {
      return;
    }

    activeVersionId.value = version.id;
    updateCode(version.code);
  }

  function ensureInitialVersion() {
    if (versions.value.length > 0) {
      return;
    }

    const version = createVersion("当前版本", code.value);
    versions.value = [version];
    activeVersionId.value = version.id;
  }

  function createVersion(note: string, snapshot: string): CodeAIVersion {
    const index = versions.value.length + 1;
    return {
      id: `${Date.now()}-${index}`,
      label: `版本${String(index).padStart(2, "0")}`,
      note,
      code: snapshot,
      createdAt: Date.now(),
    };
  }

  return {
    activeVersion,
    activeVersionId,
    closeContextMenu,
    closeDialog,
    contextMenu,
    isDialogOpen,
    openContextMenu,
    openDialog,
    selectVersion,
    submitOptimization,
    versions,
  };
}
