<script setup lang="ts">
import { computed } from "vue";
import { getDesignCardSvgAspectRatio } from "../services/designCardSvgGeometry";

const props = defineProps<{
  svg: string;
}>();

const aspectRatio = computed(() => getDesignCardSvgAspectRatio(props.svg));
</script>

<template>
  <div
    class="design-card-static-svg-view"
    :class="{ 'has-intrinsic-ratio': aspectRatio }"
    :style="{ aspectRatio }"
    v-html="svg"
  ></div>
</template>
