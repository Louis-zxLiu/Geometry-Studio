package ai

import "strings"

type Cleaner struct{}

func NewCleaner() *Cleaner {
	return &Cleaner{}
}

func (c *Cleaner) ExtractCode(raw string) string {
	trimmed := strings.TrimSpace(raw)
	fenceStart := strings.Index(trimmed, "```")
	if fenceStart < 0 {
		return trimmed
	}

	content := trimmed[fenceStart+3:]
	if lineBreak := strings.Index(content, "\n"); lineBreak >= 0 {
		// Skip optional language label (e.g. python, pthon) on the fence line.
		content = content[lineBreak+1:]
	} else {
		// Opened fence but no body.
		return ""
	}

	end := strings.Index(content, "```")
	if end < 0 {
		return strings.TrimSpace(content)
	}

	return strings.TrimSpace(content[:end])
}
