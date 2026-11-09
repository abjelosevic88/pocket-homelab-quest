package server

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

var (
	reTime  = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
	reColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	reKey   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
)

// userErr is a reason the person can act on (400, not 502).
type userErr struct{ msg string }

func (e *userErr) Error() string { return e.msg }

// today is the local day (the box's zone).
func today() string { return time.Now().Format("2006-01-02") }

func (s *Server) settingsOf(ctx context.Context, uid int64) store.Settings {
	st, _ := s.store.GetSettings(ctx, uid)
	return st
}

func (s *Server) userFail(w http.ResponseWriter, err error, what string) {
	var ue *userErr
	if errors.As(err, &ue) {
		writeErr(w, http.StatusBadRequest, ue.msg)
		return
	}
	if isNotConnected(err) {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	s.fail(w, err, what)
}

// link is a page of Quest as a full address (for messages and events).
func (s *Server) link(path string) string {
	return strings.TrimRight(s.cfg.BaseURL, "/") + path
}

func niceDate(d string) string {
	t, err := store.ParseDate(d)
	if err != nil {
		return d
	}
	return t.Format("Mon 2 Jan")
}

func daysBetween(a, b string) int {
	ta, e1 := store.ParseDate(a)
	tb, e2 := store.ParseDate(b)
	if e1 != nil || e2 != nil {
		return 0
	}
	return int(math.Round(tb.Sub(ta).Hours() / 24))
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func photoURL(id *int64) (string, string) {
	if id == nil || *id == 0 {
		return "", ""
	}
	u := fmt.Sprintf("/api/v1/photos/%d", *id)
	return u, u + "?thumb=1"
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// sourceOf is who adds a row: the acting app for a link token, "" here.
func sourceOf(ctx context.Context) string { return linkApp(ctx) }

// mayChange says whether the caller may change a row with this source: a
// link token only what its own app added.
func mayChange(ctx context.Context, source string) bool {
	app := linkApp(ctx)
	return app == "" || app == source
}

// ownRef checks an optional id the person sends (nil and 0 = none).
func ownRef(id *int64, owns func(int64) bool) (*int64, bool) {
	if id == nil || *id == 0 {
		return nil, true
	}
	if !owns(*id) {
		return nil, false
	}
	return id, true
}

// text limits for what people type
const (
	maxName  = 120
	maxLine  = 300
	maxNotes = 40000
)

func cleanText(v string, n int) string { return clip(strings.TrimSpace(v), n) }

// setStr applies a PATCH-style string field.
func setStr(keys map[string]bool, k string, dst *string, v *string, n int) {
	if keys[k] && v != nil {
		*dst = cleanText(*v, n)
	}
}
