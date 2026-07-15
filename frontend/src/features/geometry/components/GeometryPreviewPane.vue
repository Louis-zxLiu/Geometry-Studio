<script setup lang="ts">
import { computed } from "vue";
import type {
  GeometryPoint,
  GeometrySceneDocument,
} from "../services/geometryTypes";

const props = defineProps<{
  document: GeometrySceneDocument | null;
  busy?: boolean;
  progressLabel?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const width = 640;
const height = 420;
const pointMap = computed(() => {
  const map = new Map<string, GeometryPoint>();
  for (const point of props.document?.scene.points ?? []) {
    map.set(point.id, point);
  }
  return map;
});
const bounds = computed(() => resolveBounds(props.document?.scene.points ?? []));

function sx(x: number) {
  const box = bounds.value;
  return ((x - box.minX) / Math.max(1, box.maxX - box.minX)) * width;
}

function sy(y: number) {
  const box = bounds.value;
  return height - ((y - box.minY) / Math.max(1, box.maxY - box.minY)) * height;
}

function sr(radius: number) {
  const box = bounds.value;
  const scale = (width + height) / Math.max(2, box.maxX - box.minX + box.maxY - box.minY);
  return Math.max(4, radius * scale);
}

function point(id: string) {
  return pointMap.value.get(id) ?? null;
}

function segmentPoints(from: string, to: string) {
  const a = point(from);
  const b = point(to);
  if (!a || !b) {
    return null;
  }
  return {
    x1: sx(a.x),
    y1: sy(a.y),
    x2: sx(b.x),
    y2: sy(b.y),
  };
}

function polygonPoints(ids: string[]) {
  return ids
    .map((id) => point(id))
    .filter((item): item is GeometryPoint => !!item)
    .map((item) => `${sx(item.x)},${sy(item.y)}`)
    .join(" ");
}

function circleView(centerId: string, radius: number, throughId: string) {
  const center = point(centerId);
  if (!center) {
    return null;
  }
  const through = throughId ? point(throughId) : null;
  const computedRadius = through
    ? Math.hypot(sx(through.x) - sx(center.x), sy(through.y) - sy(center.y))
    : sr(radius);
  return {
    cx: sx(center.x),
    cy: sy(center.y),
    r: computedRadius,
  };
}

function resolveBounds(points: GeometryPoint[]) {
  if (!points.length) {
    return { minX: -4, maxX: 4, minY: -3, maxY: 3 };
  }

  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max(1, (maxX - minX) * 0.18);
  const padY = Math.max(1, (maxY - minY) * 0.18);
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  };
}
</script>

<template>
  <aside v-if="document" class="geometry-preview-pane">
    <header class="geometry-preview-header">
      <div>
        <strong>{{ document.scene.title || "Geometry Studio" }}</strong>
        <span v-if="busy">{{ progressLabel || "AI working..." }}</span>
      </div>
      <button type="button" aria-label="关闭几何预览" title="关闭" @click="emit('close')">
        ×
      </button>
    </header>

    <div class="geometry-preview-body">
      <img
        v-if="document.sourceImageDataUrl"
        class="geometry-source-thumb"
        :src="document.sourceImageDataUrl"
        alt="Geometry source"
      />

      <svg
        class="geometry-scene-svg"
        :viewBox="`0 0 ${width} ${height}`"
        role="img"
        :aria-label="document.scene.title"
      >
        <polygon
          v-for="polygon in document.scene.polygons"
          :key="polygon.id"
          class="geometry-svg-polygon"
          :points="polygonPoints(polygon.points)"
        />
        <circle
          v-for="circle in document.scene.circles"
          v-bind="circleView(circle.center, circle.radius, circle.through) ?? {}"
          :key="circle.id"
          class="geometry-svg-circle"
        />
        <template v-for="segment in document.scene.segments" :key="segment.id">
          <line
            v-if="segmentPoints(segment.from, segment.to)"
            v-bind="segmentPoints(segment.from, segment.to) ?? {}"
            class="geometry-svg-segment"
          />
        </template>
        <g
          v-for="pointItem in document.scene.points"
          :key="pointItem.id"
          class="geometry-svg-point"
        >
          <circle :cx="sx(pointItem.x)" :cy="sy(pointItem.y)" r="5.5" />
          <text :x="sx(pointItem.x) + 9" :y="sy(pointItem.y) - 8">
            {{ pointItem.label || pointItem.id }}
          </text>
        </g>
        <text
          v-for="annotation in document.scene.annotations"
          :key="annotation.id"
          class="geometry-svg-annotation"
          :x="sx(annotation.x)"
          :y="sy(annotation.y)"
        >
          {{ annotation.text }}
        </text>
      </svg>

      <div v-if="document.scene.constraints.length" class="geometry-preview-list">
        <strong>条件</strong>
        <p v-for="constraint in document.scene.constraints" :key="`${constraint.type}-${constraint.text}`">
          {{ constraint.text || `${constraint.type}(${constraint.args.join(", ")})` }}
        </p>
      </div>

      <div v-if="document.scene.controls.length" class="geometry-preview-list">
        <strong>控件</strong>
        <p v-for="control in document.scene.controls" :key="control.id">
          {{ control.label }}: {{ control.value }}
        </p>
      </div>

      <div v-if="document.scene.proofSteps.length" class="geometry-preview-list proof">
        <strong>证明</strong>
        <p v-for="step in document.scene.proofSteps" :key="step.id">
          {{ step.claim }}
        </p>
      </div>
    </div>
  </aside>
</template>
