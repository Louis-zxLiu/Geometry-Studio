export namespace bridge {

	export class AIProviderSettings {
	    mode: string;
	    url: string;
	    key: string;
	    model: string;

	    static createFrom(source: any = {}) {
	        return new AIProviderSettings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.url = source["url"];
	        this.key = source["key"];
	        this.model = source["model"];
	    }
	}
	export class AISelectionItem {
	    kind: string;
	    text: string;
	    name: string;
	    alt: string;
	    dataUrl: string;
	    relativePath: string;

	    static createFrom(source: any = {}) {
	        return new AISelectionItem(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.text = source["text"];
	        this.name = source["name"];
	        this.alt = source["alt"];
	        this.dataUrl = source["dataUrl"];
	        this.relativePath = source["relativePath"];
	    }
	}
	export class AISelectionPayload {
	    items: AISelectionItem[];

	    static createFrom(source: any = {}) {
	        return new AISelectionPayload(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], AISelectionItem);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIAskRequest {
	    sceneName: string;
	    currentCode: string;
	    contextKind: string;
	    question: string;
	    selection: AISelectionPayload;
	    settings: AIProviderSettings;

	    static createFrom(source: any = {}) {
	        return new AIAskRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sceneName = source["sceneName"];
	        this.currentCode = source["currentCode"];
	        this.contextKind = source["contextKind"];
	        this.question = source["question"];
	        this.selection = this.convertValues(source["selection"], AISelectionPayload);
	        this.settings = this.convertValues(source["settings"], AIProviderSettings);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIAskResult {
	    answer: string;
	    source: string;

	    static createFrom(source: any = {}) {
	        return new AIAskResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.answer = source["answer"];
	        this.source = source["source"];
	    }
	}
	export class AIDesignCardGenerationRequest {
	    sceneName: string;
	    settings: AIProviderSettings;
	    selection: AISelectionPayload;

	    static createFrom(source: any = {}) {
	        return new AIDesignCardGenerationRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sceneName = source["sceneName"];
	        this.settings = this.convertValues(source["settings"], AIProviderSettings);
	        this.selection = this.convertValues(source["selection"], AISelectionPayload);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIDesignCardOptimizeRequest {
	    sceneName: string;
	    cardId: string;
	    instruction: string;
	    settings: AIProviderSettings;

	    static createFrom(source: any = {}) {
	        return new AIDesignCardOptimizeRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sceneName = source["sceneName"];
	        this.cardId = source["cardId"];
	        this.instruction = source["instruction"];
	        this.settings = this.convertValues(source["settings"], AIProviderSettings);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DesignCard {
	    id: string;
	    createdAt: number;
	    updatedAt: number;
	    title: string;
	    order: number;
	    plan: string;
	    svg: string;

	    static createFrom(source: any = {}) {
	        return new DesignCard(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.title = source["title"];
	        this.order = source["order"];
	        this.plan = source["plan"];
	        this.svg = source["svg"];
	    }
	}
	export class AIDesignCardResult {
	    card: DesignCard;
	    source: string;

	    static createFrom(source: any = {}) {
	        return new AIDesignCardResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.card = this.convertValues(source["card"], DesignCard);
	        this.source = source["source"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}



	export class AIWorkflowRequest {
	    kind: string;
	    sceneName: string;
	    currentCode: string;
	    instruction: string;
	    errorText: string;
	    selection: AISelectionPayload;
	    maxAttempts: number;
	    settings: AIProviderSettings;

	    static createFrom(source: any = {}) {
	        return new AIWorkflowRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.sceneName = source["sceneName"];
	        this.currentCode = source["currentCode"];
	        this.instruction = source["instruction"];
	        this.errorText = source["errorText"];
	        this.selection = this.convertValues(source["selection"], AISelectionPayload);
	        this.maxAttempts = source["maxAttempts"];
	        this.settings = this.convertValues(source["settings"], AIProviderSettings);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIWorkflowSession {
	    sessionId: string;
	    state: string;

	    static createFrom(source: any = {}) {
	        return new AIWorkflowSession(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.state = source["state"];
	    }
	}
	export class CodeAIVersion {
	    id: string;
	    label: string;
	    note: string;
	    code: string;
	    createdAt: number;

	    static createFrom(source: any = {}) {
	        return new CodeAIVersion(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.note = source["note"];
	        this.code = source["code"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class CreateCodeAIVersionRequest {
	    sceneName: string;
	    note: string;
	    code: string;

	    static createFrom(source: any = {}) {
	        return new CreateCodeAIVersionRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sceneName = source["sceneName"];
	        this.note = source["note"];
	        this.code = source["code"];
	    }
	}

	export class DesignCardPlacement {
	    cardId: string;
	    afterLine: number;

	    static createFrom(source: any = {}) {
	        return new DesignCardPlacement(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cardId = source["cardId"];
	        this.afterLine = source["afterLine"];
	    }
	}
	export class DesignCardVersion {
	    id: string;
	    label: string;
	    note: string;
	    plan: string;
	    svg: string;
	    createdAt: number;

	    static createFrom(source: any = {}) {
	        return new DesignCardVersion(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.note = source["note"];
	        this.plan = source["plan"];
	        this.svg = source["svg"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class EnvironmentCheckItem {
	    key: string;
	    label: string;
	    relativePath: string;
	    category: string;
	    status: string;
	    message: string;
	    exists: boolean;

	    static createFrom(source: any = {}) {
	        return new EnvironmentCheckItem(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.label = source["label"];
	        this.relativePath = source["relativePath"];
	        this.category = source["category"];
	        this.status = source["status"];
	        this.message = source["message"];
	        this.exists = source["exists"];
	    }
	}
	export class EnvironmentStatus {
	    ready: boolean;
	    code: string;
	    severity: string;
	    runtimeDir: string;
	    summary: string;
	    recommendedAction: string;
	    checkedAt: string;
	    items: EnvironmentCheckItem[];
	    missing: string[];
	    canRebuild: boolean;
	    runtimeArchivePath: string;
	    runtimeArchiveExists: boolean;

	    static createFrom(source: any = {}) {
	        return new EnvironmentStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ready = source["ready"];
	        this.code = source["code"];
	        this.severity = source["severity"];
	        this.runtimeDir = source["runtimeDir"];
	        this.summary = source["summary"];
	        this.recommendedAction = source["recommendedAction"];
	        this.checkedAt = source["checkedAt"];
	        this.items = this.convertValues(source["items"], EnvironmentCheckItem);
	        this.missing = source["missing"];
	        this.canRebuild = source["canRebuild"];
	        this.runtimeArchivePath = source["runtimeArchivePath"];
	        this.runtimeArchiveExists = source["runtimeArchiveExists"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GeometryAnnotation {
	    id: string;
	    text: string;
	    x: number;
	    y: number;

	    static createFrom(source: any = {}) {
	        return new GeometryAnnotation(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	        this.x = source["x"];
	        this.y = source["y"];
	    }
	}
	export class GeometryCircle {
	    id: string;
	    center: string;
	    radius: number;
	    through: string;
	    label: string;
	    style: string;

	    static createFrom(source: any = {}) {
	        return new GeometryCircle(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.center = source["center"];
	        this.radius = source["radius"];
	        this.through = source["through"];
	        this.label = source["label"];
	        this.style = source["style"];
	    }
	}
	export class GeometryConstraint {
	    type: string;
	    args: string[];
	    text: string;
	    confidence: number;

	    static createFrom(source: any = {}) {
	        return new GeometryConstraint(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.args = source["args"];
	        this.text = source["text"];
	        this.confidence = source["confidence"];
	    }
	}
	export class GeometryControl {
	    id: string;
	    label: string;
	    kind: string;
	    min: number;
	    max: number;
	    value: number;
	    step: number;
	    target: string;
	    binding: string;

	    static createFrom(source: any = {}) {
	        return new GeometryControl(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.kind = source["kind"];
	        this.min = source["min"];
	        this.max = source["max"];
	        this.value = source["value"];
	        this.step = source["step"];
	        this.target = source["target"];
	        this.binding = source["binding"];
	    }
	}
	export class GeometryEntity {
	    id: string;
	    type: string;
	    label: string;
	    attributes: Record<string, string>;

	    static createFrom(source: any = {}) {
	        return new GeometryEntity(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.label = source["label"];
	        this.attributes = source["attributes"];
	    }
	}
	export class GeometryMeasurement {
	    id: string;
	    label: string;
	    kind: string;
	    args: string[];
	    value: string;

	    static createFrom(source: any = {}) {
	        return new GeometryMeasurement(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.kind = source["kind"];
	        this.args = source["args"];
	        this.value = source["value"];
	    }
	}
	export class GeometryPoint {
	    id: string;
	    label: string;
	    x: number;
	    y: number;
	    fixed: boolean;

	    static createFrom(source: any = {}) {
	        return new GeometryPoint(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.fixed = source["fixed"];
	    }
	}
	export class GeometryPolygon {
	    id: string;
	    points: string[];
	    label: string;
	    fill: string;

	    static createFrom(source: any = {}) {
	        return new GeometryPolygon(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.points = source["points"];
	        this.label = source["label"];
	        this.fill = source["fill"];
	    }
	}
	export class GeometryProofStep {
	    id: string;
	    claim: string;
	    reason: string;
	    depends: string[];

	    static createFrom(source: any = {}) {
	        return new GeometryProofStep(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.claim = source["claim"];
	        this.reason = source["reason"];
	        this.depends = source["depends"];
	    }
	}
	export class GeometrySegment {
	    id: string;
	    from: string;
	    to: string;
	    label: string;
	    style: string;

	    static createFrom(source: any = {}) {
	        return new GeometrySegment(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.label = source["label"];
	        this.style = source["style"];
	    }
	}
	export class GeometryScene {
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

	    static createFrom(source: any = {}) {
	        return new GeometryScene(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.title = source["title"];
	        this.sourceImage = source["sourceImage"];
	        this.points = this.convertValues(source["points"], GeometryPoint);
	        this.segments = this.convertValues(source["segments"], GeometrySegment);
	        this.circles = this.convertValues(source["circles"], GeometryCircle);
	        this.polygons = this.convertValues(source["polygons"], GeometryPolygon);
	        this.controls = this.convertValues(source["controls"], GeometryControl);
	        this.measurements = this.convertValues(source["measurements"], GeometryMeasurement);
	        this.constraints = this.convertValues(source["constraints"], GeometryConstraint);
	        this.annotations = this.convertValues(source["annotations"], GeometryAnnotation);
	        this.proofSteps = this.convertValues(source["proofSteps"], GeometryProofStep);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GeometrySceneDocument {
	    scene: GeometryScene;
	    sourceImageDataUrl: string;

	    static createFrom(source: any = {}) {
	        return new GeometrySceneDocument(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scene = this.convertValues(source["scene"], GeometryScene);
	        this.sourceImageDataUrl = source["sourceImageDataUrl"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class GeometrySpec {
	    problemText: string;
	    goalText: string;
	    entities: GeometryEntity[];
	    constraints: GeometryConstraint[];
	    constructionHints: string[];
	    confidence: number;

	    static createFrom(source: any = {}) {
	        return new GeometrySpec(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.problemText = source["problemText"];
	        this.goalText = source["goalText"];
	        this.entities = this.convertValues(source["entities"], GeometryEntity);
	        this.constraints = this.convertValues(source["constraints"], GeometryConstraint);
	        this.constructionHints = source["constructionHints"];
	        this.confidence = source["confidence"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GeometryWorkflowResult {
	    code: string;
	    noteMarkdown: string;
	    proofMarkdown: string;
	    spec: GeometrySpec;
	    scene: GeometryScene;
	    diagnostics: string[];

	    static createFrom(source: any = {}) {
	        return new GeometryWorkflowResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.noteMarkdown = source["noteMarkdown"];
	        this.proofMarkdown = source["proofMarkdown"];
	        this.spec = this.convertValues(source["spec"], GeometrySpec);
	        this.scene = this.convertValues(source["scene"], GeometryScene);
	        this.diagnostics = source["diagnostics"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GeometryWorkflowRequest {
	    sceneName: string;
	    imageDataUrl: string;
	    problemText: string;
	    currentCode: string;
	    settings: AIProviderSettings;
	    maxAttempts: number;

	    static createFrom(source: any = {}) {
	        return new GeometryWorkflowRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sceneName = source["sceneName"];
	        this.imageDataUrl = source["imageDataUrl"];
	        this.problemText = source["problemText"];
	        this.currentCode = source["currentCode"];
	        this.settings = this.convertValues(source["settings"], AIProviderSettings);
	        this.maxAttempts = source["maxAttempts"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GeometryWorkflowRepairRequest {
	    sceneName: string;
	    currentCode: string;
	    errorText: string;
	    diagnostics: string[];
	    result: GeometryWorkflowResult;
	    settings: AIProviderSettings;
	    maxAttempts: number;

	    static createFrom(source: any = {}) {
	        return new GeometryWorkflowRepairRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sceneName = source["sceneName"];
	        this.currentCode = source["currentCode"];
	        this.errorText = source["errorText"];
	        this.diagnostics = source["diagnostics"];
	        this.result = this.convertValues(source["result"], GeometryWorkflowResult);
	        this.settings = this.convertValues(source["settings"], AIProviderSettings);
	        this.maxAttempts = source["maxAttempts"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GeometryWorkflowSession {
	    sessionId: string;
	    state: string;

	    static createFrom(source: any = {}) {
	        return new GeometryWorkflowSession(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.state = source["state"];
	    }
	}
	export class WorkspaceInfo {
	    name: string;
	    sceneCount: number;

	    static createFrom(source: any = {}) {
	        return new WorkspaceInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.sceneCount = source["sceneCount"];
	    }
	}
	export class NoteImage {
	    name: string;
	    alt: string;
	    dataUrl: string;
	    relativePath: string;

	    static createFrom(source: any = {}) {
	        return new NoteImage(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.alt = source["alt"];
	        this.dataUrl = source["dataUrl"];
	        this.relativePath = source["relativePath"];
	    }
	}
	export class ScriptDocument {
	    filename: string;
	    code: string;
	    noteMarkdown: string;
	    noteImages: NoteImage[];

	    static createFrom(source: any = {}) {
	        return new ScriptDocument(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.code = source["code"];
	        this.noteMarkdown = source["noteMarkdown"];
	        this.noteImages = this.convertValues(source["noteImages"], NoteImage);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkspaceSnapshot {
	    scripts: string[];
	    currentFile: string;
	    document: ScriptDocument;
	    workspaces: WorkspaceInfo[];
	    currentWorkspace: string;

	    static createFrom(source: any = {}) {
	        return new WorkspaceSnapshot(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scripts = source["scripts"];
	        this.currentFile = source["currentFile"];
	        this.document = this.convertValues(source["document"], ScriptDocument);
	        this.workspaces = this.convertValues(source["workspaces"], WorkspaceInfo);
	        this.currentWorkspace = source["currentWorkspace"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportSceneResult {
	    cancelled: boolean;
	    workspace: WorkspaceSnapshot;

	    static createFrom(source: any = {}) {
	        return new ImportSceneResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cancelled = source["cancelled"];
	        this.workspace = this.convertValues(source["workspace"], WorkspaceSnapshot);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportWorkspaceResult {
	    cancelled: boolean;
	    importedWorkspaces: string[];
	    workspace: WorkspaceSnapshot;

	    static createFrom(source: any = {}) {
	        return new ImportWorkspaceResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cancelled = source["cancelled"];
	        this.importedWorkspaces = source["importedWorkspaces"];
	        this.workspace = this.convertValues(source["workspace"], WorkspaceSnapshot);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class InitSnapshot {
	    environment: EnvironmentStatus;
	    workspace: WorkspaceSnapshot;

	    static createFrom(source: any = {}) {
	        return new InitSnapshot(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.environment = this.convertValues(source["environment"], EnvironmentStatus);
	        this.workspace = this.convertValues(source["workspace"], WorkspaceSnapshot);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NoteDocument {
	    markdown: string;
	    images: NoteImage[];

	    static createFrom(source: any = {}) {
	        return new NoteDocument(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.markdown = source["markdown"];
	        this.images = this.convertValues(source["images"], NoteImage);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class NoteImageInput {
	    name: string;
	    alt: string;
	    dataUrl: string;

	    static createFrom(source: any = {}) {
	        return new NoteImageInput(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.alt = source["alt"];
	        this.dataUrl = source["dataUrl"];
	    }
	}
	export class PackageTransferResult {
	    path: string;
	    sceneName: string;

	    static createFrom(source: any = {}) {
	        return new PackageTransferResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.sceneName = source["sceneName"];
	    }
	}
	export class RunControlResult {
	    handled: boolean;
	    message: string;

	    static createFrom(source: any = {}) {
	        return new RunControlResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.handled = source["handled"];
	        this.message = source["message"];
	    }
	}
	export class ScreeningSessionState {
	    active: boolean;
	    sceneNames: string[];
	    currentIndex: number;
	    currentSceneName: string;
	    poolSize: number;
	    animation: string;

	    static createFrom(source: any = {}) {
	        return new ScreeningSessionState(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = source["active"];
	        this.sceneNames = source["sceneNames"];
	        this.currentIndex = source["currentIndex"];
	        this.currentSceneName = source["currentSceneName"];
	        this.poolSize = source["poolSize"];
	        this.animation = source["animation"];
	    }
	}
	export class ScreeningStartRequest {
	    sceneNames: string[];
	    startIndex: number;
	    poolSize: number;
	    animation: string;

	    static createFrom(source: any = {}) {
	        return new ScreeningStartRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sceneNames = source["sceneNames"];
	        this.startIndex = source["startIndex"];
	        this.poolSize = source["poolSize"];
	        this.animation = source["animation"];
	    }
	}
	export class ScreeningStopResult {
	    handled: boolean;
	    message: string;

	    static createFrom(source: any = {}) {
	        return new ScreeningStopResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.handled = source["handled"];
	        this.message = source["message"];
	    }
	}

	export class SubscriptionPurchaseResult {
	    configured: boolean;
	    url: string;
	    deviceId: string;
	    message: string;

	    static createFrom(source: any = {}) {
	        return new SubscriptionPurchaseResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.configured = source["configured"];
	        this.url = source["url"];
	        this.deviceId = source["deviceId"];
	        this.message = source["message"];
	    }
	}
	export class SubscriptionStatus {
	    status: string;
	    activated: boolean;
	    deviceId: string;
	    expireAt: string;
	    lastCheckedAt: string;
	    message: string;
	    model: string;
	    baseUrl: string;

	    static createFrom(source: any = {}) {
	        return new SubscriptionStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.activated = source["activated"];
	        this.deviceId = source["deviceId"];
	        this.expireAt = source["expireAt"];
	        this.lastCheckedAt = source["lastCheckedAt"];
	        this.message = source["message"];
	        this.model = source["model"];
	        this.baseUrl = source["baseUrl"];
	    }
	}
	export class UpdateStatus {
	    currentVersion: string;
	    latestVersion: string;
	    notes: string;
	    publishedAt: string;
	    lastCheckedAt: string;
	    message: string;
	    updateAvailable: boolean;
	    downloaded: boolean;
	    readyToInstall: boolean;

	    static createFrom(source: any = {}) {
	        return new UpdateStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.notes = source["notes"];
	        this.publishedAt = source["publishedAt"];
	        this.lastCheckedAt = source["lastCheckedAt"];
	        this.message = source["message"];
	        this.updateAvailable = source["updateAvailable"];
	        this.downloaded = source["downloaded"];
	        this.readyToInstall = source["readyToInstall"];
	    }
	}

	export class WorkspacePackageTransferResult {
	    path: string;
	    workspaces: string[];

	    static createFrom(source: any = {}) {
	        return new WorkspacePackageTransferResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.workspaces = source["workspaces"];
	    }
	}

}
