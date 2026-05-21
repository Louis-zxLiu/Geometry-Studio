import type { Ref } from "vue";

export function useCodeStreaming(codeContent: Ref<string>) {
  async function streamGeneratedCode(generatedCode: string) {
    const normalizedGeneratedCode = normalizeGeneratedCode(generatedCode);
    if (!normalizedGeneratedCode) {
      return;
    }

    const prefix = buildGenerationPrefix(codeContent.value);
    codeContent.value = prefix;
    const lines = normalizedGeneratedCode.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (index > 0) {
        codeContent.value += "\n";
      }

      codeContent.value += lines[index];
      await wait(index === 0 ? 170 : 95);
    }
  }

  return {
    streamGeneratedCode,
  };
}

function normalizeGeneratedCode(code: string) {
  return code.replace(/\r\n/g, "\n").trim();
}

function buildGenerationPrefix(currentCode: string) {
  const normalizedCurrentCode = currentCode.replace(/\r\n/g, "\n");
  if (normalizedCurrentCode.trim() === "") {
    return "";
  }

  return normalizedCurrentCode.replace(/\n*$/, "") + "\n\n\n";
}

function wait(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}
