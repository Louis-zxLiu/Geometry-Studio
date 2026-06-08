package runstate

func NormalizeExecutionResult(result ExecutionResult) *NormalizedRunFailure {
	switch result.Status {
	case ExecutionStatusReady:
		return nil
	case ExecutionStatusInterrupted:
		return &NormalizedRunFailure{
			Kind:       FailureKindInterrupted,
			ErrorText:  defaultErrorText(result.ErrorText, "已中断 AI 检查"),
			Repairable: false,
		}
	case ExecutionStatusFinished:
		return &NormalizedRunFailure{
			Kind:       FailureKindNoReady,
			ErrorText:  defaultErrorText(result.ErrorText, "Python 进程已结束，但没有弹出可视化窗口"),
			Repairable: true,
		}
	default:
		return &NormalizedRunFailure{
			Kind:       FailureKindRunError,
			ErrorText:  defaultErrorText(result.ErrorText, "Python 进程异常退出"),
			Repairable: true,
		}
	}
}

func defaultErrorText(value string, fallback string) string {
	if value == "" {
		return fallback
	}

	return value
}
