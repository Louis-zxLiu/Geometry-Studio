package subscription

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *Client) Activate(ctx context.Context, request ActivationRequest) (ActivationResponse, error) {
	url := authURL()
	if url == "" {
		return ActivationResponse{
			Status:  StatusUnconfigured,
			Message: "订阅服务未配置",
		}, nil
	}

	payload, err := json.Marshal(request)
	if err != nil {
		return ActivationResponse{}, err
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return ActivationResponse{}, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")

	response, err := c.httpClient.Do(httpRequest)
	if err != nil {
		return ActivationResponse{}, err
	}
	defer response.Body.Close()

	var result ActivationResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return ActivationResponse{}, err
	}

	if response.StatusCode >= 400 {
		message := strings.TrimSpace(result.Message)
		if message == "" {
			message = fmt.Sprintf("订阅激活失败：%s", response.Status)
		}
		return ActivationResponse{}, fmt.Errorf(message)
	}

	if result.BaseURL == "" {
		result.BaseURL = defaultAPIBaseURL()
	}
	if result.Model == "" {
		result.Model = defaultModelName()
	}

	return result, nil
}
