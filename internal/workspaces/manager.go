package workspaces

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type Manager struct {
	mu     sync.Mutex
	active string
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) EnsureReady() error {
	_, err := m.CurrentDir()
	return err
}

func (m *Manager) CurrentName() (string, error) {
	if _, err := m.CurrentDir(); err != nil {
		return "", err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	return m.active, nil
}

func (m *Manager) CurrentDir() (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	root, err := ensureRoot()
	if err != nil {
		return "", err
	}
	if err := migrateLegacyScenes(root); err != nil {
		return "", err
	}

	names, err := listWorkspaceNames(root)
	if err != nil {
		return "", err
	}
	if len(names) == 0 {
		if err := os.MkdirAll(filepath.Join(root, DefaultName), 0o755); err != nil {
			return "", err
		}
		names = []string{DefaultName}
	}

	if m.active == "" || !contains(names, m.active) {
		m.active = chooseInitialWorkspace(names)
	}

	return filepath.Join(root, m.active), nil
}

func (m *Manager) List() ([]Workspace, error) {
	root, err := scriptsRoot()
	if err != nil {
		return nil, err
	}
	if _, err := m.CurrentDir(); err != nil {
		return nil, err
	}

	return listWorkspaces(root)
}

func (m *Manager) Switch(name string) error {
	name = NormalizeName(name)
	if name == "" {
		return fmt.Errorf("workspace name is empty")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	root, err := scriptsRoot()
	if err != nil {
		return err
	}
	path := filepath.Join(root, name)
	if info, err := os.Stat(path); err != nil {
		return err
	} else if !info.IsDir() {
		return fmt.Errorf("workspace %q is not a directory", name)
	}

	m.active = name
	return nil
}

func (m *Manager) Create(name string) (Workspace, error) {
	name = NormalizeName(name)
	if name == "" {
		return Workspace{}, fmt.Errorf("workspace name is empty")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	root, err := ensureRoot()
	if err != nil {
		return Workspace{}, err
	}
	path := filepath.Join(root, name)
	if _, err := os.Stat(path); err == nil {
		return Workspace{}, fmt.Errorf("workspace %q already exists", name)
	} else if !os.IsNotExist(err) {
		return Workspace{}, err
	}

	if err := os.MkdirAll(path, 0o755); err != nil {
		return Workspace{}, err
	}

	m.active = name
	return Workspace{Name: name, SceneCount: 0}, nil
}

func (m *Manager) Rename(oldName string, newName string) (Workspace, error) {
	oldName = NormalizeName(oldName)
	newName = NormalizeName(newName)
	if oldName == "" || newName == "" {
		return Workspace{}, fmt.Errorf("workspace name is empty")
	}
	if oldName == newName {
		count, err := m.sceneCount(oldName)
		return Workspace{Name: newName, SceneCount: count}, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	root, err := scriptsRoot()
	if err != nil {
		return Workspace{}, err
	}
	oldPath := filepath.Join(root, oldName)
	newPath := filepath.Join(root, newName)
	if _, err := os.Stat(oldPath); err != nil {
		return Workspace{}, err
	}
	if _, err := os.Stat(newPath); err == nil {
		return Workspace{}, fmt.Errorf("workspace %q already exists", newName)
	} else if !os.IsNotExist(err) {
		return Workspace{}, err
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return Workspace{}, err
	}
	if m.active == oldName {
		m.active = newName
	}

	count, err := countScenes(newPath)
	if err != nil {
		return Workspace{}, err
	}
	return Workspace{Name: newName, SceneCount: count}, nil
}

func (m *Manager) Delete(name string) error {
	name = NormalizeName(name)
	if name == "" {
		return fmt.Errorf("workspace name is empty")
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if m.active == name {
		return fmt.Errorf("当前工作区不能删除，请先切换到其它工作区")
	}

	root, err := scriptsRoot()
	if err != nil {
		return err
	}
	return os.RemoveAll(filepath.Join(root, name))
}

func (m *Manager) sceneCount(name string) (int, error) {
	root, err := scriptsRoot()
	if err != nil {
		return 0, err
	}
	return countScenes(filepath.Join(root, name))
}
