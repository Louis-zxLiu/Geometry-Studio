package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"plotkitycat/internal/paths"
	"plotkitycat/internal/processutil"
	"plotkitycat/internal/version"
)

const (
	defaultManifestURL = "https://update.5051001.xyz/plotkitycat/stable/manifest.json"
	checkTTL           = 12 * time.Hour
)

type Service struct {
	client         *http.Client
	downloadClient *http.Client
	manifestURL    string
	store          *Store
}

func NewService() *Service {
	return &Service{
		client: &http.Client{
			Timeout: 20 * time.Second,
		},
		downloadClient: &http.Client{
			Timeout: 10 * time.Minute,
		},
		manifestURL: defaultManifestURL,
		store:       NewStore(),
	}
}

func (s *Service) Status() (Status, error) {
	state, err := s.store.Load()
	if err != nil {
		return Status{}, err
	}

	return s.statusFromState(state), nil
}

func (s *Service) Check(ctx context.Context, force bool) (Status, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	state, err := s.store.Load()
	if err != nil {
		return Status{}, err
	}

	if !force && canReuseCheck(state.LastCheckedAt) {
		return s.statusFromState(state), nil
	}

	manifest, err := s.fetchManifest(ctx)
	if err != nil {
		return Status{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	state.LastCheckedAt = now
	state.LatestVersion = strings.TrimSpace(manifest.Version)
	state.LatestNotes = strings.TrimSpace(manifest.Notes)
	state.LatestPublishedAt = strings.TrimSpace(manifest.PublishedAt)
	state.LastKnownArtifact = strings.TrimSpace(manifest.Windows.URL)
	state.LastKnownAvailable = compareVersions(manifest.Version, version.Current()) > 0
	if state.DownloadedVersion != state.LatestVersion {
		state.DownloadedVersion = ""
		state.DownloadedPath = ""
		state.DownloadedSHA256 = ""
		state.LastKnownDownloaded = false
	}
	state.LastKnownMessage = buildMessage(state.LastKnownAvailable, state.DownloadedVersion == state.LatestVersion, manifest.Version)
	if err := s.store.Save(state); err != nil {
		return Status{}, err
	}

	return s.statusFromState(state), nil
}

func (s *Service) Download(ctx context.Context) (Status, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	state, err := s.store.Load()
	if err != nil {
		return Status{}, err
	}

	manifest, err := s.fetchManifest(ctx)
	if err != nil {
		return Status{}, err
	}
	if compareVersions(manifest.Version, version.Current()) <= 0 {
		state.LatestVersion = strings.TrimSpace(manifest.Version)
		state.LastKnownAvailable = false
		state.LastKnownMessage = "当前已经是最新版本"
		if err := s.store.Save(state); err != nil {
			return Status{}, err
		}
		return s.statusFromState(state), nil
	}

	updatesDir, err := paths.UpdatesDir()
	if err != nil {
		return Status{}, err
	}
	if err := os.MkdirAll(updatesDir, 0o755); err != nil {
		return Status{}, err
	}

	targetName := fmt.Sprintf("PlotKityCat-%s-windows-amd64.exe.new", strings.TrimSpace(manifest.Version))
	targetPath := filepath.Join(updatesDir, targetName)
	partPath := targetPath + ".part"
	for _, entry := range staleUpdateCandidates(updatesDir, targetName) {
		_ = os.Remove(entry)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, manifest.Windows.URL, nil)
	if err != nil {
		return Status{}, err
	}
	resp, err := s.downloadClient.Do(req)
	if err != nil {
		return Status{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Status{}, fmt.Errorf("下载更新失败: %s", resp.Status)
	}

	file, err := os.Create(partPath)
	if err != nil {
		return Status{}, err
	}

	hash := sha256.New()
	_, copyErr := io.Copy(io.MultiWriter(file, hash), resp.Body)
	closeErr := file.Close()
	if copyErr != nil {
		_ = os.Remove(partPath)
		return Status{}, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(partPath)
		return Status{}, closeErr
	}

	sum := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(sum, strings.TrimSpace(manifest.Windows.SHA256)) {
		_ = os.Remove(partPath)
		return Status{}, fmt.Errorf("更新包校验失败")
	}

	if err := os.Rename(partPath, targetPath); err != nil {
		_ = os.Remove(partPath)
		return Status{}, err
	}

	state.LastCheckedAt = time.Now().UTC().Format(time.RFC3339)
	state.LatestVersion = strings.TrimSpace(manifest.Version)
	state.LatestNotes = strings.TrimSpace(manifest.Notes)
	state.LatestPublishedAt = strings.TrimSpace(manifest.PublishedAt)
	state.LastKnownArtifact = strings.TrimSpace(manifest.Windows.URL)
	state.DownloadedVersion = state.LatestVersion
	state.DownloadedPath = targetPath
	state.DownloadedSHA256 = sum
	state.LastKnownAvailable = true
	state.LastKnownDownloaded = true
	state.LastKnownMessage = "更新已下载完成，重启后即可安装"
	if err := s.store.Save(state); err != nil {
		return Status{}, err
	}

	return s.statusFromState(state), nil
}

func (s *Service) InstallAndRestart() error {
	state, err := s.store.Load()
	if err != nil {
		return err
	}
	if strings.TrimSpace(state.DownloadedVersion) == "" || strings.TrimSpace(state.DownloadedPath) == "" {
		return fmt.Errorf("没有可安装的更新包")
	}
	if !fileExists(state.DownloadedPath) {
		return fmt.Errorf("下载的更新包不存在: %s", state.DownloadedPath)
	}

	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	scriptPath, err := writeUpdateScript(exePath, state.DownloadedPath, os.Getpid())
	if err != nil {
		return err
	}

	nextState := state
	nextState.LastKnownAvailable = false
	nextState.LastKnownDownloaded = false
	nextState.LastKnownMessage = "更新已安装，正在重新启动"
	nextState.DownloadedVersion = ""
	nextState.DownloadedPath = ""
	nextState.DownloadedSHA256 = ""
	_ = s.store.Save(nextState)

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath)
	cmd.SysProcAttr = processutil.WithoutConsoleWindow()
	if err := cmd.Start(); err != nil {
		return err
	}

	os.Exit(0)
	return nil
}

func writeUpdateScript(targetExe, newExe string, mainPid int) (string, error) {
	script := fmt.Sprintf(`$target = %s
$new = %s
$mainPid = %d
$logFile = Join-Path $env:TEMP 'plotkitycat-update.log'
function Log($msg) { Add-Content -LiteralPath $logFile -Value ("[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] " + $msg) }
Log "update started target=$target new=$new mainPid=$mainPid"
for ($i=0; $i -lt 150; $i++) {
  $p = Get-Process -Id $mainPid -ErrorAction SilentlyContinue
  if (-not $p) { Log "main exe exited"; break }
  Start-Sleep -Milliseconds 200
}
Remove-Item ($target + ".old") -Force -ErrorAction SilentlyContinue
$ok = $false
for ($i=0; $i -lt 10; $i++) {
  try { Copy-Item -LiteralPath $new -Destination $target -Force; $ok = $true; Log "copy ok"; break }
  catch { Log ("copy fail " + $i + ": " + $_.Exception.Message); Start-Sleep -Milliseconds 500 }
}
if (-not $ok) { Log "copy permanent fail"; exit 1 }
try { Start-Process -FilePath $target; Log "relaunched" }
catch { Log ("relaunch fail: " + $_.Exception.Message) }
Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue
`, psQuote(targetExe), psQuote(newExe), mainPid)

	tmpDir := os.TempDir()
	scriptPath := filepath.Join(tmpDir, fmt.Sprintf("plotkitycat-update-%d.ps1", mainPid))
	if err := os.WriteFile(scriptPath, []byte(script), 0o644); err != nil {
		return "", err
	}
	return scriptPath, nil
}

func psQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

func (s *Service) fetchManifest(ctx context.Context) (Manifest, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.manifestURL, nil)
	if err != nil {
		return Manifest{}, err
	}
	req.Header.Set("User-Agent", "PlotKityCat-Updater/"+version.Current())

	resp, err := s.client.Do(req)
	if err != nil {
		return Manifest{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Manifest{}, fmt.Errorf("检查更新失败: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return Manifest{}, err
	}
	body = bytes.TrimPrefix(body, []byte("\xef\xbb\xbf"))

	var manifest Manifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		return Manifest{}, err
	}
	if strings.TrimSpace(manifest.Version) == "" {
		return Manifest{}, fmt.Errorf("更新描述缺少版本号")
	}
	if strings.TrimSpace(manifest.Windows.URL) == "" {
		return Manifest{}, fmt.Errorf("更新描述缺少下载地址")
	}
	if strings.TrimSpace(manifest.Windows.SHA256) == "" {
		return Manifest{}, fmt.Errorf("更新描述缺少 sha256")
	}

	return manifest, nil
}

func (s *Service) statusFromState(state State) Status {
	downloaded := state.DownloadedVersion != "" && state.DownloadedVersion == state.LatestVersion && fileExists(state.DownloadedPath)
	available := state.LastKnownAvailable
	if compareVersions(state.LatestVersion, version.Current()) > 0 {
		available = true
	}

	message := strings.TrimSpace(state.LastKnownMessage)
	if message == "" {
		message = buildMessage(available, downloaded, state.LatestVersion)
	}

	return Status{
		CurrentVersion:  version.Current(),
		LatestVersion:   strings.TrimSpace(state.LatestVersion),
		Notes:           strings.TrimSpace(state.LatestNotes),
		PublishedAt:     strings.TrimSpace(state.LatestPublishedAt),
		LastCheckedAt:   strings.TrimSpace(state.LastCheckedAt),
		Message:         message,
		UpdateAvailable: available,
		Downloaded:      downloaded,
		ReadyToInstall:  downloaded,
	}
}

func buildMessage(available bool, downloaded bool, latest string) string {
	switch {
	case downloaded:
		return "更新已下载完成，重启后即可安装"
	case available && strings.TrimSpace(latest) != "":
		return "发现新版本 " + strings.TrimSpace(latest)
	case available:
		return "发现新版本"
	default:
		return "当前已经是最新版本"
	}
}

func canReuseCheck(lastCheckedAt string) bool {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(lastCheckedAt))
	if err != nil {
		return false
	}

	return time.Since(parsed) < checkTTL
}

func staleUpdateCandidates(updatesDir string, keep string) []string {
	entries, err := os.ReadDir(updatesDir)
	if err != nil {
		return nil
	}

	pathsToRemove := make([]string, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "PlotKityCat-") {
			continue
		}
		if name == keep || name == keep+".part" {
			continue
		}
		pathsToRemove = append(pathsToRemove, filepath.Join(updatesDir, name))
	}

	return pathsToRemove
}

func fileExists(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

func compareVersions(left string, right string) int {
	la := parseVersion(left)
	ra := parseVersion(right)
	for i := 0; i < len(la) || i < len(ra); i++ {
		lv := 0
		if i < len(la) {
			lv = la[i]
		}
		rv := 0
		if i < len(ra) {
			rv = ra[i]
		}
		if lv > rv {
			return 1
		}
		if lv < rv {
			return -1
		}
	}
	return 0
}

func parseVersion(value string) []int {
	trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(value, "v"), "V"))
	if trimmed == "" {
		return []int{0}
	}

	parts := strings.Split(trimmed, ".")
	parsed := make([]int, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			parsed = append(parsed, 0)
			continue
		}
		digits := strings.Builder{}
		for _, r := range part {
			if r < '0' || r > '9' {
				break
			}
			digits.WriteRune(r)
		}
		if digits.Len() == 0 {
			parsed = append(parsed, 0)
			continue
		}
		number, err := strconv.Atoi(digits.String())
		if err != nil {
			parsed = append(parsed, 0)
			continue
		}
		parsed = append(parsed, number)
	}

	return parsed
}