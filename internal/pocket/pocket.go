// Package pocket talks to sibling Pocket apps for Quest: Pocket Calendar
// (game nights) and Pocket Tasks (prep). Pocket Notes and Pocket Chat are
// reached with plain JSON calls (internal/server/apps.go). Same
// bearer-token JSON API everywhere.
package pocket

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is a bearer-token JSON client for one Pocket app.
type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

// New creates a client.
func New(baseURL, token string, timeout time.Duration) *Client {
	return &Client{BaseURL: strings.TrimRight(baseURL, "/"), Token: token, HTTP: &http.Client{Timeout: timeout}}
}

// Configured reports whether URL and token are set.
func (c *Client) Configured() bool { return c != nil && c.BaseURL != "" && c.Token != "" }

// ErrNotFound is a 404 from the sibling app.
var ErrNotFound = errors.New("not found")

func (c *Client) do(ctx context.Context, method, path string, q url.Values, body any, v any) error {
	if !c.Configured() {
		return errors.New("not configured")
	}
	u := c.BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized {
		return errors.New("token rejected (401)")
	}
	if res.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if res.StatusCode >= 300 {
		var e struct {
			Error string `json:"error"`
		}
		b, _ := io.ReadAll(io.LimitReader(res.Body, 2000))
		_ = json.Unmarshal(b, &e)
		if e.Error != "" {
			return fmt.Errorf("HTTP %d: %s", res.StatusCode, e.Error)
		}
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	if v == nil || res.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(v)
}

// Health is the connection test for any Pocket app: /healthz plus a token check.
func (c *Client) Health(ctx context.Context) (string, error) {
	var out struct {
		Status  string `json:"status"`
		Version string `json:"version"`
	}
	if !c.Configured() {
		return "", errors.New("not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/healthz", nil)
	if err != nil {
		return "", err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", res.StatusCode)
	}
	_ = json.NewDecoder(res.Body).Decode(&out)
	var me map[string]any
	if err := c.do(ctx, http.MethodGet, "/api/v1/auth/me", nil, nil, &me); err != nil {
		return out.Version, err
	}
	return out.Version, nil
}

// Do is a raw JSON call (for a connection test).
func (c *Client) Do(ctx context.Context, method, path string, q url.Values, body, v any) error {
	return c.do(ctx, method, path, q, body, v)
}

// list decodes a list that may be bare or wrapped in {key:[…]} / {results:[…]}.
func list[T any](raw json.RawMessage, keys ...string) ([]T, error) {
	var out []T
	if err := json.Unmarshal(raw, &out); err == nil {
		return out, nil
	}
	var wrap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return nil, err
	}
	for _, k := range append(keys, "results", "items") {
		if b, ok := wrap[k]; ok {
			if err := json.Unmarshal(b, &out); err != nil {
				return nil, err
			}
			return out, nil
		}
	}
	return []T{}, nil
}

// ---------------- Pocket Calendar ----------------

// Calendar is one of the person's calendars.
type Calendar struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Writable bool   `json:"writable"`
	Default  bool   `json:"is_default"`
}

// Calendars lists the calendars the person can write to.
func (c *Client) Calendars(ctx context.Context) ([]Calendar, error) {
	var raw json.RawMessage
	if err := c.do(ctx, http.MethodGet, "/api/v1/calendars", nil, nil, &raw); err != nil {
		return nil, err
	}
	all, err := list[Calendar](raw, "calendars")
	if err != nil {
		return nil, err
	}
	out := []Calendar{}
	for _, cal := range all {
		if cal.Writable {
			out = append(out, cal)
		}
	}
	return out, nil
}

// Event is a game night on the calendar.
type Event struct {
	CalendarID  int64
	Title       string
	Description string
	Location    string
	URL         string
	Start       string // YYYY-MM-DDTHH:MM (local)
	Minutes     int
}

func (e Event) body() map[string]any {
	b := map[string]any{"title": e.Title, "description": e.Description, "location": e.Location, "url": e.URL, "categories": []string{"Games"}}
	start, err := time.Parse("2006-01-02T15:04", e.Start)
	if err != nil {
		b["all_day"], b["start"] = true, e.Start
	} else {
		m := e.Minutes
		if m <= 0 {
			m = 240
		}
		b["all_day"], b["start"], b["end"] = false, start.Format("2006-01-02T15:04"), start.Add(time.Duration(m)*time.Minute).Format("2006-01-02T15:04")
	}
	if e.CalendarID > 0 {
		b["calendar_id"] = e.CalendarID
	}
	return b
}

// CreateEvent adds the event and returns its id.
func (c *Client) CreateEvent(ctx context.Context, e Event) (int64, error) {
	var out struct {
		EventID int64 `json:"event_id"`
		ID      any   `json:"id"`
	}
	if err := c.do(ctx, http.MethodPost, "/api/v1/events", nil, e.body(), &out); err != nil {
		return 0, err
	}
	if out.EventID > 0 {
		return out.EventID, nil
	}
	// a bare {"id": 12} or an occurrence id like "12:20261104"
	var id int64
	_, _ = fmt.Sscan(strings.SplitN(fmt.Sprint(out.ID), ":", 2)[0], &id)
	return id, nil
}

// UpdateEvent moves or renames the event.
func (c *Client) UpdateEvent(ctx context.Context, id int64, e Event) error {
	b := e.body()
	delete(b, "calendar_id")
	return c.do(ctx, http.MethodPut, fmt.Sprintf("/api/v1/events/%d", id), nil, b, nil)
}

// DeleteEvent removes the event; one already gone counts as deleted.
func (c *Client) DeleteEvent(ctx context.Context, id int64) error {
	err := c.do(ctx, http.MethodDelete, fmt.Sprintf("/api/v1/events/%d", id), nil, nil, nil)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	return err
}

// Busy is something already in the person's calendar.
type Busy struct {
	Title  string `json:"title"`
	Start  string `json:"start"`
	End    string `json:"end"`
	AllDay bool   `json:"all_day"`
	Busy   *bool  `json:"busy"`
	Source string `json:"source"`
}

// Events lists what is in the person's calendars between two days (YYYY-MM-DD).
func (c *Client) Events(ctx context.Context, from, to string) ([]Busy, error) {
	var raw json.RawMessage
	if err := c.do(ctx, http.MethodGet, "/api/v1/events", url.Values{"from": {from}, "to": {to}}, nil, &raw); err != nil {
		return nil, err
	}
	return list[Busy](raw, "events")
}

// ---------------- Pocket Tasks ----------------

// Task is a task in Pocket Tasks.
type Task struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

// CreateTask adds a task with a link back to Quest; due is YYYY-MM-DD or "".
func (c *Client) CreateTask(ctx context.Context, title, notes, due, link string) (*Task, error) {
	body := map[string]any{"title": title, "notes": notes, "url": link}
	if due != "" {
		body["due"] = due
	}
	var out Task
	if err := c.do(ctx, http.MethodPost, "/api/v1/tasks", nil, body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
