package version

import "strings"

var appVersion = "0.0.4.2"

func Current() string {
	value := strings.TrimSpace(appVersion)
	if value == "" {
		return "0.0.4.2"
	}

	return value
}
