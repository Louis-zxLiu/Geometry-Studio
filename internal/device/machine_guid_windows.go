//go:build windows

package device

import (
	"fmt"

	"golang.org/x/sys/windows/registry"
)

func machineGuid() (string, error) {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Cryptography`, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		return "", fmt.Errorf("read MachineGuid: %w", err)
	}
	defer key.Close()

	value, _, err := key.GetStringValue("MachineGuid")
	if err != nil {
		return "", fmt.Errorf("read MachineGuid value: %w", err)
	}

	if value == "" {
		return "", fmt.Errorf("MachineGuid is empty")
	}

	return value, nil
}
