package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/notify"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// pushes runs every minute; at each person's hour it reminds them of the
// game nights tomorrow (once per game night and day).
func (s *Server) pushes(ctx context.Context) {
	now := time.Now()
	if now.Minute() > 10 {
		return
	}
	ids, err := s.store.SettingsUsers(ctx)
	if err != nil {
		return
	}
	tomorrow := store.AddDays(today(), 1)
	for _, uid := range ids {
		st, err := s.store.GetSettings(ctx, uid)
		if err != nil || st.NotifyURL == "" || !st.NotifySessions || now.Hour() != st.NotifyHour {
			continue
		}
		list, err := s.store.ListSessions(ctx, uid, store.SessionFilter{Status: "planned", From: tomorrow, To: tomorrow})
		if err != nil {
			continue
		}
		for _, x := range list {
			if x.Reminded == today() {
				continue
			}
			title, body := s.sessionReminder(ctx, uid, &x)
			if s.push(ctx, uid, st, title, body, s.link(fmt.Sprintf("/campaigns/%d/sessions/%d", x.CampaignID, x.ID))) {
				s.store.MarkReminded(ctx, uid, x.ID, today())
			}
		}
	}
}

// sessionReminder is the message about a game night coming up.
func (s *Server) sessionReminder(ctx context.Context, uid int64, x *store.Session) (string, string) {
	title := "Game night tomorrow: " + x.CampaignName
	var b strings.Builder
	fmt.Fprintf(&b, "Session %d", x.Number)
	if x.Title != "" {
		b.WriteString(" · " + x.Title)
	}
	if x.Time != "" {
		b.WriteString(" at " + x.Time)
	}
	b.WriteString(".")
	if c, err := s.store.GetCampaign(ctx, uid, x.CampaignID); err == nil && c.Place != "" {
		b.WriteString(" At " + c.Place + ".")
	}
	if plan := strings.TrimSpace(x.Plan); plan != "" {
		b.WriteString("\nYour prep: " + clip(firstLine(plan), 160))
	}
	return title, b.String()
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return s
}

// once is true the first time it is asked for a key.
func (s *Server) once(ctx context.Context, key string) bool {
	if _, _, done := s.store.CacheGet(ctx, key); done {
		return false
	}
	_ = s.store.CachePut(ctx, key, "1")
	return true
}

// push sends one message to a person's own notification address.
func (s *Server) push(ctx context.Context, uid int64, st store.Settings, title, body, link string) bool {
	if st.NotifyURL == "" {
		return false
	}
	n := notify.New(st.NotifyURL, st.NotifyFormat)
	if err := n.Send(ctx, notify.Message{Title: title, Body: body, Priority: "info", Tags: []string{"game_die"}, Link: link}); err != nil {
		s.log.Warn("notify failed", "user", uid, "err", err)
		return false
	}
	return true
}

func (s *Server) handleNotifyTest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	st, _ := s.store.GetSettings(ctx, actorID(ctx))
	n := notify.New(st.NotifyURL, st.NotifyFormat)
	if err := n.Send(ctx, notify.Message{Title: "Pocket Quest", Body: notifyTestBody, Priority: "info", Tags: []string{"game_die"}}); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

const notifyTestBody = "Notifications work. You get a reminder the day before a game night, and a note when a character has the experience for a new level."
