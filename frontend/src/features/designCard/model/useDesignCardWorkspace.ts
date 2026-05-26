import { computed, ref, watch, type Ref } from "vue";
import type { AINoteSelectionPayload, AIProviderSettings } from "../../ai/services/aiTypes";
import {
  deleteDesignCard,
  generateDesignCardFromSelection,
  listDesignCardPlacements,
  listDesignCards,
  optimizeDesignCard,
  saveDesignCardPlacements,
  updateDesignCardPlan,
} from "../services/designCardBridgeCompat";
import { formatDesignCardReference } from "../services/designCardMarkdownCodec";
import type { DesignCard, DesignCardPlacement } from "../services/designCardTypes";

type AIActivityStatus = {
  isAIGenerating: Ref<boolean>;
  start: () => void;
  stop: () => void;
};

type DesignCardWorkspaceOptions = {
  aiActivity: AIActivityStatus;
  aiSettings: Ref<AIProviderSettings>;
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  isRunning: Ref<boolean>;
  noteMarkdown: Readonly<Ref<string>>;
  onError: (message: string) => void;
  updateNoteMarkdown: (markdown: string) => void;
};

const planSaveDebounceMs = 420;

export function useDesignCardWorkspace(options: DesignCardWorkspaceOptions) {
  const cards = ref<DesignCard[]>([]);
  const placements = ref<DesignCardPlacement[]>([]);
  const activeCardId = ref("");
  const isReviewRoomOpen = computed(() => activeCardId.value !== "");
  const optimizeDialogCardId = ref("");
  const contextMenu = ref<{ cardId: string; x: number; y: number } | null>(null);
  const saveState = ref<"idle" | "saving" | "saved">("idle");

  let loadingToken = 0;
  let saveTimer = 0;

  const activeCard = computed(
    () => cards.value.find((card) => card.id === activeCardId.value) ?? null,
  );
  const sortedCards = computed(() => sortCards(cards.value));
  const isOptimizeDialogOpen = computed(() => optimizeDialogCardId.value !== "");

  watch(
    options.currentFile,
    (sceneName) => {
      if (!sceneName) {
        cards.value = [];
        placements.value = [];
        activeCardId.value = "";
        return;
      }

      const token = ++loadingToken;
      void loadCards(sceneName, token);
    },
    { immediate: true },
  );

  watch(options.codeContent, () => {
    clampPlacementsToCode();
  });

  async function loadCards(sceneName: string, token = ++loadingToken) {
    try {
      const nextCards = await listDesignCards(sceneName);
      if (token !== loadingToken) {
        return;
      }

      cards.value = sortCards(nextCards);
      await loadPlacements(sceneName);
    } catch (error) {
      if (token === loadingToken) {
        options.onError(getErrorMessage(error));
      }
    }
  }

  async function generateFromNoteSelection(selection: AINoteSelectionPayload) {
    if (
      !options.currentFile.value ||
      options.isRunning.value ||
      options.aiActivity.isAIGenerating.value ||
      !selection.items.length
    ) {
      return;
    }

    options.aiActivity.start();
    try {
      const result = await generateDesignCardFromSelection({
        sceneName: options.currentFile.value,
        settings: options.aiSettings.value,
        selection,
      });
      upsertCard(result.card);
      await placeCardAtEnd(result.card.id);
      openReviewRoom(result.card.id);
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.aiActivity.stop();
    }
  }

  function openReviewRoom(cardId: string) {
    if (!cards.value.some((card) => card.id === cardId)) {
      return;
    }

    activeCardId.value = cardId;
    contextMenu.value = null;
  }

  function closeReviewRoom() {
    activeCardId.value = "";
  }

  function openContextMenu(cardId: string, position: { x: number; y: number }) {
    if (!cards.value.some((card) => card.id === cardId)) {
      return;
    }

    contextMenu.value = { cardId, ...position };
  }

  function closeContextMenu() {
    contextMenu.value = null;
  }

  function openOptimizeDialog(cardId = contextMenu.value?.cardId ?? activeCardId.value) {
    if (!cardId || options.aiActivity.isAIGenerating.value) {
      return;
    }

    optimizeDialogCardId.value = cardId;
    contextMenu.value = null;
  }

  function closeOptimizeDialog() {
    if (!options.aiActivity.isAIGenerating.value) {
      optimizeDialogCardId.value = "";
    }
  }

  async function submitOptimization(instruction: string) {
    const cardId = optimizeDialogCardId.value;
    if (!cardId || !options.currentFile.value || options.aiActivity.isAIGenerating.value) {
      return;
    }

    options.aiActivity.start();
    try {
      const result = await optimizeDesignCard({
        sceneName: options.currentFile.value,
        cardId,
        instruction,
        settings: options.aiSettings.value,
      });
      upsertCard(result.card);
      optimizeDialogCardId.value = "";
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.aiActivity.stop();
    }
  }

  function updateActivePlan(plan: string) {
    const card = activeCard.value;
    if (!card || card.plan === plan) {
      return;
    }

    upsertCard({ ...card, plan });
    schedulePlanSave(card.id, plan);
  }

  async function flushPlanSave() {
    if (!saveTimer) {
      return;
    }

    window.clearTimeout(saveTimer);
    saveTimer = 0;
    const card = activeCard.value;
    if (card) {
      await persistPlan(card.id, card.plan);
    }
  }

  async function removeCard(cardId: string, removeOptions?: { removeNoteReferences?: boolean }) {
    if (!options.currentFile.value || !cardId) {
      return;
    }

    try {
      await deleteDesignCard(options.currentFile.value, cardId);
      cards.value = cards.value.filter((card) => card.id !== cardId);
      placements.value = placements.value.filter((placement) => placement.cardId !== cardId);
      await persistPlacements(placements.value);
      if (activeCardId.value === cardId) {
        activeCardId.value = "";
      }
      if (removeOptions?.removeNoteReferences) {
        removeCardReferencesFromNote(cardId);
      }
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  function insertCardReferenceIntoNote(cardId: string, insertAt?: number) {
    if (!cards.value.some((card) => card.id === cardId)) {
      return;
    }

    const reference = formatDesignCardReference(cardId);
    const markdown = options.noteMarkdown.value;
    const safeIndex =
      typeof insertAt === "number" && Number.isFinite(insertAt)
        ? Math.max(0, Math.min(insertAt, markdown.length))
        : markdown.length;
    const before = markdown.slice(0, safeIndex).replace(/\s+$/u, "");
    const after = markdown.slice(safeIndex).replace(/^\s+/u, "");
    const nextMarkdown = [before, reference, after].filter(Boolean).join("\n\n");
    options.updateNoteMarkdown(nextMarkdown);
  }

  function moveCard(cardId: string, delta: number) {
    const lineCount = getCodeLineCount(options.codeContent.value);
    placements.value = placements.value.map((placement) =>
      placement.cardId === cardId
        ? { ...placement, afterLine: Math.max(0, Math.min(lineCount, placement.afterLine + delta)) }
        : placement,
    );
    void persistPlacements(placements.value);
  }

  function setCardPlacement(cardId: string, afterLine: number) {
    if (!cards.value.some((card) => card.id === cardId)) {
      return;
    }

    const lineCount = getCodeLineCount(options.codeContent.value);
    const nextPlacement = { cardId, afterLine: clampLine(afterLine, lineCount) };
    const nextPlacements = placements.value.filter((placement) => placement.cardId !== cardId);
    nextPlacements.push(nextPlacement);
    placements.value = mergePlacements(cards.value, nextPlacements, lineCount);
    void persistPlacements(placements.value);
  }

  async function loadPlacements(sceneName: string) {
    const lineCount = getCodeLineCount(options.codeContent.value);
    const savedPlacements = await listDesignCardPlacements(sceneName);
    placements.value = mergePlacements(sortedCards.value, savedPlacements, lineCount);
    await persistPlacements(placements.value);
  }

  async function placeCardAtEnd(cardId: string) {
    const lineCount = getCodeLineCount(options.codeContent.value);
    const nextPlacements = placements.value.filter((placement) => placement.cardId !== cardId);
    nextPlacements.push({ cardId, afterLine: lineCount });
    placements.value = nextPlacements;
    await persistPlacements(nextPlacements);
  }

  function schedulePlanSave(cardId: string, plan: string) {
    saveState.value = "saving";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void persistPlan(cardId, plan);
    }, planSaveDebounceMs);
  }

  async function persistPlan(cardId: string, plan: string) {
    if (!options.currentFile.value) {
      saveState.value = "idle";
      return;
    }

    try {
      const card = await updateDesignCardPlan(options.currentFile.value, cardId, plan);
      upsertCard(card);
      saveState.value = "saved";
    } catch (error) {
      saveState.value = "idle";
      options.onError(getErrorMessage(error));
    } finally {
      saveTimer = 0;
    }
  }

  function removeCardReferencesFromNote(cardId: string) {
    const referencePattern = new RegExp(
      `^\\s*:::design-card\\{id="${escapeRegExp(cardId)}"\\}\\s*$`,
      "gm",
    );
    const nextMarkdown = options.noteMarkdown.value
      .replace(referencePattern, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    options.updateNoteMarkdown(nextMarkdown);
  }

  function upsertCard(card: DesignCard) {
    const nextCards = cards.value.filter((item) => item.id !== card.id);
    nextCards.push(card);
    cards.value = sortCards(nextCards);
    placements.value = mergePlacements(
      cards.value,
      placements.value,
      getCodeLineCount(options.codeContent.value),
    );
  }

  async function persistPlacements(placementsToSave: DesignCardPlacement[]) {
    if (!options.currentFile.value) {
      return;
    }

    try {
      placements.value = await saveDesignCardPlacements(
        options.currentFile.value,
        placementsToSave,
      );
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  function clampPlacementsToCode() {
    const lineCount = getCodeLineCount(options.codeContent.value);
    placements.value = placements.value.map((placement) => ({
      ...placement,
      afterLine: Math.max(0, Math.min(lineCount, placement.afterLine)),
    }));
  }

  return {
    activeCard,
    cards: sortedCards,
    closeContextMenu,
    closeOptimizeDialog,
    closeReviewRoom,
    contextMenu,
    deleteCard: removeCard,
    deleteCardFromNote: (cardId: string) => removeCard(cardId, { removeNoteReferences: true }),
    flushPlanSave,
    generateFromNoteSelection,
    insertCardReferenceIntoNote,
    isOptimizeDialogOpen,
    isReviewRoomOpen,
    moveCard,
    openContextMenu,
    openOptimizeDialog,
    openReviewRoom,
    placements,
    saveState,
    submitOptimization,
    setCardPlacement,
    updateActivePlan,
  };
}

function sortCards(cards: DesignCard[]) {
  return [...cards].sort((a, b) =>
    a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order,
  );
}

function mergePlacements(
  cards: DesignCard[],
  savedPlacements: DesignCardPlacement[],
  lineCount: number,
) {
  const savedByCard = new Map(
    savedPlacements
      .filter((placement) => placement.cardId)
      .map((placement) => [placement.cardId, placement]),
  );

  return cards.map((card) => {
    const saved = savedByCard.get(card.id);
    return {
      cardId: card.id,
      afterLine: clampLine(saved?.afterLine ?? lineCount, lineCount),
    };
  });
}

function clampLine(line: number, lineCount: number) {
  return Math.max(0, Math.min(Number.isFinite(line) ? line : lineCount, lineCount));
}

function getCodeLineCount(code: string) {
  return String(code ?? "").split("\n").length;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
