package version

import "strings"

var appVersion = "0.0.2.6"

func Current() string {
	value := strings.TrimSpace(appVersion)
	if value == "" {
		return "0.0.2.6"
	}

	return value
}
