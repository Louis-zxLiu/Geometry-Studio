package openai

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

type Request struct {
	BaseURL      string
	APIKey       string
	Model        string
	SystemPrompt string
	UserPrompt   string
	Images       []string
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 90 * time.Second},
	}
}

func (c *Client) Generate(ctx context.Context, request Request) (string, error) {
	baseURL := strings.TrimSpace(request.BaseURL)
	apiKey := strings.TrimSpace(request.APIKey)
	model := strings.TrimSpace(request.Model)
	if baseURL == "" || apiKey == "" || model == "" {
		return "", fmt.Errorf("AI 请求缺少 URL / KEY / MODEL")
	}

	body := ChatRequest{
		Model: model,
		Messages: []Message{
			{Role: "system", Content: request.SystemPrompt},
			{Role: "user", Content: buildUserContent(request.UserPrompt, request.Images)},
		},
		Stream: false,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, completionsURL(baseURL), bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Authorization", "Bearer "+apiKey)

	response, err := c.httpClient.Do(httpRequest)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		var errBody bytes.Buffer
		_, _ = errBody.ReadFrom(response.Body)
		message := strings.TrimSpace(errBody.String())
		if message == "" {
			message = response.Status
		}
		return "", fmt.Errorf("AI 服务返回失败：%s", message)
	}

	var result ChatResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("AI 服务未返回内容")
	}

	content := strings.TrimSpace(result.Choices[0].Message.Content)
	if content == "" {
		return "", fmt.Errorf("AI 服务返回了空内容")
	}

	return content, nil
}

func buildUserContent(prompt string, images []string) any {
	if len(images) == 0 {
		return prompt
	}

	parts := []ContentPart{
		{Type: "text", Text: prompt},
	}
	for _, image := range images {
		trimmed := strings.TrimSpace(image)
		if trimmed == "" {
			continue
		}
		parts = append(parts, ContentPart{
			Type:     "image_url",
			ImageURL: &ImageURL{URL: trimmed},
		})
	}

	return parts
}

func completionsURL(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(trimmed, "/chat/completions") {
		return trimmed
	}

	return trimmed + "/chat/completions"
}
