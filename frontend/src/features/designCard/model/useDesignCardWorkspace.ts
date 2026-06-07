import { computed, ref, watch, type Ref } from "vue";
import type { AINoteSceneActionRequest, AIProviderSettings } from "../../ai/services/aiTypes";
import { getErrorMessage } from "../../../lib/errors";
import {
  deleteDesignCard,
  generateDesignCardFromSelection,
  listDesignCardPlacements,
  listDesignCards,
  optimizeDesignCard,
  saveDesignCardPlacements,
  updateDesignCardPlan,
} from "../services/designCardBridgeCompat";
import { extractDesignCardReferenceIDs } from "../services/designCardMarkdownCodec";
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
};

const planSaveDebounceMs = 420;

export function useDesignCardWorkspace(options: DesignCardWorkspaceOptions) {
  const cards = ref<DesignCard[]>([]);
  const placements = ref<DesignCardPlacement[]>([]);
  const activeCardId = ref("");
  const isReviewRoomOpen = computed(() => activeCardId.value !== "");
  const optimizeDialogCardId = ref("");
  const saveState = ref<"idle" | "saving" | "saved">("idle");
  const editorAnchorLine = ref(1);

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

  async function generateFromNoteSelection(request: AINoteSceneActionRequest) {
    const targetScene = request.sceneName.trim();
    if (
      !targetScene ||
      options.isRunning.value ||
      options.aiActivity.isAIGenerating.value ||
      !request.selection.items.length
    ) {
      return;
    }

    options.aiActivity.start();
    try {
      const result = await generateDesignCardFromSelection({
        sceneName: targetScene,
        settings: options.aiSettings.value,
        selection: request.selection,
      });
      if (options.currentFile.value !== targetScene) {
        return;
      }

      upsertCard(result.card);
      await placeCardAtAnchor(result.card.id);
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
  }

  function closeReviewRoom() {
    activeCardId.value = "";
  }

  function openOptimizeDialog(cardId = activeCardId.value) {
    if (!cardId || options.aiActivity.isAIGenerating.value) {
      return;
    }

    optimizeDialogCardId.value = cardId;
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

  async function removeCard(cardId: string) {
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
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  function moveCard(cardId: string, delta: number) {
    const lineCount = getCodeLineCount(options.codeContent.value);
    placements.value = placements.value.map((placement) =>
      placement.cardId === cardId
        ? { ...placement, afterLine: clampLine(placement.afterLine + delta, lineCount) }
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
    placements.value = normalizePlacements(cards.value, nextPlacements, lineCount);
    void persistPlacements(placements.value);
  }

  function removeCardPlacement(cardId: string) {
    if (!cardId || !placements.value.some((placement) => placement.cardId === cardId)) {
      return;
    }

    placements.value = placements.value.filter((placement) => placement.cardId !== cardId);
    void persistPlacements(placements.value);
  }

  async function loadPlacements(sceneName: string) {
    const lineCount = getCodeLineCount(options.codeContent.value);
    const placementState = await listDesignCardPlacements(sceneName);
    placements.value = normalizePlacements(sortedCards.value, placementState.placements, lineCount, {
      autoPlaceUnreferencedCards: !placementState.hasSavedPlacementState,
      noteMarkdown: options.noteMarkdown.value,
    });
    await persistPlacements(placements.value);
  }

  async function placeCardAtAnchor(cardId: string) {
    const lineCount = getCodeLineCount(options.codeContent.value);
    const afterLine = clampLine(editorAnchorLine.value, lineCount);
    const nextPlacements = placements.value.filter((placement) => placement.cardId !== cardId);
    nextPlacements.push({ cardId, afterLine });
    placements.value = nextPlacements;
    await persistPlacements(nextPlacements);
  }

  function setEditorAnchorLine(line: number) {
    editorAnchorLine.value = clampLine(line, getCodeLineCount(options.codeContent.value));
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

  function upsertCard(card: DesignCard) {
    const nextCards = cards.value.filter((item) => item.id !== card.id);
    nextCards.push(card);
    cards.value = sortCards(nextCards);
    placements.value = normalizePlacements(
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
      afterLine: clampLine(placement.afterLine, lineCount),
    }));
  }

  return {
    activeCard,
    cards: sortedCards,
    closeOptimizeDialog,
    closeReviewRoom,
    deleteCard: removeCard,
    flushPlanSave,
    generateFromNoteSelection,
    isOptimizeDialogOpen,
    isReviewRoomOpen,
    moveCard,
    openOptimizeDialog,
    openReviewRoom,
    placements,
    removeCardPlacement,
    saveState,
    submitOptimization,
    setCardPlacement,
    setEditorAnchorLine,
    updateActivePlan,
  };
}

function sortCards(cards: DesignCard[]) {
  return [...cards].sort((a, b) =>
    a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order,
  );
}

function normalizePlacements(
  cards: DesignCard[],
  savedPlacements: DesignCardPlacement[],
  lineCount: number,
  options: { autoPlaceUnreferencedCards?: boolean; noteMarkdown?: string } = {},
) {
  if (savedPlacements.length === 0 && options.autoPlaceUnreferencedCards) {
    const noteCardIds = new Set(extractDesignCardReferenceIDs(options.noteMarkdown ?? ""));
    return cards.filter((card) => !noteCardIds.has(card.id)).map((card) => ({
      cardId: card.id,
      afterLine: lineCount,
    }));
  }

  const knownCardIds = new Set(cards.map((card) => card.id));
  const seenCardIds = new Set<string>();

  return savedPlacements.flatMap((saved) => {
    if (!saved.cardId || !knownCardIds.has(saved.cardId) || seenCardIds.has(saved.cardId)) {
      return [];
    }

    seenCardIds.add(saved.cardId);
    return {
      cardId: saved.cardId,
      afterLine: clampLine(saved.afterLine, lineCount),
    };
  });
}

function clampLine(line: number, lineCount: number) {
  return Math.max(1, Math.min(Number.isFinite(line) ? line : lineCount, Math.max(1, lineCount)));
}

function getCodeLineCount(code: string) {
  return String(code ?? "").split("\n").length;
}
