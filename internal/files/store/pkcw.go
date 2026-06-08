package store

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"

	"plotkitycat/internal/workspaces"
)

const workspacePackageManifestPath = "manifest.json"

type workspacePackageManifest struct {
	FormatVersion int      `json:"formatVersion"`
	Kind          string   `json:"kind"`
	Workspaces    []string `json:"workspaces"`
}

func (s *Store) ExportWorkspacePackage(workspaceNames []string, targetPath string) error {
	names := normalizeWorkspacePackageNames(workspaceNames)
	if len(names) == 0 {
		return fmt.Errorf("当前没有可导出的工作区")
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}

	file, err := os.Create(targetPath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := zip.NewWriter(file)
	defer writer.Close()

	manifestData, err := json.MarshalIndent(workspacePackageManifest{
		FormatVersion: 1,
		Kind:          "plotkitycat-workspace-package",
		Workspaces:    names,
	}, "", "  ")
	if err != nil {
		return err
	}

	manifestWriter, err := writer.Create(workspacePackageManifestPath)
	if err != nil {
		return err
	}
	if _, err := manifestWriter.Write(manifestData); err != nil {
		return err
	}

	for _, name := range names {
		workspaceDir, err := s.workspaces.WorkspaceDir(name)
		if err != nil {
			return err
		}
		if err := writeDirectoryToZip(writer, workspaceDir, filepath.ToSlash(filepath.Join("workspaces", name))); err != nil {
			return err
		}
	}

	return nil
}

func (s *Store) ImportWorkspacePackage(archivePath string) ([]string, error) {
	tempDir, err := os.MkdirTemp("", "plotkitycat-pkcw-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tempDir)

	if err := unzipArchive(archivePath, tempDir); err != nil {
		return nil, err
	}

	manifest, err := readWorkspacePackageManifest(filepath.Join(tempDir, workspacePackageManifestPath))
	if err != nil {
		return nil, err
	}

	imported := make([]string, 0, len(manifest.Workspaces))
	for _, name := range manifest.Workspaces {
		sourceDir := filepath.Join(tempDir, "workspaces", name)
		info, err := os.Stat(sourceDir)
		if err != nil {
			return nil, err
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("工作区 %q 不是有效目录", name)
		}

		resolvedName, targetDir, err := s.workspaces.ReserveWorkspaceImport(name)
		if err != nil {
			return nil, err
		}
		if err := copyDirectory(sourceDir, targetDir); err != nil {
			_ = os.RemoveAll(targetDir)
			return nil, err
		}
		imported = append(imported, resolvedName)
	}

	return imported, nil
}

func normalizeWorkspacePackageNames(workspaceNames []string) []string {
	normalized := make([]string, 0, len(workspaceNames))
	seen := make(map[string]struct{}, len(workspaceNames))
	for _, name := range workspaceNames {
		cleanName := workspaces.NormalizeName(name)
		if cleanName == "" {
			continue
		}
		if _, exists := seen[cleanName]; exists {
			continue
		}
		seen[cleanName] = struct{}{}
		normalized = append(normalized, cleanName)
	}
	sort.Strings(normalized)
	return normalized
}

func readWorkspacePackageManifest(path string) (workspacePackageManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return workspacePackageManifest{}, err
	}

	var manifest workspacePackageManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return workspacePackageManifest{}, err
	}
	if manifest.Kind != "plotkitycat-workspace-package" {
		return workspacePackageManifest{}, fmt.Errorf("不是有效的 .pkcw 工作区包")
	}

	names := normalizeWorkspacePackageNames(manifest.Workspaces)
	if len(names) == 0 {
		return workspacePackageManifest{}, fmt.Errorf(".pkcw 工作区包中没有可导入的工作区")
	}
	manifest.Workspaces = names
	return manifest, nil
}

func writeDirectoryToZip(writer *zip.Writer, sourceDir string, zipRoot string) error {
	return filepath.WalkDir(sourceDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		relativePath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}
		zipPath := zipRoot
		if relativePath != "." {
			zipPath = filepath.ToSlash(filepath.Join(zipRoot, relativePath))
		}

		if entry.IsDir() {
			if zipPath == "" {
				return nil
			}
			_, err := writer.Create(zipPath + "/")
			return err
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = zipPath
		header.Method = zip.Deflate

		targetWriter, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}

		sourceFile, err := os.Open(path)
		if err != nil {
			return err
		}
		_, err = io.Copy(targetWriter, sourceFile)
		closeErr := sourceFile.Close()
		if err != nil {
			return err
		}
		return closeErr
	})
}
