package ai

import "testing"

func TestParseResult(t *testing.T) {
	raw := "```json\n{\"title\":\"一次函数\",\"plan\":\"layout()\",\"svg\":\"<svg><text>x</text></svg>\"}\n```"

	result, err := parseResult(raw)
	if err != nil {
		t.Fatalf("parse result: %v", err)
	}
	if result.Title != "一次函数" {
		t.Fatalf("unexpected title: %s", result.Title)
	}
	if result.Plan != "layout()" {
		t.Fatalf("unexpected plan: %s", result.Plan)
	}
}
