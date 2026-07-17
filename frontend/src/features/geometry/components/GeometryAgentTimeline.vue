<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  GeometryAgentLogItem,
  GeometryAgentStep,
  GeometryAgentStepStatus,
} from "../model/useGeometryWorkflowSession";

const props = defineProps<{
  canRepair?: boolean;
  logs: GeometryAgentLogItem[];
  steps: GeometryAgentStep[];
}>();

const emit = defineEmits<{
  repair: [];
}>();

const collapsed = ref(loadCollapsedState());
const copied = ref(false);
const selectedStage = ref("");
const viewMode = ref<"artifacts" | "logs" | "json">("artifacts");
const timerNow = ref(Date.now());
let timerHandle: ReturnType<typeof window.setInterval> | undefined;

const visibleSteps = computed(() => props.steps.filter((step) => step.status !== "pending" || step.artifacts.length));
const activeStep = computed(
  () =>
    props.steps.find((step) => step.status === "running" || step.status === "waiting") ??
    [...props.steps].reverse().find((step) => step.status !== "pending") ??
    props.steps[0] ??
    null,
);
const failedStep = computed(() => [...props.steps].reverse().find((step) => step.status === "failed") ?? null);
const selectedStep = computed(() => {
  const fallback = activeStep.value;
  if (!selectedStage.value) {
    return fallback;
  }
  return props.steps.find((step) => step.stage === selectedStage.value) ?? fallback;
});
const selectedLogs = computed(() => {
  const stage = selectedStep.value?.stage;
  return stage ? props.logs.filter((log) => log.stage === stage) : props.logs;
});
const latestLog = computed(() => [...props.logs].reverse().find((log) => log.message.trim()) ?? null);
const headline = computed(() => {
  const step = activeStep.value;
  if (!step) {
    return "等待几何流程启动";
  }
  if (step.status === "waiting") {
    return `${step.title} · 等待确认`;
  }
  if (step.status === "failed") {
    return `${step.title} · 失败`;
  }
  if (step.status === "completed") {
    return `${step.title} · 已完成`;
  }
  return step.title;
});

watch(
  () => activeStep.value?.stage,
  (stage) => {
    if (stage && !selectedStage.value) {
      selectedStage.value = stage;
    }
  },
  { immediate: true },
);

watch(
  () => props.steps.map((step) => step.stage).join("|"),
  () => {
    if (!props.steps.some((step) => step.stage === selectedStage.value)) {
      selectedStage.value = activeStep.value?.stage ?? "";
    }
  },
);

watch(
  () => props.steps.map((step) => `${step.stage}:${step.status}:${step.startedAt ?? ""}:${step.endedAt ?? ""}`).join("|"),
  () => {
    timerNow.value = Date.now();
  },
);

onMounted(() => {
  timerHandle = window.setInterval(() => {
    if (props.steps.some((step) => (step.status === "running" || step.status === "waiting") && step.startedAt && !step.endedAt)) {
      timerNow.value = Date.now();
    }
  }, 1000);
});

onBeforeUnmount(() => {
  if (timerHandle !== undefined) {
    window.clearInterval(timerHandle);
  }
});

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  try {
    window.localStorage.setItem("geometry-studio:agent-timeline-collapsed", collapsed.value ? "1" : "0");
  } catch {
    // Local persistence is optional.
  }
}

async function copyLogs() {
  const text = props.logs.map(formatLogLine).join("\n");
  if (!text.trim()) {
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
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1200);
}

function selectStep(stage: string) {
  selectedStage.value = stage;
}

function statusLabel(status: GeometryAgentStepStatus) {
  switch (status) {
    case "running":
      return "进行中";
    case "waiting":
      return "等待确认";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "interrupted":
      return "已停止";
    case "pending":
    default:
      return "待开始";
  }
}

function durationLabel(step: GeometryAgentStep) {
  if (!step.startedAt) {
    return "";
  }
  const endedAt = step.endedAt ?? timerNow.value;
  const seconds = Math.max(0, Math.round((endedAt - step.startedAt) / 1000));
  if (seconds < 1) {
    return "<1s";
  }
  return `${seconds}s`;
}

function latestArtifactSummary(step: GeometryAgentStep) {
  return [...step.artifacts].reverse().find((artifact) => artifact.summary.trim())?.summary ?? "";
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatLogLine(log: GeometryAgentLogItem) {
  const detail = log.detail ? `\n${log.detail}` : "";
  return `[${formatTime(log.createdAt)}] ${log.title} ${statusLabel(log.status)}: ${log.message}${detail}`;
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function loadCollapsedState() {
  try {
    return window.localStorage.getItem("geometry-studio:agent-timeline-collapsed") === "1";
  } catch {
    return false;
  }
}
</script>

<template>
  <section class="geometry-agent-timeline" :class="{ collapsed }" aria-label="几何 DSL ReAct 工作流">
    <header class="geometry-agent-header">
      <button class="geometry-agent-header-main" type="button" @click="toggleCollapsed">
        <span class="geometry-agent-kicker">DSL ReAct 解题流程</span>
        <strong>{{ headline }}</strong>
        <small v-if="latestLog">{{ latestLog.message }}</small>
      </button>
      <div class="geometry-agent-header-actions">
        <button class="geometry-agent-action" type="button" @click="copyLogs">
          {{ copied ? "已复制" : "复制日志" }}
        </button>
        <button
          v-if="failedStep && canRepair"
          class="geometry-agent-action primary"
          type="button"
          @click="emit('repair')"
        >
          启动修复
        </button>
        <button class="geometry-agent-action" type="button" @click="toggleCollapsed">
          {{ collapsed ? "展开" : "收起" }}
        </button>
      </div>
    </header>

    <div v-if="!collapsed" class="geometry-agent-body">
      <ol class="geometry-agent-stage-list">
        <li
          v-for="step in props.steps"
          :key="step.stage"
          :class="['geometry-agent-stage', step.status, { active: selectedStep?.stage === step.stage }]"
        >
          <button type="button" @click="selectStep(step.stage)">
            <span class="geometry-agent-stage-dot" aria-hidden="true"></span>
            <span class="geometry-agent-stage-text">
              <strong>{{ step.title }}</strong>
              <em v-if="latestArtifactSummary(step)">{{ latestArtifactSummary(step) }}</em>
            </span>
            <span class="geometry-agent-stage-meta">
              <span>{{ statusLabel(step.status) }}</span>
              <time v-if="durationLabel(step)">{{ durationLabel(step) }}</time>
            </span>
          </button>
        </li>
      </ol>

      <section v-if="selectedStep" class="geometry-agent-detail">
        <div class="geometry-agent-detail-header">
          <div>
            <strong>{{ selectedStep.title }}</strong>
          </div>
          <span :class="['geometry-agent-status-pill', selectedStep.status]">
            {{ statusLabel(selectedStep.status) }}
          </span>
        </div>

        <p class="geometry-agent-description">{{ selectedStep.description }}</p>

        <div v-if="failedStep" class="geometry-agent-failure">
          <strong>失败阶段：{{ failedStep.title }}</strong>
          <p>{{ latestArtifactSummary(failedStep) || latestLog?.message || "几何工作流失败。" }}</p>
          <button v-if="canRepair" type="button" @click="emit('repair')">
            只修复当前代码
          </button>
        </div>

        <div class="geometry-agent-tabs" role="tablist" aria-label="阶段查看方式">
          <button
            type="button"
            :class="{ active: viewMode === 'artifacts' }"
            @click="viewMode = 'artifacts'"
          >
            产物
          </button>
          <button
            type="button"
            :class="{ active: viewMode === 'logs' }"
            @click="viewMode = 'logs'"
          >
            日志
          </button>
          <button
            type="button"
            :class="{ active: viewMode === 'json' }"
            @click="viewMode = 'json'"
          >
            JSON
          </button>
        </div>

        <div v-if="viewMode === 'artifacts'" class="geometry-agent-artifacts">
          <article
            v-for="artifact in selectedStep.artifacts"
            :key="artifact.id"
            :class="['geometry-agent-artifact', artifact.status]"
          >
            <div>
              <strong>{{ artifact.title }}</strong>
              <time>{{ formatTime(artifact.createdAt) }}</time>
            </div>
            <p>{{ artifact.summary }}</p>
            <details v-if="artifact.detail || artifact.data">
              <summary>查看详情</summary>
              <pre v-if="artifact.detail">{{ artifact.detail }}</pre>
              <pre v-if="artifact.data">{{ jsonPreview(artifact.data) }}</pre>
            </details>
          </article>
          <p v-if="!selectedStep.artifacts.length" class="geometry-agent-empty">
            这个阶段还没有产物摘要。
          </p>
        </div>

        <div v-else-if="viewMode === 'logs'" class="geometry-agent-log-list">
          <article v-for="log in selectedLogs" :key="log.id" :class="['geometry-agent-log', log.status]">
            <time>{{ formatTime(log.createdAt) }}</time>
            <div>
              <strong>{{ log.title }}</strong>
              <p>{{ log.message }}</p>
              <pre v-if="log.detail">{{ log.detail }}</pre>
            </div>
          </article>
          <p v-if="!selectedLogs.length" class="geometry-agent-empty">
            这个阶段还没有日志。
          </p>
        </div>

        <pre v-else class="geometry-agent-json">{{ jsonPreview(selectedStep) }}</pre>
      </section>
    </div>

    <p v-if="!collapsed && !visibleSteps.length" class="geometry-agent-empty">
      几何 agent 启动后，这里会显示每个阶段的进展。
    </p>
  </section>
</template>
