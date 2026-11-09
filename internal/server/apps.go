package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/pocket"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// The other Pocket apps: game nights on Pocket Calendar, recaps in Pocket
// Notes, news for the party in Pocket Chat, prep in Pocket Tasks. None of
// it is needed: when an app is not there, the page greys the button and
// says what to do.

func linkTo(sib *siblingConn, path string) string {
	if sib == nil || sib.public == "" {
		return ""
	}
	return strings.TrimRight(sib.public, "/") + path
}

// plainErr is an app's error in a line.
func plainErr(a pocketApp, err error) string {
	if isNotConnected(err) {
		return err.Error()
	}
	return a.name + ": " + err.Error()
}

// ---- Pocket Calendar ----

func (s *Server) calendarEvent(ctx context.Context, uid int64, st store.Settings, x *store.Session) pocket.Event {
	title := fmt.Sprintf("%s · session %d", x.CampaignName, x.Number)
	if x.Title != "" {
		title += ": " + x.Title
	}
	place := ""
	if c, err := s.store.GetCampaign(ctx, uid, x.CampaignID); err == nil {
		place = c.Place
	}
	start := x.Date
	if x.Time != "" {
		start = x.Date + "T" + x.Time
	}
	desc := "Game night in Pocket Quest: " + s.sessionLink(x)
	return pocket.Event{CalendarID: st.CalendarID, Title: title, Description: desc, Location: place, URL: s.sessionLink(x), Start: start, Minutes: x.Minutes}
}

// syncCalendar keeps a game night's event in step: added when it is planned
// (if the person wants that), moved when it moves, removed when called off.
func (s *Server) syncCalendar(ctx context.Context, uid int64, x *store.Session) {
	st := s.settingsOf(ctx, uid)
	if x.Status == "cancelled" {
		if x.CalendarRef != "" {
			_ = s.removeFromCalendar(ctx, uid, x)
		}
		return
	}
	if x.CalendarRef == "" && (!st.AutoCalendar || x.Status != "planned" || x.Date < today()) {
		return
	}
	if _, err := s.putInCalendar(ctx, uid, st, x); err != nil {
		s.log.Debug("calendar: game night not synced", "user", uid, "session", x.ID, "err", err)
	}
}

func (s *Server) putInCalendar(ctx context.Context, uid int64, st store.Settings, x *store.Session) (string, error) {
	sib, err := s.clients(ctx, uid).conn(ctx, appCalendar, scopeCalendarWrite)
	if err != nil {
		return "", err
	}
	ev := s.calendarEvent(ctx, uid, st, x)
	if x.CalendarRef != "" {
		id, _ := strconv.ParseInt(x.CalendarRef, 10, 64)
		err := sib.client.UpdateEvent(ctx, id, ev)
		if err == nil {
			return x.CalendarURL, nil
		}
		if !errors.Is(err, pocket.ErrNotFound) {
			return "", err
		}
	}
	id, err := sib.client.CreateEvent(ctx, ev)
	if err != nil {
		return "", err
	}
	x.CalendarRef, x.CalendarURL = itoa(id), linkTo(sib, "/?event="+itoa(id))
	if err := s.store.UpdateGameSession(ctx, x); err != nil {
		return "", err
	}
	return x.CalendarURL, nil
}

func (s *Server) removeFromCalendar(ctx context.Context, uid int64, x *store.Session) error {
	sib, err := s.clients(ctx, uid).conn(ctx, appCalendar, scopeCalendarWrite)
	if err != nil {
		return err
	}
	id, _ := strconv.ParseInt(x.CalendarRef, 10, 64)
	if err := sib.client.DeleteEvent(ctx, id); err != nil {
		return err
	}
	x.CalendarRef, x.CalendarURL = "", ""
	return s.store.UpdateGameSession(ctx, x)
}

// handleSessionCalendar puts a game night on the calendar or takes it off.
func (s *Server) handleSessionCalendar(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	x, err := s.store.GetSession(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	var in struct {
		On bool `json:"on"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if !in.On {
		if x.CalendarRef != "" {
			if err := s.removeFromCalendar(ctx, uid, x); err != nil {
				s.userFail(w, err, "calendar")
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "text": "Taken off your calendar"})
		return
	}
	u, err := s.putInCalendar(ctx, uid, s.settingsOf(ctx, uid), x)
	if err != nil {
		s.userFail(w, err, "calendar")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "url": u, "text": "On your calendar"})
}

// handleCalendars lists the calendars game nights can go to.
func (s *Server) handleCalendars(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sib, err := s.clients(ctx, actorID(ctx)).conn(ctx, appCalendar, scopeCalendarRead)
	if err != nil {
		s.userFail(w, err, "calendar")
		return
	}
	list, err := sib.client.Calendars(ctx)
	if err != nil {
		writeErr(w, http.StatusBadGateway, plainErr(appCalendar, err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"calendars": list})
}

// handleBusy is what else is on around a date (to pick a game night).
func (s *Server) handleBusy(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	date := r.URL.Query().Get("date")
	if date == "" || !validDate(date) {
		writeErr(w, http.StatusBadRequest, "a date is like 2026-11-20")
		return
	}
	sib, err := s.clients(ctx, actorID(ctx)).conn(ctx, appCalendar, scopeCalendarRead)
	if err != nil {
		s.userFail(w, err, "calendar")
		return
	}
	list, err := sib.client.Events(ctx, date, date)
	if err != nil {
		writeErr(w, http.StatusBadGateway, plainErr(appCalendar, err))
		return
	}
	out := []map[string]any{}
	for _, e := range list {
		if strings.Contains(e.Title, "· session ") { // our own
			continue
		}
		out = append(out, map[string]any{"title": e.Title, "start": e.Start, "end": e.End, "all_day": e.AllDay})
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": out})
}

// ---- Pocket Notes ----

func (s *Server) toNotes(ctx context.Context, uid int64, title, content string) (string, error) {
	sib, err := s.clients(ctx, uid).conn(ctx, appNotes, scopeNotesWrite)
	if err != nil {
		return "", err
	}
	folder := firstNonEmpty(s.settingsOf(ctx, uid).NotesFolder, "Quest")
	res, err := postJSONTo(ctx, sib, "/api/v1/notes", map[string]any{"title": clip(title, 200), "content": content, "category": folder})
	if err != nil {
		return "", fmt.Errorf("Pocket Notes: %w", err)
	}
	return linkTo(sib, "/notes/"+idOf(res)), nil
}

// handleSaveNote saves text as a note (a recap, prep, a backstory).
func (s *Server) handleSaveNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var in struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.Content) == "" {
		writeErr(w, http.StatusBadRequest, "nothing to save")
		return
	}
	u, err := s.toNotes(ctx, actorID(ctx), firstNonEmpty(strings.TrimSpace(in.Title), "Quest"), clip(in.Content, 50000))
	if err != nil {
		s.userFail(w, err, "notes")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "url": u, "text": "Saved in Pocket Notes"})
}

// sessionNote is a game night written out for Notes (prep is the game
// master's own, so it goes in too).
func (s *Server) sessionNote(x *store.Session, withPrep bool) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s · session %d", x.CampaignName, x.Number)
	if x.Title != "" {
		b.WriteString(": " + x.Title)
	}
	fmt.Fprintf(&b, "\n\n%s\n\n", niceDate(x.Date))
	if x.Recap != "" {
		b.WriteString("## What happened\n\n" + x.Recap + "\n\n")
	}
	if x.Loot != "" {
		b.WriteString("## Treasure\n\n" + x.Loot + "\n\n")
	}
	if x.XP > 0 {
		fmt.Fprintf(&b, "Experience: %d XP each.\n\n", x.XP)
	}
	if withPrep && x.Plan != "" {
		b.WriteString("## Prep\n\n" + x.Plan + "\n\n")
	}
	if withPrep && x.Notes != "" {
		b.WriteString("## Notes\n\n" + x.Notes + "\n\n")
	}
	b.WriteString("From Pocket Quest: " + s.sessionLink(x) + "\n")
	return b.String()
}

func (s *Server) handleSessionNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	x, err := s.store.GetSession(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	title := fmt.Sprintf("%s · session %d", x.CampaignName, x.Number)
	if x.Title != "" {
		title += ": " + x.Title
	}
	u, err := s.toNotes(ctx, uid, title, s.sessionNote(x, true))
	if err != nil {
		s.userFail(w, err, "notes")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "url": u, "text": "Saved in Pocket Notes"})
}

// ---- Pocket Tasks ----

// handleSessionTasks turns the lines of a game night's prep into tasks due the day before.
func (s *Server) handleSessionTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	x, err := s.store.GetSession(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	var in struct {
		Lines []string `json:"lines"`
	}
	_ = decode(r, &in)
	lines := in.Lines
	if len(lines) == 0 {
		for _, l := range strings.Split(x.Plan, "\n") {
			l = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(l), "-*•[] "))
			if l != "" && !strings.HasPrefix(l, "#") {
				lines = append(lines, l)
			}
		}
	}
	if len(lines) == 0 {
		writeErr(w, http.StatusBadRequest, "write your prep first, one thing a line")
		return
	}
	if len(lines) > 20 {
		lines = lines[:20]
	}
	sib, err := s.clients(ctx, uid).conn(ctx, appTasks, scopeTasksWrite)
	if err != nil {
		s.userFail(w, err, "tasks")
		return
	}
	due := store.AddDays(x.Date, -1)
	if due < today() {
		due = today()
	}
	n := 0
	for _, l := range lines {
		if _, err := sib.client.CreateTask(ctx, clip(l, 200), fmt.Sprintf("Prep for %s · session %d", x.CampaignName, x.Number), due, s.sessionLink(x)); err != nil {
			if n == 0 {
				writeErr(w, http.StatusBadGateway, plainErr(appTasks, err))
				return
			}
			break
		}
		n++
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "n": n, "url": linkTo(sib, "/"), "text": fmt.Sprintf("%d %s in Pocket Tasks", n, plural(n, "task", "tasks"))})
}

// ---- Pocket Chat ----

func (s *Server) handleChats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sib, err := s.clients(ctx, actorID(ctx)).conn(ctx, appChat, scopeChatRead)
	if err != nil {
		s.userFail(w, err, "chat")
		return
	}
	v, err := getJSONFrom(ctx, sib, "/api/v1/conversations", nil)
	if err != nil {
		writeErr(w, http.StatusBadGateway, plainErr(appChat, err))
		return
	}
	out := []map[string]any{}
	for _, m := range rows(v, "conversations") {
		if m["archived"] == true {
			continue
		}
		out = append(out, map[string]any{"id": idOf(m), "name": firstNonEmpty(str(m, "name"), str(m, "title")), "kind": str(m, "kind"), "emoji": str(m, "emoji")})
	}
	writeJSON(w, http.StatusOK, map[string]any{"conversations": out})
}

// handleShareChat posts a card to the party's chat: the next game night,
// a recap, a handout, a character or a quest.
func (s *Server) handleShareChat(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		To          string `json:"to"`
		Text        string `json:"text"`
		SessionID   int64  `json:"session_id"`
		What        string `json:"what"` // invite | recap (for a session)
		EntryID     int64  `json:"entry_id"`
		CharacterID int64  `json:"character_id"`
		QuestID     int64  `json:"quest_id"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	st := s.settingsOf(ctx, uid)
	var card map[string]any
	text := strings.TrimSpace(in.Text)
	switch {
	case in.SessionID > 0:
		x, err := s.store.GetSession(ctx, uid, in.SessionID)
		if err != nil {
			s.fail(w, err, "session")
			return
		}
		title := fmt.Sprintf("%s · session %d", x.CampaignName, x.Number)
		if in.What == "recap" {
			card = map[string]any{"title": "Last time: " + firstNonEmpty(x.Title, title), "subtitle": title, "lines": firstLines(x.Recap, 6), "icon": "📜"}
			text = firstNonEmpty(text, "The recap of our last game night.")
		} else {
			when := niceDate(x.Date)
			if x.Time != "" {
				when += " at " + x.Time
			}
			card = map[string]any{"title": firstNonEmpty(x.Title, title), "subtitle": title, "lines": []string{when}, "icon": "🎲"}
			text = firstNonEmpty(text, "Next game night: "+when+". Who's in?")
		}
		card["url"] = s.playerLinkOr(ctx, uid, x.CampaignID, s.sessionLink(x))
	case in.EntryID > 0:
		e, err := s.store.GetEntry(ctx, uid, in.EntryID)
		if err != nil {
			s.fail(w, err, "entry")
			return
		}
		card = map[string]any{"title": e.Name, "subtitle": firstNonEmpty(e.Subtitle, kindWord(e.Kind)), "lines": firstLines(e.Body, 6), "icon": "🗺️", "url": s.playerLinkOr(ctx, uid, e.CampaignID, "")}
		text = firstNonEmpty(text, "For the party: "+e.Name)
	case in.CharacterID > 0:
		c, err := s.store.GetCharacter(ctx, uid, in.CharacterID)
		if err != nil {
			s.fail(w, err, "character")
			return
		}
		link := ""
		if c.ShareOn {
			link = s.link("/c/" + c.ShareToken)
		}
		card = map[string]any{"title": c.Name, "subtitle": joinNonEmpty(" · ", c.Species, c.Classes), "lines": []string{fmt.Sprintf("Level %d · AC %d · %d hit points", c.Level, c.AC, c.HPMax)}, "icon": "🛡️", "url": link}
		text = firstNonEmpty(text, "Meet "+c.Name+".")
	case in.QuestID > 0:
		q, err := s.store.GetQuest(ctx, uid, in.QuestID)
		if err != nil {
			s.fail(w, err, "quest")
			return
		}
		lines := []string{}
		for _, o := range q.Objectives {
			mark := "○ "
			if o.Done {
				mark = "● "
			}
			lines = append(lines, mark+o.Text)
		}
		card = map[string]any{"title": q.Title, "subtitle": "Quest · " + q.Status, "lines": append(firstLines(q.Summary, 2), lines...), "icon": "🧭", "url": s.playerLinkOr(ctx, uid, q.CampaignID, "")}
		text = firstNonEmpty(text, "Quest log: "+q.Title)
	default:
		writeErr(w, http.StatusBadRequest, "pick what to share")
		return
	}
	card["app"], card["kind"] = "quest", "card"
	sib, err := s.clients(ctx, uid).conn(ctx, appChat, scopeChatWrite)
	if err != nil {
		s.userFail(w, err, "chat")
		return
	}
	body := map[string]any{"to": firstNonEmpty(strings.TrimSpace(in.To), st.ChatTo, "me"), "text": clip(text, 2000), "card": card,
		"client_id": fmt.Sprintf("quest-%d-%d", uid, time.Now().Unix()/30)}
	res, err := postJSONTo(ctx, sib, "/api/v1/send", body)
	if err != nil {
		writeErr(w, http.StatusBadGateway, plainErr(appChat, err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "url": linkTo(sib, "/c/"+str(res, "conversation_id")), "text": "Sent to Pocket Chat"})
}

// playerLinkOr is the campaign's player link when it is on, else fallback.
func (s *Server) playerLinkOr(ctx context.Context, uid, campaignID int64, fallback string) string {
	if c, err := s.store.GetCampaign(ctx, uid, campaignID); err == nil && c.ShareOn {
		return s.playerURL(c)
	}
	return fallback
}

func firstLines(text string, n int) []string {
	out := []string{}
	for _, l := range strings.Split(text, "\n") {
		if l = strings.TrimSpace(l); l != "" && len(out) < n {
			out = append(out, clip(l, 200))
		}
	}
	return out
}

// handleApps lists how the person reaches each app, in words they can act on.
func (s *Server) handleApps(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	c := s.clients(ctx, actorID(ctx))
	out := []appState{}
	for _, a := range pocketApps {
		out = append(out, c.status(ctx, a))
	}
	writeJSON(w, http.StatusOK, map[string]any{"apps": out, "core": s.core.Configured()})
}
