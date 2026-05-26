package ai

import (
	"encoding/json"
	"fmt"
	"strings"
)

type rawResult struct {
	Title string `json:"title"`
	Plan  string `json:"plan"`
	SVG   string `json:"svg"`
}

func parseResult(raw string) (rawResult, error) {
	payload := strings.TrimSpace(raw)
	if payload == "" {
		return rawResult{}, fmt.Errorf("AI 没有返回 design card 内容")
	}

	payload = stripFence(payload)
	if !strings.HasPrefix(payload, "{") {
		start := strings.Index(payload, "{")
		end := strings.LastIndex(payload, "}")
		if start >= 0 && end > start {
			payload = payload[start : end+1]
		}
	}

	var result rawResult
	if err := json.Unmarshal([]byte(payload), &result); err != nil {
		return rawResult{}, fmt.Errorf("解析 design card JSON 失败: %w", err)
	}

	result.Title = strings.TrimSpace(result.Title)
	result.Plan = strings.TrimSpace(result.Plan)
	result.SVG = strings.TrimSpace(result.SVG)
	if result.Plan == "" {
		return rawResult{}, fmt.Errorf("AI 返回的 design plan 为空")
	}
	if result.SVG == "" {
		return rawResult{}, fmt.Errorf("AI 返回的 design svg 为空")
	}
	if !strings.Contains(result.SVG, "<svg") {
		return rawResult{}, fmt.Errorf("AI 返回的 svg 格式无效")
	}

	return result, nil
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
