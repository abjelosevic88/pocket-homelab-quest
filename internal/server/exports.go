package server

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// exportDoc is everything of one person, to keep or to bring to another box.
type exportDoc struct {
	App        string            `json:"app"`
	Version    string            `json:"version"`
	ExportedAt string            `json:"exported_at"`
	Campaigns  []store.Campaign  `json:"campaigns"`
	Characters []store.Character `json:"characters"`
	Sessions   []store.Session   `json:"sessions"`
	Codex      []store.Entry     `json:"codex"`
	Quests     []store.Quest     `json:"quests"`
	Encounters []store.Encounter `json:"encounters"`
	Creatures  []store.Creature  `json:"creatures"`
	Photos     []exportPhoto     `json:"photos"`
}

type exportPhoto struct {
	ID    int64  `json:"id"`
	Kind  string `json:"kind"`
	Mime  string `json:"mime"`
	Data  []byte `json:"data"` // base64 in JSON
	Thumb []byte `json:"thumb,omitempty"`
}

func (s *Server) export(ctx context.Context, uid int64, photos bool) (exportDoc, error) {
	doc := exportDoc{App: "pocket-quest", Version: Version, ExportedAt: time.Now().UTC().Format(time.RFC3339), Photos: []exportPhoto{}}
	var err error
	if doc.Campaigns, err = s.store.ListCampaigns(ctx, uid); err != nil {
		return doc, err
	}
	if doc.Characters, err = s.store.ListCharacters(ctx, uid, store.CharacterFilter{Sheets: true}); err != nil {
		return doc, err
	}
	if doc.Sessions, err = s.store.ListSessions(ctx, uid, store.SessionFilter{}); err != nil {
		return doc, err
	}
	if doc.Codex, err = s.store.ListEntries(ctx, uid, 0, "", false); err != nil {
		return doc, err
	}
	if doc.Quests, err = s.store.ListQuests(ctx, uid, 0, false); err != nil {
		return doc, err
	}
	if doc.Encounters, err = s.store.ListEncounters(ctx, uid, store.EncounterFilter{}); err != nil {
		return doc, err
	}
	if doc.Creatures, err = s.store.ListCreatures(ctx, uid); err != nil {
		return doc, err
	}
	if photos {
		ids, err := s.store.ListPhotoIDs(ctx, uid)
		if err != nil {
			return doc, err
		}
		for _, id := range ids {
			p, err := s.store.GetPhoto(ctx, uid, id, false)
			if err != nil {
				continue
			}
			doc.Photos = append(doc.Photos, exportPhoto{ID: p.ID, Kind: p.Kind, Mime: p.Mime, Data: p.Data, Thumb: p.Thumb})
		}
	}
	return doc, nil
}

func (s *Server) handleExportJSON(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	doc, err := s.export(ctx, actorID(ctx), r.URL.Query().Get("photos") != "0")
	if err != nil {
		s.fail(w, err, "export")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="pocket-quest-`+time.Now().Format("2006-01-02")+`.json"`)
	enc := json.NewEncoder(w)
	enc.SetIndent("", " ")
	_ = enc.Encode(doc)
}

// handleExportCSV is the characters (or the game nights) as a spreadsheet.
func (s *Server) handleExportCSV(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	what := firstNonEmpty(r.URL.Query().Get("what"), "characters")
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="pocket-quest-%s-%s.csv"`, what, time.Now().Format("2006-01-02")))
	cw := csv.NewWriter(w)
	defer cw.Flush()
	if what == "sessions" {
		list, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{})
		_ = cw.Write([]string{"campaign", "number", "title", "date", "time", "status", "xp", "loot", "recap"})
		for _, x := range list {
			_ = cw.Write([]string{x.CampaignName, strconv.Itoa(x.Number), x.Title, x.Date, x.Time, x.Status, strconv.Itoa(x.XP), x.Loot, x.Recap})
		}
		return
	}
	list, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{})
	_ = cw.Write([]string{"name", "player", "species", "classes", "level", "xp", "ac", "hp_max", "hp", "initiative", "passive_perception", "speed", "campaign", "status"})
	for _, c := range list {
		_ = cw.Write([]string{c.Name, c.Player, c.Species, c.Classes, strconv.Itoa(c.Level), strconv.Itoa(c.XP), strconv.Itoa(c.AC), strconv.Itoa(c.HPMax),
			strconv.Itoa(c.HPCur), strconv.Itoa(c.Init), strconv.Itoa(c.PP), strconv.Itoa(c.Speed), c.CampaignName, c.Status})
	}
}

// handleImport takes a Pocket Quest export (again and again: nothing is doubled).
func (s *Server) handleImport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var data []byte
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") {
		r.Body = http.MaxBytesReader(w, r.Body, 512<<20)
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			writeErr(w, http.StatusBadRequest, "the file is too big")
			return
		}
		f, _, err := r.FormFile("file")
		if err != nil {
			writeErr(w, http.StatusBadRequest, "no file")
			return
		}
		defer f.Close()
		if data, err = io.ReadAll(f); err != nil {
			writeErr(w, http.StatusBadRequest, "could not read the file")
			return
		}
	} else {
		b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 512<<20))
		if err != nil {
			writeErr(w, http.StatusBadRequest, "the file is too big")
			return
		}
		data = b
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	var doc exportDoc
	if err := json.Unmarshal(data, &doc); err != nil || doc.App != "pocket-quest" {
		writeErr(w, http.StatusBadRequest, "that is not a Pocket Quest export")
		return
	}
	res, err := s.importPocket(ctx, uid, doc)
	if err != nil {
		s.fail(w, err, "import")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// importPocket brings back an export. What came in is remembered (export
// id + when it was made → the new id), so a second import finds it instead
// of doubling it.
func (s *Server) importPocket(ctx context.Context, uid int64, doc exportDoc) (map[string]any, error) {
	added := map[string]int{}
	key := func(kind string, id int64, at string) string {
		return fmt.Sprintf("import:%d:%s:%d:%s", uid, kind, id, at)
	}
	seen := func(kind string, id int64, at string, exists func(int64) bool) (int64, bool) {
		v, _, ok := s.store.CacheGet(ctx, key(kind, id, at))
		if !ok {
			return 0, false
		}
		n, _ := strconv.ParseInt(v, 10, 64)
		return n, n > 0 && exists(n)
	}
	remember := func(kind string, id int64, at string, n int64) { _ = s.store.CachePut(ctx, key(kind, id, at), itoa(n)) }

	photos := map[int64]exportPhoto{}
	for _, p := range doc.Photos {
		photos[p.ID] = p
	}
	newPhoto := map[int64]int64{}
	photo := func(old *int64) *int64 {
		if old == nil {
			return nil
		}
		if id, ok := newPhoto[*old]; ok {
			return &id
		}
		p, ok := photos[*old]
		if !ok || len(p.Data) == 0 {
			return nil
		}
		np := &store.Photo{UserID: uid, Kind: firstNonEmpty(p.Kind, "portrait"), Mime: firstNonEmpty(p.Mime, "image/jpeg"), Data: p.Data, Thumb: p.Thumb}
		if !oneOf(np.Kind, photoKinds) {
			np.Kind = "portrait"
		}
		if err := s.store.CreatePhoto(ctx, np); err != nil {
			return nil
		}
		newPhoto[*old] = np.ID
		added["photos"]++
		return &np.ID
	}
	ownsCamp := func(id int64) bool { return s.store.OwnsCampaign(ctx, uid, id) }
	camps := map[int64]int64{}
	for _, c := range doc.Campaigns {
		if n, ok := seen("campaign", c.ID, c.CreatedAt, ownsCamp); ok {
			camps[c.ID] = n
			continue
		}
		old, at := c.ID, c.CreatedAt
		c.UserID, c.PhotoID, c.ShareToken, c.ShareOn = uid, photo(c.PhotoID), "", false
		if !oneOf(c.Status, store.CampaignStates) {
			c.Status = "active"
		}
		if !oneOf(c.Advancement, store.Advancements) {
			c.Advancement = "xp"
		}
		if !oneOf(c.Emblem, Emblems) {
			c.Emblem = "dragon"
		}
		if !reColor.MatchString(c.Color) {
			c.Color = "#9f1d35"
		}
		if strings.TrimSpace(c.Name) == "" {
			c.Name = "Campaign"
		}
		if err := s.store.CreateCampaign(ctx, &c); err != nil {
			return nil, err
		}
		camps[old] = c.ID
		remember("campaign", old, at, c.ID)
		added["campaigns"]++
	}
	campOf := func(id *int64) *int64 {
		if id == nil {
			return nil
		}
		if n, ok := camps[*id]; ok {
			return &n
		}
		return nil
	}
	chars := map[int64]int64{}
	for _, c := range doc.Characters {
		if n, ok := seen("character", c.ID, c.CreatedAt, func(id int64) bool { return len(s.store.OwnCharacterIDs(ctx, uid, []int64{id})) == 1 }); ok {
			chars[c.ID] = n
			continue
		}
		old, at := c.ID, c.CreatedAt
		c.UserID, c.CampaignID, c.PhotoID, c.ShareToken, c.ShareOn = uid, campOf(c.CampaignID), photo(c.PhotoID), "", false
		if !oneOf(c.Kind, store.CharacterKinds) {
			c.Kind = "pc"
		}
		if !oneOf(c.Status, store.CharacterStates) {
			c.Status = "active"
		}
		if !oneOf(c.Token.Frame, store.Frames) {
			c.Token.Frame = ""
		}
		c.Level = clampInt(c.Level, 1, 20)
		if len(c.Sheet) == 0 || !json.Valid(c.Sheet) {
			c.Sheet = json.RawMessage("{}")
		}
		if strings.TrimSpace(c.Name) == "" {
			c.Name = "Adventurer"
		}
		if err := s.store.CreateCharacter(ctx, &c); err != nil {
			return nil, err
		}
		chars[old] = c.ID
		remember("character", old, at, c.ID)
		added["characters"]++
	}
	sessions := map[int64]int64{}
	for _, x := range doc.Sessions {
		cid, ok := camps[x.CampaignID]
		if !ok {
			continue
		}
		if n, ok := seen("session", x.ID, x.CreatedAt, func(id int64) bool { return s.store.OwnsSession(ctx, uid, id) }); ok {
			sessions[x.ID] = n
			continue
		}
		old, at := x.ID, x.CreatedAt
		att := []int64{}
		for _, a := range x.Attendance {
			if n, ok := chars[a]; ok {
				att = append(att, n)
			}
		}
		x.UserID, x.CampaignID, x.Attendance, x.CalendarRef, x.CalendarURL = uid, cid, att, "", ""
		if !oneOf(x.Status, store.SessionStates) {
			x.Status = "planned"
		}
		if !validDate(x.Date) || x.Date == "" {
			x.Date = today()
		}
		if err := s.store.CreateGameSession(ctx, &x); err != nil {
			return nil, err
		}
		sessions[old] = x.ID
		remember("session", old, at, x.ID)
		added["sessions"]++
	}
	entries := map[int64]int64{}
	places := map[int64]*int64{} // new entry id → old place id
	for _, e := range doc.Codex {
		cid, ok := camps[e.CampaignID]
		if !ok {
			continue
		}
		if n, ok := seen("entry", e.ID, e.CreatedAt, func(id int64) bool { return s.store.EntryInCampaign(ctx, uid, cid, id) }); ok {
			entries[e.ID] = n
			continue
		}
		old, at, oldPlace := e.ID, e.CreatedAt, e.PlaceID
		e.UserID, e.CampaignID, e.PlaceID, e.PhotoID = uid, cid, nil, photo(e.PhotoID)
		if !oneOf(e.Kind, store.EntryKinds) {
			e.Kind = "lore"
		}
		if !oneOf(e.Status, store.NPCStates) {
			e.Status = ""
		}
		if !oneOf(e.Attitude, store.Attitudes) {
			e.Attitude = ""
		}
		if err := s.store.CreateEntry(ctx, &e); err != nil {
			return nil, err
		}
		entries[old] = e.ID
		places[e.ID] = oldPlace
		remember("entry", old, at, e.ID)
		added["codex"]++
	}
	for id, oldPlace := range places { // now that every place exists
		if oldPlace == nil {
			continue
		}
		if n, ok := entries[*oldPlace]; ok {
			if e, err := s.store.GetEntry(ctx, uid, id); err == nil {
				e.PlaceID = &n
				_ = s.store.UpdateEntry(ctx, e)
			}
		}
	}
	ref := func(id *int64) *int64 {
		if id == nil {
			return nil
		}
		if n, ok := entries[*id]; ok {
			return &n
		}
		return nil
	}
	for _, q := range doc.Quests {
		cid, ok := camps[q.CampaignID]
		if !ok {
			continue
		}
		if _, ok := seen("quest", q.ID, q.CreatedAt, func(id int64) bool { _, err := s.store.GetQuest(ctx, uid, id); return err == nil }); ok {
			continue
		}
		old, at := q.ID, q.CreatedAt
		q.UserID, q.CampaignID, q.GiverID, q.PlaceID = uid, cid, ref(q.GiverID), ref(q.PlaceID)
		if !oneOf(q.Status, store.QuestStates) {
			q.Status = "active"
		}
		if err := s.store.CreateQuest(ctx, &q); err != nil {
			return nil, err
		}
		remember("quest", old, at, q.ID)
		added["quests"]++
	}
	creatures := map[string]string{}
	for _, c := range doc.Creatures {
		if n, ok := seen("creature", c.ID, c.CreatedAt, func(id int64) bool { _, err := s.store.GetCreature(ctx, uid, id); return err == nil }); ok {
			creatures[fmt.Sprintf("my:%d", c.ID)] = fmt.Sprintf("my:%d", n)
			continue
		}
		old, at := c.ID, c.CreatedAt
		m, err := s.cleanCreature(c.Data)
		if err != nil {
			continue
		}
		data, _ := json.Marshal(m)
		nc := &store.Creature{UserID: uid, Name: m.Name, Data: data, PhotoID: photo(c.PhotoID)}
		if err := s.store.CreateCreature(ctx, nc); err != nil {
			return nil, err
		}
		creatures[fmt.Sprintf("my:%d", old)] = fmt.Sprintf("my:%d", nc.ID)
		remember("creature", old, at, nc.ID)
		added["creatures"]++
	}
	for _, e := range doc.Encounters {
		if _, ok := seen("encounter", e.ID, e.CreatedAt, func(id int64) bool { _, err := s.store.GetEncounter(ctx, uid, id); return err == nil }); ok {
			continue
		}
		old, at := e.ID, e.CreatedAt
		e.UserID, e.CampaignID = uid, campOf(e.CampaignID)
		if e.SessionID != nil {
			if n, ok := sessions[*e.SessionID]; ok {
				e.SessionID = &n
			} else {
				e.SessionID = nil
			}
		}
		plan := []store.PlanLine{}
		for _, l := range e.Plan {
			if n, ok := creatures[l.Ref]; ok {
				l.Ref = n
			}
			if strings.HasPrefix(l.Ref, "srd:") || strings.HasPrefix(l.Ref, "my:") {
				plan = append(plan, l)
			}
		}
		e.Plan = plan
		for i, c := range e.State.Combatants {
			if strings.HasPrefix(c.Ref, "character:") {
				oldID, _ := strconv.ParseInt(strings.TrimPrefix(c.Ref, "character:"), 10, 64)
				if n, ok := chars[oldID]; ok {
					e.State.Combatants[i].Ref = fmt.Sprintf("character:%d", n)
				} else {
					e.State.Combatants[i].Ref = ""
				}
			} else if n, ok := creatures[c.Ref]; ok {
				e.State.Combatants[i].Ref = n
			}
		}
		if !oneOf(e.Status, store.EncounterStates) {
			e.Status = "plan"
		}
		if err := s.store.CreateEncounter(ctx, &e); err != nil {
			return nil, err
		}
		remember("encounter", old, at, e.ID)
		added["encounters"]++
	}
	return map[string]any{"ok": true, "added": added}, nil
}
