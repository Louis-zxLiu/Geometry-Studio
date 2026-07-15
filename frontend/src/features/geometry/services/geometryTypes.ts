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
  polygons: GeometryPolygon[];
  controls: GeometryControl[];
  measurements: GeometryMeasurement[];
  constraints: GeometryConstraint[];
  annotations: GeometryAnnotation[];
  proofSteps: GeometryProofStep[];
};

export type GeometrySceneDocument = {
  scene: GeometryScene;
  sourceImageDataUrl: string;
};

export type GeometryWorkflowRequest = {
  sceneName: string;
  imageDataUrl: string;
  problemText: string;
  currentCode: string;
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
  scene: GeometryScene;
  diagnostics: string[];
};

export type GeometryProgressEvent = {
  sessionId: string;
  sceneName: string;
  stage: string;
  message: string;
  attempt: number;
};

export type GeometryReviewRequiredEvent = {
  sessionId: string;
  sceneName: string;
  spec: GeometrySpec;
};

export type GeometryPreviewUpdatedEvent = {
  sessionId: string;
  sceneName: string;
  scene: GeometryScene;
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
};

export type GeometryInterruptedEvent = {
  sessionId: string;
  sceneName: string;
  message: string;
};
