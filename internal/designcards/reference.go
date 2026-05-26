package designcards

import (
	"fmt"
	"regexp"
)

var designCardReferencePattern = regexp.MustCompile(`:::design-card\{id="([^"]+)"\}`)

func FormatReference(cardID string) string {
	return fmt.Sprintf(`:::design-card{id="%s"}`, cardID)
}

func ExtractReferenceIDs(markdown string) []string {
	matches := designCardReferencePattern.FindAllStringSubmatch(markdown, -1)
	ids := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) > 1 {
			ids = append(ids, match[1])
		}
	}

	return ids
}
