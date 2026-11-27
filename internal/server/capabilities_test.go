package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/config"
)

// fakeCapCore is a Pocket Core that vouches for link tokens
// pcx_<alice|bob>_<search|day|widget|capture|read|write> from Pocket Hub
// and remembers the manifest Quest registers with.
type fakeCapCore struct {
	*httptest.Server
	mu       sync.Mutex
	manifest map[string]any
}

func newCapApp(t *testing.T) (*app, *fakeCapCore) {
	t.Helper()
	fc := &fakeCapCore{}
	scopes := map[string]string{"search": core.ScopeSearch, "day": core.ScopeDay, "widget": core.ScopeWidget, "capture": core.ScopeCapture,
		"read": "quest:read", "write": "quest:write"}
	fc.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/apps/register":
			var m map[string]any
			_ = json.NewDecoder(r.Body).Decode(&m)
			fc.mu.Lock()
			fc.manifest = m
			fc.mu.Unlock()
			io.WriteString(w, `{}`)
		case "/api/v1/auth/introspect":
			var in struct{ Token string }
			_ = json.NewDecoder(r.Body).Decode(&in)
			parts := strings.Split(in.Token, "_")
			if len(parts) != 3 || parts[0] != "pcx" || scopes[parts[2]] == "" {
				io.WriteString(w, `{"active":false}`)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"active": true, "kind": "delegated", "audience": "quest", "scope": scopes[parts[2]],
				"user": map[string]any{"id": 1, "sub": parts[1] + "@example.com", "email": parts[1] + "@example.com", "name": parts[1], "role": "member"},
				"app":  map[string]any{"id": 9, "slug": "hub", "name": "Pocket Hub"}})
		default:
			io.WriteString(w, `{}`)
		}
	}))
	t.Cleanup(fc.Close)
	return newApp(t, func(c *config.Config) { c.CoreURL, c.CoreRegistrationKey = fc.URL, "key" }), fc
}

// capItems are the rows of a capability answer.
func capItems(t *testing.T, m map[string]any) []map[string]any {
	t.Helper()
	l, ok := m["items"].([]any)
	if !ok {
		t.Fatalf("no items list in %v", m)
	}
	out := []map[string]any{}
	for _, v := range l {
		out = append(out, v.(map[string]any))
	}
	return out
}

// capItem finds the row with that title.
func capItem(t *testing.T, m map[string]any, title string) map[string]any {
	t.Helper()
	for _, it := range capItems(t, m) {
		if it["title"] == title {
			return it
		}
	}
	t.Fatalf("no %q in %v", title, m["items"])
	return nil
}

func TestPocketSearch(t *testing.T) {
	a := newApp(t, nil)
	ids := table(a, a.alice)
	cid := n(ids["campaign"])
	a.ok(a.alice, "PUT", "/api/v1/campaigns/"+ids["campaign"], map[string]any{"tagline": "Who stole the crown of fire?"})
	enc := a.expect(201, a.alice, "POST", "/api/v1/encounters", map[string]any{"name": "Fire beetles", "place": "The cellar", "campaign_id": cid})["encounter"].(map[string]any)

	// the person's own things first (a name with the words on top), then the rules
	res := a.ok(a.alice, "GET", "/api/v1/pocket/search?q=fire&limit=20", nil)
	all := capItems(t, res)
	if len(all) < 4 || all[0]["title"] != "Fire beetles" || all[0]["kind"] != "encounter" || all[0]["id"] != "encounter:"+id(enc) ||
		all[0]["url"] != "/encounters/"+id(enc) || all[0]["snippet"] != "The cellar · The Ember Crown" {
		t.Fatalf("the encounter leads: %v", all)
	}
	if all[1]["title"] != "The Ember Crown" || all[1]["kind"] != "campaign" || all[1]["snippet"] != "Who stole the crown of fire?" || all[1]["url"] != "/campaigns/"+ids["campaign"] {
		t.Fatalf("then the campaign whose tagline has the words: %v", all[1])
	}
	ball := capItem(t, res, "Fireball")
	if ball["kind"] != "spell" || ball["url"] != "/compendium/spells/fireball" || ball["snippet"] == "" {
		t.Fatalf("a spell: %v", ball)
	}
	for _, it := range all[2:] {
		if it["kind"] == "encounter" || it["kind"] == "campaign" {
			t.Fatalf("own things after the rules: %v", all)
		}
	}
	if gob := capItem(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q=goblin", nil), "Goblin"); gob["kind"] != "monster" || gob["url"] != "/compendium/monsters/srd:goblin" {
		t.Fatalf("a monster: %v", gob)
	}

	thora := capItem(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q=thora", nil), "Thora")
	if thora["kind"] != "character" || thora["id"] != "character:"+ids["Thora"] || thora["url"] != "/characters/"+ids["Thora"] ||
		thora["snippet"] != "Cleric 3 · Hill Dwarf · The Ember Crown" {
		t.Fatalf("character: %v", thora)
	}
	npc := capItem(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q=aldous", nil), "Brother Aldous")
	if npc["kind"] != "person" || npc["url"] != "/campaigns/"+ids["campaign"]+"/codex/"+ids["npc"] || npc["snippet"] != "The Ember Crown" {
		t.Fatalf("codex: %v", npc)
	}
	q := capItem(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q=recover", nil), "Recover the crown")
	if q["kind"] != "quest" || q["url"] != "/campaigns/"+ids["campaign"]+"?tab=quests" || q["snippet"] != "Open · The Ember Crown" {
		t.Fatalf("quest: %v", q)
	}
	night := capItem(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q=seventh", nil), "Session 1 · The seventh level")
	if night["kind"] != "game night" || night["url"] != "/campaigns/"+ids["campaign"]+"/sessions/"+ids["session"] || night["date"] != dayAfter(3) ||
		night["snippet"] != "The Ember Crown · "+niceDate(dayAfter(3)) {
		t.Fatalf("game night: %v", night)
	}
	// secrets are not searched and never shown
	for _, secret := range []string{"priest did it", "leads the cult", "the hoard"} {
		if got := capItems(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q="+strings.ReplaceAll(secret, " ", "+"), nil)); len(got) != 0 {
			t.Fatalf("%q finds %v", secret, got)
		}
	}
	if got := capItems(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q=fire&limit=1", nil)); len(got) != 1 || got[0]["title"] != "Fire beetles" {
		t.Fatalf("limit 1: %v", got)
	}
	for _, words := range []string{"", "%3F%3F", "*", "+-+"} {
		if got := capItems(t, a.ok(a.alice, "GET", "/api/v1/pocket/search?q="+words, nil)); len(got) != 0 {
			t.Fatalf("%q finds %v", words, got)
		}
	}
	// another person's things never appear; the rules are the same for everyone
	for _, w := range []string{"thora", "ember", "aldous", "recover", "seventh", "cellar"} {
		if got := capItems(t, a.ok(a.bob, "GET", "/api/v1/pocket/search?q="+w, nil)); len(got) != 0 {
			t.Fatalf("bob finds alice's %q: %v", w, got)
		}
	}
	if got := capItems(t, a.ok(a.bob, "GET", "/api/v1/pocket/search?q=fire", nil)); len(got) == 0 || got[0]["kind"] == "encounter" || got[0]["kind"] == "campaign" {
		t.Fatalf("bob's fire: %v", got)
	}
	a.expect(401, "", "GET", "/api/v1/pocket/search?q=thora", nil)
}

func TestPocketDay(t *testing.T) {
	a := newApp(t, nil)
	ids := table(a, a.alice)
	cid := n(ids["campaign"])
	day := dayAfter(-2)
	played := a.expect(201, a.alice, "POST", "/api/v1/sessions", map[string]any{"campaign_id": cid, "date": day, "time": "19:00", "minutes": 240, "title": "Into the crypt"})
	a.ok(a.alice, "POST", "/api/v1/sessions/"+id(played)+"/play", map[string]any{"attendance": []int64{n(ids["Thora"]), n(ids["Kael"])}, "xp": 100,
		"recap": "The party   found\nthe crypt."})
	a.expect(201, a.alice, "POST", "/api/v1/sessions", map[string]any{"campaign_id": cid, "date": day, "time": "21:00", "status": "cancelled"})

	d := a.ok(a.alice, "GET", "/api/v1/pocket/day/"+day, nil)
	if d["date"] != day || d["summary"] != "1 game night played" || len(capItems(t, d)) != 1 {
		t.Fatalf("day: %v", d)
	}
	it := capItem(t, d, "Session 2 · Into the crypt")
	if it["id"] != id(played) || it["time"] != "19:00" || it["end"] != "23:00" || it["kind"] != "played" || it["done"] != true || num(it, "minutes") != 240 ||
		it["sub"] != "The Ember Crown · Thora and Kael" || it["note"] != "The party found the crypt." || it["url"] != "/campaigns/"+ids["campaign"]+"/sessions/"+id(played) {
		t.Fatalf("played night: %v", it)
	}
	// a planned one: who will come is not known yet
	planned := a.ok(a.alice, "GET", "/api/v1/pocket/day/"+dayAfter(3)+"?tz=Europe/Sarajevo", nil)
	if planned["summary"] != "1 game night planned" {
		t.Fatalf("planned day: %v", planned)
	}
	if p := capItem(t, planned, "Session 1 · The seventh level"); p["kind"] != "planned" || p["done"] != nil || p["sub"] != "The Ember Crown" || p["time"] != "19:00" || p["end"] != "23:00" {
		t.Fatalf("planned night: %v", p)
	}
	a.expect(201, a.alice, "POST", "/api/v1/sessions", map[string]any{"campaign_id": cid, "date": day, "time": "22:30", "minutes": 180})
	if d := a.ok(a.alice, "GET", "/api/v1/pocket/day/"+day, nil); d["summary"] != "1 game night played, 1 planned" || len(capItems(t, d)) != 2 {
		t.Fatalf("both: %v", d)
	} else if late := capItems(t, d)[1]; late["time"] != "22:30" || late["end"] != nil || late["title"] != "Session 3" {
		t.Fatalf("past midnight has no end: %v", late)
	}
	// a day with nothing, and somebody else's day
	if d := a.ok(a.alice, "GET", "/api/v1/pocket/day/2019-03-04", nil); d["summary"] != nil || len(capItems(t, d)) != 0 {
		t.Fatalf("an empty day: %v", d)
	}
	if d := a.ok(a.bob, "GET", "/api/v1/pocket/day/"+day, nil); d["summary"] != nil || len(capItems(t, d)) != 0 {
		t.Fatalf("bob sees alice's day: %v", d)
	}
	a.expect(400, a.alice, "GET", "/api/v1/pocket/day/yesterday", nil)
	// the old route still answers as before
	if old := a.ok(a.alice, "GET", "/api/v1/day/"+day, nil); len(old["sessions"].([]any)) != 2 {
		t.Fatalf("/day changed: %v", old)
	}
}

func TestPocketWidget(t *testing.T) {
	a := newApp(t, nil)
	// nothing at all: nothing to show
	if w := a.ok(a.bob, "GET", "/api/v1/pocket/widget", nil); w["line"] != nil || len(capItems(t, w)) != 0 {
		t.Fatalf("empty: %v", w)
	}
	ids := table(a, a.alice)
	cid := n(ids["campaign"])
	when, _ := time.Parse("2006-01-02", dayAfter(3))
	// nothing played yet: the active characters, changed last first
	a.ok(a.alice, "POST", "/api/v1/characters/"+ids["Thora"]+"/hp", map[string]any{"damage": 3})
	w := a.ok(a.alice, "GET", "/api/v1/pocket/widget", nil)
	if w["line"] != "Game night "+when.Format("Monday")+" 19:00 · The Ember Crown" || w["url"] != "/campaigns/"+ids["campaign"]+"/sessions/"+ids["session"] {
		t.Fatalf("widget: %v", w)
	}
	rows := capItems(t, w)
	if len(rows) != 2 || rows[0]["title"] != "Thora" || rows[0]["detail"] != "Cleric 3 · The Ember Crown" || rows[0]["url"] != "/characters/"+ids["Thora"] || rows[1]["title"] != "Kael" {
		t.Fatalf("characters: %v", rows)
	}
	// after a game night: who came to it
	x := a.expect(201, a.alice, "POST", "/api/v1/sessions", map[string]any{"campaign_id": cid, "date": dayAfter(-7), "time": "19:00"})
	a.ok(a.alice, "POST", "/api/v1/sessions/"+id(x)+"/play", map[string]any{"attendance": []int64{n(ids["Kael"])}})
	if rows := capItems(t, a.ok(a.alice, "GET", "/api/v1/pocket/widget", nil)); len(rows) != 1 || rows[0]["title"] != "Kael" || rows[0]["detail"] != "Wizard 3 · The Ember Crown" {
		t.Fatalf("who played last: %v", rows)
	}
	// tonight, then nothing planned
	tonight := a.expect(201, a.alice, "POST", "/api/v1/sessions", map[string]any{"campaign_id": cid, "date": today(), "time": "20:00"})
	if w := a.ok(a.alice, "GET", "/api/v1/pocket/widget", nil); w["line"] != "Game night today 20:00 · The Ember Crown" {
		t.Fatalf("tonight: %v", w)
	}
	a.ok(a.alice, "DELETE", "/api/v1/sessions/"+id(tonight), nil)
	a.ok(a.alice, "DELETE", "/api/v1/sessions/"+ids["session"], nil)
	if w := a.ok(a.alice, "GET", "/api/v1/pocket/widget", nil); w["line"] != "No game night planned" || w["url"] != "/" || len(capItems(t, w)) != 1 {
		t.Fatalf("nothing planned: %v", w)
	}
	// bob still sees nothing of alice's
	if w := a.ok(a.bob, "GET", "/api/v1/pocket/widget", nil); w["line"] != nil || len(capItems(t, w)) != 0 {
		t.Fatalf("bob: %v", w)
	}
}

// A link token with one pocket:* scope reaches its one route and nothing else.
func TestPocketLinkTokens(t *testing.T) {
	a, _ := newCapApp(t)
	ids := table(a, a.alice)
	day := dayAfter(3)
	for _, c := range []struct {
		tok, method, path string
		want              int
	}{
		{"pcx_alice_search", "GET", "/api/v1/pocket/search?q=thora", 200},
		{"pcx_alice_day", "GET", "/api/v1/pocket/day/" + day, 200},
		{"pcx_alice_widget", "GET", "/api/v1/pocket/widget", 200},
		{"pcx_alice_widget", "GET", "/api/v1/auth/me", 200},
		// another capability's route
		{"pcx_alice_search", "GET", "/api/v1/pocket/day/" + day, 403},
		{"pcx_alice_search", "GET", "/api/v1/pocket/widget", 403},
		{"pcx_alice_day", "GET", "/api/v1/pocket/search?q=thora", 403},
		{"pcx_alice_day", "GET", "/api/v1/pocket/widget", 403},
		{"pcx_alice_widget", "GET", "/api/v1/pocket/search?q=thora", 403},
		{"pcx_alice_widget", "GET", "/api/v1/pocket/day/" + day, 403},
		// nothing can be kept here: there is no such route
		{"pcx_alice_capture", "POST", "/api/v1/pocket/capture", 404},
		{"pcx_alice_capture", "GET", "/api/v1/pocket/widget", 403},
		{"pcx_alice_write", "POST", "/api/v1/pocket/capture", 404},
		// the rest of the app
		{"pcx_alice_widget", "GET", "/api/v1/home", 403},
		{"pcx_alice_widget", "GET", "/api/v1/summary", 403},
		{"pcx_alice_search", "GET", "/api/v1/search?q=thora", 403},
		{"pcx_alice_search", "GET", "/api/v1/characters", 403},
		{"pcx_alice_search", "GET", "/api/v1/srd/monsters", 403},
		{"pcx_alice_day", "GET", "/api/v1/day/" + day, 403},
		{"pcx_alice_day", "GET", "/api/v1/sessions", 403},
		{"pcx_alice_day", "GET", "/api/v1/campaigns/" + ids["campaign"], 403},
		{"pcx_alice_widget", "POST", "/api/v1/rolls", 403},
		{"pcx_alice_widget", "GET", "/api/v1/settings", 403},
		// the app's own scopes do not open the new routes
		{"pcx_alice_read", "GET", "/api/v1/pocket/search?q=thora", 403},
		{"pcx_alice_read", "GET", "/api/v1/pocket/day/" + day, 403},
		{"pcx_alice_read", "GET", "/api/v1/pocket/widget", 403},
		{"pcx_alice_write", "GET", "/api/v1/pocket/widget", 403},
		{"pcx_alice_read", "GET", "/api/v1/search?q=thora", 200},
		{"pcx_nobody", "GET", "/api/v1/pocket/widget", 401},
	} {
		if code, m, _ := a.call(c.tok, c.method, c.path, map[string]any{"request_id": "req-0000000000000001", "text": "x"}); code != c.want {
			t.Errorf("%s %s %s → %d, want %d (%v)", c.tok, c.method, c.path, code, c.want, m)
		}
	}
	// the token acts for its person only
	if got := capItems(t, a.ok("pcx_alice_search", "GET", "/api/v1/pocket/search?q=thora", nil)); len(got) != 1 || got[0]["title"] != "Thora" {
		t.Fatalf("alice through the link: %v", got)
	}
	if got := capItems(t, a.ok("pcx_bob_search", "GET", "/api/v1/pocket/search?q=thora", nil)); len(got) != 0 {
		t.Fatalf("bob through the link finds alice's character: %v", got)
	}
	if d := a.ok("pcx_alice_day", "GET", "/api/v1/pocket/day/"+day, nil); len(capItems(t, d)) != 1 {
		t.Fatalf("alice's day through the link: %v", d)
	}
	if d := a.ok("pcx_bob_day", "GET", "/api/v1/pocket/day/"+day, nil); len(capItems(t, d)) != 0 {
		t.Fatalf("bob's day through the link: %v", d)
	}
	if w := a.ok("pcx_alice_widget", "GET", "/api/v1/pocket/widget", nil); !strings.HasSuffix(w["line"].(string), "The Ember Crown") || len(capItems(t, w)) != 2 {
		t.Fatalf("alice's widget through the link: %v", w)
	}
	if w := a.ok("pcx_bob_widget", "GET", "/api/v1/pocket/widget", nil); len(capItems(t, w)) != 0 || w["line"] != nil {
		t.Fatalf("bob's widget through the link: %v", w)
	}
}

func TestPocketLinkScopes(t *testing.T) {
	req := func(m, p string) *http.Request { return httptest.NewRequest(m, p, nil) }
	for _, c := range []struct {
		scope string
		r     *http.Request
		want  bool
	}{
		{core.ScopeSearch, req("GET", "/api/v1/pocket/search?q=x"), true},
		{core.ScopeDay, req("GET", "/api/v1/pocket/day/2026-01-02"), true},
		{core.ScopeWidget, req("GET", "/api/v1/pocket/widget"), true},
		{core.ScopeWidget, req("GET", "/api/v1/auth/me"), true},
		{core.ScopeCapture, req("POST", "/api/v1/pocket/capture"), false},
		{core.ScopeSearch, req("POST", "/api/v1/pocket/search"), false},
		{core.ScopeDay, req("GET", "/api/v1/pocket/day/today"), false},
		{core.ScopeDay, req("GET", "/api/v1/day/2026-01-02"), false},
		{core.ScopeWidget, req("GET", "/api/v1/home"), false},
		{"quest:read", req("GET", "/api/v1/pocket/widget"), false},
		{"quest:write", req("GET", "/api/v1/pocket/search"), false},
	} {
		if got := linkAllows([]string{c.scope}, c.r); got != c.want {
			t.Errorf("%s %s %s = %v, want %v", c.scope, c.r.Method, c.r.URL.Path, got, c.want)
		}
	}
}

// Quest tells Core what it can do, so Search, Day and Hub find it on their own.
func TestManifestCapabilities(t *testing.T) {
	a, fc := newCapApp(t)
	if err := a.s.registerWithCore(context.Background()); err != nil {
		t.Fatal(err)
	}
	fc.mu.Lock()
	m := fc.manifest
	fc.mu.Unlock()
	if m["slug"] != "quest" || m["category"] != "Media" {
		t.Fatalf("manifest: %v %v", m["slug"], m["category"])
	}
	search, _ := m["search"].(map[string]any)
	day, _ := m["day"].(map[string]any)
	widget, _ := m["widget"].(map[string]any)
	if search == nil || day == nil || day["label"] != "Quest" || day["one"] != "game night" || day["many"] != "game nights" || widget == nil || widget["title"] != "Next game" {
		t.Fatalf("capabilities: %v %v %v", search, day, widget)
	}
	if m["capture"] != nil {
		t.Fatalf("no capture: %v", m["capture"])
	}
	bangs := []string{}
	for _, b := range search["bangs"].([]any) {
		bangs = append(bangs, b.(string))
	}
	if strings.Join(bangs, " ") != "quest dnd rpg" {
		t.Fatalf("bangs: %v", bangs)
	}
	offered := map[string]bool{}
	for _, o := range m["offers"].([]any) {
		offered[o.(map[string]any)["scope"].(string)] = true
	}
	for _, sc := range []string{"quest:read", "quest:write", core.ScopeSearch, core.ScopeDay, core.ScopeWidget} {
		if !offered[sc] {
			t.Errorf("%s is not offered", sc)
		}
	}
	if offered[core.ScopeCapture] {
		t.Error("pocket:capture is offered")
	}
}
