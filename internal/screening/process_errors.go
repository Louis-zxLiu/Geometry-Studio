package screening

import "strings"

func detectPythonErrorType(stderr string, fallback error) string {
	lines := strings.Split(strings.TrimSpace(stderr), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		if index := strings.Index(line, ":"); index > 0 {
			candidate := strings.TrimSpace(line[:index])
			if strings.HasSuffix(candidate, "Error") || strings.HasSuffix(candidate, "Exception") {
				return candidate
			}
		}
	}

	if fallback != nil {
		return fallback.Error()
	}

	return "PythonError"
}

func tail(input string, lines int) string {
	if input == "" {
		return ""
	}

	parts := strings.Split(input, "\n")
	if len(parts) <= lines {
		return input
	}

	return strings.Join(parts[len(parts)-lines:], "\n")
}
