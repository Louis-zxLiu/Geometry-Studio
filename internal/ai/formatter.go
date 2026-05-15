package ai

type OpenAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenAIChatRequest struct {
	Model    string              `json:"model"`
	Messages []OpenAIChatMessage `json:"messages"`
}

type OpenAIChatChoice struct {
	Message OpenAIChatMessage `json:"message"`
}

type OpenAIChatResponse struct {
	Choices []OpenAIChatChoice `json:"choices"`
}
