<script setup lang="ts">
import { ref, watch } from "vue";
import type { GeometrySpec } from "../services/geometryTypes";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  spec: GeometrySpec | null;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [spec: GeometrySpec];
}>();

const editableSpec = ref<GeometrySpec>(createEmptySpec());

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

function removeEntity(index: number) {
  editableSpec.value.entities.splice(index, 1);
}

function removeConstraint(index: number) {
  editableSpec.value.constraints.splice(index, 1);
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

        <div class="geometry-review-grid">
          <label class="geometry-review-field wide">
            <span>题目</span>
            <textarea
              v-model="editableSpec.problemText"
              :disabled="pending"
              rows="3"
            ></textarea>
          </label>

          <label class="geometry-review-field wide">
            <span>结论</span>
            <textarea
              v-model="editableSpec.goalText"
              :disabled="pending"
              rows="2"
            ></textarea>
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
              class="geometry-review-row constraint-row"
            >
              <input v-model="constraint.type" :disabled="pending" />
              <input
                :value="constraint.args.join(', ')"
                :disabled="pending"
                @input="updateConstraintArgs(index, ($event.target as HTMLInputElement).value)"
              />
              <input v-model="constraint.text" :disabled="pending" />
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
