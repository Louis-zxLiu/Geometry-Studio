package version

import "strings"

var appVersion = "0.0.2.9-test"

func Current() string {
	value := strings.TrimSpace(appVersion)
	if value == "" {
		return "0.0.2.9-test"
	}

	return value
}
