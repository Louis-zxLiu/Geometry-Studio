package env

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
	"plotkitycat/internal/pythonruntime"
)

type CheckItem struct {
	Key          string `json:"key"`
	Label        string `json:"label"`
	RelativePath string `json:"relativePath"`
	Category     string `json:"category"`
	Status       string `json:"status"`
	Message      string `json:"message"`
	Exists       bool   `json:"exists"`
}

type Status struct {
	Ready                bool        `json:"ready"`
	Code                 string      `json:"code"`
	Severity             string      `json:"severity"`
	RuntimeDir           string      `json:"runtimeDir"`
	Summary              string      `json:"summary"`
	RecommendedAction    string      `json:"recommendedAction"`
	CheckedAt            string      `json:"checkedAt"`
	Items                []CheckItem `json:"items"`
	Missing              []string    `json:"missing"`
	CanRebuild           bool        `json:"canRebuild"`
	RuntimeArchivePath   string      `json:"runtimeArchivePath"`
	RuntimeArchiveExists bool        `json:"runtimeArchiveExists"`
}

func EvaluateStatus(requirements []Requirement) (Status, error) {
	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		return Status{}, err
	}

	archivePath, err := paths.RuntimeArchivePath()
	if err != nil {
		return Status{}, err
	}

	_, archiveStatErr := os.Stat(archivePath)
	archiveExists := archiveStatErr == nil

	runtimeInfo, runtimeErr := pythonruntime.Resolve(runtimeDir)
	pythonExists := runtimeErr == nil
	if !pythonExists {
		runtimeInfo = pythonruntime.Describe(runtimeDir)
	}

	items := make([]CheckItem, 0, len(requirements)*2)
	missing := make([]string, 0)
	for _, requirement := range requirements {
		relativePath, exists := evaluateFilesystemRequirement(runtimeInfo, requirement, pythonExists)
		items = append(items, CheckItem{
			Key:          requirement.Key,
			Label:        requirement.Label,
			RelativePath: relativePath,
			Category:     "filesystem",
			Status:       mapCheckStatus(exists),
			Message:      mapFileMessage(exists),
			Exists:       exists,
		})

		if !exists && requirement.ImportName == "" {
			missing = appendUnique(missing, requirement.Label)
		}
	}

	status := Status{
		RuntimeDir:           runtimeDir,
		CheckedAt:            time.Now().Format(time.RFC3339),
		Items:                items,
		Missing:              missing,
		CanRebuild:           archiveExists,
		RuntimeArchivePath:   archivePath,
		RuntimeArchiveExists: archiveExists,
	}

	if !pythonExists {
		status.Ready = false
		status.Severity = "error"
		if !archiveExists {
			status.Code = "runtime_archive_missing"
			status.Summary = "Missing resources/runtime/runtime.7z; Python runtime cannot be rebuilt automatically."
			status.RecommendedAction = "Create runtime/ with tools/prepare-geometry-runtime.ps1 or provide resources/runtime/runtime.7z."
		} else {
			status.Code = "python_executable_missing"
			status.Summary = "Python runtime interpreter was not found."
			status.RecommendedAction = "Rebuild runtime or create a venv under runtime/."
		}
		if runtimeErr != nil && status.Summary != "" {
			status.Summary += " " + runtimeErr.Error()
		}
		return status, nil
	}

	importItems, importMissing, importErr := evaluatePythonImports(runtimeInfo, requirements)
	status.Items = append(status.Items, importItems...)
	status.Missing = appendUnique(status.Missing, importMissing...)

	switch {
	case importErr != nil:
		status.Ready = false
		status.Code = "python_runtime_broken"
		status.Severity = "error"
		status.Summary = "Python runtime starts, but the import health check failed."
		status.RecommendedAction = "Run tools/prepare-geometry-runtime.ps1 to repair runtime packages."
	case len(importMissing) > 0:
		status.Ready = false
		status.Code = "python_package_unhealthy"
		status.Severity = "error"
		status.Summary = "Python runtime starts, but required packages are missing."
		status.RecommendedAction = "Install the Geometry Studio runtime packages with tools/prepare-geometry-runtime.ps1."
	default:
		status.Ready = true
		status.Code = "ready"
		status.Severity = "info"
		status.Summary = "Python runtime ready: " + runtimeInfo.String()
		status.RecommendedAction = "No action needed."
	}

	return status, nil
}

func evaluateFilesystemRequirement(info pythonruntime.Runtime, requirement Requirement, pythonExists bool) (string, bool) {
	if requirement.Key == "python" {
		if pythonExists {
			relativePath := pythonruntime.PythonRelativePath(info)
			if relativePath != "" {
				return relativePath, true
			}
			return requirement.RelativePath, true
		}
		return requirement.RelativePath, false
	}

	relativePaths := append([]string{requirement.RelativePath}, requirement.AlternativeRelativePaths...)
	if relativePath, exists := pythonruntime.RequirementExists(info, relativePaths...); exists {
		return relativePath, true
	}

	modulePath := modulePathFromRequirement(requirement)
	if relativePath, exists := pythonruntime.ModulePathExists(info, modulePath); exists {
		return relativePath, true
	}

	return requirement.RelativePath, false
}

func modulePathFromRequirement(requirement Requirement) string {
	relativePath := filepath.ToSlash(requirement.RelativePath)
	for _, prefix := range []string{"Lib/site-packages/", "lib/site-packages/"} {
		if strings.HasPrefix(relativePath, prefix) {
			return strings.TrimPrefix(relativePath, prefix)
		}
	}
	if requirement.ImportName == "" {
		return ""
	}
	return strings.Split(requirement.ImportName, ".")[0]
}

func evaluatePythonImports(info pythonruntime.Runtime, requirements []Requirement) ([]CheckItem, []string, error) {
	modules := make([]Requirement, 0, len(requirements))
	for _, requirement := range requirements {
		if requirement.ImportName != "" {
			modules = append(modules, requirement)
		}
	}
	if len(modules) == 0 {
		return nil, nil, nil
	}

	script := buildImportCheckScript(modules)
	cmd := exec.Command(info.Python, "-c", script)
	cmd.Env = pythonruntime.BuildEnv(info)
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	output, err := cmd.Output()
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = strings.TrimSpace(string(output))
		}
		if message == "" {
			message = err.Error()
		}

		return []CheckItem{
			{
				Key:      "python_import_probe",
				Label:    "Python import health check",
				Category: "runtime",
				Status:   "failed",
				Message:  message,
				Exists:   false,
			},
		}, nil, err
	}

	statusByKey := map[string]string{}
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		parts := strings.SplitN(strings.TrimSpace(line), "|", 2)
		if len(parts) != 2 {
			continue
		}
		statusByKey[parts[0]] = parts[1]
	}

	items := make([]CheckItem, 0, len(modules))
	missing := make([]string, 0)
	for _, requirement := range modules {
		result := statusByKey[requirement.Key]
		exists := result == "ok"
		if !exists {
			missing = appendUnique(missing, requirement.Label)
		}

		items = append(items, CheckItem{
			Key:          requirement.Key + "_import",
			Label:        requirement.Label + " import check",
			RelativePath: requirement.RelativePath,
			Category:     "import",
			Status:       mapCheckStatus(exists),
			Message:      mapImportMessage(exists),
			Exists:       exists,
		})
	}

	return items, missing, nil
}

func buildImportCheckScript(requirements []Requirement) string {
	lines := []string{
		"import importlib",
	}
	for _, requirement := range requirements {
		lines = append(lines,
			"try:",
			"    importlib.import_module("+strconv.Quote(requirement.ImportName)+")",
			"    print("+strconv.Quote(requirement.Key+"|ok")+")",
			"except Exception:",
			"    print("+strconv.Quote(requirement.Key+"|missing")+")",
		)
	}

	return strings.Join(lines, "\n")
}

func mapCheckStatus(exists bool) string {
	if exists {
		return "ok"
	}

	return "missing"
}

func mapFileMessage(exists bool) string {
	if exists {
		return "Found"
	}

	return "Missing"
}

func mapImportMessage(exists bool) string {
	if exists {
		return "Import succeeded"
	}

	return "Import failed"
}

func appendUnique(values []string, additions ...string) []string {
	for _, addition := range additions {
		addition = strings.TrimSpace(addition)
		if addition == "" {
			continue
		}
		found := false
		for _, value := range values {
			if value == addition {
				found = true
				break
			}
		}
		if !found {
			values = append(values, addition)
		}
	}
	return values
}
