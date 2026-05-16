package subscription

import (
	"os"
	"strings"
	"time"
)

const (
	defaultAuthURL = "https://bridge.5051001.xyz/auth/activate"
	defaultBaseURL = "https://bridge.5051001.xyz/v1"
	defaultModel   = ""
	defaultBuyURL  = "https://afdian.com/a/wingflow/plan"
)

func authURL() string {
	return strings.TrimSpace(firstNonEmpty(os.Getenv("PLOTKITYCAT_SUBSCRIPTION_AUTH_URL"), defaultAuthURL))
}

func defaultAPIBaseURL() string {
	return strings.TrimSpace(firstNonEmpty(os.Getenv("PLOTKITYCAT_SUBSCRIPTION_API_BASE_URL"), defaultBaseURL))
}

func defaultModelName() string {
	return strings.TrimSpace(firstNonEmpty(os.Getenv("PLOTKITYCAT_SUBSCRIPTION_MODEL"), defaultModel))
}

func purchaseURL() string {
	return strings.TrimSpace(firstNonEmpty(os.Getenv("PLOTKITYCAT_SUBSCRIPTION_PURCHASE_URL"), defaultBuyURL))
}

func cacheTTL() time.Duration {
	return 24 * time.Hour
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}
