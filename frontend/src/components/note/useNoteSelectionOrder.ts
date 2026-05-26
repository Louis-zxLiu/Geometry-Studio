export function useNoteSelectionOrder() {
  let selectionOrder = 0;

  function nextSelectionOrder() {
    selectionOrder += 1;
    return selectionOrder;
  }

  return {
    nextSelectionOrder,
  };
}
