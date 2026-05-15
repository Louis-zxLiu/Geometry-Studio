package ai

import (
	"fmt"
	"strings"
)

func buildScaffoldCode(request GenerationRequest, prompt string, source string) string {
	textCount := 0
	imageCount := 0
	firstText := ""
	for _, item := range request.Selection.Items {
		switch item.Kind {
		case "text":
			textCount += 1
			if firstText == "" {
				firstText = summarizeLine(item.Text)
			}
		case "image":
			imageCount += 1
		}
	}

	lines := []string{
		"import matplotlib.pyplot as plt",
		"",
		"",
		"def main():",
		fmt.Sprintf("    # AI scaffold source: %s", source),
		fmt.Sprintf("    # Selected text blocks: %d", textCount),
		fmt.Sprintf("    # Selected images: %d", imageCount),
	}

	if firstText != "" {
		lines = append(lines, fmt.Sprintf("    # First note hint: %q", firstText))
	}
	if prompt != "" {
		lines = append(lines, fmt.Sprintf("    # Prompt template loaded: %d chars", len(prompt)))
	}

	lines = append(lines,
		"    fig, ax = plt.subplots(dpi=120)",
		fmt.Sprintf("    ax.set_title(%q)", request.SceneName),
		"    ax.text(0.5, 0.5, 'AI generation pipeline ready', ha='center', va='center')",
		"    ax.set_axis_off()",
		"    plt.show()",
		"",
		"",
		`if __name__ == "__main__":`,
		"    main()",
	)

	return strings.Join(lines, "\n")
}

func wrapGeneratedCode(code string) string {
	return "\"\"\"\n" + strings.TrimSpace(code) + "\n\"\"\""
}

func summarizeLine(text string) string {
	normalized := strings.Join(strings.Fields(text), " ")
	if len(normalized) <= 48 {
		return normalized
	}

	return normalized[:48] + "..."
}
