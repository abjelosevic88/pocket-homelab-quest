package store

import (
	"context"
	"database/sql"
	"encoding/json"
)

// ---- the codex: people, places, factions, items, lore, handouts ----

const entryCols = `x.id, x.user_id, x.campaign_id, x.kind, x.name, x.subtitle, x.body, x.secret, x.status, x.attitude, x.place_id, x.monster, x.photo_id,
	x.revealed, x.pinned, x.tags, x.source, x.created_at, x.updated_at, COALESCE((SELECT name FROM codex p WHERE p.id = x.place_id), '')`

func scanEntry(sc interface{ Scan(...any) error }) (*Entry, error) {
	var e Entry
	var place, photo sql.NullInt64
	var rev, pin int
	var tags string
	if err := sc.Scan(&e.ID, &e.UserID, &e.CampaignID, &e.Kind, &e.Name, &e.Subtitle, &e.Body, &e.Secret, &e.Status, &e.Attitude, &place, &e.Monster, &photo,
		&rev, &pin, &tags, &e.Source, &e.CreatedAt, &e.UpdatedAt, &e.PlaceName); err != nil {
		return nil, err
	}
	e.PlaceID, e.PhotoID = nullInt(place), nullInt(photo)
	e.Revealed, e.Pinned = rev == 1, pin == 1
	_ = json.Unmarshal([]byte(tags), &e.Tags)
	if e.Tags == nil {
		e.Tags = []string{}
	}
	return &e, nil
}

// ListEntries lists a campaign's codex (kind "" = everything; revealed = only what players may see).
func (s *Store) ListEntries(ctx context.Context, uid, campaignID int64, kind string, revealed bool) ([]Entry, error) {
	q := `SELECT ` + entryCols + ` FROM codex x WHERE x.user_id = ?`
	args := []any{uid}
	if campaignID > 0 {
		q += ` AND x.campaign_id = ?`
		args = append(args, campaignID)
	}
	if kind != "" {
		q += ` AND x.kind = ?`
		args = append(args, kind)
	}
	if revealed {
		q += ` AND x.revealed = 1`
	}
	q += ` ORDER BY x.pinned DESC, x.name COLLATE NOCASE`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Entry{}
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// GetEntry returns one codex entry.
func (s *Store) GetEntry(ctx context.Context, uid, id int64) (*Entry, error) {
	e, err := scanEntry(s.DB.QueryRowContext(ctx, `SELECT `+entryCols+` FROM codex x WHERE x.user_id = ? AND x.id = ?`, uid, id))
	return e, notFound(err)
}

// EntryInCampaign reports whether the entry is the person's and in that campaign.
func (s *Store) EntryInCampaign(ctx context.Context, uid, campaignID, id int64) bool {
	var n int
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM codex WHERE user_id = ? AND campaign_id = ? AND id = ?`, uid, campaignID, id).Scan(&n)
	return n > 0
}

// CreateEntry adds a codex entry.
func (s *Store) CreateEntry(ctx context.Context, e *Entry) error {
	res, err := s.DB.ExecContext(ctx, `INSERT INTO codex (user_id, campaign_id, kind, name, subtitle, body, secret, status, attitude, place_id, monster, photo_id, revealed, pinned, tags, source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.UserID, e.CampaignID, e.Kind, e.Name, e.Subtitle, e.Body, e.Secret, e.Status, e.Attitude, nullI(e.PlaceID), e.Monster, nullI(e.PhotoID),
		boolInt(e.Revealed), boolInt(e.Pinned), toJSON(CleanTags(e.Tags)), e.Source)
	if err != nil {
		return err
	}
	e.ID, _ = res.LastInsertId()
	s.TouchCampaign(ctx, e.UserID, e.CampaignID)
	return nil
}

// UpdateEntry saves a codex entry.
func (s *Store) UpdateEntry(ctx context.Context, e *Entry) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE codex SET kind = ?, name = ?, subtitle = ?, body = ?, secret = ?, status = ?, attitude = ?, place_id = ?, monster = ?, photo_id = ?,
		revealed = ?, pinned = ?, tags = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`,
		e.Kind, e.Name, e.Subtitle, e.Body, e.Secret, e.Status, e.Attitude, nullI(e.PlaceID), e.Monster, nullI(e.PhotoID),
		boolInt(e.Revealed), boolInt(e.Pinned), toJSON(CleanTags(e.Tags)), e.UserID, e.ID)
	return affected(res, err)
}

// DeleteEntry removes a codex entry.
func (s *Store) DeleteEntry(ctx context.Context, uid, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM codex WHERE user_id = ? AND id = ?`, uid, id)
	return affected(res, err)
}

// ---- quests ----

const questCols = `q.id, q.user_id, q.campaign_id, q.title, q.status, q.giver_id, q.place_id, q.summary, q.secret, q.reward, q.objectives, q.revealed, q.sort,
	q.done_on, q.source, q.created_at, q.updated_at, COALESCE((SELECT name FROM codex g WHERE g.id = q.giver_id), ''), COALESCE((SELECT name FROM codex p WHERE p.id = q.place_id), '')`

func scanQuest(sc interface{ Scan(...any) error }) (*Quest, error) {
	var q Quest
	var giver, place sql.NullInt64
	var obj string
	var rev int
	if err := sc.Scan(&q.ID, &q.UserID, &q.CampaignID, &q.Title, &q.Status, &giver, &place, &q.Summary, &q.Secret, &q.Reward, &obj, &rev, &q.Sort,
		&q.DoneOn, &q.Source, &q.CreatedAt, &q.UpdatedAt, &q.GiverName, &q.PlaceName); err != nil {
		return nil, err
	}
	q.GiverID, q.PlaceID = nullInt(giver), nullInt(place)
	q.Revealed = rev == 1
	_ = json.Unmarshal([]byte(obj), &q.Objectives)
	if q.Objectives == nil {
		q.Objectives = []Objective{}
	}
	return &q, nil
}

// ListQuests lists a campaign's quest log (campaignID 0 = every campaign).
func (s *Store) ListQuests(ctx context.Context, uid, campaignID int64, revealed bool) ([]Quest, error) {
	q := `SELECT ` + questCols + ` FROM quests q WHERE q.user_id = ?`
	args := []any{uid}
	if campaignID > 0 {
		q += ` AND q.campaign_id = ?`
		args = append(args, campaignID)
	}
	if revealed {
		q += ` AND q.revealed = 1`
	}
	q += ` ORDER BY CASE q.status WHEN 'active' THEN 0 WHEN 'rumour' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, q.sort, q.updated_at DESC`
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Quest{}
	for rows.Next() {
		x, err := scanQuest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *x)
	}
	return out, rows.Err()
}

// GetQuest returns one quest.
func (s *Store) GetQuest(ctx context.Context, uid, id int64) (*Quest, error) {
	q, err := scanQuest(s.DB.QueryRowContext(ctx, `SELECT `+questCols+` FROM quests q WHERE q.user_id = ? AND q.id = ?`, uid, id))
	return q, notFound(err)
}

// CreateQuest adds a quest.
func (s *Store) CreateQuest(ctx context.Context, q *Quest) error {
	res, err := s.DB.ExecContext(ctx, `INSERT INTO quests (user_id, campaign_id, title, status, giver_id, place_id, summary, secret, reward, objectives, revealed, sort, done_on, source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		q.UserID, q.CampaignID, q.Title, q.Status, nullI(q.GiverID), nullI(q.PlaceID), q.Summary, q.Secret, q.Reward, toJSON(q.Objectives), boolInt(q.Revealed), q.Sort, q.DoneOn, q.Source)
	if err != nil {
		return err
	}
	q.ID, _ = res.LastInsertId()
	s.TouchCampaign(ctx, q.UserID, q.CampaignID)
	return nil
}

// UpdateQuest saves a quest.
func (s *Store) UpdateQuest(ctx context.Context, q *Quest) error {
	if q.Objectives == nil {
		q.Objectives = []Objective{}
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE quests SET title = ?, status = ?, giver_id = ?, place_id = ?, summary = ?, secret = ?, reward = ?, objectives = ?, revealed = ?,
		sort = ?, done_on = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`,
		q.Title, q.Status, nullI(q.GiverID), nullI(q.PlaceID), q.Summary, q.Secret, q.Reward, toJSON(q.Objectives), boolInt(q.Revealed), q.Sort, q.DoneOn, q.UserID, q.ID)
	return affected(res, err)
}

// DeleteQuest removes a quest.
func (s *Store) DeleteQuest(ctx context.Context, uid, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM quests WHERE user_id = ? AND id = ?`, uid, id)
	return affected(res, err)
}
