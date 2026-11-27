package server

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/srd"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// What Pocket Search, Pocket Day and Pocket Hub ask Quest (the capabilities
// value in links.go): one route each, in the shape every Pocket app answers
// in. They read what /search, /day and /home read, as the request's person,
// and change nothing. The game master's secrets are never in an answer.

// dots joins the parts of a line that are there: "Cleric 3 · Hill Dwarf".
func dots(parts ...string) string { return joinNonEmpty(" · ", parts...) }

// nameList: "Thora", "Thora and Kael", "Thora, Kael and Brim".
func nameList(names []string) string {
	switch len(names) {
	case 0:
		return ""
	case 1:
		return names[0]
	}
	return strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1]
}

// levelLine is a character's class and level as the sheet shows it:
// "Cleric 3", "Fighter 3 · Wizard 2", or "Level 2" before a class is picked.
func levelLine(c store.Character) string {
	if strings.TrimSpace(c.Classes) != "" {
		return c.Classes
	}
	return fmt.Sprintf("Level %d", c.Level)
}

// nightTitle names a game night as its page does: "Session 3 · The seventh level".
func nightTitle(x store.Session) string {
	return dots(fmt.Sprintf("Session %d", x.Number), x.Title)
}

// codexKinds are the codex kinds in plain words.
var codexKinds = map[string]string{"npc": "person", "place": "place", "faction": "faction", "item": "item", "lore": "lore", "handout": "handout"}

// questStatus is a quest's state in plain words.
var questStatus = map[string]string{"rumour": "Rumour", "active": "Open", "done": "Done", "failed": "Failed"}

// srdKinds are the rules content kinds in plain words, and the compendium
// page each one opens on.
var srdKinds = map[string][2]string{
	"monster":    {"monster", "/compendium/monsters/srd:"},
	"spell":      {"spell", "/compendium/spells/"},
	"magic_item": {"magic item", "/compendium/magic-items/"},
	"equipment":  {"equipment", "/compendium/equipment/"},
	"condition":  {"condition", "/compendium/conditions/"},
	"rule":       {"rule", "/compendium/rules/"},
}

// ---------- search ----------

// pocketSearch answers Pocket Search: the person's campaigns, characters,
// game nights, codex, quests and encounters, found by the same fields as
// /search, then the rules content (monsters, spells, items, conditions,
// rules) by name, which /search also covers. A name that has the words comes
// first, then the person's other matches, then the rules.
func (s *Server) pocketSearch(r *http.Request, q string, limit int) ([]core.SearchItem, error) {
	if !strings.ContainsFunc(q, func(c rune) bool { return unicode.IsLetter(c) || unicode.IsDigit(c) }) {
		return nil, nil
	}
	ctx := r.Context()
	uid := actorID(ctx)
	lq := strings.ToLower(q)
	has := func(parts ...string) bool {
		for _, p := range parts {
			if strings.Contains(strings.ToLower(p), lq) {
				return true
			}
		}
		return false
	}
	// a name that is the words or starts with them, a name that has them, then the rest
	score := func(name string) float64 {
		n := strings.ToLower(strings.TrimSpace(name))
		switch {
		case n == lq || strings.HasPrefix(n, lq):
			return 5
		case strings.Contains(n, lq):
			return 4
		}
		return 3
	}
	out := []core.SearchItem{}
	camps, err := s.store.ListCampaigns(ctx, uid)
	if err != nil {
		return nil, err
	}
	for _, c := range camps {
		if has(c.Name, c.Tagline, c.World) {
			out = append(out, core.SearchItem{ID: "campaign:" + itoa(c.ID), Title: c.Name, Kind: "campaign", Snippet: firstNonEmpty(c.Tagline, c.World),
				Date: c.UpdatedAt, URL: fmt.Sprintf("/campaigns/%d", c.ID), Score: score(c.Name)})
		}
	}
	chars, err := s.store.ListCharacters(ctx, uid, store.CharacterFilter{})
	if err != nil {
		return nil, err
	}
	for _, c := range chars {
		if has(c.Name, c.Player, c.Classes, c.Species) {
			out = append(out, core.SearchItem{ID: "character:" + itoa(c.ID), Title: c.Name, Kind: "character", Snippet: dots(levelLine(c), c.Species, c.CampaignName),
				Date: c.UpdatedAt, URL: fmt.Sprintf("/characters/%d", c.ID), Score: score(c.Name)})
		}
	}
	nights, err := s.store.ListSessions(ctx, uid, store.SessionFilter{Desc: true})
	if err != nil {
		return nil, err
	}
	for _, x := range nights {
		if has(x.Title, x.Recap) {
			out = append(out, core.SearchItem{ID: "night:" + itoa(x.ID), Title: dots(fmt.Sprintf("Session %d", x.Number), firstNonEmpty(x.Title, x.CampaignName)),
				Kind: "game night", Snippet: dots(x.CampaignName, niceDate(x.Date)), Date: x.Date, URL: s.sessionPath(&x), Score: score(x.Title)})
		}
	}
	entries, err := s.store.ListEntries(ctx, uid, 0, "", false)
	if err != nil {
		return nil, err
	}
	campName := map[int64]string{}
	for _, c := range camps {
		campName[c.ID] = c.Name
	}
	for _, e := range entries {
		if has(e.Name, e.Subtitle, e.Body) {
			out = append(out, core.SearchItem{ID: "codex:" + itoa(e.ID), Title: e.Name, Kind: firstNonEmpty(codexKinds[e.Kind], "codex entry"),
				Snippet: dots(e.Subtitle, campName[e.CampaignID]), Date: e.UpdatedAt, URL: fmt.Sprintf("/campaigns/%d/codex/%d", e.CampaignID, e.ID), Score: score(e.Name)})
		}
	}
	quests, err := s.store.ListQuests(ctx, uid, 0, false)
	if err != nil {
		return nil, err
	}
	for _, x := range quests {
		if has(x.Title, x.Summary) {
			out = append(out, core.SearchItem{ID: "quest:" + itoa(x.ID), Title: x.Title, Kind: "quest", Snippet: dots(questStatus[x.Status], campName[x.CampaignID]),
				Date: x.UpdatedAt, URL: fmt.Sprintf("/campaigns/%d?tab=quests", x.CampaignID), Score: score(x.Title)})
		}
	}
	encs, err := s.store.ListEncounters(ctx, uid, store.EncounterFilter{})
	if err != nil {
		return nil, err
	}
	for _, e := range encs {
		if has(e.Name, e.Place) {
			out = append(out, core.SearchItem{ID: "encounter:" + itoa(e.ID), Title: e.Name, Kind: "encounter", Snippet: dots(e.Place, e.CampaignName),
				Date: e.UpdatedAt, URL: fmt.Sprintf("/encounters/%d", e.ID), Score: score(e.Name)})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	if len(out) >= limit {
		return out[:limit], nil
	}
	// the rules content after everything of the person's own, in its own order
	for _, h := range srd.Search(q, limit-len(out)) {
		k, ok := srdKinds[h.Kind]
		if !ok {
			continue
		}
		out = append(out, core.SearchItem{ID: h.Kind + ":" + h.Key, Title: h.Name, Kind: k[0], Snippet: h.Line, URL: k[1] + h.Key, Score: 1})
	}
	return out, nil
}

// ---------- day ----------

// pocketDay answers Pocket Day: the game nights held or planned that day,
// as /day lists them (called-off ones left out), with who came to the ones
// that were played. Game nights are kept as plain local dates and times, so
// the time zone is not used.
func (s *Server) pocketDay(r *http.Request, date string, _ *time.Location) (*core.Day, error) {
	ctx := r.Context()
	uid := actorID(ctx)
	list, err := s.store.ListSessions(ctx, uid, store.SessionFilter{From: date, To: date})
	if err != nil {
		return nil, err
	}
	var names map[int64]string
	day := &core.Day{Date: date}
	played, planned := 0, 0
	for _, x := range list {
		if x.Status == "cancelled" {
			continue
		}
		it := core.DayItem{ID: itoa(x.ID), Time: x.Time, Title: nightTitle(x), Kind: x.Status, URL: s.sessionPath(&x)}
		if t, err := time.Parse("15:04", x.Time); err == nil && x.Minutes > 0 {
			if end := t.Add(time.Duration(x.Minutes) * time.Minute); end.Day() == t.Day() {
				it.End = end.Format("15:04")
			}
		}
		var came []string
		if x.Status == "played" {
			played++
			it.Done, it.Minutes = true, float64(x.Minutes)
			it.Note = clip(strings.Join(strings.Fields(x.Recap), " "), 300)
			if len(x.Attendance) > 0 && names == nil {
				names = map[int64]string{}
				chars, err := s.store.ListCharacters(ctx, uid, store.CharacterFilter{})
				if err != nil {
					return nil, err
				}
				for _, c := range chars {
					names[c.ID] = c.Name
				}
			}
			for _, id := range x.Attendance {
				if n := names[id]; n != "" {
					came = append(came, n)
				}
			}
		} else {
			planned++
		}
		it.Sub = dots(x.CampaignName, nameList(came))
		day.Items = append(day.Items, it)
	}
	if len(day.Items) == 0 {
		return nil, nil
	}
	var parts []string
	if played > 0 {
		parts = append(parts, fmt.Sprintf("%d %s played", played, plural(played, "game night", "game nights")))
	}
	if planned > 0 {
		if played > 0 {
			parts = append(parts, fmt.Sprintf("%d planned", planned))
		} else {
			parts = append(parts, fmt.Sprintf("%d %s planned", planned, plural(planned, "game night", "game nights")))
		}
	}
	day.Summary = strings.Join(parts, ", ")
	return day, nil
}

// ---------- widget ----------

// whenWords says when a game night is, from today: "today", "tomorrow",
// "Friday" within the week, else "Fri 5 Dec".
func whenWords(date string) string {
	switch d := daysBetween(today(), date); {
	case d == 0:
		return "today"
	case d == 1:
		return "tomorrow"
	case d > 1 && d < 7:
		if t, err := store.ParseDate(date); err == nil {
			return t.Format("Monday")
		}
	}
	return niceDate(date)
}

// pocketWidget answers Pocket Hub: the next game night with its campaign,
// then the characters who came to the last game nights (or, before any was
// played, the ones changed last). Of the game nights it reads only the
// next one and the last three played. Someone with no campaign and no character gets nothing to show.
func (s *Server) pocketWidget(r *http.Request) (*core.WidgetData, error) {
	ctx := r.Context()
	uid := actorID(ctx)
	next, err := s.store.ListSessions(ctx, uid, store.SessionFilter{Status: "planned", From: today(), Limit: 1})
	if err != nil {
		return nil, err
	}
	chars, err := s.store.ListCharacters(ctx, uid, store.CharacterFilter{})
	if err != nil {
		return nil, err
	}
	w := &core.WidgetData{URL: "/"}
	if len(next) > 0 {
		x := next[0]
		w.Line = dots("Game night "+strings.TrimSpace(whenWords(x.Date)+" "+x.Time), x.CampaignName)
		w.URL = s.sessionPath(&x)
	} else if camps, err := s.store.ListCampaigns(ctx, uid); err != nil {
		return nil, err
	} else if len(camps) > 0 && camps[0].Status == "active" {
		w.Line = "No game night planned"
	}
	byID := map[int64]store.Character{}
	for _, c := range chars {
		byID[c.ID] = c
	}
	var shown []store.Character
	seen := map[int64]bool{}
	last, err := s.store.ListSessions(ctx, uid, store.SessionFilter{Status: "played", Desc: true, Limit: 3})
	if err != nil {
		return nil, err
	}
	for _, x := range last {
		for _, id := range x.Attendance {
			if c, ok := byID[id]; ok && !seen[id] && len(shown) < 6 {
				seen[id] = true
				shown = append(shown, c)
			}
		}
	}
	if len(shown) == 0 { // nothing played yet: the active characters changed last
		active := []store.Character{}
		for _, c := range chars {
			if c.Status == "active" {
				active = append(active, c)
			}
		}
		sort.SliceStable(active, func(i, j int) bool { return active[i].UpdatedAt > active[j].UpdatedAt })
		if len(active) > 6 {
			active = active[:6]
		}
		shown = active
	}
	for _, c := range shown {
		w.Items = append(w.Items, core.WidgetItem{ID: itoa(c.ID), Title: c.Name, Detail: dots(levelLine(c), c.CampaignName), URL: fmt.Sprintf("/characters/%d", c.ID)})
	}
	if w.Line == "" && len(w.Items) == 0 {
		return nil, nil
	}
	return w, nil
}
