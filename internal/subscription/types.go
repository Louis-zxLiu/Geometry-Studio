package subscription

type Status string

const (
	StatusActive       Status = "active"
	StatusInactive     Status = "inactive"
	StatusUnconfigured Status = "unconfigured"
	StatusError        Status = "error"
)

type CacheState struct {
	DeviceID      string `json:"device_id"`
	InstallID     string `json:"install_id"`
	Token         string `json:"token"`
	ExpireAt      string `json:"expire_at"`
	BaseURL       string `json:"base_url"`
	Model         string `json:"model"`
	LastCheckedAt string `json:"last_checked_at"`
	Status        Status `json:"status"`
	Message       string `json:"message"`
}

type ActivationRequest struct {
	DeviceID   string `json:"device_id"`
	InstallID  string `json:"install_id"`
	AppVersion string `json:"app_version"`
}

type ActivationResponse struct {
	Status   Status `json:"status"`
	Token    string `json:"token"`
	ExpireAt string `json:"expire_at"`
	BaseURL  string `json:"base_url"`
	Model    string `json:"model"`
	Message  string `json:"message"`
}

type View struct {
	Status        Status `json:"status"`
	Activated     bool   `json:"activated"`
	DeviceID      string `json:"deviceId"`
	ExpireAt      string `json:"expireAt"`
	LastCheckedAt string `json:"lastCheckedAt"`
	Message       string `json:"message"`
	Model         string `json:"model"`
	BaseURL       string `json:"baseUrl"`
}

type Session struct {
	Token    string
	BaseURL  string
	Model    string
	DeviceID string
}

type PurchaseLink struct {
	Configured bool   `json:"configured"`
	URL        string `json:"url"`
	DeviceID   string `json:"deviceId"`
	Message    string `json:"message"`
}
