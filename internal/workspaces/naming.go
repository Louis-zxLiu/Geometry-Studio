package workspaces

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func NormalizeName(name string) string {
	replacer := strings.NewReplacer(
		"<", "",
		">", "",
		":", "",
		"\"", "",
		"/", "",
		"\\", "",
		"|", "",
		"?", "",
		"*", "",
	)
	return strings.TrimSpace(replacer.Replace(name))
}

func nextAvailablePath(root string, name string) string {
	initialPath := filepath.Join(root, name)
	if _, err := os.Stat(initialPath); os.IsNotExist(err) {
		return initialPath
	}

	for index := 2; ; index++ {
		nextPath := filepath.Join(root, fmt.Sprintf("%s 副本%d", name, index))
		if _, err := os.Stat(nextPath); os.IsNotExist(err) {
			return nextPath
		}
	}
}

func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
