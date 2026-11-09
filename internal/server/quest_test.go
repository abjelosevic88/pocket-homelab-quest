package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/config"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/rules"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/srd"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// table sets up a campaign with two characters, an NPC, a quest and a
// game night for tok.
func table(a *app, tok string) map[string]string {
	a.t.Helper()
	out := map[string]string{}
	c := a.expect(201, tok, "POST", "/api/v1/campaigns", map[string]any{"name": "The Ember Crown", "secrets": "The priest did it.", "summary": "A lost crown."})
	out["campaign"] = id(c)
	cid := num(c, "id")
	for _, ch := range []map[string]any{
		{"name": "Thora", "campaign_id": cid, "level": 3, "class_key": "cleric", "classes": "Cleric 3", "species": "Hill Dwarf", "ac": 18, "hp_max": 27, "sheet": map[string]any{"v": 1}},
		{"name": "Kael", "campaign_id": cid, "level": 3, "class_key": "wizard", "classes": "Wizard 3", "species": "High Elf", "ac": 12, "hp_max": 17, "init": 3},
	} {
		m := a.expect(201, tok, "POST", "/api/v1/characters", ch)
		out[ch["name"].(string)] = id(m)
	}
	e := a.expect(201, tok, "POST", "/api/v1/codex", map[string]any{"campaign_id": cid, "kind": "npc", "name": "Brother Aldous", "body": "A kind priest.", "secret": "Leads the cult.", "revealed": true})
	out["npc"] = id(e)
	h := a.expect(201, tok, "POST", "/api/v1/codex", map[string]any{"campaign_id": cid, "kind": "handout", "name": "Burned letter", "body": "…the seventh level…"})
	out["hidden"] = id(h)
	q := a.expect(201, tok, "POST", "/api/v1/quests", map[string]any{"campaign_id": cid, "title": "Recover the crown", "secret": "It's in the hoard.", "giver_id": num(e, "id"),
		"objectives": []map[string]any{{"text": "Find the map"}, {"text": "Reach the hoard"}}})
	out["quest"] = id(q)
	x := a.expect(201, tok, "POST", "/api/v1/sessions", map[string]any{"campaign_id": cid, "date": dayAfter(3), "time": "19:00", "title": "The seventh level"})
	out["session"] = id(x)
	return out
}

func dayAfter(n int) string { return store.AddDays(today(), n) }

func TestEverythingIsPerPerson(t *testing.T) {
	a := newApp(t, nil)
	ids := table(a, a.alice)
	// Bob's lists are empty
	for _, p := range []string{"/api/v1/campaigns", "/api/v1/characters", "/api/v1/sessions", "/api/v1/codex", "/api/v1/quests", "/api/v1/encounters", "/api/v1/creatures", "/api/v1/rolls"} {
		m := a.ok(a.bob, "GET", p, nil)
		for k, v := range m {
			if l, ok := v.([]any); ok && len(l) > 0 && k != "emblems" {
				t.Fatalf("bob sees %d %s at %s", len(l), k, p)
			}
		}
	}
	// and every one of Alice's things is a 404 for him
	for _, c := range []struct{ method, path string }{
		{"GET", "/api/v1/campaigns/" + ids["campaign"]}, {"PUT", "/api/v1/campaigns/" + ids["campaign"]}, {"DELETE", "/api/v1/campaigns/" + ids["campaign"]},
		{"POST", "/api/v1/campaigns/" + ids["campaign"] + "/share"},
		{"GET", "/api/v1/characters/" + ids["Thora"]}, {"PUT", "/api/v1/characters/" + ids["Thora"]}, {"DELETE", "/api/v1/characters/" + ids["Thora"]},
		{"POST", "/api/v1/characters/" + ids["Thora"] + "/hp"}, {"POST", "/api/v1/characters/" + ids["Thora"] + "/share"},
		{"GET", "/api/v1/codex/" + ids["npc"]}, {"PUT", "/api/v1/codex/" + ids["npc"]}, {"DELETE", "/api/v1/codex/" + ids["npc"]},
		{"PUT", "/api/v1/quests/" + ids["quest"]}, {"DELETE", "/api/v1/quests/" + ids["quest"]},
		{"GET", "/api/v1/sessions/" + ids["session"]}, {"PUT", "/api/v1/sessions/" + ids["session"]}, {"DELETE", "/api/v1/sessions/" + ids["session"]},
		{"POST", "/api/v1/sessions/" + ids["session"] + "/play"},
	} {
		a.expect(404, a.bob, c.method, c.path, map[string]any{"name": "Mine", "damage": 5})
	}
	// Bob cannot put his things into Alice's campaign, or roll for her character
	a.expect(400, a.bob, "POST", "/api/v1/characters", map[string]any{"name": "Spy", "campaign_id": n(ids["campaign"])})
	a.expect(400, a.bob, "POST", "/api/v1/codex", map[string]any{"name": "Spy", "campaign_id": n(ids["campaign"])})
	a.expect(400, a.bob, "POST", "/api/v1/sessions", map[string]any{"campaign_id": n(ids["campaign"])})
	a.expect(400, a.bob, "POST", "/api/v1/rolls", map[string]any{"expr": "1d20", "character_id": n(ids["Thora"])})
	a.expect(400, a.bob, "POST", "/api/v1/encounters", map[string]any{"name": "x", "campaign_id": n(ids["campaign"])})
	// Alice's things are intact
	if c := a.ok(a.alice, "GET", "/api/v1/campaigns/"+ids["campaign"], nil); len(c["party"].([]any)) != 2 || c["campaign"].(map[string]any)["name"] != "The Ember Crown" {
		t.Fatalf("alice's campaign: %v", c)
	}
}

func TestPlayerViewKeepsSecrets(t *testing.T) {
	a := newApp(t, nil)
	ids := table(a, a.alice)
	camp := a.ok(a.alice, "GET", "/api/v1/campaigns/"+ids["campaign"], nil)["campaign"].(map[string]any)
	tok := camp["share_token"].(string)
	// off by default
	a.expect(404, "", "GET", "/api/v1/public/p/"+tok, nil)
	r := a.ok(a.alice, "PUT", "/api/v1/campaigns/"+ids["campaign"], map[string]any{"share_on": true})
	if !strings.HasSuffix(r["player_url"].(string), "/p/"+tok) {
		t.Fatalf("player url %v", r["player_url"])
	}
	pv := a.ok("", "GET", "/api/v1/public/p/"+tok, nil)
	b, _ := json.Marshal(pv)
	for _, secret := range []string{"The priest did it", "Leads the cult", "in the hoard", "Burned letter", "seventh level…"} {
		if strings.Contains(string(b), secret) {
			t.Fatalf("player view shows %q", secret)
		}
	}
	if len(pv["party"].([]any)) != 2 || len(pv["codex"].([]any)) != 1 || len(pv["quests"].([]any)) != 1 || pv["next"] == nil {
		t.Fatalf("player view: %s", b)
	}
	// a new link stops the old one
	a.ok(a.alice, "POST", "/api/v1/campaigns/"+ids["campaign"]+"/share", nil)
	a.expect(404, "", "GET", "/api/v1/public/p/"+tok, nil)
	// a character sheet link
	a.expect(404, "", "GET", "/api/v1/public/c/"+strings.Repeat("x", 24), nil)
	sh := a.ok(a.alice, "POST", "/api/v1/characters/"+ids["Thora"]+"/share", nil)
	url := sh["share_url"].(string)
	pc := a.ok("", "GET", "/api/v1/public/c/"+url[strings.LastIndex(url, "/")+1:], nil)["character"].(map[string]any)
	if pc["name"] != "Thora" || pc["share_token"] != "" {
		t.Fatalf("shared sheet %v", pc)
	}
}

func TestGameNightGivesXPAndLevels(t *testing.T) {
	a := newApp(t, nil)
	ids := table(a, a.alice)
	x := a.ok(a.alice, "GET", "/api/v1/sessions/"+ids["session"], nil)["session"].(map[string]any)
	if len(x["attendance"].([]any)) != 2 || num(x, "number") != 1 {
		t.Fatalf("new game night: %v", x)
	}
	r := a.ok(a.alice, "POST", "/api/v1/sessions/"+ids["session"]+"/play", map[string]any{"xp": 2700, "recap": "You found the map.", "attendance": []int64{n(ids["Thora"])}})
	if l := r["level_up"].([]any); len(l) != 1 || l[0] != "Thora" {
		t.Fatalf("level up: %v", r["level_up"])
	}
	th := a.ok(a.alice, "GET", "/api/v1/characters/"+ids["Thora"], nil)
	if num(th["character"].(map[string]any), "xp") != 2700 || num(th, "level_for_xp") != 4 {
		t.Fatalf("thora after: %v", th)
	}
	// playing it again with a different amount gives the difference, not twice
	a.ok(a.alice, "POST", "/api/v1/sessions/"+ids["session"]+"/play", map[string]any{"xp": 3000})
	th = a.ok(a.alice, "GET", "/api/v1/characters/"+ids["Thora"], nil)
	if num(th["character"].(map[string]any), "xp") != 3000 {
		t.Fatalf("thora replayed: %v", th["character"].(map[string]any)["xp"])
	}
	kael := a.ok(a.alice, "GET", "/api/v1/characters/"+ids["Kael"], nil)["character"].(map[string]any)
	if num(kael, "xp") != 0 {
		t.Fatalf("kael was not there: %v", kael["xp"])
	}
	// the next game night is number 2
	y := a.expect(201, a.alice, "POST", "/api/v1/sessions", map[string]any{"campaign_id": n(ids["campaign"])})
	if num(y, "number") != 2 {
		t.Fatalf("number %v", y["number"])
	}
}

func TestHitPoints(t *testing.T) {
	cases := []struct {
		cur, temp, max    int
		dmg, heal, tmp    int
		wantCur, wantTemp int
	}{
		{20, 0, 27, 5, 0, 0, 15, 0},
		{20, 4, 27, 6, 0, 0, 18, 0},
		{3, 0, 27, 10, 0, 0, 0, 0},
		{0, 0, 27, 0, 30, 0, 27, 0},
		{10, 5, 27, 0, 0, 3, 10, 5}, // temporary hit points don't stack
		{10, 2, 27, 0, 0, 8, 10, 8},
	}
	for i, c := range cases {
		cur, temp := applyHP(c.cur, c.temp, c.max, &c.dmg, &c.heal, &c.tmp, nil)
		if cur != c.wantCur || temp != c.wantTemp {
			t.Errorf("case %d: got %d/%d, want %d/%d", i, cur, temp, c.wantCur, c.wantTemp)
		}
	}
}

func TestEncounterAndFight(t *testing.T) {
	a := newApp(t, nil)
	ids := table(a, a.alice)
	cid := n(ids["campaign"])
	// four level 1 → Low 200: one bugbear is 200 XP. Here: two level 3 → Low 300, Moderate 450, High 800
	d := a.ok(a.alice, "POST", "/api/v1/difficulty", map[string]any{"campaign_id": cid, "plan": []map[string]any{{"ref": "srd:goblin", "n": 4}, {"ref": "srd:bugbear", "n": 1}}})
	if df := d["difficulty"].(map[string]any); num(df, "xp") != 400 || df["rating"] != "moderate" || num(df, "high") != 800 {
		t.Fatalf("difficulty %v", df)
	}
	a.expect(400, a.alice, "POST", "/api/v1/encounters", map[string]any{"name": "x", "plan": []map[string]any{{"ref": "srd:nope", "n": 1}}})
	e := a.expect(201, a.alice, "POST", "/api/v1/encounters", map[string]any{"name": "Goblins", "campaign_id": cid, "plan": []map[string]any{{"ref": "srd:goblin", "n": 3}}})
	eid := id(e["encounter"].(map[string]any))
	a.expect(404, a.bob, "GET", "/api/v1/encounters/"+eid, nil)
	a.expect(404, a.bob, "POST", "/api/v1/encounters/"+eid+"/start", nil)
	st := a.ok(a.alice, "POST", "/api/v1/encounters/"+eid+"/start", map[string]any{"roll_player": true})["encounter"].(map[string]any)
	fight := st["state"].(map[string]any)
	cbs := fight["combatants"].([]any)
	if len(cbs) != 5 || num(fight, "round") != 1 || st["status"] != "running" {
		t.Fatalf("fight: %v", fight)
	}
	// Thora takes 9 damage in the tracker → her sheet follows
	var state store.Fight
	b, _ := json.Marshal(fight)
	_ = json.Unmarshal(b, &state)
	for i := range state.Combatants {
		if state.Combatants[i].Name == "Thora" {
			state.Combatants[i].HP -= 9
		}
		if state.Combatants[i].Kind == "monster" {
			state.Combatants[i].HP, state.Combatants[i].Out = 0, true
		}
	}
	a.expect(404, a.bob, "PUT", "/api/v1/encounters/"+eid+"/fight", map[string]any{"state": state})
	a.ok(a.alice, "PUT", "/api/v1/encounters/"+eid+"/fight", map[string]any{"state": state, "log": "Thora is hit."})
	th := a.ok(a.alice, "GET", "/api/v1/characters/"+ids["Thora"], nil)["character"].(map[string]any)
	if num(th, "hp_cur") != 18 {
		t.Fatalf("thora's hp: %v", th["hp_cur"])
	}
	// the player view shows the fight
	a.ok(a.alice, "PUT", "/api/v1/campaigns/"+ids["campaign"], map[string]any{"share_on": true})
	tok := a.ok(a.alice, "GET", "/api/v1/campaigns/"+ids["campaign"], nil)["campaign"].(map[string]any)["share_token"].(string)
	pv := a.ok("", "GET", "/api/v1/public/p/"+tok, nil)
	if f, ok := pv["fight"].(map[string]any); !ok || len(f["combatants"].([]any)) != 5 {
		t.Fatalf("player fight %v", pv["fight"])
	}
	// finishing shares the goblins' XP: 3 × 50 = 150 between two
	fin := a.ok(a.alice, "POST", "/api/v1/encounters/"+eid+"/finish", map[string]any{"award": true})
	if num(fin, "xp_each") != 75 {
		t.Fatalf("xp each %v", fin["xp_each"])
	}
	k := a.ok(a.alice, "GET", "/api/v1/characters/"+ids["Kael"], nil)["character"].(map[string]any)
	if num(k, "xp") != 75 {
		t.Fatalf("kael's xp %v", k["xp"])
	}
}

func TestRollsAndCreatures(t *testing.T) {
	a := newApp(t, nil)
	ids := table(a, a.alice)
	r := a.ok(a.alice, "POST", "/api/v1/rolls", map[string]any{"expr": "2d6+3", "label": "Mace", "kind": "damage", "character_id": n(ids["Thora"])})
	tot := num(r["result"].(map[string]any), "total")
	if tot < 5 || tot > 15 || !strings.Contains(r["text"].(string), "2d6") {
		t.Fatalf("roll %v", r)
	}
	a.expect(400, a.alice, "POST", "/api/v1/rolls", map[string]any{"expr": "9d"})
	if l := a.ok(a.alice, "GET", "/api/v1/rolls", nil)["rolls"].([]any); len(l) != 1 || l[0].(map[string]any)["character_name"] != "Thora" {
		t.Fatalf("roll log %v", l)
	}
	c := a.ok(a.alice, "POST", "/api/v1/creatures", map[string]any{"data": map[string]any{"name": "Cinder Wraith", "ac": 13, "hp": 45, "cr": 3, "abil": []int{6, 16, 10, 10, 12, 15}}})
	ref := fmt.Sprintf("my:%d", int64(num(c, "id")))
	m := a.ok(a.alice, "GET", "/api/v1/srd/monsters/"+ref, nil)
	if m["name"] != "Cinder Wraith" || num(m, "xp") != 700 {
		t.Fatalf("own monster %v", m)
	}
	a.expect(404, a.bob, "GET", "/api/v1/srd/monsters/"+ref, nil)
	a.expect(400, a.bob, "POST", "/api/v1/encounters", map[string]any{"name": "steal", "plan": []map[string]any{{"ref": ref, "n": 1}}})
	if l := a.ok(a.alice, "GET", "/api/v1/srd/monsters", nil)["monsters"].([]any); len(l) < 300 || l[0].(map[string]any)["mine"] != true {
		t.Fatalf("monster list starts with %v", l[0])
	}
	if res := a.ok(a.alice, "GET", "/api/v1/search?q=ember", nil)["results"].([]any); len(res) == 0 || res[0].(map[string]any)["kind"] != "campaign" {
		t.Fatalf("search %v", res)
	}
}

func TestSRDFilesAreServed(t *testing.T) {
	a := newApp(t, nil)
	for _, k := range []string{"classes", "races", "features", "equipment", "conditions"} {
		req, _ := http.NewRequest("GET", a.url+"/api/v1/srd/file/"+k, nil)
		req.Header.Set("Authorization", "Bearer "+a.alice)
		res, err := http.DefaultClient.Do(req) // Go's client asks for gzip and unpacks it
		if err != nil || res.StatusCode != 200 {
			t.Fatalf("%s: %v %v", k, err, res.StatusCode)
		}
		var v any
		if err := json.NewDecoder(res.Body).Decode(&v); err != nil {
			t.Fatalf("%s: %v", k, err)
		}
		res.Body.Close()
	}
	a.expect(404, a.alice, "GET", "/api/v1/srd/file/secrets", nil)
}

func TestExportImportTwice(t *testing.T) {
	a := newApp(t, nil)
	table(a, a.alice)
	a.expect(201, a.alice, "POST", "/api/v1/encounters", map[string]any{"name": "Goblins", "plan": []map[string]any{{"ref": "srd:goblin", "n": 3}}})
	req, _ := http.NewRequest("GET", a.url+"/api/v1/export.json", nil)
	req.Header.Set("Authorization", "Bearer "+a.alice)
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("export: %v", err)
	}
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(res.Body)
	res.Body.Close()
	var doc map[string]any
	_ = json.Unmarshal(buf.Bytes(), &doc)
	for i := 0; i < 2; i++ { // into Bob's account, twice
		req, _ = http.NewRequest("POST", a.url+"/api/v1/import", bytes.NewReader(buf.Bytes()))
		req.Header.Set("Authorization", "Bearer "+a.bob)
		req.Header.Set("Content-Type", "application/json")
		res, err = http.DefaultClient.Do(req)
		if err != nil || res.StatusCode != 200 {
			t.Fatalf("import %d: %v %v", i, err, res.StatusCode)
		}
		res.Body.Close()
	}
	for path, want := range map[string]int{"/api/v1/campaigns": 1, "/api/v1/characters": 2, "/api/v1/sessions": 1, "/api/v1/codex": 2, "/api/v1/quests": 1, "/api/v1/encounters": 1} {
		m := a.ok(a.bob, "GET", path, nil)
		for k, v := range m {
			if l, ok := v.([]any); ok && k != "emblems" && len(l) != want {
				t.Fatalf("%s: %d %s, want %d", path, len(l), k, want)
			}
		}
	}
	q := a.ok(a.bob, "GET", "/api/v1/quests", nil)["quests"].([]any)[0].(map[string]any)
	if q["giver_name"] != "Brother Aldous" {
		t.Fatalf("quest giver after import: %v", q["giver_name"])
	}
}

func TestSettingsArePersonal(t *testing.T) {
	a := newApp(t, nil)
	a.ok(a.alice, "PUT", "/api/v1/settings", map[string]any{"crit_rule": "max", "notes_folder": "Games/Quest", "player_monster": "hidden"})
	if s := a.ok(a.bob, "GET", "/api/v1/settings", nil); s["crit_rule"] != "double" || s["notes_folder"] != "Quest" {
		t.Fatalf("bob's settings changed: %v", s)
	}
	if s := a.ok(a.alice, "GET", "/api/v1/settings", nil); s["crit_rule"] != "max" || s["player_monster"] != "hidden" {
		t.Fatalf("alice's settings: %v", s)
	}
	a.expect(400, a.alice, "PUT", "/api/v1/settings", map[string]any{"crit_rule": "triple"})
	ids := table(a, a.alice)
	a.expect(400, a.bob, "PUT", "/api/v1/settings", map[string]any{"campaign": n(ids["campaign"])})
}

func TestLinkScopes(t *testing.T) {
	r := func(method, path string) *http.Request { return httptest.NewRequest(method, path, nil) }
	read, write := []string{"quest:read"}, []string{"quest:write"}
	for _, c := range []struct {
		scopes []string
		req    *http.Request
		want   bool
	}{
		{read, r("GET", "/api/v1/summary"), true},
		{read, r("GET", "/api/v1/characters/3"), true},
		{read, r("GET", "/api/v1/srd/monsters/srd:goblin"), true},
		{read, r("GET", "/api/v1/day/2026-11-13"), true},
		{read, r("GET", "/api/v1/campaigns/3"), false}, // has the secrets
		{read, r("GET", "/api/v1/codex"), false},
		{read, r("POST", "/api/v1/rolls"), false},
		{write, r("POST", "/api/v1/rolls"), true},
		{write, r("POST", "/api/v1/sessions"), true},
		{write, r("PUT", "/api/v1/codex/4"), true},
		{write, r("POST", "/api/v1/characters/4/hp"), true},
		{write, r("PUT", "/api/v1/characters/4"), false},
		{write, r("DELETE", "/api/v1/campaigns/4"), false},
		{write, r("GET", "/api/v1/settings"), false},
		{nil, r("GET", "/api/v1/auth/me"), true},
	} {
		if got := linkAllows(c.scopes, c.req); got != c.want {
			t.Errorf("%v %s %s = %v, want %v", c.scopes, c.req.Method, c.req.URL.Path, got, c.want)
		}
	}
}

func TestDemoIsByTheRules(t *testing.T) {
	a := newApp(t, func(c *config.Config) { c.DemoData = true })
	home := a.ok(a.alice, "GET", "/api/v1/home", nil)
	if home["campaign"].(map[string]any)["name"] != "The Ember Crown" || len(home["party"].([]any)) != 4 || home["fight"] == nil {
		t.Fatalf("home: %v", home)
	}
	chars := a.ok(a.alice, "GET", "/api/v1/characters?sheets=1", nil)["characters"].([]any)
	if len(chars) != 8 {
		t.Fatalf("%d characters", len(chars))
	}
	for _, c := range chars {
		ch := c.(map[string]any)
		sheet := ch["sheet"].(map[string]any)
		if rules.LevelFor(int(num(ch, "xp"))) < int(num(ch, "level")) && ch["campaign_name"] == "The Ember Crown" {
			t.Errorf("%s: level %v with %v XP", ch["name"], ch["level"], ch["xp"])
		}
		for _, sp := range sheet["spells"].([]any) {
			if k := sp.(map[string]any)["key"].(string); !srdHas("spell", k) {
				t.Errorf("%s: no spell %q in the SRD", ch["name"], k)
			}
		}
		for _, it := range sheet["inventory"].([]any) {
			m := it.(map[string]any)
			if k, _ := m["key"].(string); k != "" && !srdHas("equipment", k) {
				t.Errorf("%s: no equipment %q", ch["name"], k)
			}
			if k, _ := m["magic"].(string); k != "" && !srdHas("magic", k) {
				t.Errorf("%s: no magic item %q", ch["name"], k)
			}
		}
	}
	// seeding again does nothing
	if err := a.s.seedDemo(t.Context(), a.ids["Alice"]); err != nil {
		t.Fatal(err)
	}
	if l := a.ok(a.alice, "GET", "/api/v1/campaigns", nil)["campaigns"].([]any); len(l) != 2 {
		t.Fatalf("%d campaigns after a second seed", len(l))
	}
	// the fight in progress has the stat blocks it needs
	enc := a.ok(a.alice, "GET", fmt.Sprintf("/api/v1/encounters/%d", int64(num(home["fight"].(map[string]any), "id"))), nil)
	if len(enc["blocks"].(map[string]any)) < 3 {
		t.Fatalf("blocks %v", enc["blocks"])
	}
}

func srdHas(kind, key string) bool {
	switch kind {
	case "spell":
		_, ok := srd.SpellByKey(key)
		return ok
	case "magic":
		_, ok := srd.MagicItemByKey(key)
		return ok
	}
	_, ok := srd.EquipmentByKey(key)
	return ok
}
