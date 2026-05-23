<script setup lang="ts">
import type { CodeAIVersion } from "../../features/codeAIOptimize/model/useCodeAIOptimize";

defineProps<{
  activeId: string;
  versions: CodeAIVersion[];
}>();

const emit = defineEmits<{
  select: [id: string];
}>();
</script>

<template>
  <aside v-if="versions.length > 0" class="code-ai-version-rail" aria-label="AI versions">
    <button
      v-for="version in versions"
      :key="version.id"
      class="code-ai-version-mark"
      :class="{ active: version.id === activeId }"
      type="button"
      :title="`${version.label} · ${version.note}`"
      @click="emit('select', version.id)"
    >
      <span>{{ version.label }}</span>
    </button>
  </aside>
</template>
