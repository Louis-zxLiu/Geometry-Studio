//go:build !windows

package startupdiag

import "fmt"

func ShowStartupError(title string, message string) {}

func StartupErrorMessage(err error) string {
	message := "PlotKityCat failed to start."
	if err != nil {
		message = fmt.Sprintf("%s\n\nError: %v", message, err)
	}
	return message
}
