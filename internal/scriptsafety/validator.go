package scriptsafety

import (
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
)

type Violation struct {
	RuleID  string
	Line    int
	Message string
	Snippet string
}

type ValidationError struct {
	Violations []Violation
}

type lineRule struct {
	id      string
	pattern *regexp.Regexp
	message string
}

var defaultRules = []lineRule{
	newLineRule("import.os", `(^|[^A-Za-z0-9_])(import\s+os\b|from\s+os\s+import\b)`, "不允许导入 os 模块"),
	newLineRule("import.subprocess", `(^|[^A-Za-z0-9_])(import\s+subprocess\b|from\s+subprocess\s+import\b)`, "不允许导入 subprocess 模块"),
	newLineRule("call.os.system", `\bos\s*\.\s*system\s*\(`, "不允许调用 os.system"),
	newLineRule("call.os.popen", `\bos\s*\.\s*popen\s*\(`, "不允许调用 os.popen"),
	newLineRule("call.os.remove", `\bos\s*\.\s*(remove|unlink|rmdir|removedirs|rename|replace|startfile)\s*\(`, "不允许执行危险的 os 文件或系统操作"),
	newLineRule("call.shutil", `\bshutil\s*\.\s*(rmtree|move|copy2?|copytree)\s*\(`, "不允许执行危险的 shutil 文件操作"),
	newLineRule("call.subprocess", `\bsubprocess\s*\.\s*(run|call|Popen|check_call|check_output)\s*\(`, "不允许启动外部进程"),
	newLineRule("call.dynamic", `(^|[^A-Za-z0-9_])(eval|exec|compile|__import__)\s*\(`, "不允许使用动态执行能力"),
}

func newLineRule(id string, pattern string, message string) lineRule {
	return lineRule{
		id:      id,
		pattern: regexp.MustCompile(pattern),
		message: message,
	}
}

func Validate(code string) error {
	violations := Analyze(code)
	if len(violations) == 0 {
		return nil
	}

	return &ValidationError{Violations: violations}
}

func ValidateFile(path string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	return Validate(string(content))
}

func Analyze(code string) []Violation {
	lines := strings.Split(strings.ReplaceAll(code, "\r\n", "\n"), "\n")
	violations := make([]Violation, 0)
	seen := map[string]struct{}{}

	for index, rawLine := range lines {
		lineNumber := index + 1
		trimmed := strings.TrimSpace(rawLine)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		for _, rule := range defaultRules {
			if !rule.pattern.MatchString(rawLine) {
				continue
			}

			key := fmt.Sprintf("%s:%d", rule.id, lineNumber)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}

			violations = append(violations, Violation{
				RuleID:  rule.id,
				Line:    lineNumber,
				Message: rule.message,
				Snippet: trimmed,
			})
		}
	}

	sort.SliceStable(violations, func(i int, j int) bool {
		if violations[i].Line != violations[j].Line {
			return violations[i].Line < violations[j].Line
		}
		return violations[i].RuleID < violations[j].RuleID
	})

	return violations
}

func (e *ValidationError) Error() string {
	if e == nil || len(e.Violations) == 0 {
		return "已拦截危险 Python 代码"
	}

	lines := []string{"已拦截危险 Python 代码"}
	for _, violation := range e.Violations {
		if violation.Snippet != "" {
			lines = append(lines, fmt.Sprintf("第 %d 行: %s\n%s", violation.Line, violation.Message, violation.Snippet))
			continue
		}
		lines = append(lines, fmt.Sprintf("第 %d 行: %s", violation.Line, violation.Message))
	}

	return strings.Join(lines, "\n\n")
}
