package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/rules"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/srd"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// monsterFor finds a stat block: srd:<key> (built in) or my:<id> (the person's own).
func (s *Server) monsterFor(ctx context.Context, uid int64, ref string) (*srd.Monster, error) {
	kind, key, _ := strings.Cut(ref, ":")
	switch kind {
	case "srd":
		if m, ok := srd.MonsterByKey(key); ok {
			return m, nil
		}
	case "my":
		id, _ := strconv.ParseInt(key, 10, 64)
		c, err := s.store.GetCreature(ctx, uid, id)
		if err != nil {
			return nil, err
		}
		var m srd.Monster
		_ = json.Unmarshal(c.Data, &m)
		m.Key, m.Name = ref, c.Name
		if m.XP == 0 {
			m.XP = rules.CRXP[m.CR]
		}
		return &m, nil
	}
	return nil, store.ErrNotFound
}

// ---- difficulty ----

type planCost struct {
	Ref  string  `json:"ref"`
	Name string  `json:"name"`
	N    int     `json:"n"`
	XP   int     `json:"xp"` // each
	CR   float64 `json:"cr"`
}

// difficulty rates a plan for a party (SRD 5.2 XP budget).
func (s *Server) difficulty(ctx context.Context, uid int64, plan []store.PlanLine, levels []int) (rules.Difficulty, []planCost) {
	xp := 0
	costs := []planCost{}
	for _, l := range plan {
		m, err := s.monsterFor(ctx, uid, l.Ref)
		if err != nil {
			continue
		}
		xp += m.XP * l.N
		costs = append(costs, planCost{Ref: l.Ref, Name: m.Name, N: l.N, XP: m.XP, CR: m.CR})
	}
	return rules.Rate(levels, xp), costs
}

func (s *Server) handleDifficulty(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		Levels     []int            `json:"levels"`
		CampaignID int64            `json:"campaign_id"`
		Plan       []store.PlanLine `json:"plan"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	levels := in.Levels
	if len(levels) == 0 {
		levels = s.partyLevels(ctx, uid, in.CampaignID)
	}
	d, costs := s.difficulty(ctx, uid, in.Plan, levels)
	writeJSON(w, http.StatusOK, map[string]any{"difficulty": d, "costs": costs, "levels": levels})
}

// handleTables are the numbers the pages work with (levels, the budget, CR → XP).
func (s *Server) handleTables(w http.ResponseWriter, r *http.Request) {
	cr := map[string]int{}
	for k, v := range rules.CRXP {
		cr[srd.CRText(k)] = v
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	writeJSON(w, http.StatusOK, map[string]any{"level_xp": rules.LevelXP, "budget": rules.Budget, "cr_xp": cr})
}

// ---- encounters ----

type encounterIn struct {
	CampaignID *int64            `json:"campaign_id"`
	SessionID  *int64            `json:"session_id"`
	Name       *string           `json:"name"`
	Place      *string           `json:"place"`
	Readaloud  *string           `json:"readaloud"`
	Notes      *string           `json:"notes"`
	Plan       *[]store.PlanLine `json:"plan"`
}

func (s *Server) applyEncounter(ctx context.Context, uid int64, e *store.Encounter, in encounterIn, keys map[string]bool) error {
	if keys["campaign_id"] {
		id, ok := ownRef(in.CampaignID, func(id int64) bool { return s.store.OwnsCampaign(ctx, uid, id) })
		if !ok {
			return &userErr{"unknown campaign"}
		}
		e.CampaignID = id
	}
	if keys["session_id"] {
		id, ok := ownRef(in.SessionID, func(id int64) bool { return s.store.OwnsSession(ctx, uid, id) })
		if !ok {
			return &userErr{"unknown game night"}
		}
		e.SessionID = id
	}
	setStr(keys, "name", &e.Name, in.Name, maxName)
	setStr(keys, "place", &e.Place, in.Place, maxLine)
	setStr(keys, "readaloud", &e.Readaloud, in.Readaloud, maxNotes)
	setStr(keys, "notes", &e.Notes, in.Notes, maxNotes)
	if keys["plan"] && in.Plan != nil {
		e.Plan = []store.PlanLine{}
		for _, l := range *in.Plan {
			if l.N < 1 {
				continue
			}
			m, err := s.monsterFor(ctx, uid, l.Ref)
			if err != nil {
				return &userErr{"unknown monster: " + l.Ref}
			}
			if len(e.Plan) >= 30 {
				break
			}
			e.Plan = append(e.Plan, store.PlanLine{Ref: l.Ref, N: clampInt(l.N, 1, 50), Name: m.Name})
		}
	}
	if e.Name == "" {
		return &userErr{"give the encounter a name"}
	}
	return nil
}

func (s *Server) encounterOut(ctx context.Context, uid int64, e *store.Encounter) map[string]any {
	var levels []int
	if e.CampaignID != nil {
		levels = s.partyLevels(ctx, uid, *e.CampaignID)
	}
	d, costs := s.difficulty(ctx, uid, e.Plan, levels)
	return map[string]any{"encounter": e, "difficulty": d, "costs": costs, "levels": levels}
}

func (s *Server) handleListEncounters(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	list, err := s.store.ListEncounters(ctx, uid, store.EncounterFilter{CampaignID: int64(queryInt(r, "campaign")), SessionID: int64(queryInt(r, "session")), Status: r.URL.Query().Get("status")})
	if err != nil {
		s.fail(w, err, "encounters")
		return
	}
	type row struct {
		store.Encounter
		Rating   string `json:"rating"`
		Monsters int    `json:"monsters"`
	}
	out := []row{}
	levelsBy := map[int64][]int{}
	for _, e := range list {
		var levels []int
		if e.CampaignID != nil {
			if l, ok := levelsBy[*e.CampaignID]; ok {
				levels = l
			} else {
				levels = s.partyLevels(ctx, uid, *e.CampaignID)
				levelsBy[*e.CampaignID] = levels
			}
		}
		d, _ := s.difficulty(ctx, uid, e.Plan, levels)
		n := 0
		for _, l := range e.Plan {
			n += l.N
		}
		e.State.Log = []store.LogLine{}
		out = append(out, row{Encounter: e, Rating: d.Rating, Monsters: n})
	}
	writeJSON(w, http.StatusOK, map[string]any{"encounters": out})
}

func (s *Server) handleCreateEncounter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in encounterIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	e := &store.Encounter{UserID: uid, Status: "plan", Plan: []store.PlanLine{}}
	if err := s.applyEncounter(ctx, uid, e, in, keys); err != nil {
		s.userFail(w, err, "encounter")
		return
	}
	if err := s.store.CreateEncounter(ctx, e); err != nil {
		s.fail(w, err, "encounter")
		return
	}
	e, _ = s.store.GetEncounter(ctx, uid, e.ID)
	writeJSON(w, http.StatusCreated, s.encounterOut(ctx, uid, e))
}

func (s *Server) handleGetEncounter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	e, err := s.store.GetEncounter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "encounter")
		return
	}
	out := s.encounterOut(ctx, uid, e)
	// the stat blocks the fight needs, once each
	blocks := map[string]*srd.Monster{}
	for _, l := range e.Plan {
		if m, err := s.monsterFor(ctx, uid, l.Ref); err == nil {
			blocks[l.Ref] = m
		}
	}
	for _, c := range e.State.Combatants {
		if _, ok := blocks[c.Ref]; !ok && (strings.HasPrefix(c.Ref, "srd:") || strings.HasPrefix(c.Ref, "my:")) {
			if m, err := s.monsterFor(ctx, uid, c.Ref); err == nil {
				blocks[c.Ref] = m
			}
		}
	}
	out["blocks"] = blocks
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleUpdateEncounter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	e, err := s.store.GetEncounter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "encounter")
		return
	}
	var in encounterIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := s.applyEncounter(ctx, uid, e, in, keys); err != nil {
		s.userFail(w, err, "encounter")
		return
	}
	if err := s.store.UpdateEncounter(ctx, e); err != nil {
		s.fail(w, err, "encounter")
		return
	}
	e, _ = s.store.GetEncounter(ctx, uid, e.ID)
	writeJSON(w, http.StatusOK, s.encounterOut(ctx, uid, e))
}

func (s *Server) handleDeleteEncounter(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteEncounter(r.Context(), actorID(r.Context()), idParam(r, "id")); err != nil {
		s.fail(w, err, "encounter")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- the fight ----

func avgHP(m *srd.Monster) int { return max(1, m.HP) }

// rollHP rolls a monster's hit dice ("2d6+2"), falling back to the average.
func rollHP(m *srd.Monster) int {
	if m.HD == "" {
		return avgHP(m)
	}
	if r, err := rules.Roll(strings.ReplaceAll(m.HD, " ", "")); err == nil && r.Total > 0 {
		return r.Total
	}
	return avgHP(m)
}

func d20(bonus int) int {
	r, err := rules.Roll("1d20")
	if err != nil {
		return 10 + bonus
	}
	return r.Total + bonus
}

// sortFight puts the combatants in initiative order (ties: the higher
// bonus first, then the players) and keeps whose turn it is.
func sortFight(f *store.Fight) {
	cur := ""
	if f.Turn >= 0 && f.Turn < len(f.Combatants) {
		cur = f.Combatants[f.Turn].ID
	}
	sort.SliceStable(f.Combatants, func(i, j int) bool {
		a, b := f.Combatants[i], f.Combatants[j]
		if a.Init != b.Init {
			return a.Init > b.Init
		}
		if a.InitBonus != b.InitBonus {
			return a.InitBonus > b.InitBonus
		}
		return a.Kind == "pc" && b.Kind != "pc"
	})
	f.Turn = 0
	for i, c := range f.Combatants {
		if c.ID == cur {
			f.Turn = i
		}
	}
}

func (s *Server) logLine(f *store.Fight, text string) {
	f.Log = append(f.Log, store.LogLine{Round: f.Round, Text: clip(text, maxLine), At: time.Now().UTC().Format(time.RFC3339)})
	if len(f.Log) > 300 {
		f.Log = f.Log[len(f.Log)-300:]
	}
}

// handleStartEncounter turns the plan into a fight: the monsters with their
// hit points and rolled initiative, and the campaign's party.
func (s *Server) handleStartEncounter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		Party      *bool `json:"party"`       // add the campaign's characters (default yes)
		RollHP     bool  `json:"roll_hp"`     // roll the monsters' hit points instead of the average
		GroupInit  bool  `json:"group_init"`  // one initiative for each kind of monster
		RollPlayer bool  `json:"roll_player"` // roll for the players too (otherwise they tell you)
	}
	_ = decode(r, &in)
	s.fightMu.Lock()
	defer s.fightMu.Unlock()
	e, err := s.store.GetEncounter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "encounter")
		return
	}
	f := store.Fight{Round: 1, Started: store.Now(), Combatants: []store.Combatant{}, Log: []store.LogLine{}}
	n := 0
	id := func() string { n++; return fmt.Sprintf("c%d", n) }
	for _, l := range e.Plan {
		m, err := s.monsterFor(ctx, uid, l.Ref)
		if err != nil {
			continue
		}
		groupInit := d20(m.DexMod())
		for i := 1; i <= l.N; i++ {
			hp := avgHP(m)
			if in.RollHP {
				hp = rollHP(m)
			}
			name := m.Name
			if l.N > 1 {
				name = fmt.Sprintf("%s %d", m.Name, i)
			}
			ini := groupInit
			if !in.GroupInit {
				ini = d20(m.DexMod())
			}
			c := store.Combatant{ID: id(), Kind: "monster", Ref: l.Ref, Name: name, Init: ini, InitBonus: m.DexMod(), AC: m.AC, HPMax: hp, HP: hp, Conditions: []string{}}
			if len(m.Legendary) > 0 {
				c.Legendary = 3
			}
			f.Combatants = append(f.Combatants, c)
		}
	}
	if (in.Party == nil || *in.Party) && e.CampaignID != nil {
		party, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{CampaignID: *e.CampaignID, Status: "active"})
		for _, ch := range party {
			ini := 0
			if in.RollPlayer {
				ini = d20(ch.Init)
			}
			f.Combatants = append(f.Combatants, store.Combatant{ID: id(), Kind: "pc", Ref: fmt.Sprintf("character:%d", ch.ID), Name: ch.Name, Init: ini, InitBonus: ch.Init,
				AC: ch.AC, HPMax: ch.HPMax, HP: ch.HPCur, Temp: ch.HPTemp, Conditions: []string{}, Color: ch.Token.Color})
		}
	}
	sortFight(&f)
	f.Turn = 0
	s.logLine(&f, "The fight begins.")
	e.State, e.Status, e.FinishedAt = f, "running", ""
	if err := s.store.UpdateEncounter(ctx, e); err != nil {
		s.fail(w, err, "encounter")
		return
	}
	e, _ = s.store.GetEncounter(ctx, uid, e.ID)
	writeJSON(w, http.StatusOK, s.encounterOut(ctx, uid, e))
}

// handleSaveFight stores the fight as the tracker has it, and copies the
// player characters' hit points back to their sheets.
func (s *Server) handleSaveFight(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		State store.Fight `json:"state"`
		Sort  bool        `json:"sort"`
		Log   string      `json:"log"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	s.fightMu.Lock()
	defer s.fightMu.Unlock()
	e, err := s.store.GetEncounter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "encounter")
		return
	}
	f := in.State
	if len(f.Combatants) > 80 {
		writeErr(w, http.StatusBadRequest, "at most 80 in one fight")
		return
	}
	f.Round = clampInt(f.Round, 1, 9999)
	if f.Started == "" {
		f.Started = e.State.Started
	}
	seen := map[string]bool{}
	for i := range f.Combatants {
		c := &f.Combatants[i]
		c.Name = cleanText(c.Name, maxName)
		if c.Name == "" {
			c.Name = "Someone"
		}
		if c.ID == "" || seen[c.ID] {
			c.ID = "c" + store.RandomToken(4)
		}
		seen[c.ID] = true
		if !oneOf(c.Kind, []string{"pc", "monster", "npc"}) {
			c.Kind = "monster"
		}
		c.HPMax = clampInt(c.HPMax, 0, 99999)
		c.HP = clampInt(c.HP, -99999, c.HPMax)
		c.Temp = clampInt(c.Temp, 0, 9999)
		c.AC = clampInt(c.AC, 0, 60)
		c.Init = clampInt(c.Init, -20, 99)
		c.Note = cleanText(c.Note, maxLine)
		c.Saves = [2]int{clampInt(c.Saves[0], 0, 3), clampInt(c.Saves[1], 0, 3)}
		conds := []string{}
		for _, k := range c.Conditions {
			if reKey.MatchString(k) && !oneOf(k, conds) && len(conds) < 16 {
				conds = append(conds, k)
			}
		}
		c.Conditions = conds
		if c.Color != "" && !reColor.MatchString(c.Color) {
			c.Color = ""
		}
	}
	// keep the log the server had, plus what the tracker adds
	f.Log = e.State.Log
	if in.Log != "" {
		s.logLine(&f, in.Log)
	}
	if in.Sort {
		sortFight(&f)
	}
	store.NormalizeFight(&f)
	// hit points back to the sheets
	for _, c := range f.Combatants {
		if c.Kind != "pc" || !strings.HasPrefix(c.Ref, "character:") {
			continue
		}
		cid, _ := strconv.ParseInt(strings.TrimPrefix(c.Ref, "character:"), 10, 64)
		for _, old := range e.State.Combatants {
			if old.ID == c.ID && (old.HP != c.HP || old.Temp != c.Temp) {
				_ = s.store.SetCharacterHP(ctx, uid, cid, max0(c.HP), c.Temp)
			}
		}
	}
	e.State = f
	if e.Status == "plan" {
		e.Status = "running"
	}
	if err := s.store.UpdateEncounter(ctx, e); err != nil {
		s.fail(w, err, "encounter")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"state": e.State, "status": e.Status})
}

// handleFinishEncounter ends the fight; with award, the XP of the monsters
// beaten is shared out evenly among the player characters in it.
func (s *Server) handleFinishEncounter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		Award bool `json:"award"`
	}
	_ = decode(r, &in)
	s.fightMu.Lock()
	defer s.fightMu.Unlock()
	e, err := s.store.GetEncounter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "encounter")
		return
	}
	xp := 0
	var pcs []int64
	for _, c := range e.State.Combatants {
		switch {
		case c.Kind == "pc" && strings.HasPrefix(c.Ref, "character:"):
			id, _ := strconv.ParseInt(strings.TrimPrefix(c.Ref, "character:"), 10, 64)
			pcs = append(pcs, id)
		case c.Kind == "monster" && (c.Out || c.HP <= 0):
			if m, err := s.monsterFor(ctx, uid, c.Ref); err == nil {
				xp += m.XP
			}
		}
	}
	each := 0
	if in.Award && len(pcs) > 0 && xp > 0 {
		each = xp / len(pcs)
		_ = s.store.AddCharacterXP(ctx, uid, s.store.OwnCharacterIDs(ctx, uid, pcs), each)
		s.logLine(&e.State, fmt.Sprintf("The fight is over: %d XP each.", each))
	} else {
		s.logLine(&e.State, "The fight is over.")
	}
	e.Status, e.XP, e.FinishedAt = "done", xp, store.Now()
	if err := s.store.UpdateEncounter(ctx, e); err != nil {
		s.fail(w, err, "encounter")
		return
	}
	s.publish(ctx, uid, "quest.encounter_finished", fmt.Sprintf("encounter:%d", e.ID), map[string]any{"name": e.Name, "rounds": e.State.Round, "xp": xp, "xp_each": each})
	e, _ = s.store.GetEncounter(ctx, uid, e.ID)
	out := s.encounterOut(ctx, uid, e)
	out["xp_each"] = each
	writeJSON(w, http.StatusOK, out)
}

// handleResetEncounter puts a fight back to its plan.
func (s *Server) handleResetEncounter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	s.fightMu.Lock()
	defer s.fightMu.Unlock()
	e, err := s.store.GetEncounter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "encounter")
		return
	}
	e.Status, e.State, e.FinishedAt, e.XP = "plan", store.Fight{}, "", 0
	if err := s.store.UpdateEncounter(ctx, e); err != nil {
		s.fail(w, err, "encounter")
		return
	}
	e, _ = s.store.GetEncounter(ctx, uid, e.ID)
	writeJSON(w, http.StatusOK, s.encounterOut(ctx, uid, e))
}

// ---- your own monsters ----

func (s *Server) cleanCreature(in json.RawMessage) (*srd.Monster, error) {
	var m srd.Monster
	if len(in) > maxSheet || json.Unmarshal(in, &m) != nil {
		return nil, &userErr{"the stat block is not readable"}
	}
	m.Name = cleanText(m.Name, maxName)
	if m.Name == "" {
		return nil, &userErr{"give the monster a name"}
	}
	m.AC, m.HP = clampInt(m.AC, 0, 60), clampInt(m.HP, 1, 99999)
	for i := range m.Abil {
		m.Abil[i] = clampInt(m.Abil[i], 1, 30)
	}
	if m.Size == "" {
		m.Size = "Medium"
	}
	if m.Type == "" {
		m.Type = "humanoid"
	}
	if m.CR < 0 || m.CR > 30 {
		return nil, &userErr{"a challenge rating is 0 to 30"}
	}
	if xp, ok := rules.CRXP[m.CR]; ok && m.XP == 0 {
		m.XP = xp
	}
	if m.PB == 0 {
		m.PB = max(2, 2+(int(m.CR)-1)/4)
	}
	if m.Traits == nil {
		m.Traits = []srd.Action{}
	}
	if m.Actions == nil {
		m.Actions = []srd.Action{}
	}
	return &m, nil
}

func (s *Server) handleListCreatures(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListCreatures(r.Context(), actorID(r.Context()))
	if err != nil {
		s.fail(w, err, "monsters")
		return
	}
	for i := range list {
		list[i].PhotoURL, _ = photoURL(list[i].PhotoID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"creatures": list})
}

func (s *Server) handleSaveCreature(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		Data    json.RawMessage `json:"data"`
		PhotoID *int64          `json:"photo_id"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	m, err := s.cleanCreature(in.Data)
	if err != nil {
		s.userFail(w, err, "monster")
		return
	}
	photo, ok := ownRef(in.PhotoID, func(id int64) bool { return s.store.OwnsPhoto(ctx, uid, id) })
	if !ok {
		writeErr(w, http.StatusBadRequest, "unknown picture")
		return
	}
	data, _ := json.Marshal(m)
	c := &store.Creature{UserID: uid, Name: m.Name, Data: data, PhotoID: photo}
	if id := idParam(r, "id"); id > 0 {
		if _, err := s.store.GetCreature(ctx, uid, id); err != nil {
			s.fail(w, err, "monster")
			return
		}
		c.ID = id
		err = s.store.UpdateCreature(ctx, c)
	} else {
		err = s.store.CreateCreature(ctx, c)
	}
	if err != nil {
		s.fail(w, err, "monster")
		return
	}
	c, _ = s.store.GetCreature(ctx, uid, c.ID)
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) handleDeleteCreature(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteCreature(r.Context(), actorID(r.Context()), idParam(r, "id")); err != nil {
		s.fail(w, err, "monster")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
