package ai

import (
	"fmt"
	"strings"
)

type rawResult struct {
	Title string
	Plan  string
	SVG   string
}

func parseResult(raw string) (rawResult, error) {
	payload := strings.TrimSpace(raw)
	if payload == "" {
		return rawResult{}, fmt.Errorf("AI 没有返回 design card 内容")
	}

	payload = stripFence(payload)

	title := extractTag(payload, "title")
	plan := extractTag(payload, "plan")
	svg := extractTag(payload, "svg_code")

	if plan == "" {
		return rawResult{}, fmt.Errorf("AI 返回的 design plan 为空")
	}
	if svg == "" {
		return rawResult{}, fmt.Errorf("AI 返回的 design svg 为空")
	}
	if !strings.Contains(svg, "<svg") {
		return rawResult{}, fmt.Errorf("AI 返回的 svg 格式无效")
	}

	return rawResult{
		Title: title,
		Plan:  plan,
		SVG:   svg,
	}, nil
}

func extractTag(content, tag string) string {
	openTag := "<" + tag + ">"
	closeTag := "</" + tag + ">"

	start := strings.Index(content, openTag)
	if start < 0 {
		return ""
	}
	start += len(openTag)

	end := strings.Index(content[start:], closeTag)
	if end < 0 {
		return ""
	}

	return strings.TrimSpace(content[start : start+end])
}

func stripFence(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}

	content := trimmed[3:]
	if lineBreak := strings.Index(content, "\n"); lineBreak >= 0 {
		content = content[lineBreak+1:]
	} else {
		return ""
	}

	if end := strings.LastIndex(content, "```"); end >= 0 {
		content = content[:end]
	}

	return strings.TrimSpace(content)
}
