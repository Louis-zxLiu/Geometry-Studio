import type { AIProviderSettings } from "../../ai/services/aiTypes";

export type GeometryEntity = {
  id: string;
  type: string;
  label: string;
  attributes: Record<string, string>;
};

export type GeometryConstraint = {
  type: string;
  args: string[];
  text: string;
  confidence: number;
};

export type GeometrySpec = {
  problemText: string;
  goalText: string;
  entities: GeometryEntity[];
  constraints: GeometryConstraint[];
  constructionHints: string[];
  confidence: number;
};

export type GeometryPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  fixed: boolean;
};

export type GeometrySegment = {
  id: string;
  from: string;
  to: string;
  label: string;
  style: string;
};

export type GeometryCircle = {
  id: string;
  center: string;
  radius: number;
  through: string;
  label: string;
  style: string;
};

export type GeometryArc = {
  id: string;
  center: string;
  start: string;
  end: string;
  radius: number;
  label: string;
  style: string;
};

export type GeometryPolygon = {
  id: string;
  points: string[];
  label: string;
  fill: string;
};

export type GeometryControl = {
  id: string;
  label: string;
  kind: string;
  min: number;
  max: number;
  value: number;
  step: number;
  target: string;
  binding: string;
};

export type GeometryMeasurement = {
  id: string;
  label: string;
  kind: string;
  args: string[];
  value: string;
};

export type GeometryAnnotation = {
  id: string;
  text: string;
  x: number;
  y: number;
};

export type GeometryProofStep = {
  id: string;
  claim: string;
  reason: string;
  depends: string[];
};

export type GeometryScene = {
  version: number;
  title: string;
  sourceImage: string;
  points: GeometryPoint[];
  segments: GeometrySegment[];
  circles: GeometryCircle[];
  arcs: GeometryArc[];
  polygons: GeometryPolygon[];
  controls: GeometryControl[];
  measurements: GeometryMeasurement[];
  constraints: GeometryConstraint[];
  annotations: GeometryAnnotation[];
  proofSteps: GeometryProofStep[];
};

export type GeometryValidationIssue = {
  severity: string;
  target: string;
  message: string;
  suggestedRepair: string;
};

export type GeometryValidationSummary = {
  isValid: boolean;
  objectCoverage: number;
  conditionCoverage: number;
  summary: string;
  failedItems: GeometryValidationIssue[];
  repairInstructions: string[];
  residualSummary?: Record<string, unknown>;
};

export type GeometryConstruction = {
  version: number;
  dslCode: string;
  objects: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  constructionIntent: Array<Record<string, unknown>>;
  solution: Record<string, unknown>;
  validation: Record<string, unknown>;
  reviewStatus: string;
  specFingerprint: string;
  diagnostics: string[];
};

export type GeometryWorkflowRequest = {
  sceneName: string;
  imageDataUrl: string;
  problemText: string;
  currentCode: string;
  settings: AIProviderSettings;
  maxAttempts: number;
};

export type GeometryWorkflowRepairRequest = {
  sceneName: string;
  currentCode: string;
  errorText: string;
  diagnostics: string[];
  result: GeometryWorkflowResult;
  settings: AIProviderSettings;
  maxAttempts: number;
};

export type GeometryWorkflowSession = {
  sessionId: string;
  state: string;
};

export type GeometryWorkflowResult = {
  code: string;
  noteMarkdown: string;
  proofMarkdown: string;
  spec: GeometrySpec;
  construction: GeometryConstruction;
  scene: GeometryScene;
  diagnostics: string[];
};

export type GeometryProgressEvent = {
  sessionId: string;
  sceneName: string;
  stage: string;
  agentName?: string;
  title?: string;
  description?: string;
  message: string;
  status?: "pending" | "running" | "waiting" | "completed" | "failed" | "interrupted";
  eventKind?: "stage" | "artifact" | "review" | "log";
  attempt: number;
  artifactTitle?: string;
  artifactSummary?: string;
  artifactDetail?: string;
  artifactData?: Record<string, unknown>;
};

export type GeometryReviewRequiredEvent = {
  sessionId: string;
  sceneName: string;
  spec: GeometrySpec;
  constructionDraft?: GeometryConstruction;
  previewScene?: GeometryScene;
  validationSummary?: GeometryValidationSummary;
};

export type GeometryCodeAppliedEvent = {
  sessionId: string;
  sceneName: string;
  code: string;
  result: GeometryWorkflowResult;
};

export type GeometrySucceededEvent = {
  sessionId: string;
  sceneName: string;
  result: GeometryWorkflowResult;
};

export type GeometryFailedEvent = {
  sessionId: string;
  sceneName: string;
  errorText: string;
  diagnostics: string[];
  repairable?: boolean;
  result?: GeometryWorkflowResult;
};

export type GeometryInterruptedEvent = {
  sessionId: string;
  sceneName: string;
  message: string;
};
