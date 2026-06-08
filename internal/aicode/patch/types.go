package patch

type ChangedLineRange struct {
	StartLine int `json:"startLine"`
	EndLine   int `json:"endLine"`
}

type ApplyResult struct {
	Code          string             `json:"code"`
	ChangedRanges []ChangedLineRange `json:"changedRanges"`
}

type RepairPatchBlock struct {
	Before string
	After  string
}
