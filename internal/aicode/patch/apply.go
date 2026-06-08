package patch

import (
	"errors"
	"regexp"
	"sort"
	"strings"
)

var repairBlockPattern = regexp.MustCompile(
	`>>>Acode[ \t]*\r?\n([\s\S]*?)\r?\n<<<Acode[ \t]*\r?\n>>>Bcode[ \t]*\r?\n([\s\S]*?)\r?\n<<<Bcode`,
)

func ApplyRepairPatch(currentCode string, patchText string) (ApplyResult, error) {
	normalizedCurrentCode := normalizeNewlines(currentCode)
	blocks, err := ParseRepairPatch(patchText)
	if err != nil {
		return ApplyResult{}, err
	}

	if err := validateRepairBlocks(normalizedCurrentCode, blocks); err != nil {
		return ApplyResult{}, err
	}

	type matchedBlock struct {
		block RepairPatchBlock
		start int
		end   int
	}

	matches := make([]matchedBlock, 0, len(blocks))
	for _, block := range blocks {
		start := strings.Index(normalizedCurrentCode, block.Before)
		matches = append(matches, matchedBlock{
			block: block,
			start: start,
			end:   start + len(block.Before),
		})
	}

	sort.Slice(matches, func(left int, right int) bool {
		return matches[left].start < matches[right].start
	})

	for index := 1; index < len(matches); index++ {
		if matches[index].start < matches[index-1].end {
			return ApplyResult{}, errors.New("AI 修复补丁存在重叠片段，请重试")
		}
	}

	nextCode := normalizedCurrentCode
	changedRanges := make([]ChangedLineRange, 0, len(matches))
	for index := len(matches) - 1; index >= 0; index-- {
		match := matches[index]
		nextCode = nextCode[:match.start] + match.block.After + nextCode[match.end:]
		changedRanges = append([]ChangedLineRange{{
			StartLine: lineNumberAt(normalizedCurrentCode, match.start),
			EndLine:   lineNumberAt(normalizedCurrentCode, match.end),
		}}, changedRanges...)
	}

	if strings.TrimSpace(nextCode) == "" {
		return ApplyResult{}, errors.New("AI 修复后的代码为空，已取消替换")
	}

	return ApplyResult{
		Code:          nextCode,
		ChangedRanges: changedRanges,
	}, nil
}

func ApplyGeneratedCode(currentCode string, generatedCode string) ApplyResult {
	normalizedCurrentCode := normalizeNewlines(currentCode)
	normalizedGeneratedCode := strings.TrimSpace(normalizeNewlines(generatedCode))
	if normalizedGeneratedCode == "" {
		return ApplyResult{
			Code:          normalizedCurrentCode,
			ChangedRanges: nil,
		}
	}

	prefix := buildGenerationPrefix(normalizedCurrentCode)
	nextCode := prefix + normalizedGeneratedCode
	startOffset := len(prefix)
	endOffset := len(nextCode)

	return ApplyResult{
		Code: nextCode,
		ChangedRanges: []ChangedLineRange{{
			StartLine: lineNumberAt(nextCode, startOffset),
			EndLine:   lineNumberAt(nextCode, endOffset),
		}},
	}
}

func ParseRepairPatch(patchText string) ([]RepairPatchBlock, error) {
	normalizedPatch := strings.TrimSpace(normalizeNewlines(patchText))
	matches := repairBlockPattern.FindAllStringSubmatchIndex(normalizedPatch, -1)
	if len(matches) == 0 {
		return nil, errors.New("AI 修复没有返回有效补丁")
	}

	blocks := make([]RepairPatchBlock, 0, len(matches))
	for _, match := range matches {
		blocks = append(blocks, RepairPatchBlock{
			Before: trimOneTrailingNewline(normalizedPatch[match[2]:match[3]]),
			After:  trimOneTrailingNewline(normalizedPatch[match[4]:match[5]]),
		})
	}

	if strings.TrimSpace(repairBlockPattern.ReplaceAllString(normalizedPatch, "")) != "" {
		return nil, errors.New("AI 修复补丁包含无法识别的内容，请重试")
	}

	return blocks, nil
}

func validateRepairBlocks(currentCode string, blocks []RepairPatchBlock) error {
	normalizedCode := normalizeNewlines(currentCode)
	for _, block := range blocks {
		if strings.TrimSpace(block.Before) == "" {
			return errors.New("AI 修复补丁缺少旧代码片段")
		}

		firstIndex := strings.Index(normalizedCode, block.Before)
		if firstIndex < 0 {
			return errors.New("AI 修复片段未能定位到当前代码，请重试")
		}

		secondIndex := strings.Index(normalizedCode[firstIndex+len(block.Before):], block.Before)
		if secondIndex >= 0 {
			return errors.New("AI 修复片段匹配到多处，请重试")
		}
	}

	return nil
}

func normalizeNewlines(value string) string {
	return strings.ReplaceAll(value, "\r\n", "\n")
}

func trimOneTrailingNewline(value string) string {
	return strings.TrimSuffix(normalizeNewlines(value), "\n")
}

func buildGenerationPrefix(currentCode string) string {
	normalizedCurrentCode := normalizeNewlines(currentCode)
	if strings.TrimSpace(normalizedCurrentCode) == "" {
		return ""
	}

	return strings.TrimRight(normalizedCurrentCode, "\n") + "\n\n\n"
}
