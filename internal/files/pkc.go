package files

import (
	"archive/zip"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (s *Store) ExportScenePackage(sceneName string, targetPath string) error {
	scenePath, err := s.scenePath(sceneName)
	if err != nil {
		return err
	}

	if _, err := os.Stat(filepath.Join(scenePath, sceneMainFile)); err != nil {
		return err
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

	return filepath.WalkDir(scenePath, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == scenePath {
			return nil
		}

		relativePath, err := filepath.Rel(filepath.Dir(scenePath), path)
		if err != nil {
			return err
		}

		zipPath := filepath.ToSlash(relativePath)
		if entry.IsDir() {
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

func (s *Store) ImportScenePackage(archivePath string) (string, error) {
	tempDir, err := os.MkdirTemp("", "plotkitycat-pkc-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tempDir)

	if err := unzipArchive(archivePath, tempDir); err != nil {
		return "", err
	}

	extractedSceneDir, suggestedSceneName, err := resolveImportedScene(tempDir, archivePath)
	if err != nil {
		return "", err
	}

	scriptsDir, err := s.ensureScriptsDir()
	if err != nil {
		return "", err
	}

	targetName := s.nextAvailableSceneName(normalizeSceneName(suggestedSceneName))
	targetPath := filepath.Join(scriptsDir, targetName)
	if err := copyDirectory(extractedSceneDir, targetPath); err != nil {
		return "", err
	}

	return targetName, nil
}

func (s *Store) nextAvailableSceneName(baseName string) string {
	name := normalizeSceneName(baseName)
	if name == "" {
		name = "untitled"
	}

	dir, err := s.ensureScriptsDir()
	if err != nil {
		return name
	}

	if _, err := os.Stat(filepath.Join(dir, name)); os.IsNotExist(err) {
		return name
	}

	for index := 2; ; index++ {
		candidate := fmt.Sprintf("%s 副本%d", name, index)
		if _, err := os.Stat(filepath.Join(dir, candidate)); os.IsNotExist(err) {
			return candidate
		}
	}
}

func unzipArchive(archivePath string, destination string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	for _, file := range reader.File {
		targetPath := filepath.Join(destination, filepath.FromSlash(file.Name))
		cleanDestination := filepath.Clean(destination)
		cleanTarget := filepath.Clean(targetPath)
		if cleanTarget != cleanDestination && !strings.HasPrefix(cleanTarget, cleanDestination+string(filepath.Separator)) {
			return fmt.Errorf("archive contains invalid path")
		}

		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}

		sourceFile, err := file.Open()
		if err != nil {
			return err
		}

		targetFile, err := os.Create(targetPath)
		if err != nil {
			sourceFile.Close()
			return err
		}

		_, copyErr := io.Copy(targetFile, sourceFile)
		closeErr := targetFile.Close()
		sourceCloseErr := sourceFile.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if sourceCloseErr != nil {
			return sourceCloseErr
		}
	}

	return nil
}

func resolveImportedScene(root string, archivePath string) (string, string, error) {
	rootMain := filepath.Join(root, sceneMainFile)
	if _, err := os.Stat(rootMain); err == nil {
		return root, strings.TrimSuffix(filepath.Base(archivePath), filepath.Ext(archivePath)), nil
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return "", "", err
	}

	var directories []string
	for _, entry := range entries {
		if entry.IsDir() {
			directories = append(directories, entry.Name())
		}
	}
	sort.Strings(directories)

	for _, name := range directories {
		sceneDir := filepath.Join(root, name)
		if _, err := os.Stat(filepath.Join(sceneDir, sceneMainFile)); err == nil {
			return sceneDir, name, nil
		}
	}

	return "", "", fmt.Errorf("未在 .pkc 包中找到 main.py")
}

func copyDirectory(source string, destination string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		relativePath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if relativePath == "." {
			return os.MkdirAll(destination, 0o755)
		}

		targetPath := filepath.Join(destination, relativePath)
		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0o755)
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}

		sourceFile, err := os.Open(path)
		if err != nil {
			return err
		}

		targetFile, err := os.Create(targetPath)
		if err != nil {
			sourceFile.Close()
			return err
		}

		_, err = io.Copy(targetFile, sourceFile)
		sourceCloseErr := sourceFile.Close()
		targetCloseErr := targetFile.Close()
		if err != nil {
			return err
		}
		if sourceCloseErr != nil {
			return sourceCloseErr
		}
		if targetCloseErr != nil {
			return targetCloseErr
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}

		return os.Chmod(targetPath, info.Mode())
	})
}
