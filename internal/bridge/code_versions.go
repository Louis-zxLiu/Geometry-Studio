package bridge

import "plotkitycat/internal/codeversions"

func (a *App) ListCodeAIVersions(sceneName string) ([]CodeAIVersion, error) {
	versions, err := a.codeVersionStore.List(sceneName)
	if err != nil {
		return nil, err
	}

	return mapCodeAIVersions(versions), nil
}

func (a *App) CreateCodeAIVersion(request CreateCodeAIVersionRequest) (CodeAIVersion, error) {
	version, err := a.codeVersionStore.Create(request.SceneName, request.Note, request.Code)
	if err != nil {
		return CodeAIVersion{}, err
	}

	return mapCodeAIVersion(version), nil
}

func (a *App) DeleteCodeAIVersion(sceneName string, id string) ([]CodeAIVersion, error) {
	versions, err := a.codeVersionStore.Delete(sceneName, id)
	if err != nil {
		return nil, err
	}

	return mapCodeAIVersions(versions), nil
}

func mapCodeAIVersions(versions []codeversions.Version) []CodeAIVersion {
	mapped := make([]CodeAIVersion, 0, len(versions))
	for _, version := range versions {
		mapped = append(mapped, mapCodeAIVersion(version))
	}

	return mapped
}

func mapCodeAIVersion(version codeversions.Version) CodeAIVersion {
	return CodeAIVersion{
		ID:        version.ID,
		Label:     version.Label,
		Note:      version.Note,
		Code:      version.Code,
		CreatedAt: version.CreatedAt,
	}
}
