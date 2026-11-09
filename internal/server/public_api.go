package server

import (
	"fmt"
	"net/http"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// The player view: a campaign's link (/p/<token>) shows the players what
// they may know — the party, the recaps, what the game master revealed of
// people, places and lore, the quest log, and the fight in progress — and
// never a secret. Off until the game master switches it on; a new link
// stops the old one.

type publicCharacter struct {
	ID       int64       `json:"id"`
	Name     string      `json:"name"`
	Player   string      `json:"player"`
	Kind     string      `json:"kind"`
	Species  string      `json:"species"`
	Classes  string      `json:"classes"`
	ClassKey string      `json:"class_key"`
	Level    int         `json:"level"`
	AC       int         `json:"ac"`
	HPMax    int         `json:"hp_max"`
	HPCur    int         `json:"hp_cur"`
	HPTemp   int         `json:"hp_temp"`
	PP       int         `json:"pp"`
	Status   string      `json:"status"`
	Token    store.Token `json:"token"`
	PhotoURL string      `json:"photo_url"`
	SheetURL string      `json:"sheet_url"`
}

type publicEntry struct {
	ID        int64    `json:"id"`
	Kind      string   `json:"kind"`
	Name      string   `json:"name"`
	Subtitle  string   `json:"subtitle"`
	Body      string   `json:"body"`
	Status    string   `json:"status"`
	Attitude  string   `json:"attitude"`
	PlaceName string   `json:"place_name"`
	Tags      []string `json:"tags"`
	PhotoURL  string   `json:"photo_url"`
}

type publicQuest struct {
	ID         int64             `json:"id"`
	Title      string            `json:"title"`
	Status     string            `json:"status"`
	Summary    string            `json:"summary"`
	Reward     string            `json:"reward"`
	GiverName  string            `json:"giver_name"`
	PlaceName  string            `json:"place_name"`
	Objectives []store.Objective `json:"objectives"`
}

type publicCombatant struct {
	ID         string   `json:"id"`
	Kind       string   `json:"kind"`
	Type       string   `json:"type,omitempty"`
	Name       string   `json:"name"`
	Init       int      `json:"init"`
	Health     string   `json:"health"` // healthy | hurt | bloodied | down | ""
	HP         *int     `json:"hp,omitempty"`
	HPMax      *int     `json:"hp_max,omitempty"`
	Conditions []string `json:"conditions"`
	Out        bool     `json:"out"`
	Color      string   `json:"color,omitempty"`
}

func healthWord(hp, max int) string {
	switch {
	case max <= 0:
		return ""
	case hp <= 0:
		return "down"
	case hp*2 <= max:
		return "bloodied"
	case hp < max:
		return "hurt"
	}
	return "healthy"
}

func (s *Server) handlePublicCampaign(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tok := chiParam(r, "token")
	c, err := s.store.CampaignByShare(ctx, tok)
	if err != nil {
		writeErr(w, http.StatusNotFound, "this link does not work (any more): ask your game master for a new one")
		return
	}
	uid := c.UserID
	st := s.settingsOf(ctx, uid)
	base := "/api/v1/public/p/" + tok + "/photos/"
	pu := func(id *int64) string {
		if id == nil {
			return ""
		}
		return fmt.Sprintf("%s%d", base, *id)
	}
	camp := map[string]any{"name": c.Name, "tagline": c.Tagline, "world": c.World, "summary": c.Summary, "emblem": c.Emblem, "color": c.Color,
		"photo_url": pu(c.PhotoID), "schedule": c.Schedule, "place": c.Place, "house_rules": c.HouseRules, "sessions": c.Sessions, "party_level": c.PartyLevel}
	chars, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{CampaignID: c.ID})
	party := []publicCharacter{}
	for _, ch := range chars {
		pc := publicCharacter{ID: ch.ID, Name: ch.Name, Player: ch.Player, Kind: ch.Kind, Species: ch.Species, Classes: ch.Classes, ClassKey: ch.ClassKey, Level: ch.Level,
			AC: ch.AC, HPMax: ch.HPMax, HPCur: ch.HPCur, HPTemp: ch.HPTemp, PP: ch.PP, Status: ch.Status, Token: ch.Token, PhotoURL: pu(ch.PhotoID)}
		if ch.ShareOn {
			pc.SheetURL = "/c/" + ch.ShareToken
		}
		party = append(party, pc)
	}
	sessions, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{CampaignID: c.ID, Desc: true})
	recaps := []map[string]any{}
	var next map[string]any
	for _, x := range sessions {
		switch x.Status {
		case "played":
			recaps = append(recaps, map[string]any{"id": x.ID, "number": x.Number, "title": x.Title, "date": x.Date, "recap": x.Recap, "loot": x.Loot, "xp": x.XP})
		case "planned":
			if x.Date >= today() {
				next = map[string]any{"number": x.Number, "title": x.Title, "date": x.Date, "time": x.Time}
			}
		}
	}
	entries, _ := s.store.ListEntries(ctx, uid, c.ID, "", true)
	codex := []publicEntry{}
	for _, e := range entries {
		codex = append(codex, publicEntry{ID: e.ID, Kind: e.Kind, Name: e.Name, Subtitle: e.Subtitle, Body: e.Body, Status: e.Status, Attitude: e.Attitude,
			PlaceName: e.PlaceName, Tags: e.Tags, PhotoURL: pu(e.PhotoID)})
	}
	qs, _ := s.store.ListQuests(ctx, uid, c.ID, true)
	quests := []publicQuest{}
	for _, q := range qs {
		quests = append(quests, publicQuest{ID: q.ID, Title: q.Title, Status: q.Status, Summary: q.Summary, Reward: q.Reward, GiverName: q.GiverName, PlaceName: q.PlaceName, Objectives: q.Objectives})
	}
	out := map[string]any{"campaign": camp, "party": party, "recaps": recaps, "next": next, "codex": codex, "quests": quests}
	if e, err := s.store.RunningEncounter(ctx, uid, c.ID); err == nil {
		list := []publicCombatant{}
		turn := ""
		for i, cb := range e.State.Combatants {
			if cb.Hidden {
				continue
			}
			if i == e.State.Turn {
				turn = cb.ID
			}
			pc := publicCombatant{ID: cb.ID, Kind: cb.Kind, Name: cb.Name, Init: cb.Init, Conditions: cb.Conditions, Out: cb.Out, Color: cb.Color}
			if cb.Kind != "pc" && cb.Ref != "" {
				if m, err := s.monsterFor(ctx, uid, cb.Ref); err == nil {
					pc.Type = m.Type
				}
			}
			if cb.Kind == "pc" || st.PlayerMonster == "numbers" {
				hp, hm := cb.HP, cb.HPMax
				pc.HP, pc.HPMax = &hp, &hm
			}
			if cb.Kind == "pc" || st.PlayerMonster != "hidden" {
				pc.Health = healthWord(cb.HP, cb.HPMax)
			}
			list = append(list, pc)
		}
		out["fight"] = map[string]any{"name": e.Name, "place": e.Place, "round": e.State.Round, "turn": turn, "combatants": list}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, out)
}

// handlePublicPhoto serves a picture the player view shows (only those).
func (s *Server) handlePublicPhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	c, err := s.store.CampaignByShare(ctx, chiParam(r, "token"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	id := idParam(r, "id")
	ok := c.PhotoID != nil && *c.PhotoID == id
	if !ok {
		chars, _ := s.store.ListCharacters(ctx, c.UserID, store.CharacterFilter{CampaignID: c.ID})
		for _, ch := range chars {
			if ch.PhotoID != nil && *ch.PhotoID == id {
				ok = true
			}
		}
	}
	if !ok {
		entries, _ := s.store.ListEntries(ctx, c.UserID, c.ID, "", true)
		for _, e := range entries {
			if e.PhotoID != nil && *e.PhotoID == id {
				ok = true
			}
		}
	}
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	p, err := s.store.GetPhoto(ctx, c.UserID, id, queryBool(r, "thumb"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	servePhoto(w, r, p)
}

// handlePublicCharacter is a character sheet someone shared (read only).
func (s *Server) handlePublicCharacter(w http.ResponseWriter, r *http.Request) {
	tok := chiParam(r, "token")
	c, err := s.store.CharacterByShare(r.Context(), tok)
	if err != nil {
		writeErr(w, http.StatusNotFound, "this link does not work (any more)")
		return
	}
	c.ShareToken = ""
	c.CampaignID = nil
	if c.PhotoID != nil {
		c.PhotoURL = "/api/v1/public/c/" + tok + "/photo"
		c.ThumbURL = c.PhotoURL + "?thumb=1"
	}
	c.PhotoID = nil
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"character": c})
}

func (s *Server) handlePublicCharacterPhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	c, err := s.store.CharacterByShare(ctx, chiParam(r, "token"))
	if err != nil || c.PhotoID == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	p, err := s.store.GetPhoto(ctx, c.UserID, *c.PhotoID, queryBool(r, "thumb"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	servePhoto(w, r, p)
}
