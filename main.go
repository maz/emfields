package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	cl "github.com/maz/goodies/http/log"
	"github.com/maz/kvs"
	"html/template"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	urlpath "path"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

var store = kvs.NewSnappyKeyValueStore(NewBackingStore())
var safestderr = NewPrintableWriter(os.Stderr)

func init() {
	log.SetOutput(safestderr)
}

var root = filepath.Dir(os.Args[0])
var indexTemplate = template.Must(template.ParseFiles(filepath.Join(root, "index.html")))

func gencsrf(w http.ResponseWriter, req *http.Request) string {
	c, _ := req.Cookie("csrf") //This doesn't need to be uber-secure. It's only to try to prevent malicous sites from submitting fake entries
	if c != nil {
		return c.Value
	}
	buf := make([]byte, 64)
	rand.Read(buf)
	token := base64.URLEncoding.EncodeToString(buf)
	c = &http.Cookie{
		Name:     "csrf",
		Value:    token,
		HttpOnly: true,
		MaxAge:   3600 * 60,
	}
	http.SetCookie(w, c)
	return token
}

func genkey() string {
	const keyLength = 4
	const letters = "1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM"
	key := make([]byte, keyLength)
	rand.Read(key)
	for i := 0; i < keyLength; i++ {
		key[i] = letters[int(key[i])%len(letters)]
	}
	return string(key)
}

//A note on security. Aribitrary text may be stored in the key value store. It is not JSON-sanitized for simplicity. Instead, JSON libriares should be used to decode the text, instead of eval(), since it should not be trusted.
func indexHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	defer func() {
		x := recover()
		if x != nil {
			const size = 8192
			buf := make([]byte, size)
			log.Printf("500 internal server error on %q: %s\n%s", req.URL.Path, fmt.Sprint(x), string(buf[0:runtime.Stack(buf, false)]))
			// Delete all Headers (we don't want to set any bad cookies)
			w.Header().Del("Set-Cookie")
			// Say we've got an error
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("500 Internal Server Error"))
		}
	}()
	w.Header().Set("Cache-Control", "no-cache")
	csrf := gencsrf(w, req)
	if req.Method == "GET" {
		var value []byte = nil
		if req.RequestURI != "/" {
			var err error
			value, err = store.Get(strings.Replace(urlpath.Base(req.URL.Path), ".json", "", -1)) //this is a bit hackish, but it shouldn't be a problem
			if err != nil {
				if _, ok := err.(*kvs.KeyNotFoundError); !ok {
					panic(err)
				}
			}
		}
		if req.Header.Get("Accept") == "application/json" || urlpath.Ext(req.URL.Path) == ".json" {
			//DON'T EXTEND THIS TO JSON-P!!
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			if value == nil {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte("null"))
			} else {
				w.Write(value)
			}
		} else {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			if value == nil && req.RequestURI != "/" {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte("404 File Not Found"))
			} else {
				m := make(map[string]interface{})
				m["csrf"] = csrf
				if value == nil {
					m["value"] = "null"
				} else {
					m["value"] = string(value)
				}
				if req.URL.RawQuery == "shared" {
					m["shared"] = fmt.Sprintf("http://%s%s", req.Host, req.URL.Path)
				} else {
					m["shared"] = nil
				}
				err := indexTemplate.Execute(w, m)
				if err != nil {
					panic(err)
				}
			}
		}
	} else if req.Method == "POST" && req.RequestURI == "/" {
		if req.FormValue("csrf") == csrf {
			val := req.FormValue("value")
			key := genkey()
			err := store.Set(key, []byte(val))
			if err != nil {
				panic(err)
			}
			if req.Header.Get("Accept") == "text/plain" {
				w.Write([]byte(key))
			} else {
				http.Redirect(w, req, "/"+key+"?shared", http.StatusFound)
			}
		} else {
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte("Invalid CSRF Token"))
		}
	} else {
		w.WriteHeader(http.StatusMethodNotAllowed)
		w.Write([]byte("405: Method not Allowed"))
	}
}

func main() {
	defer func() {
		store.Close()
		log.Println("Closed Database")
	}()

	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Join(root, "static")))))
	http.Handle("/", http.HandlerFunc(indexHandler))

	addr := ":" + os.Getenv("PORT")
	if addr == ":" {
		addr = ":8080"
	}
	server := &http.Server{Addr: addr, Handler: cl.NewCommonLogHandler(log.New(safestderr, "", 0), GzippingHandler(http.DefaultServeMux))}
	l, err := net.Listen("tcp", addr)
	if err != nil {
		log.Panic(err)
	}
	defer l.Close()
	log.Printf("Listening on %q\n", addr)
	go func() {
		e := server.Serve(l)
		if e != nil {
			log.Panic(err)
		}
	}()
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGTERM, syscall.SIGINT)
	sig := <-c
	log.Printf("Recieved signal %q, terminating...\n", sig.String())
}
