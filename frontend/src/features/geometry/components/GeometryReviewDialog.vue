<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderMarkdownToHtml } from "../../notebook/rendering/markdownRenderer";
import type {
  GeometryConstruction,
  GeometrySpec,
  GeometryValidationIssue,
  GeometryValidationSummary,
} from "../services/geometryTypes";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  constructionDraft?: GeometryConstruction | null;
  sourceImageDataUrl?: string;
  spec: GeometrySpec | null;
  validationSummary?: GeometryValidationSummary | null;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [spec: GeometrySpec];
}>();

const editableSpec = ref<GeometrySpec>(createEmptySpec());

const dslPreview = computed(() => props.constructionDraft?.dslCode?.trim() ?? "");
const attemptHistoryPreview = computed(() => props.constructionDraft?.attemptHistory?.slice(-6) ?? []);
const renderedImagePreview = computed(() => {
  if (props.constructionDraft?.renderedImageDataUrl) {
    return props.constructionDraft.renderedImageDataUrl;
  }
  return [...(props.constructionDraft?.attemptHistory ?? [])]
    .reverse()
    .find((item) => item.renderedImageDataUrl)?.renderedImageDataUrl ?? "";
});
const renderedImageCaption = computed(() => props.constructionDraft?.renderedImagePath || props.constructionDraft?.renderError || "");

const validationObjectPercent = computed(() =>
  Math.round(((props.validationSummary?.objectScore ?? props.validationSummary?.objectCoverage) ?? 0) * 100),
);
const validationConditionPercent = computed(() =>
  Math.round(((props.validationSummary?.conditionScore ?? props.validationSummary?.conditionCoverage) ?? 0) * 100),
);
const validationTotalPercent = computed(() => {
  const value = props.validationSummary?.totalScore;
  return typeof value === "number" ? Math.round(value * 100) : null;
});
const validationStatusText = computed(() => {
  if (!props.validationSummary) {
    return "等待验证反馈";
  }
  return props.validationSummary.isValid ? "可以交给教师确认" : "需要教师重点检查";
});
const scoreCards = computed(() => [
  { label: "对象", value: validationObjectPercent.value },
  { label: "条件", value: validationConditionPercent.value },
  { label: "总分", value: validationTotalPercent.value ?? Math.round((validationObjectPercent.value * 0.3) + (validationConditionPercent.value * 0.7)) },
]);

const validationFailedItems = computed<GeometryValidationIssue[]>(() => {
  const direct = props.validationSummary?.failedItems ?? [];
  if (direct.length) {
    return direct.slice(0, 12);
  }
  const failedConditions = props.validationSummary?.failedConditions ?? [];
  return failedConditions.slice(0, 12).map((item, index) => {
    const value = item as Record<string, unknown>;
    return {
      severity: "error",
      target: String(value.type ?? value.condition_type ?? `condition_${index + 1}`),
      message: String(value.message ?? value.validation_message ?? JSON.stringify(item)),
      suggestedRepair: "把这个失败条件补充到构造提示里，并让 VLM 重新生成 DSL。",
    };
  });
});

const repairSuggestions = computed(() => {
  const values = [
    ...(props.validationSummary?.repairInstructions ?? []),
    ...validationFailedItems.value.map((item) => item.suggestedRepair),
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(values)).slice(0, 8);
});

const credibilityReport = computed(() => {
  const summary = props.validationSummary;
  const draft = props.constructionDraft;
  const lines: string[] = [];
  if (!summary) {
    return ["还没有收到验证器反馈。"];
  }
  lines.push(summary.isValid
    ? "验证器认为最终 DSL 已满足主要对象和条件，可以进入人工确认。"
    : "验证器没有完全通过，教师需要检查失败项和渲染图。");
  lines.push(`对象覆盖 ${validationObjectPercent.value}%，条件覆盖 ${validationConditionPercent.value}%。`);
  if (typeof summary.iterations === "number" || typeof draft?.iterations === "number") {
    lines.push(`ReAct 共执行 ${summary.iterations ?? draft?.iterations} 轮。`);
  }
  if (draft?.renderSuccess || renderedImagePreview.value) {
    lines.push("已生成最后一轮渲染图，可与原题图对照。");
  } else if (draft?.renderError) {
    lines.push(`渲染未成功：${draft.renderError}`);
  }
  if (validationFailedItems.value.length) {
    lines.push(`仍有 ${validationFailedItems.value.length} 个失败或风险项。`);
  }
  return lines;
});

const objectPreview = computed(() =>
  (props.constructionDraft?.objects ?? [])
    .slice(0, 16)
    .map((item, index) => ({
      id: String(item.id ?? item.name ?? `object_${index + 1}`),
      kind: String(item.kind ?? item.type ?? "object"),
      label: String(item.label ?? ""),
      raw: compactJson(item),
    })),
);

const constructionConstraintPreview = computed(() =>
  (props.constructionDraft?.constraints ?? [])
    .map((item, index) => ({
      id: String(item.id ?? item.type ?? `constraint_${index + 1}`),
      type: String(item.type ?? ""),
      text: String(item.text ?? ""),
    }))
    .slice(0, 12),
);

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

function addConstructionHint(value = "") {
  editableSpec.value.constructionHints.push(value);
}

function addRepairHint(value: string) {
  const text = value.trim();
  if (!text || editableSpec.value.constructionHints.some((item) => item.trim() === text)) {
    return;
  }
  editableSpec.value.constructionHints.push(text);
}

function addIssueHint(item: GeometryValidationIssue) {
  addRepairHint(`${item.target ? `${item.target}: ` : ""}${item.message}${item.suggestedRepair ? `；建议：${item.suggestedRepair}` : ""}`);
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

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}
</script>

<template>
  <Transition name="dialog-enter">
    <div v-if="open" class="dialog-backdrop">
      <section class="create-dialog geometry-review-dialog">
        <header class="geometry-review-titlebar">
          <div>
            <h2>几何批改台</h2>
            <p>{{ validationStatusText }}</p>
          </div>
          <div class="geometry-review-score-strip" aria-label="验证分数">
            <span v-for="item in scoreCards" :key="item.label">
              <strong>{{ item.value }}%</strong>
              <small>{{ item.label }}</small>
            </span>
          </div>
        </header>

        <div class="geometry-review-workbench">
          <aside class="geometry-review-pane media-pane">
            <section>
              <h3>图形对照</h3>
              <div class="geometry-review-image-grid">
                <figure>
                  <img v-if="sourceImageDataUrl" :src="sourceImageDataUrl" alt="原题图" />
                  <figcaption>{{ sourceImageDataUrl ? "原题图" : "无原题图" }}</figcaption>
                </figure>
                <figure>
                  <img v-if="renderedImagePreview" :src="renderedImagePreview" alt="DSL 渲染图" />
                  <figcaption>DSL 渲染图</figcaption>
                </figure>
              </div>
              <em v-if="renderedImageCaption" class="geometry-review-rendered-caption">{{ renderedImageCaption }}</em>
            </section>

            <section>
              <h3>可信度报告</h3>
              <ul class="geometry-review-report">
                <li v-for="item in credibilityReport" :key="item">{{ item }}</li>
              </ul>
              <p v-if="validationSummary?.summary" class="geometry-review-validation-summary">
                {{ validationSummary.summary }}
              </p>
            </section>
          </aside>

          <main class="geometry-review-pane spec-pane">
            <section>
              <div class="geometry-review-heading">
                <h3>最终 DSL</h3>
              </div>
              <pre class="geometry-review-code">{{ dslPreview || "暂无 DSL" }}</pre>
            </section>

            <section>
              <div class="geometry-review-heading">
                <h3>题意确认</h3>
              </div>
              <label class="geometry-review-field wide">
                <span>题目</span>
                <textarea v-model="editableSpec.problemText" :disabled="pending" rows="3"></textarea>
              </label>
              <div
                v-if="editableSpec.problemText.trim()"
                class="geometry-review-preview notebook-markdown-rendered"
                v-html="renderReviewMarkdown(editableSpec.problemText)"
              ></div>
              <label class="geometry-review-field wide">
                <span>结论</span>
                <textarea v-model="editableSpec.goalText" :disabled="pending" rows="2"></textarea>
              </label>
            </section>

            <section class="geometry-review-section">
              <div class="geometry-review-heading">
                <h3>对象</h3>
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
              <details v-if="objectPreview.length" class="geometry-review-details">
                <summary>查看 DSL 已构造对象</summary>
                <ul>
                  <li v-for="item in objectPreview" :key="item.id">
                    <strong>{{ item.id }}</strong>
                    <span>{{ item.kind }} {{ item.label }}</span>
                    <pre>{{ item.raw }}</pre>
                  </li>
                </ul>
              </details>
            </section>

            <section class="geometry-review-section">
              <div class="geometry-review-heading">
                <h3>条件</h3>
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
                    <textarea v-model="constraint.text" :disabled="pending" rows="2"></textarea>
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
                </div>
              </div>
              <details v-if="constructionConstraintPreview.length" class="geometry-review-details">
                <summary>查看验证目标</summary>
                <ul>
                  <li v-for="item in constructionConstraintPreview" :key="`${item.id}-${item.text}`">
                    <strong>{{ item.type }}</strong>
                    <span>{{ item.text || item.id }}</span>
                  </li>
                </ul>
              </details>
            </section>

            <section class="geometry-review-section">
              <div class="geometry-review-heading">
                <h3>构造提示</h3>
                <button type="button" :disabled="pending" @click="addConstructionHint()">加提示</button>
              </div>
              <div class="geometry-review-list">
                <div
                  v-for="(_hint, index) in editableSpec.constructionHints"
                  :key="`hint-${index}`"
                  class="geometry-review-hint-item"
                >
                  <div class="geometry-review-row hint-row">
                    <textarea v-model="editableSpec.constructionHints[index]" :disabled="pending" rows="2"></textarea>
                    <button type="button" :disabled="pending" @click="removeConstructionHint(index)">删</button>
                  </div>
                </div>
              </div>
            </section>
          </main>

          <aside class="geometry-review-pane issue-pane">
            <section>
              <h3>失败项与风险</h3>
              <ul v-if="validationFailedItems.length" class="geometry-review-validation-list">
                <li v-for="item in validationFailedItems" :key="`${item.target}-${item.message}`">
                  <strong>{{ item.target || item.severity }}</strong>
                  <span>{{ item.message }}</span>
                  <button type="button" :disabled="pending" @click="addIssueHint(item)">加入提示</button>
                </li>
              </ul>
              <p v-else class="geometry-review-empty">没有失败项，重点检查图形是否符合题意。</p>
            </section>

            <section>
              <h3>一键修复建议</h3>
              <ul v-if="repairSuggestions.length" class="geometry-review-suggestion-list">
                <li v-for="item in repairSuggestions" :key="item">
                  <span>{{ item }}</span>
                  <button type="button" :disabled="pending" @click="addRepairHint(item)">加入提示</button>
                </li>
              </ul>
              <p v-else class="geometry-review-empty">当前没有额外建议。</p>
            </section>

            <section>
              <h3>ReAct 历史</h3>
              <ol v-if="attemptHistoryPreview.length" class="geometry-review-attempts">
                <li v-for="item in attemptHistoryPreview" :key="`attempt-${item.attempt}`">
                  <strong>#{{ item.attempt }} · {{ item.action }}</strong>
                  <span>{{ item.validationSummary?.summary || item.executionError || item.thought }}</span>
                </li>
              </ol>
              <p v-else class="geometry-review-empty">暂无尝试记录。</p>
            </section>
          </aside>
        </div>

        <div class="create-dialog-actions">
          <button class="dialog-button secondary" type="button" :disabled="pending" @click="emit('cancel')">
            停止
          </button>
          <button class="dialog-button primary" type="button" :disabled="pending" @click="submit">
            确认并继续
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
