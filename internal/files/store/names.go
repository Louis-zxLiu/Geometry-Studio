package store

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

func normalizeSceneName(name string) string {
	sanitized := sanitizeAssetName(name)
	if strings.EqualFold(filepath.Ext(sanitized), ".py") {
		sanitized = strings.TrimSuffix(sanitized, filepath.Ext(sanitized))
	}
	sanitized = strings.TrimSpace(sanitized)
	if sanitized == "" {
		return "untitled"
	}

	return sanitized
}

func sanitizeAssetName(name string) string {
	replacer := strings.NewReplacer(
		"<", "",
		">", "",
		":", "",
		"\"", "",
		"/", "",
		"\\", "",
		"|", "",
		"?", "",
		"*", "",
	)

	name = strings.TrimSpace(replacer.Replace(name))
	if name == "" {
		return "untitled"
	}

	return name
}

func defaultScriptTemplate(sceneName string) string {
	return "import matplotlib.pyplot as plt\n\nplt.rcParams.update({\n    \"font.family\": \"SimHei\",\n    \"mathtext.fontset\": \"cm\",\n    \"axes.unicode_minus\": False,\n    \"font.size\": 10\n})\n\nif __name__ == \"__main__\":\n    plt.figure(dpi=120)\n    plt.title(\"" + sceneName + ".py\")\n    plt.show()\n"
}

func stripExtension(filename string) string {
	return strings.TrimSuffix(filename, filepath.Ext(filename))
}

func appendImageReferences(markdown string, references []string) string {
	trimmed := strings.TrimRight(markdown, "\r\n")
	if trimmed == "" {
		return strings.Join(references, "\n\n")
	}

	return trimmed + "\n\n" + strings.Join(references, "\n\n")
}

func decodeDataURL(dataURL string) ([]byte, string, error) {
	if !strings.HasPrefix(dataURL, "data:") {
		return nil, "", fmt.Errorf("unsupported image payload")
	}

	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return nil, "", fmt.Errorf("invalid data URL")
	}

	header := parts[0]
	payload := parts[1]
	if !strings.HasSuffix(header, ";base64") {
		return nil, "", fmt.Errorf("only base64 image payloads are supported")
	}

	mediaType := strings.TrimPrefix(strings.TrimSuffix(header, ";base64"), "data:")
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", err
	}

	return data, extensionFromMediaType(mediaType), nil
}

func encodeDataURL(filename string, data []byte) string {
	mediaType := mime.TypeByExtension(strings.ToLower(filepath.Ext(filename)))
	if mediaType == "" {
		mediaType = http.DetectContentType(sniffBytes(data))
	}
	if mediaType == "" {
		mediaType = defaultMimeType
	}

	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func extensionFromMediaType(mediaType string) string {
	extensions, err := mime.ExtensionsByType(mediaType)
	if err == nil && len(extensions) > 0 {
		return strings.ToLower(extensions[0])
	}

	switch mediaType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	default:
		return ""
	}
}

func sniffBytes(data []byte) []byte {
	if len(data) <= 512 {
		return data
	}

	return bytes.Clone(data[:512])
}
