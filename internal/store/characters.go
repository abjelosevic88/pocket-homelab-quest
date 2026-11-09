package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

const characterCols = `ch.id, ch.user_id, ch.campaign_id, ch.name, ch.player, ch.kind, ch.level, ch.classes, ch.class_key, ch.species, ch.ac, ch.hp_max, ch.hp_cur,
	ch.hp_temp, ch.init, ch.pp, ch.speed, ch.xp, ch.token, ch.photo_id, ch.status, ch.share_token, ch.share_on, ch.created_at, ch.updated_at,
	COALESCE((SELECT name FROM campaigns c WHERE c.id = ch.campaign_id), '')`

func scanCharacter(sc interface{ Scan(...any) error }, withSheet bool) (*Character, error) {
	var c Character
	var camp, photo sql.NullInt64
	var token, sheet string
	var share int
	dst := []any{&c.ID, &c.UserID, &camp, &c.Name, &c.Player, &c.Kind, &c.Level, &c.Classes, &c.ClassKey, &c.Species, &c.AC, &c.HPMax, &c.HPCur,
		&c.HPTemp, &c.Init, &c.PP, &c.Speed, &c.XP, &token, &photo, &c.Status, &c.ShareToken, &share, &c.CreatedAt, &c.UpdatedAt, &c.CampaignName}
	if withSheet {
		dst = append(dst, &sheet)
	}
	if err := sc.Scan(dst...); err != nil {
		return nil, err
	}
	c.CampaignID, c.PhotoID = nullInt(camp), nullInt(photo)
	c.ShareOn = share == 1
	_ = json.Unmarshal([]byte(token), &c.Token)
	if withSheet {
		c.Sheet = json.RawMessage(sheet)
	}
	return &c, nil
}

// CharacterFilter narrows the list.
type CharacterFilter struct {
	CampaignID int64  // 0 = all, -1 = without a campaign
	Status     string // "" = all
	Sheets     bool   // include the whole sheet
}

// ListCharacters lists a person's characters.
func (s *Store) ListCharacters(ctx context.Context, uid int64, f CharacterFilter) ([]Character, error) {
	q := `SELECT ` + characterCols
	if f.Sheets {
		q += `, ch.sheet`
	}
	q += ` FROM characters ch WHERE ch.user_id = ?`
	args := []any{uid}
	switch {
	case f.CampaignID > 0:
		q += ` AND ch.campaign_id = ?`
		args = append(args, f.CampaignID)
	case f.CampaignID < 0:
		q += ` AND ch.campaign_id IS NULL`
	}
	if f.Status != "" {
		q += ` AND ch.status = ?`
		args = append(args, f.Status)
	}
	q += ` ORDER BY CASE ch.status WHEN 'active' THEN 0 ELSE 1 END, ch.kind, ch.updated_at DESC`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Character{}
	for rows.Next() {
		c, err := scanCharacter(rows, f.Sheets)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// GetCharacter returns one of a person's characters with the whole sheet.
func (s *Store) GetCharacter(ctx context.Context, uid, id int64) (*Character, error) {
	c, err := scanCharacter(s.DB.QueryRowContext(ctx, `SELECT `+characterCols+`, ch.sheet FROM characters ch WHERE ch.user_id = ? AND ch.id = ?`, uid, id), true)
	return c, notFound(err)
}

// CharacterByShare finds a character by its share link (only while it is on).
func (s *Store) CharacterByShare(ctx context.Context, token string) (*Character, error) {
	if len(token) < 16 {
		return nil, ErrNotFound
	}
	c, err := scanCharacter(s.DB.QueryRowContext(ctx, `SELECT `+characterCols+`, ch.sheet FROM characters ch WHERE ch.share_token = ? AND ch.share_on = 1`, token), true)
	return c, notFound(err)
}

// CreateCharacter adds a character.
func (s *Store) CreateCharacter(ctx context.Context, c *Character) error {
	if c.ShareToken == "" {
		c.ShareToken = RandomToken(18)
	}
	if len(c.Sheet) == 0 {
		c.Sheet = json.RawMessage("{}")
	}
	res, err := s.DB.ExecContext(ctx, `INSERT INTO characters (user_id, campaign_id, name, player, kind, level, classes, class_key, species, ac, hp_max, hp_cur, hp_temp,
		init, pp, speed, xp, sheet, token, photo_id, status, share_token, share_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.UserID, nullI(c.CampaignID), c.Name, c.Player, c.Kind, c.Level, c.Classes, c.ClassKey, c.Species, c.AC, c.HPMax, c.HPCur, c.HPTemp,
		c.Init, c.PP, c.Speed, c.XP, string(c.Sheet), toJSON(c.Token), nullI(c.PhotoID), c.Status, c.ShareToken, boolInt(c.ShareOn))
	if err != nil {
		return err
	}
	c.ID, _ = res.LastInsertId()
	return nil
}

// UpdateCharacter saves a character.
func (s *Store) UpdateCharacter(ctx context.Context, c *Character) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE characters SET campaign_id = ?, name = ?, player = ?, kind = ?, level = ?, classes = ?, class_key = ?, species = ?, ac = ?,
		hp_max = ?, hp_cur = ?, hp_temp = ?, init = ?, pp = ?, speed = ?, xp = ?, sheet = ?, token = ?, photo_id = ?, status = ?, share_token = ?, share_on = ?,
		updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`,
		nullI(c.CampaignID), c.Name, c.Player, c.Kind, c.Level, c.Classes, c.ClassKey, c.Species, c.AC, c.HPMax, c.HPCur, c.HPTemp, c.Init, c.PP, c.Speed, c.XP,
		string(c.Sheet), toJSON(c.Token), nullI(c.PhotoID), c.Status, c.ShareToken, boolInt(c.ShareOn), c.UserID, c.ID)
	return affected(res, err)
}

// SetCharacterHP changes only the hit points (the fight and the quick buttons).
func (s *Store) SetCharacterHP(ctx context.Context, uid, id int64, cur, temp int) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE characters SET hp_cur = ?, hp_temp = ?, sheet = json_set(sheet, '$.hp.cur', ?, '$.hp.temp', ?),
		updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`, cur, temp, cur, temp, uid, id)
	return affected(res, err)
}

// AddCharacterXP gives XP to characters (a played game night).
func (s *Store) AddCharacterXP(ctx context.Context, uid int64, ids []int64, xp int) error {
	if xp == 0 || len(ids) == 0 {
		return nil
	}
	for _, id := range ids {
		if _, err := s.DB.ExecContext(ctx, `UPDATE characters SET xp = MAX(0, xp + ?), sheet = json_set(sheet, '$.xp', MAX(0, xp + ?)),
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`, xp, xp, uid, id); err != nil {
			return err
		}
	}
	return nil
}

// DeleteCharacter removes a character.
func (s *Store) DeleteCharacter(ctx context.Context, uid, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM characters WHERE user_id = ? AND id = ?`, uid, id)
	return affected(res, err)
}

// OwnCharacterIDs keeps the ids that are the person's characters.
func (s *Store) OwnCharacterIDs(ctx context.Context, uid int64, ids []int64) []int64 {
	out := []int64{}
	if len(ids) == 0 {
		return out
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := []any{uid}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT id FROM characters WHERE user_id = ? AND id IN (`+ph+`)`, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	have := map[int64]bool{}
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			have[id] = true
		}
	}
	for _, id := range ids {
		if have[id] {
			out = append(out, id)
			delete(have, id)
		}
	}
	return out
}
