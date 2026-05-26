package designcards

import (
	"os"
	"path/filepath"
	"testing"
)

type stubSceneDirResolver struct {
	root string
}

func (s stubSceneDirResolver) SceneDir(sceneName string) (string, error) {
	return filepath.Join(s.root, sceneName), nil
}

func TestStoreCreateAndVersion(t *testing.T) {
	tempDir := t.TempDir()
	sceneDir := filepath.Join(tempDir, "scene-a")
	if err := os.MkdirAll(sceneDir, 0o755); err != nil {
		t.Fatalf("mkdir scene: %v", err)
	}

	store := NewStore(stubSceneDirResolver{root: tempDir})

	card, err := store.Create("scene-a", "函数关系", "print('plan')", "<svg><text>layout</text></svg>")
	if err != nil {
		t.Fatalf("create card: %v", err)
	}
	if card.Meta.ID != "card-001" {
		t.Fatalf("unexpected card id: %s", card.Meta.ID)
	}

	version, err := store.CreateVersion("scene-a", card.Meta.ID, "优化", "next plan", "<svg><rect /></svg>")
	if err != nil {
		t.Fatalf("create version: %v", err)
	}
	if version.Label != "版本01" {
		t.Fatalf("unexpected version label: %s", version.Label)
	}

	versions, err := store.ListVersions("scene-a", card.Meta.ID)
	if err != nil {
		t.Fatalf("list versions: %v", err)
	}
	if len(versions) != 1 {
		t.Fatalf("unexpected version count: %d", len(versions))
	}

	stored, err := store.Get("scene-a", card.Meta.ID)
	if err != nil {
		t.Fatalf("get card: %v", err)
	}
	if stored.Meta.Title != "函数关系" {
		t.Fatalf("unexpected title: %s", stored.Meta.Title)
	}
}

func TestStorePlacements(t *testing.T) {
	tempDir := t.TempDir()
	sceneDir := filepath.Join(tempDir, "scene-a")
	if err := os.MkdirAll(sceneDir, 0o755); err != nil {
		t.Fatalf("mkdir scene: %v", err)
	}

	store := NewStore(stubSceneDirResolver{root: tempDir})
	card, err := store.Create("scene-a", "方案", "plan", "<svg />")
	if err != nil {
		t.Fatalf("create card: %v", err)
	}

	placements, err := store.SavePlacements("scene-a", []Placement{
		{CardID: card.Meta.ID, AfterLine: 8},
		{CardID: card.Meta.ID, AfterLine: 12},
		{CardID: "", AfterLine: 1},
		{CardID: "card-999", AfterLine: -2},
	})
	if err != nil {
		t.Fatalf("save placements: %v", err)
	}
	if len(placements) != 2 {
		t.Fatalf("unexpected placement count: %d", len(placements))
	}
	if placements[1].AfterLine != 0 {
		t.Fatalf("expected negative line to clamp to 0, got %d", placements[1].AfterLine)
	}

	stored, err := store.ListPlacements("scene-a")
	if err != nil {
		t.Fatalf("list placements: %v", err)
	}
	if len(stored) != 2 || stored[0].CardID != card.Meta.ID {
		t.Fatalf("unexpected stored placements: %#v", stored)
	}

	if err := store.Delete("scene-a", card.Meta.ID); err != nil {
		t.Fatalf("delete card: %v", err)
	}
	remaining, err := store.ListPlacements("scene-a")
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(remaining) != 1 || remaining[0].CardID == card.Meta.ID {
		t.Fatalf("expected deleted card placement cleanup, got %#v", remaining)
	}
}
