import { watch, type Ref } from "vue";

export type CodeStreamingResult = "completed" | "cancelled";

export function composeGeneratedCode(currentCode: string, generatedCode: string) {
  const normalizedGeneratedCode = normalizeGeneratedCode(generatedCode);
  if (!normalizedGeneratedCode) {
    return currentCode;
  }

  return buildGenerationPrefix(currentCode) + normalizedGeneratedCode;
}

export function useCodeStreaming(codeContent: Ref<string>, currentFile: Ref<string>) {
  let activeStreamToken = 0;
  let activeSceneName = "";

  function cancelStreaming() {
    activeStreamToken += 1;
    activeSceneName = "";
  }

  function isActiveStream(token: number, sceneName: string) {
    return activeStreamToken === token && currentFile.value === sceneName;
  }

  async function streamGeneratedCode(generatedCode: string): Promise<CodeStreamingResult> {
    const nextCode = composeGeneratedCode(codeContent.value, generatedCode);
    if (nextCode === codeContent.value) {
      return "completed";
    }

    const sceneAtStart = currentFile.value;
    const streamToken = activeStreamToken + 1;
    activeStreamToken = streamToken;
    activeSceneName = sceneAtStart;

    if (!isActiveStream(streamToken, sceneAtStart)) {
      return "cancelled";
    }

    codeContent.value = buildGenerationPrefix(codeContent.value);
    const lines = normalizeGeneratedCode(generatedCode).split("\n");
    try {
      for (let index = 0; index < lines.length; index += 1) {
        if (!isActiveStream(streamToken, sceneAtStart)) {
          return "cancelled";
        }

        if (index > 0) {
          codeContent.value += "\n";
        }

        codeContent.value += lines[index];
        await wait(index === 0 ? 170 : 95);
      }

      return "completed";
    } finally {
      if (activeStreamToken === streamToken) {
        activeSceneName = "";
      }
    }
  }

  watch(currentFile, (nextFile) => {
    if (activeSceneName && nextFile !== activeSceneName) {
      cancelStreaming();
    }
  });

  return {
    cancelStreaming,
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
