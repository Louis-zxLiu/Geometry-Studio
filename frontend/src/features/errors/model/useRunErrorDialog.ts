import { ref } from "vue";

export function useRunErrorDialog() {
  const isRunErrorDialogOpen = ref(false);
  const isRunErrorCopied = ref(false);
  const isRunErrorRepairable = ref(false);
  const runErrorText = ref("");

  function openRunErrorDialog(errorText: string, options?: { repairable?: boolean }) {
    runErrorText.value = asString(errorText);
    isRunErrorDialogOpen.value = true;
    isRunErrorCopied.value = false;
    isRunErrorRepairable.value = options?.repairable ?? false;
  }

  function closeRunErrorDialog() {
    isRunErrorDialogOpen.value = false;
    isRunErrorCopied.value = false;
    isRunErrorRepairable.value = false;
  }

  function clearRunError() {
    runErrorText.value = "";
    isRunErrorCopied.value = false;
    isRunErrorRepairable.value = false;
  }

  async function copyRunError() {
    const text = runErrorText.value.trim();
    if (!text) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    isRunErrorCopied.value = true;
  }

  return {
    clearRunError,
    closeRunErrorDialog,
    copyRunError,
    isRunErrorCopied,
    isRunErrorDialogOpen,
    isRunErrorRepairable,
    openRunErrorDialog,
    runErrorText,
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}
