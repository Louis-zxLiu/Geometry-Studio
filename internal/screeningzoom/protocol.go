package screeningzoom

type Rect struct {
	Left   int32 `json:"left"`
	Top    int32 `json:"top"`
	Right  int32 `json:"right"`
	Bottom int32 `json:"bottom"`
}

type command struct {
	Type       string `json:"type"`
	TargetHWND uint64 `json:"targetHwnd,omitempty"`
	Rect       *Rect  `json:"rect,omitempty"`
}

type Status struct {
	Available  bool
	Running    bool
	HelperPath string
	TargetHWND uintptr
}
