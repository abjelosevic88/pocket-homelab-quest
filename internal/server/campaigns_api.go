package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/rules"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// ---- campaigns ----

// Emblems are the pictures a campaign banner can carry (web/src/components/Art.tsx).
var Emblems = []string{"dragon", "castle", "crown", "skull", "tree", "ship", "moon", "sun", "tower", "sword", "eye", "mountain", "compass", "chalice", "rune", "wolf"}

type campaignIn struct {
	Name        *string `json:"name"`
	Tagline     *string `json:"tagline"`
	World       *string `json:"world"`
	Status      *string `json:"status"`
	Emblem      *string `json:"emblem"`
	Color       *string `json:"color"`
	PhotoID     *int64  `json:"photo_id"`
	Summary     *string `json:"summary"`
	Secrets     *string `json:"secrets"`
	HouseRules  *string `json:"house_rules"`
	Advancement *string `json:"advancement"`
	Schedule    *string `json:"schedule"`
	Place       *string `json:"place"`
	ShareOn     *bool   `json:"share_on"`
}

func (s *Server) applyCampaign(ctx context.Context, uid int64, c *store.Campaign, in campaignIn, keys map[string]bool) error {
	setStr(keys, "name", &c.Name, in.Name, maxName)
	setStr(keys, "tagline", &c.Tagline, in.Tagline, maxLine)
	setStr(keys, "world", &c.World, in.World, maxName)
	setStr(keys, "summary", &c.Summary, in.Summary, maxNotes)
	setStr(keys, "secrets", &c.Secrets, in.Secrets, maxNotes)
	setStr(keys, "house_rules", &c.HouseRules, in.HouseRules, maxNotes)
	setStr(keys, "schedule", &c.Schedule, in.Schedule, maxLine)
	setStr(keys, "place", &c.Place, in.Place, maxLine)
	if keys["status"] && in.Status != nil {
		if !oneOf(*in.Status, store.CampaignStates) {
			return &userErr{"a campaign is active, paused or done"}
		}
		c.Status = *in.Status
	}
	if keys["advancement"] && in.Advancement != nil {
		if !oneOf(*in.Advancement, store.Advancements) {
			return &userErr{"characters level up by experience points or by milestones"}
		}
		c.Advancement = *in.Advancement
	}
	if keys["emblem"] && in.Emblem != nil {
		if !oneOf(*in.Emblem, Emblems) {
			return &userErr{"unknown emblem"}
		}
		c.Emblem = *in.Emblem
	}
	if keys["color"] && in.Color != nil {
		if !reColor.MatchString(*in.Color) {
			return &userErr{"a colour is like #9f1d35"}
		}
		c.Color = strings.ToLower(*in.Color)
	}
	if keys["photo_id"] {
		id, ok := ownRef(in.PhotoID, func(id int64) bool { return s.store.OwnsPhoto(ctx, uid, id) })
		if !ok {
			return &userErr{"unknown picture"}
		}
		c.PhotoID = id
	}
	if keys["share_on"] && in.ShareOn != nil {
		c.ShareOn = *in.ShareOn
	}
	if c.Name == "" {
		return &userErr{"give the campaign a name"}
	}
	return nil
}

func (s *Server) decorateCampaign(c *store.Campaign) {
	c.PhotoURL, _ = photoURL(c.PhotoID)
}

func (s *Server) handleListCampaigns(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListCampaigns(r.Context(), actorID(r.Context()))
	if err != nil {
		s.fail(w, err, "campaigns")
		return
	}
	for i := range list {
		s.decorateCampaign(&list[i])
		if linkApp(r.Context()) != "" { // another app never sees the game master's secrets
			list[i].Secrets = ""
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"campaigns": list, "emblems": Emblems})
}

func (s *Server) handleCreateCampaign(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in campaignIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	c := &store.Campaign{UserID: uid, Status: "active", Emblem: "dragon", Color: "#9f1d35", Advancement: "xp"}
	if err := s.applyCampaign(ctx, uid, c, in, keys); err != nil {
		s.userFail(w, err, "campaign")
		return
	}
	if err := s.store.CreateCampaign(ctx, c); err != nil {
		s.fail(w, err, "campaign")
		return
	}
	c, _ = s.store.GetCampaign(ctx, uid, c.ID)
	s.decorateCampaign(c)
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) ownCampaign(w http.ResponseWriter, r *http.Request) *store.Campaign {
	c, err := s.store.GetCampaign(r.Context(), actorID(r.Context()), idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "campaign")
		return nil
	}
	s.decorateCampaign(c)
	return c
}

// handleGetCampaign is a campaign with everything in it (one call for its page).
func (s *Server) handleGetCampaign(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	c := s.ownCampaign(w, r)
	if c == nil {
		return
	}
	party, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{CampaignID: c.ID})
	for i := range party {
		s.decorateCharacter(&party[i])
	}
	sessions, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{CampaignID: c.ID, Desc: true})
	codex, _ := s.store.ListEntries(ctx, uid, c.ID, "", false)
	for i := range codex {
		s.decorateEntry(&codex[i])
	}
	quests, _ := s.store.ListQuests(ctx, uid, c.ID, false)
	encounters, _ := s.store.ListEncounters(ctx, uid, store.EncounterFilter{CampaignID: c.ID})
	for i := range encounters {
		encounters[i].State = store.Fight{Round: encounters[i].State.Round, Combatants: []store.Combatant{}, Log: []store.LogLine{}}
	}
	writeJSON(w, http.StatusOK, map[string]any{"campaign": c, "party": party, "sessions": sessions, "codex": codex, "quests": quests,
		"encounters": encounters, "player_url": s.playerURL(c)})
}

func (s *Server) playerURL(c *store.Campaign) string {
	if !c.ShareOn {
		return ""
	}
	return s.link("/p/" + c.ShareToken)
}

func (s *Server) handleUpdateCampaign(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	c := s.ownCampaign(w, r)
	if c == nil {
		return
	}
	var in campaignIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := s.applyCampaign(ctx, uid, c, in, keys); err != nil {
		s.userFail(w, err, "campaign")
		return
	}
	if err := s.store.UpdateCampaign(ctx, c); err != nil {
		s.fail(w, err, "campaign")
		return
	}
	c, _ = s.store.GetCampaign(ctx, uid, c.ID)
	s.decorateCampaign(c)
	writeJSON(w, http.StatusOK, map[string]any{"campaign": c, "player_url": s.playerURL(c)})
}

// handleNewShareLink makes a new player link (the old one stops working).
func (s *Server) handleNewShareLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	c := s.ownCampaign(w, r)
	if c == nil {
		return
	}
	c.ShareToken, c.ShareOn = store.RandomToken(18), true
	if err := s.store.UpdateCampaign(ctx, c); err != nil {
		s.fail(w, err, "campaign")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"campaign": c, "player_url": s.playerURL(c)})
}

func (s *Server) handleDeleteCampaign(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	sessions, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{CampaignID: idParam(r, "id")})
	if err := s.store.DeleteCampaign(ctx, uid, idParam(r, "id")); err != nil {
		s.fail(w, err, "campaign")
		return
	}
	for _, x := range sessions { // their calendar events go too
		if x.CalendarRef != "" {
			_ = s.removeFromCalendar(ctx, uid, &x)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- game nights ----

type sessionIn struct {
	CampaignID *int64   `json:"campaign_id"`
	Number     *int     `json:"number"`
	Title      *string  `json:"title"`
	Date       *string  `json:"date"`
	Time       *string  `json:"time"`
	Minutes    *int     `json:"minutes"`
	Status     *string  `json:"status"`
	Plan       *string  `json:"plan"`
	Recap      *string  `json:"recap"`
	Notes      *string  `json:"notes"`
	XP         *int     `json:"xp"`
	Loot       *string  `json:"loot"`
	Attendance *[]int64 `json:"attendance"`
}

func (s *Server) applySession(ctx context.Context, uid int64, x *store.Session, in sessionIn, keys map[string]bool) error {
	if keys["campaign_id"] && in.CampaignID != nil {
		if !s.store.OwnsCampaign(ctx, uid, *in.CampaignID) {
			return &userErr{"unknown campaign"}
		}
		x.CampaignID = *in.CampaignID
	}
	setStr(keys, "title", &x.Title, in.Title, maxName)
	setStr(keys, "plan", &x.Plan, in.Plan, maxNotes)
	setStr(keys, "recap", &x.Recap, in.Recap, maxNotes)
	setStr(keys, "notes", &x.Notes, in.Notes, maxNotes)
	setStr(keys, "loot", &x.Loot, in.Loot, maxNotes)
	if keys["number"] && in.Number != nil {
		x.Number = clampInt(*in.Number, 0, 9999)
	}
	if keys["date"] && in.Date != nil {
		if !validDate(*in.Date) {
			return &userErr{"a date is like 2026-11-20"}
		}
		x.Date = *in.Date
	}
	if keys["time"] && in.Time != nil {
		if *in.Time != "" && !reTime.MatchString(*in.Time) {
			return &userErr{"a time is like 19:30"}
		}
		x.Time = *in.Time
	}
	if keys["minutes"] && in.Minutes != nil {
		x.Minutes = clampInt(*in.Minutes, 15, 24*60)
	}
	if keys["status"] && in.Status != nil {
		if !oneOf(*in.Status, store.SessionStates) {
			return &userErr{"a game night is planned, played or cancelled"}
		}
		x.Status = *in.Status
	}
	if keys["xp"] && in.XP != nil {
		x.XP = clampInt(*in.XP, 0, 1000000)
	}
	if keys["attendance"] && in.Attendance != nil {
		x.Attendance = s.store.OwnCharacterIDs(ctx, uid, *in.Attendance)
	}
	if x.CampaignID == 0 {
		return &userErr{"pick the campaign"}
	}
	if x.Date == "" {
		x.Date = today()
	}
	return nil
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.SessionFilter{CampaignID: int64(queryInt(r, "campaign")), Status: q.Get("status"), From: q.Get("from"), To: q.Get("to"), Limit: queryInt(r, "limit"), Desc: queryBool(r, "desc")}
	if !validDate(f.From) || !validDate(f.To) {
		writeErr(w, http.StatusBadRequest, "a date is like 2026-11-20")
		return
	}
	list, err := s.store.ListSessions(r.Context(), actorID(r.Context()), f)
	if err != nil {
		s.fail(w, err, "sessions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": list})
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in sessionIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	x := &store.Session{UserID: uid, Status: "planned", Minutes: 240, Attendance: []int64{}, Source: sourceOf(ctx)}
	if err := s.applySession(ctx, uid, x, in, keys); err != nil {
		s.userFail(w, err, "session")
		return
	}
	if !keys["number"] {
		x.Number = s.store.NextSessionNumber(ctx, uid, x.CampaignID)
	}
	if !keys["attendance"] { // everyone in the party, to start with
		party, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{CampaignID: x.CampaignID, Status: "active"})
		for _, c := range party {
			x.Attendance = append(x.Attendance, c.ID)
		}
	}
	if err := s.store.CreateGameSession(ctx, x); err != nil {
		s.fail(w, err, "session")
		return
	}
	x, _ = s.store.GetSession(ctx, uid, x.ID)
	if x.Status == "planned" {
		s.publish(ctx, uid, "quest.session_planned", fmt.Sprintf("session:%d", x.ID), map[string]any{"campaign": x.CampaignName, "number": x.Number, "date": x.Date, "time": x.Time, "url": s.sessionLink(x)})
		s.syncCalendar(ctx, uid, x)
		x, _ = s.store.GetSession(ctx, uid, x.ID)
	}
	writeJSON(w, http.StatusCreated, x)
}

func (s *Server) sessionLink(x *store.Session) string {
	return s.link(fmt.Sprintf("/campaigns/%d/sessions/%d", x.CampaignID, x.ID))
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	x, err := s.store.GetSession(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	encounters, _ := s.store.ListEncounters(ctx, uid, store.EncounterFilter{SessionID: x.ID})
	party, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{CampaignID: x.CampaignID})
	for i := range party {
		s.decorateCharacter(&party[i])
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": x, "encounters": encounters, "party": party})
}

func (s *Server) handleUpdateSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	x, err := s.store.GetSession(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	if !mayChange(ctx, x.Source) {
		writeErr(w, http.StatusForbidden, "this app may change only the game nights it added")
		return
	}
	var in sessionIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	before := *x
	if err := s.applySession(ctx, uid, x, in, keys); err != nil {
		s.userFail(w, err, "session")
		return
	}
	if err := s.store.UpdateGameSession(ctx, x); err != nil {
		s.fail(w, err, "session")
		return
	}
	if before.Date != x.Date || before.Time != x.Time || before.Title != x.Title || before.Minutes != x.Minutes || before.Status != x.Status {
		s.syncCalendar(ctx, uid, x)
	}
	x, _ = s.store.GetSession(ctx, uid, x.ID)
	writeJSON(w, http.StatusOK, x)
}

// handlePlaySession marks a game night as played and gives the XP to each
// character there (once: playing it again gives only the difference).
func (s *Server) handlePlaySession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	x, err := s.store.GetSession(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	var in sessionIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	given := 0
	if x.Status == "played" {
		given = x.XP
	}
	oldAtt := append([]int64(nil), x.Attendance...)
	if err := s.applySession(ctx, uid, x, in, keys); err != nil {
		s.userFail(w, err, "session")
		return
	}
	wasPlayed := x.Status == "played" && given > 0
	x.Status = "played"
	if err := s.store.UpdateGameSession(ctx, x); err != nil {
		s.fail(w, err, "session")
		return
	}
	// take back what the old attendance got, give the new amount to the new attendance
	if wasPlayed {
		_ = s.store.AddCharacterXP(ctx, uid, oldAtt, -given)
	}
	before := map[int64]int{}
	for _, id := range x.Attendance {
		if c, err := s.store.GetCharacter(ctx, uid, id); err == nil {
			before[id] = c.XP
		}
	}
	_ = s.store.AddCharacterXP(ctx, uid, x.Attendance, x.XP)
	var ready []string
	for _, id := range x.Attendance {
		c, err := s.store.GetCharacter(ctx, uid, id)
		if err != nil || c.Kind != "pc" {
			continue
		}
		if rules.LevelFor(c.XP) > c.Level && rules.LevelFor(before[id]) <= c.Level {
			ready = append(ready, c.Name)
		}
	}
	s.syncCalendar(ctx, uid, x)
	s.publish(ctx, uid, "quest.session_played", fmt.Sprintf("session:%d", x.ID), map[string]any{"campaign": x.CampaignName, "number": x.Number, "date": x.Date,
		"xp": x.XP, "recap": clip(x.Recap, 2000), "url": s.sessionLink(x)})
	if len(ready) > 0 {
		st := s.settingsOf(ctx, uid)
		if st.NotifyLevel {
			s.push(ctx, uid, st, "Time to level up", strings.Join(ready, ", ")+" "+plural(len(ready), "has", "have")+" the experience for a new level.", s.sessionLink(x))
		}
	}
	x, _ = s.store.GetSession(ctx, uid, x.ID)
	writeJSON(w, http.StatusOK, map[string]any{"session": x, "level_up": ready})
}

func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	x, err := s.store.GetSession(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	if !mayChange(ctx, x.Source) {
		writeErr(w, http.StatusForbidden, "this app may remove only the game nights it added")
		return
	}
	if x.CalendarRef != "" {
		_ = s.removeFromCalendar(ctx, uid, x)
	}
	if err := s.store.DeleteGameSession(ctx, uid, x.ID); err != nil {
		s.fail(w, err, "session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- the codex ----

type entryIn struct {
	CampaignID *int64    `json:"campaign_id"`
	Kind       *string   `json:"kind"`
	Name       *string   `json:"name"`
	Subtitle   *string   `json:"subtitle"`
	Body       *string   `json:"body"`
	Secret     *string   `json:"secret"`
	Status     *string   `json:"status"`
	Attitude   *string   `json:"attitude"`
	PlaceID    *int64    `json:"place_id"`
	Monster    *string   `json:"monster"`
	PhotoID    *int64    `json:"photo_id"`
	Revealed   *bool     `json:"revealed"`
	Pinned     *bool     `json:"pinned"`
	Tags       *[]string `json:"tags"`
}

func (s *Server) applyEntry(ctx context.Context, uid int64, e *store.Entry, in entryIn, keys map[string]bool) error {
	if keys["campaign_id"] && in.CampaignID != nil {
		if !s.store.OwnsCampaign(ctx, uid, *in.CampaignID) {
			return &userErr{"unknown campaign"}
		}
		e.CampaignID = *in.CampaignID
	}
	if keys["kind"] && in.Kind != nil {
		if !oneOf(*in.Kind, store.EntryKinds) {
			return &userErr{"an entry is a person, a place, a faction, an item, lore or a handout"}
		}
		e.Kind = *in.Kind
	}
	setStr(keys, "name", &e.Name, in.Name, maxName)
	setStr(keys, "subtitle", &e.Subtitle, in.Subtitle, maxLine)
	setStr(keys, "body", &e.Body, in.Body, maxNotes)
	setStr(keys, "secret", &e.Secret, in.Secret, maxNotes)
	if keys["status"] && in.Status != nil {
		if !oneOf(*in.Status, store.NPCStates) {
			return &userErr{"a person is alive, dead or missing"}
		}
		e.Status = *in.Status
	}
	if keys["attitude"] && in.Attitude != nil {
		if !oneOf(*in.Attitude, store.Attitudes) {
			return &userErr{"an attitude is friendly, neutral or hostile"}
		}
		e.Attitude = *in.Attitude
	}
	if keys["monster"] && in.Monster != nil {
		e.Monster = strings.TrimSpace(*in.Monster)
		if e.Monster != "" {
			if _, err := s.monsterFor(ctx, uid, e.Monster); err != nil {
				return &userErr{"unknown stat block"}
			}
		}
	}
	if keys["photo_id"] {
		id, ok := ownRef(in.PhotoID, func(id int64) bool { return s.store.OwnsPhoto(ctx, uid, id) })
		if !ok {
			return &userErr{"unknown picture"}
		}
		e.PhotoID = id
	}
	if keys["revealed"] && in.Revealed != nil {
		e.Revealed = *in.Revealed
	}
	if keys["pinned"] && in.Pinned != nil {
		e.Pinned = *in.Pinned
	}
	if keys["tags"] && in.Tags != nil {
		e.Tags = store.CleanTags(*in.Tags)
	}
	if e.CampaignID == 0 {
		return &userErr{"pick the campaign"}
	}
	if keys["place_id"] {
		id, ok := ownRef(in.PlaceID, func(id int64) bool { return id != e.ID && s.store.EntryInCampaign(ctx, uid, e.CampaignID, id) })
		if !ok {
			return &userErr{"that place is not in this campaign"}
		}
		e.PlaceID = id
	}
	if e.Name == "" {
		return &userErr{"give it a name"}
	}
	return nil
}

func (s *Server) decorateEntry(e *store.Entry) {
	e.PhotoURL, e.ThumbURL = photoURL(e.PhotoID)
}

func (s *Server) handleListEntries(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListEntries(r.Context(), actorID(r.Context()), int64(queryInt(r, "campaign")), r.URL.Query().Get("kind"), false)
	if err != nil {
		s.fail(w, err, "codex")
		return
	}
	for i := range list {
		s.decorateEntry(&list[i])
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": list})
}

func (s *Server) handleCreateEntry(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in entryIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	e := &store.Entry{UserID: uid, Kind: "npc", Tags: []string{}, Source: sourceOf(ctx)}
	if err := s.applyEntry(ctx, uid, e, in, keys); err != nil {
		s.userFail(w, err, "entry")
		return
	}
	if e.Kind == "npc" && !keys["status"] {
		e.Status = "alive"
	}
	if err := s.store.CreateEntry(ctx, e); err != nil {
		s.fail(w, err, "entry")
		return
	}
	e, _ = s.store.GetEntry(ctx, uid, e.ID)
	s.decorateEntry(e)
	writeJSON(w, http.StatusCreated, e)
}

func (s *Server) handleGetEntry(w http.ResponseWriter, r *http.Request) {
	e, err := s.store.GetEntry(r.Context(), actorID(r.Context()), idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "entry")
		return
	}
	s.decorateEntry(e)
	writeJSON(w, http.StatusOK, e)
}

func (s *Server) handleUpdateEntry(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	e, err := s.store.GetEntry(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "entry")
		return
	}
	if !mayChange(ctx, e.Source) {
		writeErr(w, http.StatusForbidden, "this app may change only what it added")
		return
	}
	var in entryIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	delete(keys, "campaign_id") // an entry stays in its campaign
	if err := s.applyEntry(ctx, uid, e, in, keys); err != nil {
		s.userFail(w, err, "entry")
		return
	}
	if err := s.store.UpdateEntry(ctx, e); err != nil {
		s.fail(w, err, "entry")
		return
	}
	e, _ = s.store.GetEntry(ctx, uid, e.ID)
	s.decorateEntry(e)
	writeJSON(w, http.StatusOK, e)
}

func (s *Server) handleDeleteEntry(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	e, err := s.store.GetEntry(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "entry")
		return
	}
	if !mayChange(ctx, e.Source) {
		writeErr(w, http.StatusForbidden, "this app may remove only what it added")
		return
	}
	if err := s.store.DeleteEntry(ctx, uid, e.ID); err != nil {
		s.fail(w, err, "entry")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- the quest log ----

type questIn struct {
	CampaignID *int64             `json:"campaign_id"`
	Title      *string            `json:"title"`
	Status     *string            `json:"status"`
	GiverID    *int64             `json:"giver_id"`
	PlaceID    *int64             `json:"place_id"`
	Summary    *string            `json:"summary"`
	Secret     *string            `json:"secret"`
	Reward     *string            `json:"reward"`
	Objectives *[]store.Objective `json:"objectives"`
	Revealed   *bool              `json:"revealed"`
	Sort       *int               `json:"sort"`
}

func (s *Server) applyQuest(ctx context.Context, uid int64, q *store.Quest, in questIn, keys map[string]bool) error {
	if keys["campaign_id"] && in.CampaignID != nil {
		if !s.store.OwnsCampaign(ctx, uid, *in.CampaignID) {
			return &userErr{"unknown campaign"}
		}
		q.CampaignID = *in.CampaignID
	}
	setStr(keys, "title", &q.Title, in.Title, maxName)
	setStr(keys, "summary", &q.Summary, in.Summary, maxNotes)
	setStr(keys, "secret", &q.Secret, in.Secret, maxNotes)
	setStr(keys, "reward", &q.Reward, in.Reward, maxLine)
	if keys["status"] && in.Status != nil {
		if !oneOf(*in.Status, store.QuestStates) {
			return &userErr{"a quest is a rumour, active, done or failed"}
		}
		if *in.Status != q.Status && (*in.Status == "done" || *in.Status == "failed") {
			q.DoneOn = today()
		} else if *in.Status == "active" || *in.Status == "rumour" {
			q.DoneOn = ""
		}
		q.Status = *in.Status
	}
	if keys["objectives"] && in.Objectives != nil {
		q.Objectives = []store.Objective{}
		for _, o := range *in.Objectives {
			if t := cleanText(o.Text, maxLine); t != "" && len(q.Objectives) < 30 {
				q.Objectives = append(q.Objectives, store.Objective{Text: t, Done: o.Done})
			}
		}
	}
	if keys["revealed"] && in.Revealed != nil {
		q.Revealed = *in.Revealed
	}
	if keys["sort"] && in.Sort != nil {
		q.Sort = *in.Sort
	}
	if q.CampaignID == 0 {
		return &userErr{"pick the campaign"}
	}
	in2 := func(id int64) bool { return s.store.EntryInCampaign(ctx, uid, q.CampaignID, id) }
	if keys["giver_id"] {
		id, ok := ownRef(in.GiverID, in2)
		if !ok {
			return &userErr{"that person is not in this campaign"}
		}
		q.GiverID = id
	}
	if keys["place_id"] {
		id, ok := ownRef(in.PlaceID, in2)
		if !ok {
			return &userErr{"that place is not in this campaign"}
		}
		q.PlaceID = id
	}
	if q.Title == "" {
		return &userErr{"give the quest a name"}
	}
	return nil
}

func (s *Server) handleListQuests(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListQuests(r.Context(), actorID(r.Context()), int64(queryInt(r, "campaign")), false)
	if err != nil {
		s.fail(w, err, "quests")
		return
	}
	if linkApp(r.Context()) != "" {
		for i := range list {
			list[i].Secret = ""
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"quests": list})
}

func (s *Server) handleCreateQuest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in questIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	q := &store.Quest{UserID: uid, Status: "active", Revealed: true, Objectives: []store.Objective{}, Source: sourceOf(ctx)}
	if err := s.applyQuest(ctx, uid, q, in, keys); err != nil {
		s.userFail(w, err, "quest")
		return
	}
	if err := s.store.CreateQuest(ctx, q); err != nil {
		s.fail(w, err, "quest")
		return
	}
	q, _ = s.store.GetQuest(ctx, uid, q.ID)
	writeJSON(w, http.StatusCreated, q)
}

func (s *Server) handleUpdateQuest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	q, err := s.store.GetQuest(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "quest")
		return
	}
	if !mayChange(ctx, q.Source) {
		writeErr(w, http.StatusForbidden, "this app may change only the quests it added")
		return
	}
	var in questIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	delete(keys, "campaign_id")
	was := q.Status
	if err := s.applyQuest(ctx, uid, q, in, keys); err != nil {
		s.userFail(w, err, "quest")
		return
	}
	if err := s.store.UpdateQuest(ctx, q); err != nil {
		s.fail(w, err, "quest")
		return
	}
	if was != "done" && q.Status == "done" {
		s.publish(ctx, uid, "quest.quest_completed", fmt.Sprintf("quest:%d", q.ID), map[string]any{"title": q.Title, "reward": q.Reward})
	}
	q, _ = s.store.GetQuest(ctx, uid, q.ID)
	writeJSON(w, http.StatusOK, q)
}

func (s *Server) handleDeleteQuest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	q, err := s.store.GetQuest(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "quest")
		return
	}
	if !mayChange(ctx, q.Source) {
		writeErr(w, http.StatusForbidden, "this app may remove only the quests it added")
		return
	}
	if err := s.store.DeleteQuest(ctx, uid, q.ID); err != nil {
		s.fail(w, err, "quest")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
