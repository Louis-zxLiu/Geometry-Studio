package pythonruntime

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"plotkitycat/internal/paths"
)

type Layout string

const (
	LayoutStandalone Layout = "standalone"
	LayoutVirtualEnv Layout = "venv"
)

type Runtime struct {
	Root           string
	Layout         Layout
	Python         string
	PythonWindowed string
	Args           []string
	ScriptsDir     string
	SitePackages   []string
	QtRoot         string
	QtBinDir       string
	QtPluginsDir   string
	QtPlatformsDir string
}

type executableCandidate struct {
	relativePath string
	layout       Layout
	windowed     bool
}

func ResolveDefault() (Runtime, error) {
	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		return Runtime{}, err
	}

	return Resolve(runtimeDir)
}

func Resolve(root string) (Runtime, error) {
	info := Describe(root)

	for _, candidate := range executableCandidates() {
		candidatePath := filepath.Join(info.Root, filepath.FromSlash(candidate.relativePath))
		if !fileExists(candidatePath) {
			continue
		}
		if candidate.windowed {
			if info.PythonWindowed == "" {
				info.PythonWindowed = candidatePath
			}
			if info.Python != "" {
				continue
			}
		}
		info.Python = candidatePath
		info.Layout = candidate.layout
		break
	}

	if info.PythonWindowed == "" {
		for _, relativePath := range []string{"pythonw.exe", "Scripts/pythonw.exe"} {
			candidatePath := filepath.Join(info.Root, filepath.FromSlash(relativePath))
			if fileExists(candidatePath) {
				info.PythonWindowed = candidatePath
				break
			}
		}
	}

	if info.Python == "" {
		return info, errors.New("python runtime not found; expected one of ./runtime/python.exe, ./runtime/pythonw.exe, ./runtime/Scripts/python.exe, or ./runtime/Scripts/pythonw.exe")
	}

	return info, nil
}

func Describe(root string) Runtime {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		absRoot = root
	}

	info := Runtime{
		Root:         absRoot,
		ScriptsDir:   firstExistingDir(filepath.Join(absRoot, "Scripts"), filepath.Join(absRoot, "bin")),
		SitePackages: findSitePackages(absRoot),
	}

	info.QtRoot = findPyQtRoot(info.SitePackages)
	if info.QtRoot != "" {
		info.QtBinDir = existingDir(filepath.Join(info.QtRoot, "bin"))
		info.QtPluginsDir = existingDir(filepath.Join(info.QtRoot, "plugins"))
		info.QtPlatformsDir = existingDir(filepath.Join(info.QtPluginsDir, "platforms"))
	}

	return info
}

func BuildEnv(info Runtime) []string {
	env := append([]string{}, os.Environ()...)

	pathEntries := compactPaths([]string{
		info.QtBinDir,
		info.ScriptsDir,
		info.Root,
	})
	if len(pathEntries) > 0 {
		pathValue := strings.Join(pathEntries, string(os.PathListSeparator))
		if existing := getEnv(env, "PATH"); existing != "" {
			pathValue += string(os.PathListSeparator) + existing
		}
		env = setEnv(env, "PATH", pathValue)
	}

	if len(info.SitePackages) > 0 {
		pythonPath := strings.Join(info.SitePackages, string(os.PathListSeparator))
		if existing := getEnv(env, "PYTHONPATH"); existing != "" {
			pythonPath += string(os.PathListSeparator) + existing
		}
		env = setEnv(env, "PYTHONPATH", pythonPath)
	}

	env = setEnv(env, "MPLBACKEND", "Qt5Agg")
	env = setEnv(env, "PYTHONIOENCODING", "utf-8")
	env = setEnv(env, "PYTHONUTF8", "1")
	env = setEnv(env, "PYTHONNOUSERSITE", "1")
	env = setEnv(env, "QT_API", "pyqt5")

	if info.QtPluginsDir != "" {
		env = setEnv(env, "QT_PLUGIN_PATH", info.QtPluginsDir)
	}
	if info.QtPlatformsDir != "" {
		env = setEnv(env, "QT_QPA_PLATFORM_PLUGIN_PATH", info.QtPlatformsDir)
	}

	return env
}

func PythonRelativePath(info Runtime) string {
	if info.Python == "" || info.Root == "" {
		return ""
	}
	relativePath, err := filepath.Rel(info.Root, info.Python)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(relativePath)
}

func RequirementExists(info Runtime, relativePaths ...string) (string, bool) {
	for _, relativePath := range relativePaths {
		if strings.TrimSpace(relativePath) == "" {
			continue
		}
		candidate := filepath.Join(info.Root, filepath.FromSlash(relativePath))
		if pathExists(candidate) {
			return filepath.ToSlash(relativePath), true
		}
	}

	return "", false
}

func ModulePathExists(info Runtime, modulePath string) (string, bool) {
	modulePath = filepath.FromSlash(strings.TrimSpace(modulePath))
	if modulePath == "" {
		return "", false
	}

	for _, sitePackage := range info.SitePackages {
		candidate := filepath.Join(sitePackage, modulePath)
		if pathExists(candidate) {
			relativePath, err := filepath.Rel(info.Root, candidate)
			if err == nil {
				return filepath.ToSlash(relativePath), true
			}
			return candidate, true
		}
	}

	return "", false
}

func executableCandidates() []executableCandidate {
	candidates := []executableCandidate{
		{relativePath: "python.exe", layout: LayoutStandalone},
		{relativePath: "Scripts/python.exe", layout: LayoutVirtualEnv},
		{relativePath: "pythonw.exe", layout: LayoutStandalone, windowed: true},
		{relativePath: "Scripts/pythonw.exe", layout: LayoutVirtualEnv, windowed: true},
	}
	if runtime.GOOS != "windows" {
		candidates = append(candidates,
			executableCandidate{relativePath: "bin/python", layout: LayoutVirtualEnv},
			executableCandidate{relativePath: "bin/python3", layout: LayoutVirtualEnv},
		)
	}
	return candidates
}

func findSitePackages(root string) []string {
	candidates := []string{
		filepath.Join(root, "Lib", "site-packages"),
		filepath.Join(root, "lib", "site-packages"),
	}

	matches, _ := filepath.Glob(filepath.Join(root, "lib", "python*", "site-packages"))
	candidates = append(candidates, matches...)

	return compactPaths(candidates)
}

func findPyQtRoot(sitePackages []string) string {
	for _, sitePackage := range sitePackages {
		for _, relativePath := range []string{
			filepath.Join("PyQt5", "Qt5"),
			filepath.Join("PyQt5", "Qt"),
		} {
			candidate := filepath.Join(sitePackage, relativePath)
			if dirExists(candidate) {
				return candidate
			}
		}
	}
	return ""
}

func compactPaths(paths []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		if strings.TrimSpace(path) == "" || !dirExists(path) {
			continue
		}
		cleanPath := filepath.Clean(path)
		key := cleanPath
		if runtime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, cleanPath)
	}
	return result
}

func firstExistingDir(paths ...string) string {
	for _, path := range paths {
		if dirExists(path) {
			return filepath.Clean(path)
		}
	}
	return ""
}

func existingDir(path string) string {
	if dirExists(path) {
		return filepath.Clean(path)
	}
	return ""
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func getEnv(env []string, key string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) || equalEnvKey(entry, key) {
			return entry[strings.Index(entry, "=")+1:]
		}
	}
	return ""
}

func setEnv(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) || equalEnvKey(entry, key) {
			env[index] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func equalEnvKey(entry string, key string) bool {
	index := strings.Index(entry, "=")
	if index < 0 {
		return false
	}
	entryKey := entry[:index]
	if runtime.GOOS == "windows" {
		return strings.EqualFold(entryKey, key)
	}
	return entryKey == key
}

func (l Layout) String() string {
	if l == "" {
		return "unknown"
	}
	return string(l)
}

func (r Runtime) String() string {
	relative := PythonRelativePath(r)
	if relative == "" {
		return fmt.Sprintf("%s runtime at %s", r.Layout, r.Root)
	}
	return fmt.Sprintf("%s runtime at %s (%s)", r.Layout, r.Root, relative)
}
