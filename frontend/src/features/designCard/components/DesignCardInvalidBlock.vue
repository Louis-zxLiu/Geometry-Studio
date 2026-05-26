<script setup lang="ts">
defineProps<{
  cardId: string;
}>();
</script>

<template>
  <article class="design-card-invalid-block">
    <strong>设计卡片已失效</strong>
    <span>{{ cardId }}</span>
  </article>
</template>
