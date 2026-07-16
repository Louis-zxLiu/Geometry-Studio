package bridge

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestGeometryWorkflowRequestSerializesDynamicConstruction(t *testing.T) {
	payload, err := json.Marshal(GeometryWorkflowRequest{DynamicConstruction: true})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	if !strings.Contains(string(payload), `"dynamicConstruction":true`) {
		t.Fatalf("dynamicConstruction missing from JSON: %s", payload)
	}
}

func TestCodeHasDynamicGeometryControl(t *testing.T) {
	if !codeHasDynamicGeometryControl("from matplotlib.widgets import Slider\nslider = Slider(ax, '角度', 20, 80)") {
		t.Fatal("expected direct Slider call to be detected")
	}
	if !codeHasDynamicGeometryControl("slider = matplotlib.widgets.Slider(ax, '角度', 20, 80)") {
		t.Fatal("expected qualified Slider call to be detected")
	}
	if codeHasDynamicGeometryControl("ax.plot([0, 1], [0, 1])") {
		t.Fatal("static code should not be detected as dynamic")
	}
}

func TestDynamicRuntimeProbeRequiresSlider(t *testing.T) {
	service := &geometryWorkflowService{}
	result := service.probeGeneratedCode(
		context.Background(),
		"scene",
		"import matplotlib.pyplot as plt\nplt.plot([0, 1], [0, 1])\nplt.show()",
		true,
	)
	if result.OK {
		t.Fatal("dynamic probe should reject code without Slider")
	}
	if !result.Repairable {
		t.Fatal("missing Slider should be repairable")
	}
	if !strings.Contains(result.ErrorText, "Slider") {
		t.Fatalf("expected Slider guidance, got: %s", result.ErrorText)
	}
}
