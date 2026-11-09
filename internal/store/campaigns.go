package store

import (
	"context"
	"database/sql"
)

const campaignCols = `c.id, c.user_id, c.name, c.tagline, c.world, c.status, c.emblem, c.color, c.photo_id, c.summary, c.secrets, c.house_rules,
	c.advancement, c.schedule, c.place, c.share_token, c.share_on, c.created_at, c.updated_at,
	(SELECT COUNT(1) FROM characters ch WHERE ch.campaign_id = c.id AND ch.status = 'active'),
	COALESCE((SELECT CAST(ROUND(AVG(ch.level)) AS INTEGER) FROM characters ch WHERE ch.campaign_id = c.id AND ch.status = 'active' AND ch.kind = 'pc'), 0),
	(SELECT COUNT(1) FROM nights se WHERE se.campaign_id = c.id AND se.status = 'played'),
	COALESCE((SELECT MIN(se.date) FROM nights se WHERE se.campaign_id = c.id AND se.status = 'planned' AND se.date >= date('now','localtime')), ''),
	(SELECT COUNT(1) FROM quests q WHERE q.campaign_id = c.id AND q.status = 'active')`

func scanCampaign(sc interface{ Scan(...any) error }) (*Campaign, error) {
	var c Campaign
	var photo sql.NullInt64
	var share int
	if err := sc.Scan(&c.ID, &c.UserID, &c.Name, &c.Tagline, &c.World, &c.Status, &c.Emblem, &c.Color, &photo, &c.Summary, &c.Secrets, &c.HouseRules,
		&c.Advancement, &c.Schedule, &c.Place, &c.ShareToken, &share, &c.CreatedAt, &c.UpdatedAt,
		&c.Party, &c.PartyLevel, &c.Sessions, &c.NextSession, &c.OpenQuests); err != nil {
		return nil, err
	}
	c.PhotoID = nullInt(photo)
	c.ShareOn = share == 1
	return &c, nil
}

// ListCampaigns lists a person's campaigns, the active ones first.
func (s *Store) ListCampaigns(ctx context.Context, uid int64) ([]Campaign, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT `+campaignCols+` FROM campaigns c WHERE c.user_id = ?
		ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, c.updated_at DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Campaign{}
	for rows.Next() {
		c, err := scanCampaign(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// GetCampaign returns one of a person's campaigns.
func (s *Store) GetCampaign(ctx context.Context, uid, id int64) (*Campaign, error) {
	c, err := scanCampaign(s.DB.QueryRowContext(ctx, `SELECT `+campaignCols+` FROM campaigns c WHERE c.user_id = ? AND c.id = ?`, uid, id))
	return c, notFound(err)
}

// CampaignByShare finds a campaign by its player link (only while it is on).
func (s *Store) CampaignByShare(ctx context.Context, token string) (*Campaign, error) {
	if len(token) < 16 {
		return nil, ErrNotFound
	}
	c, err := scanCampaign(s.DB.QueryRowContext(ctx, `SELECT `+campaignCols+` FROM campaigns c WHERE c.share_token = ? AND c.share_on = 1`, token))
	return c, notFound(err)
}

// OwnsCampaign reports whether the campaign is the person's.
func (s *Store) OwnsCampaign(ctx context.Context, uid, id int64) bool {
	var n int
	_ = s.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM campaigns WHERE user_id = ? AND id = ?`, uid, id).Scan(&n)
	return n > 0
}

// CreateCampaign adds a campaign.
func (s *Store) CreateCampaign(ctx context.Context, c *Campaign) error {
	if c.ShareToken == "" {
		c.ShareToken = RandomToken(18)
	}
	res, err := s.DB.ExecContext(ctx, `INSERT INTO campaigns (user_id, name, tagline, world, status, emblem, color, photo_id, summary, secrets, house_rules, advancement, schedule, place, share_token, share_on)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.UserID, c.Name, c.Tagline, c.World, c.Status, c.Emblem, c.Color, nullI(c.PhotoID), c.Summary, c.Secrets, c.HouseRules, c.Advancement, c.Schedule, c.Place, c.ShareToken, boolInt(c.ShareOn))
	if err != nil {
		return err
	}
	c.ID, _ = res.LastInsertId()
	return nil
}

// UpdateCampaign saves a campaign.
func (s *Store) UpdateCampaign(ctx context.Context, c *Campaign) error {
	res, err := s.DB.ExecContext(ctx, `UPDATE campaigns SET name = ?, tagline = ?, world = ?, status = ?, emblem = ?, color = ?, photo_id = ?, summary = ?, secrets = ?,
		house_rules = ?, advancement = ?, schedule = ?, place = ?, share_token = ?, share_on = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`,
		c.Name, c.Tagline, c.World, c.Status, c.Emblem, c.Color, nullI(c.PhotoID), c.Summary, c.Secrets, c.HouseRules, c.Advancement, c.Schedule, c.Place,
		c.ShareToken, boolInt(c.ShareOn), c.UserID, c.ID)
	return affected(res, err)
}

// TouchCampaign marks a campaign as just used (it moves up the list).
func (s *Store) TouchCampaign(ctx context.Context, uid, id int64) {
	_, _ = s.DB.ExecContext(ctx, `UPDATE campaigns SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id = ?`, uid, id)
}

// DeleteCampaign removes a campaign with its sessions, codex and quests
// (characters stay, without a campaign).
func (s *Store) DeleteCampaign(ctx context.Context, uid, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM campaigns WHERE user_id = ? AND id = ?`, uid, id)
	return affected(res, err)
}

func affected(res sql.Result, err error) error {
	if err != nil {
		return conflict(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
