package instancelock

import "net"

type Lock struct {
	listener net.Listener
}

func Acquire() (*Lock, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:49152")
	if err != nil {
		return nil, err
	}

	return &Lock{listener: listener}, nil
}

func (l *Lock) Release() error {
	if l == nil || l.listener == nil {
		return nil
	}

	err := l.listener.Close()
	l.listener = nil
	return err
}
