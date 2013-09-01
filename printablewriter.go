package main

import (
	"bytes"
	"fmt"
	"io"
	"sync"
	"unicode"
)

type PrintableWriter struct {
	backing io.Writer
	lock    sync.Mutex
}

func NewPrintableWriter(backing io.Writer) *PrintableWriter {
	return &PrintableWriter{backing: backing}
}

func (w *PrintableWriter) Write(data []byte) (int, error) {
	buf := bytes.NewBuffer(make([]byte, 0, len(data))) //Allocate a slice with the capacity for the original data, since it's unlikely that we will have bad characters
	for _, r := range string(data) {
		if unicode.IsPrint(r) || unicode.IsSpace(r) {
			buf.WriteRune(r)
		} else {
			buf.WriteString(fmt.Sprintf("<%d>", int(r)))
		}
	}
	w.lock.Lock()
	defer w.lock.Unlock()
	return w.backing.Write(buf.Bytes())
}
