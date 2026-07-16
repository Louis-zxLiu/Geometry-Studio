<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderMarkdownToHtml } from "../../notebook/rendering/markdownRenderer";
import type {
  GeometryConstruction,
  GeometrySpec,
  GeometryValidationSummary,
} from "../services/geometryTypes";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  constructionDraft?: GeometryConstruction | null;
  spec: GeometrySpec | null;
  validationSummary?: GeometryValidationSummary | null;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [spec: GeometrySpec];
}>();

const editableSpec = ref<GeometrySpec>(createEmptySpec());
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
  return props.validationSummary.isValid ? "约束校验通过" : "约束校验未通过";
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

</script>

<template>
  <Transition name="dialog-enter">
    <div v-if="open" class="dialog-backdrop">
      <section class="create-dialog geometry-review-dialog">
        <h2>几何规格复核</h2>

        <div class="geometry-review-construction">
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
