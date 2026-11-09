package store

import (
	"context"
	"encoding/json"
)

const sessionCols = `se.id, se.user_id, se.campaign_id, se.number, se.title, se.date, se.time, se.minutes, se.status, se.plan, se.recap, se.notes, se.xp, se.loot,
	se.attendance, se.calendar_ref, se.calendar_url, se.reminded, se.source, se.created_at, se.updated_at,
	COALESCE((SELECT name FROM campaigns c WHERE c.id = se.campaign_id), ''),
	(SELECT COUNT(1) FROM encounters e WHERE e.session_id = se.id)`

func scanSession(sc interface{ Scan(...any) error }) (*Session, error) {
	var x Session
	var att string
	if err := sc.Scan(&x.ID, &x.UserID, &x.CampaignID, &x.Number, &x.Title, &x.Date, &x.Time, &x.Minutes, &x.Status, &x.Plan, &x.Recap, &x.Notes, &x.XP, &x.Loot,
		&att, &x.CalendarRef, &x.CalendarURL, &x.Reminded, &x.Source, &x.CreatedAt, &x.UpdatedAt, &x.CampaignName, &x.Encounters); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(att), &x.Attendance)
	if x.Attendance == nil {
		x.Attendance = []int64{}
	}
	return &x, nil
}

// SessionFilter narrows the list.
type SessionFilter struct {
	CampaignID int64
	Status     string
	From, To   string // dates
	Limit      int
	Desc       bool
}

// ListSessions lists a person's game nights.
func (s *Store) ListSessions(ctx context.Context, uid int64, f SessionFilter) ([]Session, error) {
	q := `SELECT ` + sessionCols + ` FROM nights se WHERE se.user_id = ?`
	args := []any{uid}
	if f.CampaignID > 0 {
		q += ` AND se.campaign_id = ?`
		args = append(args, f.CampaignID)
	}
	if f.Status != "" {
		q += ` AND se.status = ?`
		args = append(args, f.Status)
	}
	if f.From != "" {
		q += ` AND se.date >= ?`
		args = append(args, f.From)
	}
	if f.To != "" {
		q += ` AND se.date <= ?`
		args = append(args, f.To)
	}
	if f.Desc {
		q += ` ORDER BY se.date DESC, se.number DESC`
	} else {
		q += ` ORDER BY se.date, se.number`
	}
	if f.Limit > 0 {
		q += ` LIMIT ?`
		args = append(args, f.Limit)
	}
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		x, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *x)
	}
	return out, rows.Err()
}

// GetSession returns one of a person's game nights.
func (s *Store) GetSession(ctx context.Context, uid, id int64) (*Session, error) {
	x, err := scanSession(s.DB.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM nights se WHERE se.user_id = ? AND se.id = ?`, uid, id))
	return x, notFound(err)
}

// NextSessionNumber is the number the next game night of a campaign gets.
func (s *Store) NextSessionNumber(ctx context.Context, uid, campaignID int64) int {
	var n int
	_ = s.DB.QueryRowContext(ctx, `SELECT COALESCE(MAX(number), 0) + 1 FROM nights WHERE user_id = ? AND campaign_id = ? AND status != 'cancelled'`, uid, campaignID).Scan(&n)
	return n
}

// CreateSession adds a game night.
func (s *Store) CreateGameSession(ctx context.Context, x *Session) error {
	res, err := s.DB.ExecContext(ctx, `INSERT INTO nights (user_id, campaign_id, number, title, date, time, minutes, status, plan, recap, notes, xp, loot, attendance, calendar_ref, calendar_url, source)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		x.UserID, x.CampaignID, x.Number, x.Title, x.Date, x.Time, x.Minutes, x.Status, x.Plan, x.Recap, x.Notes, x.XP, x.Loot, toJSON(x.Attendance), x.CalendarRef, x.CalendarURL, x.Source)
	if err != nil {
		return err
	}
	x.ID, _ = res.LastInsertId()
	s.TouchCampaign(ctx, x.UserID, x.CampaignID)
	return nil
}

// UpdateGameSession saves a game night.
func (s *Store) UpdateGameSession(ctx context.Context, x *Session) error {
	if x.Attendance == nil {
		x.Attendance = []int64{}
	}
	res, err := s.DB.ExecContext(ctx, `UPDATE nights SET campaign_id = ?, number = ?, title = ?, date = ?, time = ?, minutes = ?, status = ?, plan = ?, recap = ?, notes = ?,
		xp = ?, loot = ?, attendance = ?, calendar_ref = ?, calendar_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`,
		x.CampaignID, x.Number, x.Title, x.Date, x.Time, x.Minutes, x.Status, x.Plan, x.Recap, x.Notes, x.XP, x.Loot, toJSON(x.Attendance), x.CalendarRef, x.CalendarURL, x.UserID, x.ID)
	if err == nil {
		s.TouchCampaign(ctx, x.UserID, x.CampaignID)
	}
	return affected(res, err)
}

// MarkReminded records that the reminder for a game night went out today.
func (s *Store) MarkReminded(ctx context.Context, uid, id int64, day string) {
	_, _ = s.DB.ExecContext(ctx, `UPDATE nights SET reminded = ? WHERE user_id = ? AND id = ?`, day, uid, id)
}

// DeleteGameSession removes a game night.
func (s *Store) DeleteGameSession(ctx context.Context, uid, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM nights WHERE user_id = ? AND id = ?`, uid, id)
	return affected(res, err)
}

// OwnsSession reports whether the game night is the person's.
func (s *Store) OwnsSession(ctx context.Context, uid, id int64) bool {
	var n int
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM nights WHERE user_id = ? AND id = ?`, uid, id).Scan(&n)
	return n > 0
}
