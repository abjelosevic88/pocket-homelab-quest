package server

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/names"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/srd"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// The built-in rules content. Lists come without long descriptions; a
// whole file (classes, species, features… what the character builder
// needs) goes out as stored, gzipped.

var srdFiles = map[string]bool{"classes": true, "races": true, "backgrounds": true, "traits": true, "features": true, "skills": true, "proficiencies": true,
	"languages": true, "alignments": true, "schools": true, "weapon_props": true, "conditions": true, "damage_types": true, "equipment": true, "equip_cats": true,
	"feats": true, "rules": true}

func (s *Server) handleSRDFile(w http.ResponseWriter, r *http.Request) {
	kind := chiParam(r, "kind")
	if !srdFiles[kind] {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	gz, _ := srd.Gz(kind)
	etag := `"` + Version + "-" + kind + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Vary", "Accept-Encoding")
	if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(gz)
		return
	}
	zr, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		s.fail(w, err, "srd")
		return
	}
	defer zr.Close()
	_, _ = io.Copy(w, zr)
}

// monsterRow is a monster in the list: built in or the person's own.
type monsterRow struct {
	srd.MonsterSummary
	Mine bool `json:"mine,omitempty"`
}

func (s *Server) handleSRDMonsters(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	out := []monsterRow{}
	mine, _ := s.store.ListCreatures(ctx, actorID(ctx))
	for _, c := range mine {
		var m srd.Monster
		_ = json.Unmarshal(c.Data, &m)
		m.Key, m.Name = fmt.Sprintf("my:%d", c.ID), c.Name
		out = append(out, monsterRow{MonsterSummary: m.Summary(), Mine: true})
	}
	for _, m := range srd.MonsterSummaries() {
		m.Key = "srd:" + m.Key
		out = append(out, monsterRow{MonsterSummary: m})
	}
	writeJSON(w, http.StatusOK, map[string]any{"monsters": out})
}

func (s *Server) handleSRDMonster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ref := chiParam(r, "key")
	if u, err := pathUnescape(ref); err == nil {
		ref = u
	}
	if !strings.Contains(ref, ":") {
		ref = "srd:" + ref
	}
	m, err := s.monsterFor(ctx, actorID(ctx), ref)
	if err != nil {
		s.fail(w, err, "monster")
		return
	}
	out := *m
	if strings.HasPrefix(out.Key, "srd:") || !strings.Contains(out.Key, ":") {
		out.Key = "srd:" + strings.TrimPrefix(out.Key, "srd:")
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleSRDSpells(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, max-age=3600")
	writeJSON(w, http.StatusOK, map[string]any{"spells": srd.SpellSummaries()})
}

func (s *Server) handleSRDSpell(w http.ResponseWriter, r *http.Request) {
	sp, ok := srd.SpellByKey(chiParam(r, "key"))
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, sp)
}

func (s *Server) handleSRDMagic(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, max-age=3600")
	writeJSON(w, http.StatusOK, map[string]any{"items": srd.MagicSummaries()})
}

func (s *Server) handleSRDMagicItem(w http.ResponseWriter, r *http.Request) {
	m, ok := srd.MagicItemByKey(chiParam(r, "key"))
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// ---- search: your own things first, then the rules ----

type searchHit struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
	Name string `json:"name"`
	Line string `json:"line"`
	URL  string `json:"url"`
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	limit := clampInt(queryInt(r, "limit"), 0, 100)
	if limit == 0 {
		limit = 30
	}
	out := []searchHit{}
	if q == "" {
		writeJSON(w, http.StatusOK, map[string]any{"results": out})
		return
	}
	has := func(parts ...string) bool {
		for _, p := range parts {
			if strings.Contains(strings.ToLower(p), q) {
				return true
			}
		}
		return false
	}
	if list, err := s.store.ListCampaigns(ctx, uid); err == nil {
		for _, c := range list {
			if has(c.Name, c.Tagline, c.World) {
				out = append(out, searchHit{"campaign", itoa(c.ID), c.Name, firstNonEmpty(c.Tagline, c.World), fmt.Sprintf("/campaigns/%d", c.ID)})
			}
		}
	}
	if list, err := s.store.ListCharacters(ctx, uid, store.CharacterFilter{}); err == nil {
		for _, c := range list {
			if has(c.Name, c.Player, c.Classes, c.Species) {
				out = append(out, searchHit{"character", itoa(c.ID), c.Name, joinNonEmpty(" · ", c.Species, c.Classes), fmt.Sprintf("/characters/%d", c.ID)})
			}
		}
	}
	if list, err := s.store.ListEntries(ctx, uid, 0, "", false); err == nil {
		for _, e := range list {
			if has(e.Name, e.Subtitle, e.Body) {
				out = append(out, searchHit{e.Kind, itoa(e.ID), e.Name, firstNonEmpty(e.Subtitle, kindWord(e.Kind)), fmt.Sprintf("/campaigns/%d/codex/%d", e.CampaignID, e.ID)})
			}
		}
	}
	if list, err := s.store.ListQuests(ctx, uid, 0, false); err == nil {
		for _, x := range list {
			if has(x.Title, x.Summary) {
				out = append(out, searchHit{"quest", itoa(x.ID), x.Title, "Quest · " + x.Status, fmt.Sprintf("/campaigns/%d/quests?open=%d", x.CampaignID, x.ID)})
			}
		}
	}
	if list, err := s.store.ListSessions(ctx, uid, store.SessionFilter{Desc: true}); err == nil {
		for _, x := range list {
			if has(x.Title, x.Recap) {
				out = append(out, searchHit{"session", itoa(x.ID), fmt.Sprintf("Session %d · %s", x.Number, firstNonEmpty(x.Title, x.CampaignName)), niceDate(x.Date), s.sessionPath(&x)})
			}
		}
	}
	if list, err := s.store.ListEncounters(ctx, uid, store.EncounterFilter{}); err == nil {
		for _, e := range list {
			if has(e.Name, e.Place) {
				out = append(out, searchHit{"encounter", itoa(e.ID), e.Name, firstNonEmpty(e.Place, "Encounter"), fmt.Sprintf("/encounters/%d", e.ID)})
			}
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	for _, h := range srd.Search(q, limit-len(out)) {
		path := map[string]string{"monster": "/compendium/monsters/srd:", "spell": "/compendium/spells/", "magic_item": "/compendium/magic-items/",
			"equipment": "/compendium/equipment/", "condition": "/compendium/conditions/", "rule": "/compendium/rules/"}[h.Kind]
		out = append(out, searchHit{h.Kind, h.Key, h.Name, h.Line, path + h.Key})
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": out})
}

func (s *Server) sessionPath(x *store.Session) string {
	return fmt.Sprintf("/campaigns/%d/sessions/%d", x.CampaignID, x.ID)
}

func kindWord(k string) string {
	return map[string]string{"npc": "Person", "place": "Place", "faction": "Faction", "item": "Item", "lore": "Lore", "handout": "Handout"}[k]
}

// ---- names ----

func (s *Server) handleNames(w http.ResponseWriter, r *http.Request) {
	kind := firstNonEmpty(r.URL.Query().Get("kind"), "human")
	if !oneOf(kind, names.Species) && kind != "tavern" && kind != "place" {
		writeErr(w, http.StatusBadRequest, "names are for a species, a tavern or a place")
		return
	}
	n := clampInt(queryInt(r, "n"), 1, 30)
	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	writeJSON(w, http.StatusOK, map[string]any{"names": names.Make(rnd, kind, n), "kind": kind})
}

// ---- the table today ----

// handleHome is the first page: the campaign at hand, the next game
// night, the party's health, the open quests, a fight in progress.
func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	st := s.settingsOf(ctx, uid)
	camps, err := s.store.ListCampaigns(ctx, uid)
	if err != nil {
		s.fail(w, err, "home")
		return
	}
	for i := range camps {
		s.decorateCampaign(&camps[i])
		if linkApp(ctx) != "" { // another app never sees the game master's secrets
			camps[i].Secrets = ""
		}
	}
	var cur *store.Campaign
	want := st.Campaign
	if q := int64(queryInt(r, "campaign")); q > 0 {
		want = q
	}
	for i := range camps {
		if camps[i].ID == want {
			cur = &camps[i]
		}
	}
	if cur == nil && len(camps) > 0 {
		cur = &camps[0]
	}
	out := map[string]any{"campaigns": camps, "campaign": cur, "today": today()}
	chars, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{Status: "active"})
	for i := range chars {
		s.decorateCharacter(&chars[i])
	}
	out["characters"] = len(chars)
	if cur != nil {
		party := []store.Character{}
		for _, c := range chars {
			if c.CampaignID != nil && *c.CampaignID == cur.ID {
				party = append(party, c)
			}
		}
		out["party"] = party
		next, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{CampaignID: cur.ID, Status: "planned", From: today(), Limit: 3})
		last, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{CampaignID: cur.ID, Status: "played", Desc: true, Limit: 1})
		out["next"], out["last"] = next, last
		quests, _ := s.store.ListQuests(ctx, uid, cur.ID, false)
		open := []store.Quest{}
		for _, q := range quests {
			if q.Status == "active" && len(open) < 6 {
				open = append(open, q)
			}
		}
		out["quests"] = open
		pinned, _ := s.store.ListEntries(ctx, uid, cur.ID, "", false)
		pins := []store.Entry{}
		for _, e := range pinned {
			if e.Pinned && len(pins) < 6 {
				s.decorateEntry(&e)
				pins = append(pins, e)
			}
		}
		out["pinned"] = pins
		if e, err := s.store.RunningEncounter(ctx, uid, cur.ID); err == nil {
			turn := ""
			if len(e.State.Combatants) > 0 {
				turn = e.State.Combatants[e.State.Turn].Name
			}
			out["fight"] = map[string]any{"id": e.ID, "name": e.Name, "round": e.State.Round, "turn": turn, "count": len(e.State.Combatants)}
		}
		planned, _ := s.store.ListEncounters(ctx, uid, store.EncounterFilter{CampaignID: cur.ID, Status: "plan"})
		if len(planned) > 4 {
			planned = planned[:4]
		}
		levels := s.partyLevels(ctx, uid, cur.ID)
		prep := []map[string]any{}
		for _, e := range planned {
			d, _ := s.difficulty(ctx, uid, e.Plan, levels)
			prep = append(prep, map[string]any{"id": e.ID, "name": e.Name, "place": e.Place, "rating": d.Rating, "xp": d.XP})
		}
		out["prepared"] = prep
	} else {
		out["party"], out["next"], out["last"], out["quests"], out["pinned"], out["prepared"] = []any{}, []any{}, []any{}, []any{}, []any{}, []any{}
	}
	rolls, _ := s.store.ListRolls(ctx, uid, 0, 6)
	out["rolls"] = rolls
	writeJSON(w, http.StatusOK, out)
}

// handleSummary is the short version for other apps (Pocket Day, AI, search).
func (s *Server) handleSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	camps, _ := s.store.ListCampaigns(ctx, uid)
	upcoming, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{Status: "planned", From: today(), To: store.AddDays(today(), 30)})
	recent, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{Status: "played", Desc: true, Limit: 3})
	chars, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{Status: "active"})
	type charLine struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Line     string `json:"line"`
		HP       string `json:"hp"`
		Campaign string `json:"campaign"`
		URL      string `json:"url"`
	}
	cl := []charLine{}
	for _, c := range chars {
		cl = append(cl, charLine{c.ID, c.Name, joinNonEmpty(" · ", c.Species, c.Classes, fmt.Sprintf("level %d", c.Level)), fmt.Sprintf("%d/%d", c.HPCur, c.HPMax), c.CampaignName, s.link(fmt.Sprintf("/characters/%d", c.ID))})
	}
	line := func(x store.Session, recap bool) sessLine {
		l := sessLine{x.ID, x.CampaignName, x.Number, x.Title, x.Date, x.Time, "", s.sessionLink(&x)}
		if recap {
			l.Recap = clip(x.Recap, 600)
		}
		return l
	}
	up, re := []sessLine{}, []sessLine{}
	for _, x := range upcoming {
		up = append(up, line(x, false))
	}
	for _, x := range recent {
		re = append(re, line(x, true))
	}
	active := []map[string]any{}
	for _, c := range camps {
		if c.Status == "active" {
			active = append(active, map[string]any{"id": c.ID, "name": c.Name, "party": c.Party, "party_level": c.PartyLevel, "sessions": c.Sessions,
				"next_session": c.NextSession, "open_quests": c.OpenQuests, "url": s.link(fmt.Sprintf("/campaigns/%d", c.ID))})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"campaigns": active, "upcoming": up, "recent": re, "characters": cl,
		"text": s.summaryText(active, up, cl)})
}

func (s *Server) summaryText(camps []map[string]any, up []sessLine, chars any) string {
	n := len(camps)
	if n == 0 {
		return "No campaign running yet."
	}
	t := fmt.Sprintf("%d %s running.", n, plural(n, "campaign", "campaigns"))
	if len(up) > 0 {
		x := up[0]
		t += fmt.Sprintf(" Next game night: %s, session %d, %s", x.Campaign, x.Number, niceDate(x.Date))
		if x.Time != "" {
			t += " at " + x.Time
		}
		t += "."
	}
	return t
}

type sessLine struct {
	ID       int64  `json:"id"`
	Campaign string `json:"campaign"`
	Number   int    `json:"number"`
	Title    string `json:"title"`
	Date     string `json:"date"`
	Time     string `json:"time"`
	Recap    string `json:"recap,omitempty"`
	URL      string `json:"url"`
}

// handleDay is what happens on a date (for Pocket Day): game nights then.
func (s *Server) handleDay(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	date := chiParam(r, "date")
	if !validDate(date) || date == "" {
		writeErr(w, http.StatusBadRequest, "a date is like 2026-11-20")
		return
	}
	list, _ := s.store.ListSessions(ctx, actorID(ctx), store.SessionFilter{From: date, To: date})
	items := []map[string]any{}
	for _, x := range list {
		if x.Status == "cancelled" {
			continue
		}
		items = append(items, map[string]any{"title": fmt.Sprintf("%s · session %d", x.CampaignName, x.Number), "subtitle": x.Title, "time": x.Time, "status": x.Status,
			"recap": clip(x.Recap, 600), "url": s.sessionLink(&x)})
	}
	writeJSON(w, http.StatusOK, map[string]any{"date": date, "sessions": items})
}
