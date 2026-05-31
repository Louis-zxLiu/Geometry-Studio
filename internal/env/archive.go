package env

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"plotkitycat/internal/paths"
)

func (m *Manager) ensureRuntimeExtracted(onProgress func(Progress)) error {
	reportProgress(onProgress, Progress{
		Stage:   "checking",
		Message: "Checking runtime",
		Percent: 12,
	})

	status, err := m.Status()
	if err != nil {
		return err
	}
	if status.Ready {
		reportProgress(onProgress, Progress{
			Stage:   "ready",
			Message: "Runtime ready",
			Percent: 100,
		})
		return nil
	}

	archivePath, err := paths.RuntimeArchivePath()
	if err != nil {
		return err
	}

	if _, err := os.Stat(archivePath); err != nil {
		return fmt.Errorf("runtime archive not found: %s", archivePath)
	}

	reportProgress(onProgress, Progress{
		Stage:   "extracting",
		Message: "Extracting runtime",
		Percent: 18,
	})

	runtimeDir, err := paths.RuntimeDir()
	if err != nil {
		return err
	}

	tempDir, err := paths.RuntimeTempDir()
	if err != nil {
		return err
	}

	if err := os.RemoveAll(tempDir); err != nil {
		return err
	}
	if err := os.MkdirAll(tempDir, 0o755); err != nil {
		return err
	}

	if err := extractArchive(archivePath, tempDir, onProgress); err != nil {
		_ = os.RemoveAll(tempDir)
		return err
	}

	reportProgress(onProgress, Progress{
		Stage:   "installing",
		Message: "Installing runtime",
		Percent: 92,
	})

	if err := installRuntimeFromTemp(tempDir, runtimeDir); err != nil {
		_ = os.RemoveAll(tempDir)
		return err
	}

	status, err = m.Status()
	if err != nil {
		return err
	}
	if !status.Ready {
		return fmt.Errorf("runtime extracted but still incomplete")
	}

	reportProgress(onProgress, Progress{
		Stage:   "ready",
		Message: "Runtime ready",
		Percent: 100,
	})

	return nil
}

func installRuntimeFromTemp(tempDir string, runtimeDir string) error {
	if err := os.RemoveAll(runtimeDir); err != nil {
		return err
	}

	if err := retryRename(tempDir, runtimeDir, 8, 250*time.Millisecond); err == nil {
		return nil
	}

	// Windows may transiently deny directory rename while Defender or shell
	// components still hold short-lived handles on freshly extracted files.
	// Fall back to a copy-based install so runtime rebuild remains reliable.
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		return err
	}
	if err := copyDirContents(tempDir, runtimeDir); err != nil {
		return err
	}

	return os.RemoveAll(tempDir)
}

func retryRename(source string, target string, attempts int, delay time.Duration) error {
	var lastErr error
	for index := 0; index < attempts; index++ {
		lastErr = os.Rename(source, target)
		if lastErr == nil {
			return nil
		}

		time.Sleep(delay)
	}

	return lastErr
}

func copyDirContents(sourceDir string, targetDir string) error {
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		sourcePath := filepath.Join(sourceDir, entry.Name())
		targetPath := filepath.Join(targetDir, entry.Name())

		info, err := entry.Info()
		if err != nil {
			return err
		}

		if entry.IsDir() {
			if err := os.MkdirAll(targetPath, info.Mode()); err != nil {
				return err
			}
			if err := copyDirContents(sourcePath, targetPath); err != nil {
				return err
			}
			continue
		}

		if err := copyFile(sourcePath, targetPath, info.Mode()); err != nil {
			return err
		}
	}

	return nil
}

func copyFile(sourcePath string, targetPath string, mode os.FileMode) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer source.Close()

	target, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}

	_, copyErr := io.Copy(target, source)
	closeErr := target.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}

	return nil
}

func extractArchive(archivePath string, targetDir string, onProgress func(Progress)) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	totalFiles := 0
	for _, file := range reader.File {
		if !archiveEntryIsDir(file) {
			totalFiles++
		}
	}

	processedFiles := 0
	for _, file := range reader.File {
		relativePath := normalizeArchivePath(file.Name)
		if relativePath == "" {
			continue
		}

		targetPath := filepath.Join(targetDir, filepath.FromSlash(relativePath))
		cleanTargetPath := filepath.Clean(targetPath)
		cleanRoot := filepath.Clean(targetDir) + string(os.PathSeparator)
		if cleanTargetPath != filepath.Clean(targetDir) && !strings.HasPrefix(cleanTargetPath, cleanRoot) {
			return fmt.Errorf("invalid runtime archive entry: %s", file.Name)
		}

		if archiveEntryIsDir(file) {
			if err := os.MkdirAll(cleanTargetPath, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(cleanTargetPath), 0o755); err != nil {
			return err
		}

		src, err := file.Open()
		if err != nil {
			return err
		}

		dst, err := os.OpenFile(cleanTargetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, file.Mode())
		if err != nil {
			src.Close()
			return err
		}

		_, copyErr := io.Copy(dst, src)
		closeErr := dst.Close()
		srcErr := src.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if srcErr != nil {
			return srcErr
		}

		processedFiles++
		if totalFiles > 0 {
			progressPercent := 18 + int(float64(processedFiles)/float64(totalFiles)*68.0)
			reportProgress(onProgress, Progress{
				Stage:   "extracting",
				Message: "Extracting runtime",
				Percent: progressPercent,
			})
		}
	}

	return nil
}

func normalizeArchivePath(name string) string {
	normalized := strings.TrimSpace(strings.ReplaceAll(name, "\\", "/"))
	normalized = strings.TrimPrefix(normalized, "./")
	normalized = strings.TrimPrefix(normalized, "/")
	if normalized == "" {
		return ""
	}

	if normalized == "runtime" {
		return ""
	}
	if strings.HasPrefix(normalized, "runtime/") {
		return strings.TrimPrefix(normalized, "runtime/")
	}

	return normalized
}

func archiveEntryIsDir(file *zip.File) bool {
	if file == nil {
		return false
	}

	if file.FileInfo().IsDir() {
		return true
	}

	return strings.HasSuffix(file.Name, "/") || strings.HasSuffix(file.Name, "\\")
}
