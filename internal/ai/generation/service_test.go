package generation

import (
	"strings"
	"testing"
)

func TestExtractCodeSanitizesMatplotlibTextSymbols(t *testing.T) {
	raw := "```python\nax.text(0, 0, '✓ 通过 \\u2717 ✗ ❌ ☑ ☒')\n```"

	code := extractCode(raw)

	for _, forbidden := range []string{"✓", `\u2717`, "✗", "❌", "☑", "☒"} {
		if strings.Contains(code, forbidden) {
			t.Fatalf("extractCode() kept forbidden symbol %q in %q", forbidden, code)
		}
	}
	for _, want := range []string{"正确", "错误", "通过", "是", "否"} {
		if !strings.Contains(code, want) {
			t.Fatalf("extractCode() = %q, want replacement %q", code, want)
		}
	}
}
