package store

import (
	"context"
	"database/sql"
	"encoding/json"
)

// ---- encounters ----

const encounterCols = `e.id, e.user_id, e.campaign_id, e.session_id, e.name, e.place, e.readaloud, e.notes, e.status, e.plan, e.state, e.xp, e.finished_at,
	e.created_at, e.updated_at, COALESCE((SELECT name FROM campaigns c WHERE c.id = e.campaign_id), '')`

func scanEncounter(sc interface{ Scan(...any) error }) (*Encounter, error) {
	var e Encounter
	var camp, sess sql.NullInt64
	var plan, state string
	if err := sc.Scan(&e.ID, &e.UserID, &camp, &sess, &e.Name, &e.Place, &e.Readaloud, &e.Notes, &e.Status, &plan, &state, &e.XP, &e.FinishedAt,
		&e.CreatedAt, &e.UpdatedAt, &e.CampaignName); err != nil {
		return nil, err
	}
	e.CampaignID, e.SessionID = nullInt(camp), nullInt(sess)
	_ = json.Unmarshal([]byte(plan), &e.Plan)
	_ = json.Unmarshal([]byte(state), &e.State)
	NormalizeFight(&e.State)
	if e.Plan == nil {
		e.Plan = []PlanLine{}
	}
	return &e, nil
}

// NormalizeFight fills the empty lists so the JSON is never null.
func NormalizeFight(f *Fight) {
	if f.Combatants == nil {
		f.Combatants = []Combatant{}
	}
	if f.Log == nil {
		f.Log = []LogLine{}
	}
	for i := range f.Combatants {
		if f.Combatants[i].Conditions == nil {
			f.Combatants[i].Conditions = []string{}
		}
	}
	if f.Turn < 0 || f.Turn >= len(f.Combatants) {
		f.Turn = 0
	}
}

// EncounterFilter narrows the list.
type EncounterFilter struct {
	CampaignID int64
	SessionID  int64
	Status     string
}

// ListEncounters lists a person's encounters, running ones first.
func (s *Store) ListEncounters(ctx context.Context, uid int64, f EncounterFilter) ([]Encounter, error) {
	q := `SELECT ` + encounterCols + ` FROM encounters e WHERE e.user_id = ?`
	args := []any{uid}
	if f.CampaignID > 0 {
		q += ` AND e.campaign_id = ?`
		args = append(args, f.CampaignID)
	}
	if f.SessionID > 0 {
		q += ` AND e.session_id = ?`
		args = append(args, f.SessionID)
	}
	if f.Status != "" {
		q += ` AND e.status = ?`
		args = append(args, f.Status)
	}
	q += ` ORDER BY CASE e.status WHEN 'running' THEN 0 WHEN 'plan' THEN 1 ELSE 2 END, e.updated_at DESC`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Encounter{}
	for rows.Next() {
		e, err := scanEncounter(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// GetEncounter returns one encounter.
func (s *Store) GetEncounter(ctx context.Context, uid, id int64) (*Encounter, error) {
	e, err := scanEncounter(s.DB.QueryRowContext(ctx, `SELECT `+encounterCols+` FROM encounters e WHERE e.user_id = ? AND e.id = ?`, uid, id))
	return e, notFound(err)
}

// RunningEncounter is the campaign's fight in progress (for the player view).
func (s *Store) RunningEncounter(ctx context.Context, uid, campaignID int64) (*Encounter, error) {
	e, err := scanEncounter(s.DB.QueryRowContext(ctx, `SELECT `+encounterCols+` FROM encounters e WHERE e.user_id = ? AND e.campaign_id = ? AND e.status = 'running'
		ORDER BY e.updated_at DESC LIMIT 1`, uid, campaignID))
	return e, notFound(err)
}

// CreateEncounter adds an encounter.
func (s *Store) CreateEncounter(ctx context.Context, e *Encounter) error {
	NormalizeFight(&e.State)
	if e.Plan == nil {
		e.Plan = []PlanLine{}
	}
	res, err := s.DB.ExecContext(ctx, `INSERT INTO encounters (user_id, campaign_id, session_id, name, place, readaloud, notes, status, plan, state, xp, finished_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.UserID, nullI(e.CampaignID), nullI(e.SessionID), e.Name, e.Place, e.Readaloud, e.Notes, e.Status, toJSON(e.Plan), toJSON(e.State), e.XP, e.FinishedAt)
	if err != nil {
		return err
	}
	e.ID, _ = res.LastInsertId()
	return nil
}

// UpdateEncounter saves an encounter.
func (s *Store) UpdateEncounter(ctx context.Context, e *Encounter) error {
	NormalizeFight(&e.State)
	if e.Plan == nil {
		e.Plan = []PlanLine{}
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE encounters SET campaign_id = ?, session_id = ?, name = ?, place = ?, readaloud = ?, notes = ?, status = ?, plan = ?, state = ?,
		xp = ?, finished_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`,
		nullI(e.CampaignID), nullI(e.SessionID), e.Name, e.Place, e.Readaloud, e.Notes, e.Status, toJSON(e.Plan), toJSON(e.State), e.XP, e.FinishedAt, e.UserID, e.ID)
	return affected(res, err)
}

// DeleteEncounter removes an encounter.
func (s *Store) DeleteEncounter(ctx context.Context, uid, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM encounters WHERE user_id = ? AND id = ?`, uid, id)
	return affected(res, err)
}

// ---- creatures (homebrew monsters) ----

func scanCreature(sc interface{ Scan(...any) error }) (*Creature, error) {
	var c Creature
	var data string
	var photo sql.NullInt64
	if err := sc.Scan(&c.ID, &c.UserID, &c.Name, &data, &photo, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	c.Data, c.PhotoID = json.RawMessage(data), nullInt(photo)
	return &c, nil
}

const creatureCols = `id, user_id, name, data, photo_id, created_at, updated_at`

// ListCreatures lists a person's own monsters.
func (s *Store) ListCreatures(ctx context.Context, uid int64) ([]Creature, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+creatureCols+` FROM creatures WHERE user_id = ? ORDER BY name COLLATE NOCASE`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Creature{}
	for rows.Next() {
		c, err := scanCreature(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// GetCreature returns one of a person's monsters.
func (s *Store) GetCreature(ctx context.Context, uid, id int64) (*Creature, error) {
	c, err := scanCreature(s.DB.QueryRowContext(ctx, `SELECT `+creatureCols+` FROM creatures WHERE user_id = ? AND id = ?`, uid, id))
	return c, notFound(err)
}

// CreateCreature adds a monster.
func (s *Store) CreateCreature(ctx context.Context, c *Creature) error {
	res, err := s.DB.ExecContext(ctx, `INSERT INTO creatures (user_id, name, data, photo_id) VALUES (?, ?, ?, ?)`, c.UserID, c.Name, string(c.Data), nullI(c.PhotoID))
	if err != nil {
		return err
	}
	c.ID, _ = res.LastInsertId()
	return nil
}

// UpdateCreature saves a monster.
func (s *Store) UpdateCreature(ctx context.Context, c *Creature) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE creatures SET name = ?, data = ?, photo_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`,
		c.Name, string(c.Data), nullI(c.PhotoID), c.UserID, c.ID)
	return affected(res, err)
}

// DeleteCreature removes a monster.
func (s *Store) DeleteCreature(ctx context.Context, uid, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM creatures WHERE user_id = ? AND id = ?`, uid, id)
	return affected(res, err)
}

// ---- the dice log ----

// AddRoll records a roll and keeps the log to its last 500.
func (s *Store) AddRoll(ctx context.Context, r *Roll) error {
	if len(r.Detail) == 0 {
		r.Detail = json.RawMessage("{}")
	}
	res, err := s.DB.ExecContext(ctx, `INSERT INTO rolls (user_id, campaign_id, character_id, label, expr, total, detail, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		r.UserID, nullI(r.CampaignID), nullI(r.CharacterID), r.Label, r.Expr, r.Total, string(r.Detail), r.Kind)
	if err != nil {
		return err
	}
	r.ID, _ = res.LastInsertId()
	r.CreatedAt = Now()
	_, _ = s.DB.ExecContext(ctx, `DELETE FROM rolls WHERE user_id = ? AND id NOT IN (SELECT id FROM rolls WHERE user_id = ? ORDER BY id DESC LIMIT 500)`, r.UserID, r.UserID)
	return nil
}

// ListRolls lists the latest rolls (characterID 0 = everyone's).
func (s *Store) ListRolls(ctx context.Context, uid, characterID int64, limit int) ([]Roll, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	q := `SELECT r.id, r.user_id, r.campaign_id, r.character_id, r.label, r.expr, r.total, r.detail, r.kind, r.created_at,
		COALESCE((SELECT name FROM characters ch WHERE ch.id = r.character_id), '') FROM rolls r WHERE r.user_id = ?`
	args := []any{uid}
	if characterID > 0 {
		q += ` AND r.character_id = ?`
		args = append(args, characterID)
	}
	q += ` ORDER BY r.id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Roll{}
	for rows.Next() {
		var r Roll
		var camp, char sql.NullInt64
		var detail string
		if err := rows.Scan(&r.ID, &r.UserID, &camp, &char, &r.Label, &r.Expr, &r.Total, &detail, &r.Kind, &r.CreatedAt, &r.CharacterName); err != nil {
			return nil, err
		}
		r.CampaignID, r.CharacterID, r.Detail = nullInt(camp), nullInt(char), json.RawMessage(detail)
		out = append(out, r)
	}
	return out, rows.Err()
}

// ClearRolls empties the dice log.
func (s *Store) ClearRolls(ctx context.Context, uid int64) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM rolls WHERE user_id = ?`, uid)
	return err
}
