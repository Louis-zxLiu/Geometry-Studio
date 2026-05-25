package version

import "strings"

var appVersion = "0.0.1"

func Current() string {
	value := strings.TrimSpace(appVersion)
	if value == "" {
		return "0.0.1"
	}

	return value
}
