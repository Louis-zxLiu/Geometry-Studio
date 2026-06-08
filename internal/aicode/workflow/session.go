package workflow

import "context"

type sessionEntry struct {
	cancel  context.CancelFunc
	session Session
}
