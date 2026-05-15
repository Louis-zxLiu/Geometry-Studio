package device

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

type Service struct{}

func NewService() *Service {
	return &Service{}
}

func (s *Service) ID() (string, error) {
	value, err := machineGuid()
	if err != nil {
		return "", err
	}

	normalized := strings.TrimSpace(strings.ToLower(value))
	sum := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(sum[:]), nil
}
