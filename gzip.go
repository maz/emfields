package main

import (
	"compress/gzip"
	"net/http"
	"strings"
)

type gzipResponseWriter struct {
	w      http.ResponseWriter
	z      *gzip.Writer
	Status int
}

func (g *gzipResponseWriter) Header() http.Header {
	return g.w.Header()
}

func (g *gzipResponseWriter) WriteHeader(status int) {
	g.Status = status
	g.w.WriteHeader(status)
}

func (g *gzipResponseWriter) Write(data []byte) (int, error) {
	return g.z.Write(data)
}

func (g *gzipResponseWriter) close() {
	if err := g.z.Close(); err != nil {
		panic(err)
	}
}

func GzippingHandler(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method == "HEAD" {
			handler.ServeHTTP(w, req)
			return
		}
		gzip_found := false
		for _, header := range req.Header[http.CanonicalHeaderKey("Accept-Encoding")] {
			for _, encoding := range strings.Split(header, ",") {
				if encoding == "gzip" {
					gzip_found = true
					break
				}
			}
			if gzip_found {
				break
			}
		}
		if gzip_found {
			w.Header().Set("Content-Encoding", "gzip")
			z, _ := gzip.NewWriterLevel(w, gzip.BestSpeed)
			gzrw := &gzipResponseWriter{w, z, 200}
			handler.ServeHTTP(gzrw, req)
			if gzrw.Status != http.StatusNotModified {
				//This shouldn't have a body
				gzrw.close()
			}
		} else {
			handler.ServeHTTP(w, req)
		}
	})
}
