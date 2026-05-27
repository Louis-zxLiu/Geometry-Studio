package ai

import "testing"

func TestParseResult(t *testing.T) {
	raw := "```\n<title>一次函数</title>\n\n<plan>\nlayout()\n</plan>\n\n<svg_code>\n<svg><text>x</text></svg>\n</svg_code>\n```"

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
	if result.SVG != "<svg><text>x</text></svg>" {
		t.Fatalf("unexpected svg: %s", result.SVG)
	}
}
