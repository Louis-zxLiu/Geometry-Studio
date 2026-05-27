export function insertBlockReference(markdown: string, block: string, insertAt?: number) {
  if (!block) {
    return markdown;
  }

  if (!markdown) {
    return block;
  }

  if (typeof insertAt !== "number" || Number.isNaN(insertAt)) {
    const trimmedMarkdown = markdown.replace(/\s+$/u, "");
    return `${trimmedMarkdown}\n\n${block}`;
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const safeIndex = protectAtomicBlockInsertionIndex(
    normalized,
    Math.max(0, Math.min(insertAt, normalized.length)),
  );
  const before = normalized.slice(0, safeIndex);
  const after = normalized.slice(safeIndex);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : before.endsWith("\n\n") ? "" : before ? "\n" : "";
  const suffix = after.startsWith("\n") ? "" : after ? "\n\n" : "";
  return `${before}${prefix}${block}${suffix}${after}`;
}

export function collapseBlankLines(markdown: string) {
  return markdown.replace(/\n{3,}/g, "\n\n");
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function protectAtomicBlockInsertionIndex(markdown: string, insertAt: number) {
  const atomicPattern = /:::design-card\{id="[^"]+"\}/g;
  for (const match of markdown.matchAll(atomicPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (insertAt <= start || insertAt >= end) {
      continue;
    }

    return insertAt < start + (end - start) / 2 ? start : end;
  }

  return insertAt;
}
