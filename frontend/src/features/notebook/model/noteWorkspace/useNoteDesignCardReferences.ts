import type { Ref } from "vue";
import {
  extractDesignCardReferenceIDs,
  formatDesignCardReference,
} from "../../../designCard/services/designCardMarkdownCodec";
import type { NoteDocument } from "../../services/notebookStorage";
import { collapseBlankLines, insertBlockReference } from "./noteMarkdownBlocks";

type NoteDesignCardReferencesOptions = {
  currentDocument: Ref<NoteDocument>;
  persistImmediately: () => void;
  updateMarkdown: (markdown: string) => void;
};

export function useNoteDesignCardReferences(options: NoteDesignCardReferencesOptions) {
  function insertDesignCardReference(payload: {
    cardId: string;
    insertAt?: number;
    persist?: "debounced" | "immediate";
    source?: "editor" | "note";
  }) {
    if (!payload.cardId) {
      return;
    }

    const markdown = options.currentDocument.value.markdown;
    const hasReference = extractDesignCardReferenceIDs(markdown).includes(payload.cardId);
    if (payload.source !== "note" && hasReference) {
      return;
    }

    const withoutExistingReference = removeDesignCardReferences(
      markdown,
      payload.cardId,
      payload.insertAt,
    );
    const nextMarkdown = insertBlockReference(
      withoutExistingReference.markdown,
      formatDesignCardReference(payload.cardId),
      withoutExistingReference.insertAt,
    );
    options.updateMarkdown(nextMarkdown);
    if (payload.persist === "immediate") {
      options.persistImmediately();
    }
  }

  function removeDesignCardReference(payload: {
    cardId: string;
    persist?: "debounced" | "immediate";
  }) {
    if (!payload.cardId) {
      return;
    }

    const currentMarkdown = options.currentDocument.value.markdown;
    const nextMarkdown = removeDesignCardReferences(currentMarkdown, payload.cardId).markdown;
    if (nextMarkdown === currentMarkdown) {
      return;
    }

    options.updateMarkdown(nextMarkdown);
    if (payload.persist === "immediate") {
      options.persistImmediately();
    }
  }

  return {
    insertDesignCardReference,
    removeDesignCardReference,
  };
}

function removeDesignCardReferences(markdown: string, cardId: string, insertAt?: number) {
  const reference = formatDesignCardReference(cardId);
  let nextMarkdown = "";
  let cursor = 0;
  let nextInsertAt = insertAt;
  let removed = false;

  for (;;) {
    const index = markdown.indexOf(reference, cursor);
    if (index === -1) {
      nextMarkdown += markdown.slice(cursor);
      break;
    }

    nextMarkdown += markdown.slice(cursor, index);
    removed = true;
    if (typeof nextInsertAt === "number" && index < nextInsertAt) {
      nextInsertAt = Math.max(0, nextInsertAt - reference.length);
    }
    cursor = index + reference.length;
  }

  return {
    insertAt: nextInsertAt,
    markdown: removed ? collapseBlankLines(nextMarkdown).trim() : markdown,
  };
}
