import type { DesignCard, DesignCardPlacement } from "./designCardTypes";

const storagePrefix = "plotkitycat:design-card:placements:";

export function createDesignCardPlacementStorage() {
  function load(sceneName: string, cards: DesignCard[], lineCount: number): DesignCardPlacement[] {
    const saved = loadSavedPlacements(sceneName);
    return cards.map((card) => {
      const savedPlacement = saved.get(card.id);
      if (savedPlacement) {
        return {
          cardId: card.id,
          afterLine: clampLine(savedPlacement.afterLine, lineCount),
        };
      }

      return {
        cardId: card.id,
        afterLine: lineCount,
      };
    });
  }

  function save(sceneName: string, placements: DesignCardPlacement[]) {
    if (!sceneName) {
      return;
    }

    window.localStorage.setItem(`${storagePrefix}${sceneName}`, JSON.stringify(placements));
  }

  function clear(sceneName: string) {
    if (sceneName) {
      window.localStorage.removeItem(`${storagePrefix}${sceneName}`);
    }
  }

  return { clear, load, save };
}

function loadSavedPlacements(sceneName: string) {
  const placements = new Map<string, DesignCardPlacement>();
  if (!sceneName) {
    return placements;
  }

  try {
    const raw = window.localStorage.getItem(`${storagePrefix}${sceneName}`);
    const parsed = JSON.parse(raw || "[]") as DesignCardPlacement[];
    parsed.forEach((placement) => {
      if (placement.cardId) {
        placements.set(placement.cardId, placement);
      }
    });
  } catch {
    return placements;
  }

  return placements;
}

function clampLine(line: number, lineCount: number) {
  return Math.max(0, Math.min(Number.isFinite(line) ? line : lineCount, lineCount));
}
