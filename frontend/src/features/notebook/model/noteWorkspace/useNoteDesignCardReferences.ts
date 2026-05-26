import type { Ref } from "vue";
import {
  extractDesignCardReferenceIDs,
  formatDesignCardReference,
} from "../../../designCard/services/designCardMarkdownCodec";
import type { NoteDocument } from "../../services/notebookStorage";
import { collapseBlankLines, insertBlockReference } from "./noteMarkdownBlocks";

type NoteDesignCardReferencesOptions = {
  currentDocument: Ref<NoteDocument>;
  updateMarkdown: (markdown: string) => void;
};

export function useNoteDesignCardReferences(options: NoteDesignCardReferencesOptions) {
  function insertDesignCardReference(payload: {
    cardId: string;
    insertAt?: number;
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
    options.updateMarkdown(insertBlockReference(
      withoutExistingReference.markdown,
      formatDesignCardReference(payload.cardId),
      withoutExistingReference.insertAt,
    ));
  }

  return {
    insertDesignCardReference,
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
