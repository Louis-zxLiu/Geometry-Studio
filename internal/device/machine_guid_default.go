//go:build !windows

package device

import "fmt"

func machineGuid() (string, error) {
	return "", fmt.Errorf("MachineGuid is only supported on Windows")
}
