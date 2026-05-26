<script setup lang="ts">
defineProps<{
  svg: string;
}>();
</script>

<template>
  <div class="design-card-svg-view" v-html="svg"></div>
</template>
