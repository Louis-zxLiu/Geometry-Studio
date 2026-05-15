package subscription

import (
	"fmt"
	"net/url"
	"strings"
)

func buildPurchaseURL(rawURL string, deviceID string) (string, error) {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return "", nil
	}

	parsedURL, err := url.Parse(trimmedURL)
	if err != nil {
		return "", fmt.Errorf("购买链接配置无效")
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", fmt.Errorf("购买链接配置无效")
	}

	query := parsedURL.Query()
	if strings.TrimSpace(deviceID) != "" {
		if query.Get("device_id") == "" {
			query.Set("device_id", deviceID)
		}
		if query.Get("remark") == "" {
			query.Set("remark", "pkc:"+deviceID)
		}
	}

	parsedURL.RawQuery = query.Encode()
	return parsedURL.String(), nil
}
