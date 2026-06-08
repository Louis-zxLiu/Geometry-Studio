package patch

import "strings"

func lineNumberAt(code string, offset int) int {
	return strings.Count(normalizeNewlines(code[:max(0, min(len(code), offset))]), "\n") + 1
}

func max(left int, right int) int {
	if left > right {
		return left
	}

	return right
}

func min(left int, right int) int {
	if left < right {
		return left
	}

	return right
}
