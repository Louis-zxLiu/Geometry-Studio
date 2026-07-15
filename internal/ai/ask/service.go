package ask

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"plotkitycat/internal/ai/provider"
)

type Service struct {
	router *provider.Router
}

func NewService(router *provider.Router) *Service {
	return &Service{router: router}
}

func (s *Service) Ask(ctx context.Context, request Request) (Result, error) {
	if strings.TrimSpace(request.Question) == "" {
		return Result{}, errors.New("请输入要提问的内容")
	}
	if len(request.Selection.Items) == 0 {
		return Result{}, errors.New("请先选中要提问的文字或代码")
	}

	raw, err := s.router.Chat(ctx, provider.ChatRequest{
		Settings:     request.Settings,
		SystemPrompt: buildSystemPrompt(),
		UserPrompt:   buildUserPrompt(request),
		Images:       extractImageDataURLs(request.Selection.Items),
	})
	if err != nil {
		return Result{}, err
	}

	return Result{
		Answer: strings.TrimSpace(raw),
		Source: string(request.Settings.Mode),
	}, nil
}

func buildSystemPrompt() string {
	return strings.Join([]string{
		"你是 Geometry Studio 的中文学习助手。",
		"你只回答用户围绕当前选中内容提出的问题，不生成补丁，不改写代码，不要求运行程序。",
		"如果上下文不足，请明确说明缺少什么信息，并给出可继续追问的方向。",
		"数学公式使用 Markdown + MathJax 语法：行内公式用 $...$，块级公式用 $$...$$。",
		"回答必须使用中文，结构清晰，尽量直接。",
	}, "\n")
}

func buildUserPrompt(request Request) string {
	lines := []string{
		fmt.Sprintf("场景名：%s", strings.TrimSpace(request.SceneName)),
		fmt.Sprintf("上下文类型：%s", normalizeContextKind(request.ContextKind)),
		"",
		"用户问题：",
		strings.TrimSpace(request.Question),
	}

	textLines := make([]string, 0)
	imageLines := make([]string, 0)
	for index, item := range request.Selection.Items {
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
		lines = append(lines, "", "选中的文字或代码：")
		lines = append(lines, textLines...)
	}
	if len(imageLines) > 0 {
		lines = append(lines, "", "选中的图片：")
		lines = append(lines, imageLines...)
	}

	currentCode := strings.TrimSpace(request.CurrentCode)
	if currentCode != "" {
		lines = append(lines, "", "当前代码（仅供理解上下文，不要直接修改）：", "```python", currentCode, "```")
	}

	return strings.Join(lines, "\n")
}

func normalizeContextKind(kind string) string {
	switch strings.TrimSpace(kind) {
	case "code":
		return "代码区选中内容"
	case "note":
		return "笔记区选中内容"
	default:
		return "选中内容"
	}
}

func extractImageDataURLs(items []SelectionItem) []string {
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
