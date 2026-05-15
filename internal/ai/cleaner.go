package ai

import "strings"

type Cleaner struct{}

func NewCleaner() *Cleaner {
	return &Cleaner{}
}

func (c *Cleaner) ExtractCode(raw string) string {
	start := strings.Index(raw, `"""`)
	if start < 0 {
		return strings.TrimSpace(raw)
	}

	content := raw[start+3:]
	end := strings.Index(content, `"""`)
	if end < 0 {
		return strings.TrimSpace(content)
	}

	return strings.TrimSpace(content[:end])
}
