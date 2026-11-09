package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg" // picture sizes
	_ "image/png"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/rules"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// ---- characters ----

type characterIn struct {
	CampaignID *int64           `json:"campaign_id"`
	Name       *string          `json:"name"`
	Player     *string          `json:"player"`
	Kind       *string          `json:"kind"`
	Level      *int             `json:"level"`
	Classes    *string          `json:"classes"`
	ClassKey   *string          `json:"class_key"`
	Species    *string          `json:"species"`
	AC         *int             `json:"ac"`
	HPMax      *int             `json:"hp_max"`
	HPCur      *int             `json:"hp_cur"`
	HPTemp     *int             `json:"hp_temp"`
	Init       *int             `json:"init"`
	PP         *int             `json:"pp"`
	Speed      *int             `json:"speed"`
	XP         *int             `json:"xp"`
	Sheet      *json.RawMessage `json:"sheet"`
	Token      *store.Token     `json:"token"`
	PhotoID    *int64           `json:"photo_id"`
	Status     *string          `json:"status"`
	ShareOn    *bool            `json:"share_on"`
}

const maxSheet = 512 << 10

func (s *Server) applyCharacter(ctx context.Context, uid int64, c *store.Character, in characterIn, keys map[string]bool) error {
	if keys["campaign_id"] {
		id, ok := ownRef(in.CampaignID, func(id int64) bool { return s.store.OwnsCampaign(ctx, uid, id) })
		if !ok {
			return &userErr{"unknown campaign"}
		}
		c.CampaignID = id
	}
	setStr(keys, "name", &c.Name, in.Name, maxName)
	setStr(keys, "player", &c.Player, in.Player, maxName)
	setStr(keys, "classes", &c.Classes, in.Classes, maxLine)
	setStr(keys, "species", &c.Species, in.Species, maxName)
	if keys["class_key"] && in.ClassKey != nil {
		if *in.ClassKey != "" && !reKey.MatchString(*in.ClassKey) {
			return &userErr{"unknown class"}
		}
		c.ClassKey = *in.ClassKey
	}
	if keys["kind"] && in.Kind != nil {
		if !oneOf(*in.Kind, store.CharacterKinds) {
			return &userErr{"a character is a player character or a companion"}
		}
		c.Kind = *in.Kind
	}
	if keys["status"] && in.Status != nil {
		if !oneOf(*in.Status, store.CharacterStates) {
			return &userErr{"a character is active, retired or dead"}
		}
		c.Status = *in.Status
	}
	num := func(k string, dst *int, v *int, lo, hi int) {
		if keys[k] && v != nil {
			*dst = clampInt(*v, lo, hi)
		}
	}
	num("level", &c.Level, in.Level, 1, 20)
	num("ac", &c.AC, in.AC, 0, 60)
	num("hp_max", &c.HPMax, in.HPMax, 1, 9999)
	num("hp_cur", &c.HPCur, in.HPCur, -9999, 9999)
	num("hp_temp", &c.HPTemp, in.HPTemp, 0, 9999)
	num("init", &c.Init, in.Init, -20, 40)
	num("pp", &c.PP, in.PP, 0, 60)
	num("speed", &c.Speed, in.Speed, 0, 500)
	num("xp", &c.XP, in.XP, 0, 10000000)
	if c.HPCur > c.HPMax {
		c.HPCur = c.HPMax
	}
	if keys["sheet"] && in.Sheet != nil {
		b := bytes.TrimSpace(*in.Sheet)
		if len(b) > maxSheet {
			return &userErr{"the character sheet is too big"}
		}
		var probe map[string]any
		if len(b) == 0 || json.Unmarshal(b, &probe) != nil {
			return &userErr{"the character sheet is not readable"}
		}
		c.Sheet = json.RawMessage(b)
	}
	if keys["token"] && in.Token != nil {
		t := *in.Token
		if t.Color != "" && !reColor.MatchString(t.Color) {
			return &userErr{"a colour is like #9f1d35"}
		}
		if !oneOf(t.Frame, store.Frames) {
			return &userErr{"a frame is gold, silver, bronze or iron"}
		}
		if t.Emblem != "" && !reKey.MatchString(t.Emblem) {
			return &userErr{"unknown emblem"}
		}
		c.Token = t
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
		return &userErr{"give the character a name"}
	}
	return nil
}

func (s *Server) decorateCharacter(c *store.Character) {
	c.PhotoURL, c.ThumbURL = photoURL(c.PhotoID)
}

func (s *Server) handleListCharacters(w http.ResponseWriter, r *http.Request) {
	f := store.CharacterFilter{CampaignID: int64(queryInt(r, "campaign")), Status: r.URL.Query().Get("status"), Sheets: queryBool(r, "sheets")}
	list, err := s.store.ListCharacters(r.Context(), actorID(r.Context()), f)
	if err != nil {
		s.fail(w, err, "characters")
		return
	}
	for i := range list {
		s.decorateCharacter(&list[i])
	}
	writeJSON(w, http.StatusOK, map[string]any{"characters": list})
}

func (s *Server) handleCreateCharacter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in characterIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	c := &store.Character{UserID: uid, Kind: "pc", Level: 1, AC: 10, HPMax: 1, HPCur: 1, PP: 10, Speed: 30, Status: "active", Sheet: json.RawMessage("{}")}
	if err := s.applyCharacter(ctx, uid, c, in, keys); err != nil {
		s.userFail(w, err, "character")
		return
	}
	if !keys["hp_cur"] {
		c.HPCur = c.HPMax
	}
	if err := s.store.CreateCharacter(ctx, c); err != nil {
		s.fail(w, err, "character")
		return
	}
	c, _ = s.store.GetCharacter(ctx, uid, c.ID)
	s.decorateCharacter(c)
	s.publish(ctx, uid, "quest.character_created", fmt.Sprintf("character:%d", c.ID), map[string]any{"name": c.Name, "classes": c.Classes, "species": c.Species, "level": c.Level})
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) handleGetCharacter(w http.ResponseWriter, r *http.Request) {
	c, err := s.store.GetCharacter(r.Context(), actorID(r.Context()), idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "character")
		return
	}
	s.decorateCharacter(c)
	out := map[string]any{"character": c, "next_level_xp": rules.NextLevelXP(c.Level), "level_for_xp": rules.LevelFor(c.XP)}
	if c.ShareOn {
		out["share_url"] = s.link("/c/" + c.ShareToken)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleUpdateCharacter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	c, err := s.store.GetCharacter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "character")
		return
	}
	var in characterIn
	keys, err := decodeKeys(r, &in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	was := c.Level
	if err := s.applyCharacter(ctx, uid, c, in, keys); err != nil {
		s.userFail(w, err, "character")
		return
	}
	if err := s.store.UpdateCharacter(ctx, c); err != nil {
		s.fail(w, err, "character")
		return
	}
	if c.Level > was {
		s.publish(ctx, uid, "quest.character_leveled", fmt.Sprintf("character:%d", c.ID), map[string]any{"name": c.Name, "classes": c.Classes, "level": c.Level})
	}
	c, _ = s.store.GetCharacter(ctx, uid, c.ID)
	s.decorateCharacter(c)
	out := map[string]any{"character": c}
	if c.ShareOn {
		out["share_url"] = s.link("/c/" + c.ShareToken)
	}
	writeJSON(w, http.StatusOK, out)
}

// handleCharacterHP is the quick change: damage, healing, temporary hit
// points (temporary ones soak damage first, healing never goes past the
// maximum).
func (s *Server) handleCharacterHP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	c, err := s.store.GetCharacter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "character")
		return
	}
	var in struct {
		Damage *int `json:"damage"`
		Heal   *int `json:"heal"`
		Temp   *int `json:"temp"`
		Set    *int `json:"set"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	cur, temp := applyHP(c.HPCur, c.HPTemp, c.HPMax, in.Damage, in.Heal, in.Temp, in.Set)
	if err := s.store.SetCharacterHP(ctx, uid, c.ID, cur, temp); err != nil {
		s.fail(w, err, "character")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hp_cur": cur, "hp_temp": temp, "hp_max": c.HPMax})
}

// applyHP works out hit points after damage, healing or temporary hit
// points. At 0 a character is down (not below 0 on the sheet).
func applyHP(cur, temp, max int, damage, heal, setTemp, set *int) (int, int) {
	if set != nil {
		cur = clampInt(*set, 0, max)
	}
	if setTemp != nil && *setTemp > temp { // temporary hit points don't stack: keep the larger
		temp = clampInt(*setTemp, 0, 9999)
	}
	if damage != nil && *damage > 0 {
		d := *damage
		if temp > 0 {
			soak := min(temp, d)
			temp -= soak
			d -= soak
		}
		cur = max0(cur - d)
	}
	if heal != nil && *heal > 0 {
		cur = clampInt(max0(cur)+*heal, 0, max)
	}
	return cur, temp
}

func max0(v int) int {
	if v < 0 {
		return 0
	}
	return v
}

func (s *Server) handleShareCharacter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	c, err := s.store.GetCharacter(ctx, uid, idParam(r, "id"))
	if err != nil {
		s.fail(w, err, "character")
		return
	}
	c.ShareToken, c.ShareOn = store.RandomToken(18), true
	if err := s.store.UpdateCharacter(ctx, c); err != nil {
		s.fail(w, err, "character")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"share_url": s.link("/c/" + c.ShareToken)})
}

func (s *Server) handleDeleteCharacter(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteCharacter(r.Context(), actorID(r.Context()), idParam(r, "id")); err != nil {
		s.fail(w, err, "character")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- the dice ----

func (s *Server) handleListRolls(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListRolls(r.Context(), actorID(r.Context()), int64(queryInt(r, "character")), queryInt(r, "limit"))
	if err != nil {
		s.fail(w, err, "rolls")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rolls": list})
}

// handleRoll rolls an expression on the server (so every roll comes from
// the same fair dice and lands in the log).
func (s *Server) handleRoll(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		Expr        string `json:"expr"`
		Label       string `json:"label"`
		Kind        string `json:"kind"`
		CharacterID *int64 `json:"character_id"`
		CampaignID  *int64 `json:"campaign_id"`
		Quiet       bool   `json:"quiet"` // roll without logging it
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	res, err := rules.Roll(in.Expr)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if in.Kind == "" {
		in.Kind = "roll"
	}
	if !oneOf(in.Kind, store.RollKinds) {
		writeErr(w, http.StatusBadRequest, "unknown kind of roll")
		return
	}
	ch, ok := ownRef(in.CharacterID, func(id int64) bool { return len(s.store.OwnCharacterIDs(ctx, uid, []int64{id})) == 1 })
	if !ok {
		writeErr(w, http.StatusBadRequest, "unknown character")
		return
	}
	camp, ok := ownRef(in.CampaignID, func(id int64) bool { return s.store.OwnsCampaign(ctx, uid, id) })
	if !ok {
		writeErr(w, http.StatusBadRequest, "unknown campaign")
		return
	}
	detail, _ := json.Marshal(res)
	roll := &store.Roll{UserID: uid, CampaignID: camp, CharacterID: ch, Label: cleanText(in.Label, maxLine), Expr: res.Expr, Total: res.Total, Detail: detail, Kind: in.Kind}
	if !in.Quiet {
		if err := s.store.AddRoll(ctx, roll); err != nil {
			s.fail(w, err, "roll")
			return
		}
	} else {
		roll.CreatedAt = store.Now()
	}
	writeJSON(w, http.StatusOK, map[string]any{"roll": roll, "result": res, "text": rules.Describe(res)})
}

func (s *Server) handleClearRolls(w http.ResponseWriter, r *http.Request) {
	if err := s.store.ClearRolls(r.Context(), actorID(r.Context())); err != nil {
		s.fail(w, err, "rolls")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ---- pictures ----

// maxPhoto is the largest picture taken (the browser shrinks them first).
const maxPhoto = 8 << 20

var photoKinds = []string{"portrait", "npc", "place", "map", "handout", "campaign", "item", "monster"}

func (s *Server) handleUploadPhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	r.Body = http.MaxBytesReader(w, r.Body, 2*maxPhoto+(1<<20))
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "the picture is too big (8 MB at most)")
		return
	}
	read := func(field string) ([]byte, string, error) {
		f, h, err := r.FormFile(field)
		if err != nil {
			return nil, "", err
		}
		defer f.Close()
		b, err := io.ReadAll(io.LimitReader(f, maxPhoto+1))
		if err != nil {
			return nil, "", err
		}
		if len(b) > maxPhoto {
			return nil, "", fmt.Errorf("too big")
		}
		return b, h.Header.Get("Content-Type"), nil
	}
	data, _, err := read("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "send the picture as “file”")
		return
	}
	mime := http.DetectContentType(data)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
		writeErr(w, http.StatusBadRequest, "send a JPEG, PNG or WebP picture")
		return
	}
	p := &store.Photo{UserID: uid, Kind: firstNonEmpty(r.FormValue("kind"), "portrait"), Mime: mime, Data: data}
	if !oneOf(p.Kind, photoKinds) {
		p.Kind = "portrait"
	}
	if cfg, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil {
		p.Width, p.Height = cfg.Width, cfg.Height
	} else {
		p.Width, _ = strconv.Atoi(r.FormValue("width"))
		p.Height, _ = strconv.Atoi(r.FormValue("height"))
	}
	if t, tm, err := read("thumb"); err == nil && len(t) > 0 {
		if http.DetectContentType(t) == "image/jpeg" || tm == "image/jpeg" {
			p.Thumb = t
		}
	}
	if err := s.store.CreatePhoto(ctx, p); err != nil {
		s.fail(w, err, "photo")
		return
	}
	u, t := photoURL(&p.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"id": p.ID, "url": u, "thumb_url": t, "width": p.Width, "height": p.Height})
}

func (s *Server) handlePhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	p, err := s.store.GetPhoto(ctx, actorID(ctx), idParam(r, "id"), queryBool(r, "thumb"))
	if err != nil {
		s.fail(w, err, "photo")
		return
	}
	servePhoto(w, r, p)
}

func servePhoto(w http.ResponseWriter, r *http.Request, p *store.Photo) {
	w.Header().Set("Content-Type", p.Mime)
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(p.Data))
}

// partyLevels are the levels of a campaign's active player characters.
func (s *Server) partyLevels(ctx context.Context, uid, campaignID int64) []int {
	if campaignID == 0 {
		return nil
	}
	party, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{CampaignID: campaignID, Status: "active"})
	var out []int
	for _, c := range party {
		if c.Kind == "pc" {
			out = append(out, c.Level)
		}
	}
	return out
}

func joinNames(names []string) string {
	switch len(names) {
	case 0:
		return ""
	case 1:
		return names[0]
	}
	return strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1]
}
