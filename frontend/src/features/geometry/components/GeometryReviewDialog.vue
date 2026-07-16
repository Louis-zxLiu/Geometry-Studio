<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderMarkdownToHtml } from "../../notebook/rendering/markdownRenderer";
import type {
  GeometryConstruction,
  GeometryScene,
  GeometrySpec,
  GeometryValidationSummary,
} from "../services/geometryTypes";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  constructionDraft?: GeometryConstruction | null;
  previewScene?: GeometryScene | null;
  spec: GeometrySpec | null;
  validationSummary?: GeometryValidationSummary | null;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [spec: GeometrySpec];
}>();

const editableSpec = ref<GeometrySpec>(createEmptySpec());
const previewDrawing = computed(() => buildPreviewDrawing(props.previewScene));
const previewStats = computed(() => {
  const scene = props.previewScene;
  return {
    points: scene?.points?.filter((point) => point.label?.trim()).length ?? 0,
    segments: scene?.segments?.length ?? 0,
    circles: scene?.circles?.length ?? 0,
    arcs: scene?.arcs?.length ?? 0,
  };
});
const constructionIntentPreview = computed(() =>
  (props.constructionDraft?.constructionIntent ?? [])
    .map((item) => String(item.summary ?? item.source ?? ""))
    .filter(Boolean)
    .slice(0, 4),
);
const constructionConstraintPreview = computed(() =>
  (props.constructionDraft?.constraints ?? [])
    .map((item) => ({
      id: String(item.id ?? item.type ?? ""),
      type: String(item.type ?? ""),
      text: String(item.text ?? ""),
    }))
    .slice(0, 8),
);
const constructionResidualPreview = computed(() => {
  const solution = props.constructionDraft?.solution as Record<string, unknown> | undefined;
  const residualsValue = solution?.["residuals"];
  const residuals = Array.isArray(residualsValue) ? residualsValue : [];
  return residuals
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: String(item.constraintId ?? item.type ?? ""),
      value: Number(item.value ?? 0),
      ok: Boolean(item.ok),
      message: String(item.message ?? ""),
    }))
    .slice(0, 8);
});
const validationFailedItems = computed(() => props.validationSummary?.failedItems?.slice(0, 4) ?? []);
const validationStatusText = computed(() => {
  if (!props.validationSummary) {
    return "暂无校验反馈";
  }
  return props.validationSummary.isValid ? "草图校验通过" : "草图校验未通过";
});

watch(
  () => props.spec,
  (spec) => {
    editableSpec.value = cloneSpec(spec ?? createEmptySpec());
  },
  { deep: true, immediate: true },
);

function addEntity() {
  editableSpec.value.entities.push({
    id: `E${editableSpec.value.entities.length + 1}`,
    type: "point",
    label: "",
    attributes: {},
  });
}

function addConstraint() {
  editableSpec.value.constraints.push({
    type: "relation",
    args: [],
    text: "",
    confidence: 0.9,
  });
}

function addConstructionHint() {
  editableSpec.value.constructionHints.push("");
}

function removeEntity(index: number) {
  editableSpec.value.entities.splice(index, 1);
}

function removeConstraint(index: number) {
  editableSpec.value.constraints.splice(index, 1);
}

function removeConstructionHint(index: number) {
  editableSpec.value.constructionHints.splice(index, 1);
}

function updateConstraintArgs(index: number, value: string) {
  editableSpec.value.constraints[index].args = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function submit() {
  if (props.pending) {
    return;
  }
  emit("confirm", cloneSpec(editableSpec.value));
}

function renderReviewMarkdown(markdown: string) {
  const text = markdown.trim();
  return text ? renderMarkdownToHtml(text) : "";
}

function createEmptySpec(): GeometrySpec {
  return {
    problemText: "",
    goalText: "",
    entities: [],
    constraints: [],
    constructionHints: [],
    confidence: 0.9,
  };
}

function cloneSpec(spec: GeometrySpec): GeometrySpec {
  return JSON.parse(JSON.stringify(spec)) as GeometrySpec;
}

type PreviewDrawing = {
  arcs: Array<{ id: string; label: string; path: string }>;
  circles: Array<{ id: string; label: string; radius: number; x: number; y: number }>;
  points: Array<{ id: string; label: string; x: number; y: number }>;
  segments: Array<{ id: string; label: string; x1: number; x2: number; y1: number; y2: number }>;
};

function buildPreviewDrawing(scene?: GeometryScene | null): PreviewDrawing | null {
  const sourcePoints = scene?.points ?? [];
  if (!sourcePoints.length) {
    return null;
  }
  const pointMap = new Map(sourcePoints.map((point) => [point.id, point]));
  let minX = Math.min(...sourcePoints.map((point) => point.x));
  let maxX = Math.max(...sourcePoints.map((point) => point.x));
  let minY = Math.min(...sourcePoints.map((point) => point.y));
  let maxY = Math.max(...sourcePoints.map((point) => point.y));
  for (const circle of scene?.circles ?? []) {
    const center = pointMap.get(circle.center);
    if (!center) {
      continue;
    }
    minX = Math.min(minX, center.x - circle.radius);
    maxX = Math.max(maxX, center.x + circle.radius);
    minY = Math.min(minY, center.y - circle.radius);
    maxY = Math.max(maxY, center.y + circle.radius);
  }
  const canvasWidth = 360;
  const canvasHeight = 220;
  const padding = 22;
  const rangeX = Math.max(1, maxX - minX);
  const rangeY = Math.max(1, maxY - minY);
  const scale = Math.min((canvasWidth - padding * 2) / rangeX, (canvasHeight - padding * 2) / rangeY);
  const offsetX = (canvasWidth - rangeX * scale) / 2;
  const offsetY = (canvasHeight - rangeY * scale) / 2;
  const project = (point: { x: number; y: number }) => ({
    x: offsetX + (point.x - minX) * scale,
    y: canvasHeight - (offsetY + (point.y - minY) * scale),
  });
  const points = sourcePoints.map((point) => ({ ...project(point), id: point.id, label: point.label }));
  const segments = (scene?.segments ?? [])
    .map((segment) => {
      const from = pointMap.get(segment.from);
      const to = pointMap.get(segment.to);
      if (!from || !to) {
        return null;
      }
      const start = project(from);
      const end = project(to);
      return {
        id: segment.id,
        label: segment.label,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      };
    })
    .filter((segment): segment is PreviewDrawing["segments"][number] => !!segment);
  const circles = (scene?.circles ?? [])
    .map((circle) => {
      const center = pointMap.get(circle.center);
      if (!center) {
        return null;
      }
      const projected = project(center);
      return {
        id: circle.id,
        label: circle.label,
        radius: circle.radius * scale,
        x: projected.x,
        y: projected.y,
      };
    })
    .filter((circle): circle is PreviewDrawing["circles"][number] => !!circle);
  const arcs = (scene?.arcs ?? [])
    .map((arc) => {
      const center = pointMap.get(arc.center);
      const start = pointMap.get(arc.start);
      const end = pointMap.get(arc.end);
      if (!center || !start || !end) {
        return null;
      }
      const c = project(center);
      const s = project(start);
      const e = project(end);
      const radius = Math.max(1, Math.hypot(s.x - c.x, s.y - c.y));
      const startAngle = Math.atan2(s.y - c.y, s.x - c.x);
      const endAngle = Math.atan2(e.y - c.y, e.x - c.x);
      let delta = endAngle - startAngle;
      if (delta < 0) {
        delta += Math.PI * 2;
      }
      const largeArc = delta > Math.PI ? 1 : 0;
      return {
        id: arc.id,
        label: arc.label,
        path: `M ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArc} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)}`,
      };
    })
    .filter((arc): arc is PreviewDrawing["arcs"][number] => !!arc);
  return { arcs, circles, points, segments };
}
</script>

<template>
  <Transition name="dialog-enter">
    <div v-if="open" class="dialog-backdrop">
      <section class="create-dialog geometry-review-dialog">
        <h2>几何规格复核</h2>

        <div class="geometry-review-construction">
          <div class="geometry-review-preview-panel">
            <div class="geometry-review-heading compact">
              <strong>构造预览</strong>
              <span>{{ previewStats.points }} 点 · {{ previewStats.segments }} 线 · {{ previewStats.circles }} 圆</span>
            </div>
            <svg
              v-if="previewDrawing"
              class="geometry-review-svg"
              viewBox="0 0 360 220"
              role="img"
              aria-label="约束构造预览"
            >
              <circle
                v-for="circle in previewDrawing.circles"
                :key="circle.id"
                class="geometry-review-svg-circle"
                :cx="circle.x"
                :cy="circle.y"
                :r="circle.radius"
              />
              <path
                v-for="arc in previewDrawing.arcs"
                :key="arc.id"
                class="geometry-review-svg-arc"
                :d="arc.path"
              />
              <line
                v-for="segment in previewDrawing.segments"
                :key="segment.id"
                class="geometry-review-svg-segment"
                :x1="segment.x1"
                :x2="segment.x2"
                :y1="segment.y1"
                :y2="segment.y2"
              />
              <g v-for="point in previewDrawing.points" :key="point.id">
                <circle class="geometry-review-svg-point" :cx="point.x" :cy="point.y" r="3.6" />
                <text
                  v-if="point.label"
                  class="geometry-review-svg-label"
                  :x="point.x + 6"
                  :y="point.y - 6"
                >
                  {{ point.label }}
                </text>
              </g>
            </svg>
            <div v-else class="geometry-review-empty-preview">暂无构造预览</div>
          </div>

          <div class="geometry-review-validation-panel">
            <div class="geometry-review-heading compact">
              <strong>{{ validationStatusText }}</strong>
              <span v-if="validationSummary">
                对象 {{ Math.round(validationSummary.objectCoverage * 100) }}% · 条件 {{ Math.round(validationSummary.conditionCoverage * 100) }}%
              </span>
            </div>
            <p v-if="validationSummary?.summary" class="geometry-review-validation-summary">
              {{ validationSummary.summary }}
            </p>
            <ul v-if="validationFailedItems.length" class="geometry-review-validation-list">
              <li v-for="item in validationFailedItems" :key="`${item.target}-${item.message}`">
                <strong>{{ item.target || item.severity }}</strong>
                <span>{{ item.message }}</span>
              </li>
            </ul>
            <div
              v-if="constructionIntentPreview.length || constructionConstraintPreview.length || constructionResidualPreview.length"
              class="geometry-review-constraint-preview"
            >
              <div v-if="constructionIntentPreview.length" class="geometry-review-mini-section">
                <strong>构造意图</strong>
                <ul>
                  <li v-for="item in constructionIntentPreview" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div v-if="constructionConstraintPreview.length" class="geometry-review-mini-section">
                <strong>约束</strong>
                <ul>
                  <li v-for="item in constructionConstraintPreview" :key="`${item.id}-${item.text}`">
                    <span>{{ item.type }}</span>
                    <em>{{ item.text || item.id }}</em>
                  </li>
                </ul>
              </div>
              <div v-if="constructionResidualPreview.length" class="geometry-review-mini-section">
                <strong>残差</strong>
                <ul>
                  <li v-for="item in constructionResidualPreview" :key="`${item.id}-${item.value}`">
                    <span>{{ item.id }}</span>
                    <em>{{ item.value.toExponential(2) }}{{ item.message ? ` · ${item.message}` : "" }}</em>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="geometry-review-grid">
          <label class="geometry-review-field wide">
            <span>题目</span>
            <textarea
              v-model="editableSpec.problemText"
              :disabled="pending"
              rows="3"
            ></textarea>
            <div
              v-if="editableSpec.problemText.trim()"
              class="geometry-review-preview notebook-markdown-rendered"
              v-html="renderReviewMarkdown(editableSpec.problemText)"
            ></div>
          </label>

          <label class="geometry-review-field wide">
            <span>结论</span>
            <textarea
              v-model="editableSpec.goalText"
              :disabled="pending"
              rows="2"
            ></textarea>
            <div
              v-if="editableSpec.goalText.trim()"
              class="geometry-review-preview notebook-markdown-rendered"
              v-html="renderReviewMarkdown(editableSpec.goalText)"
            ></div>
          </label>
        </div>

        <div class="geometry-review-section">
          <div class="geometry-review-heading">
            <strong>对象</strong>
            <button type="button" :disabled="pending" @click="addEntity">加对象</button>
          </div>
          <div class="geometry-review-list">
            <div
              v-for="(entity, index) in editableSpec.entities"
              :key="`${entity.id}-${index}`"
              class="geometry-review-row entity-row"
            >
              <input v-model="entity.id" :disabled="pending" />
              <input v-model="entity.type" :disabled="pending" />
              <input v-model="entity.label" :disabled="pending" />
              <button type="button" :disabled="pending" @click="removeEntity(index)">删</button>
            </div>
          </div>
        </div>

        <div class="geometry-review-section">
          <div class="geometry-review-heading">
            <strong>条件</strong>
            <button type="button" :disabled="pending" @click="addConstraint">加条件</button>
          </div>
          <div class="geometry-review-list">
            <div
              v-for="(constraint, index) in editableSpec.constraints"
              :key="`${constraint.type}-${index}`"
              class="geometry-review-constraint-item"
            >
              <div class="geometry-review-row constraint-row">
                <input v-model="constraint.type" :disabled="pending" />
                <input
                  :value="constraint.args.join(', ')"
                  :disabled="pending"
                  @input="updateConstraintArgs(index, ($event.target as HTMLInputElement).value)"
                />
                <textarea
                  v-model="constraint.text"
                  :disabled="pending"
                  rows="2"
                ></textarea>
                <input
                  v-model.number="constraint.confidence"
                  :disabled="pending"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                />
                <button type="button" :disabled="pending" @click="removeConstraint(index)">删</button>
              </div>
              <div
                v-if="constraint.text.trim()"
                class="geometry-review-preview notebook-markdown-rendered"
                v-html="renderReviewMarkdown(constraint.text)"
              ></div>
            </div>
          </div>
        </div>

        <div class="geometry-review-section">
          <div class="geometry-review-heading">
            <strong>构造提示</strong>
            <button type="button" :disabled="pending" @click="addConstructionHint">加提示</button>
          </div>
          <div class="geometry-review-list">
            <div
              v-for="(_hint, index) in editableSpec.constructionHints"
              :key="`hint-${index}`"
              class="geometry-review-hint-item"
            >
              <div class="geometry-review-row hint-row">
                <textarea
                  v-model="editableSpec.constructionHints[index]"
                  :disabled="pending"
                  rows="2"
                ></textarea>
                <button type="button" :disabled="pending" @click="removeConstructionHint(index)">删</button>
              </div>
              <div
                v-if="editableSpec.constructionHints[index]?.trim()"
                class="geometry-review-preview notebook-markdown-rendered"
                v-html="renderReviewMarkdown(editableSpec.constructionHints[index])"
              ></div>
            </div>
          </div>
        </div>

        <div class="create-dialog-actions">
          <button
            class="dialog-button secondary"
            type="button"
            :disabled="pending"
            @click="emit('cancel')"
          >
            停止
          </button>
          <button
            class="dialog-button primary"
            type="button"
            :disabled="pending"
            @click="submit"
          >
            确认
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
