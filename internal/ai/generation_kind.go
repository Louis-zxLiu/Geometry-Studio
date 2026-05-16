package ai

import "path/filepath"

type GenerationKind string

const (
	GenerationKindVisualize GenerationKind = "visualize"
	GenerationKindDesign    GenerationKind = "design"
)

func normalizeGenerationKind(kind GenerationKind) GenerationKind {
	if kind == GenerationKindDesign {
		return GenerationKindDesign
	}

	return GenerationKindVisualize
}

func resolvePromptPath(mode ServiceMode, kind GenerationKind) string {
	filename := "custom.txt"
	if mode == ModeSubscription {
		filename = "subscription.txt"
	}

	if normalizeGenerationKind(kind) == GenerationKindDesign {
		return filepath.Join("design", filename)
	}

	return filename
}
