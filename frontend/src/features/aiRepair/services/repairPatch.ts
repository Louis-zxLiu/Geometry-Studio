export type RepairPatchBlock = {
  before: string;
  after: string;
};

export type ChangedLineRange = {
  startLine: number;
  endLine: number;
};

export type ApplyRepairResult = {
  code: string;
  changedRanges: ChangedLineRange[];
};

const blockPattern =
  />>>Acode[ \t]*\r?\n([\s\S]*?)\r?\n<<<Acode[ \t]*\r?\n>>>Bcode[ \t]*\r?\n([\s\S]*?)\r?\n<<<Bcode/g;

export function applyRepairPatch(currentCode: string, patchText: string): ApplyRepairResult {
  const normalizedCurrentCode = normalizeNewlines(currentCode);
  const blocks = parseRepairPatch(patchText);
  validateRepairBlocks(normalizedCurrentCode, blocks);

  const matches = blocks.map((block) => {
    const start = normalizedCurrentCode.indexOf(block.before);
    return {
      block,
      start,
      end: start + block.before.length,
    };
  });

  const sortedMatches = [...matches].sort((left, right) => left.start - right.start);
  for (let index = 1; index < sortedMatches.length; index += 1) {
    if (sortedMatches[index].start < sortedMatches[index - 1].end) {
      throw new Error("AI 修复补丁存在重叠片段，请重试");
    }
  }

  let nextCode = normalizedCurrentCode;
  const changedRanges: ChangedLineRange[] = [];
  for (let index = sortedMatches.length - 1; index >= 0; index -= 1) {
    const match = sortedMatches[index];
    const prefix = nextCode.slice(0, match.start);
    const suffix = nextCode.slice(match.end);
    nextCode = prefix + match.block.after + suffix;
    changedRanges.unshift({
      startLine: lineNumberAt(currentCode, match.start),
      endLine: lineNumberAt(currentCode, match.end),
    });
  }

  if (nextCode.trim() === "") {
    throw new Error("AI 修复后的代码为空，已取消替换");
  }

  return {
    code: nextCode,
    changedRanges,
  };
}

export function parseRepairPatch(patchText: string): RepairPatchBlock[] {
  const normalizedPatch = normalizeNewlines(patchText).trim();
  const blocks: RepairPatchBlock[] = [];
  let match: RegExpExecArray | null;

  blockPattern.lastIndex = 0;
  while ((match = blockPattern.exec(normalizedPatch)) !== null) {
    blocks.push({
      before: trimOneTrailingNewline(match[1]),
      after: trimOneTrailingNewline(match[2]),
    });
  }

  if (blocks.length === 0) {
    throw new Error("AI 修复没有返回有效补丁");
  }
  blockPattern.lastIndex = 0;
  if (normalizedPatch.replace(blockPattern, "").trim() !== "") {
    throw new Error("AI 修复补丁包含无法识别的内容，请重试");
  }

  return blocks;
}

function validateRepairBlocks(currentCode: string, blocks: RepairPatchBlock[]) {
  const normalizedCode = normalizeNewlines(currentCode);
  for (const block of blocks) {
    if (block.before.trim() === "") {
      throw new Error("AI 修复补丁缺少旧代码片段");
    }

    const before = normalizeNewlines(block.before);
    const firstIndex = normalizedCode.indexOf(before);
    if (firstIndex < 0) {
      throw new Error("AI 修复片段未能定位到当前代码，请重试");
    }

    const secondIndex = normalizedCode.indexOf(before, firstIndex + before.length);
    if (secondIndex >= 0) {
      throw new Error("AI 修复片段匹配到多处，请重试");
    }
  }
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function trimOneTrailingNewline(value: string) {
  return normalizeNewlines(value).replace(/\n$/u, "");
}

function lineNumberAt(code: string, offset: number) {
  return normalizeNewlines(code.slice(0, Math.max(0, offset))).split("\n").length;
}
