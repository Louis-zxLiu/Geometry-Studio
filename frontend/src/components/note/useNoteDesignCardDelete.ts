import { ref } from "vue";

export function useNoteDesignCardDelete(onDelete: (cardId: string) => void) {
  const armedDesignCardDeleteId = ref("");
  let designCardDeleteTimer = 0;

  function requestDesignCardDelete(cardId: string) {
    if (armedDesignCardDeleteId.value === cardId) {
      onDelete(cardId);
      armedDesignCardDeleteId.value = "";
      return;
    }

    armedDesignCardDeleteId.value = cardId;
    window.clearTimeout(designCardDeleteTimer);
    designCardDeleteTimer = window.setTimeout(() => {
      if (armedDesignCardDeleteId.value === cardId) {
        armedDesignCardDeleteId.value = "";
      }
    }, 1800);
  }

  function clearDesignCardDeleteTimer() {
    window.clearTimeout(designCardDeleteTimer);
  }

  return {
    armedDesignCardDeleteId,
    clearDesignCardDeleteTimer,
    requestDesignCardDelete,
  };
}
