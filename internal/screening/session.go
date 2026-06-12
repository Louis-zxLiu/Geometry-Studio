package screening

import "errors"

var errSessionInactive = errors.New("放映会话未激活")

func normalizeStartRequest(request StartRequest) ([]string, int, int, Animation, error) {
	sceneNames := normalizeSceneNames(request.SceneNames)
	if len(sceneNames) == 0 {
		return nil, 0, 0, "", errors.New("至少选择一个场景才能开始放映")
	}

	poolSize := request.PoolSize
	if poolSize <= 0 {
		poolSize = 3
	}

	startIndex := request.StartIndex
	if startIndex < 0 || startIndex >= len(sceneNames) {
		startIndex = 0
	}

	animation := request.Animation
	if animation == "" {
		animation = AnimationCrossfade
	}

	return sceneNames, startIndex, poolSize, animation, nil
}

func (s *Service) targetIndicesLocked() []int {
	limit := s.currentIndex + s.poolSize
	if limit > len(s.sceneNames) {
		limit = len(s.sceneNames)
	}
	indices := make([]int, 0, limit-s.currentIndex)
	for index := s.currentIndex; index < limit; index++ {
		indices = append(indices, index)
	}
	return indices
}

func (s *Service) stateLocked() SessionState {
	state := SessionState{
		Active:       s.active,
		SceneNames:   append([]string(nil), s.sceneNames...),
		CurrentIndex: s.currentIndex,
		PoolSize:     s.poolSize,
		Animation:    string(s.animation),
	}
	if s.active && s.currentIndex >= 0 && s.currentIndex < len(s.sceneNames) {
		state.CurrentSceneName = s.sceneNames[s.currentIndex]
	}
	return state
}

func normalizeSceneNames(items []string) []string {
	result := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		if item == "" {
			continue
		}
		if _, exists := seen[item]; exists {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	return result
}

func entryWindow(entry *poolEntry) uintptr {
	if entry == nil {
		return 0
	}
	return entry.hwnd
}
