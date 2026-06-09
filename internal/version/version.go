package version

import "strings"

var appVersion = "0.0.3.0"

func Current() string {
	value := strings.TrimSpace(appVersion)
	if value == "" {
		return "0.0.3.0"
	}

	return value
}
