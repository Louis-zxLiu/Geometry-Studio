package prompting

import (
	"fmt"
	"strings"
)

type SelectionItem struct {
	Kind         string
	Text         string
	Name         string
	Alt          string
	DataURL      string
	RelativePath string
}

type Request struct {
	SceneName   string
	CurrentCode string
	Prompt      string
	Selection   []SelectionItem
}

func BuildSystemPrompt(template string) string {
	return strings.TrimSpace(template)
}

func BuildUserPrompt(request Request) string {
	lines := []string{
		fmt.Sprintf("场景名：%s", request.SceneName),
	}

	if prompt := strings.TrimSpace(request.Prompt); prompt != "" {
		lines = append(lines, "", "附加提示词：", prompt)
	}

	textLines := make([]string, 0)
	imageLines := make([]string, 0)
	for index, item := range request.Selection {
		switch item.Kind {
		case "text":
			text := strings.TrimSpace(item.Text)
			if text != "" {
				textLines = append(textLines, fmt.Sprintf("%d. %s", len(textLines)+1, text))
			}
		case "image":
			label := strings.TrimSpace(item.Alt)
			if label == "" {
				label = strings.TrimSpace(item.Name)
			}
			if label == "" {
				label = fmt.Sprintf("图片 %d", index+1)
			}
			imageLines = append(imageLines, fmt.Sprintf("%d. %s (%s)", len(imageLines)+1, label, strings.TrimSpace(item.RelativePath)))
		}
	}

	if len(textLines) > 0 {
		lines = append(lines, "", "选中的文本：")
		lines = append(lines, textLines...)
	}
	if len(imageLines) > 0 {
		lines = append(lines, "", "选中的图片：")
		lines = append(lines, imageLines...)
	}

	return strings.Join(lines, "\n")
}

func ExtractImageDataURLs(items []SelectionItem) []string {
	images := make([]string, 0, len(items))
	for _, item := range items {
		if item.Kind != "image" {
			continue
		}

		dataURL := strings.TrimSpace(item.DataURL)
		if dataURL != "" {
			images = append(images, dataURL)
		}
	}

	return images
}
