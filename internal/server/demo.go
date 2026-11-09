package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/rules"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// seedDemo fills the owner's account with two campaigns (one running, one
// paused), their parties built by the rules, months of game nights, the
// people and places of the world, a quest log, encounters (one fight in
// progress), a homebrew monster and a dice log — for `make run`, the CI
// smoke test and the screenshots.
func (s *Server) seedDemo(ctx context.Context, uid int64) error {
	ctx = context.WithoutCancel(ctx) // with AUTH_MODE=none this runs inside the first request
	if list, _ := s.store.ListCampaigns(ctx, uid); len(list) > 0 {
		return nil
	}
	rnd := rand.New(rand.NewSource(42))
	day := func(n int) string { return store.AddDays(today(), n) }

	// ---- The Ember Crown (running, level 5) ----
	ember := &store.Campaign{UserID: uid, Name: "The Ember Crown", Tagline: "A dead king's crown, a city of soot, and something old waking under the mountain.",
		World: "The Cinder Coast", Status: "active", Emblem: "crown", Color: "#9f1d35", Advancement: "xp", Schedule: "Fridays, 19:00", Place: "Ana's flat",
		Summary: "Three hundred years ago King Aurex wore the Ember Crown and the mountain obeyed him. Then the mountain burned, the king fell, and the crown was lost.\n\n" +
			"Now the miners of Cinderfall dig deeper every year, strange fires burn in the old chapel, and a cult that calls itself the Ashen Hand leaves soot handprints on the doors of those it has chosen.",
		Secrets: "The crown is in Skarnveth's hoard — the young red dragon sleeping in the Roost. Brother Aldous leads the Ashen Hand: he wants the crown to wake the dragon's mother, Ysgarra, who sleeps in the mountain's heart.\n\n" +
			"If the party trusts Aldous with the Emberdeep map, the cult reaches the hoard first (session 15 or so).",
		HouseRules: "Potions are a bonus action to drink yourself.\nCritical hits: double the dice.\nInspiration for great role-play — one at a time.", ShareOn: true}
	if err := s.store.CreateCampaign(ctx, ember); err != nil {
		return err
	}
	// ---- Tides of the Drowned Isle (paused, level 3) ----
	tides := &store.Campaign{UserID: uid, Name: "Tides of the Drowned Isle", Tagline: "A lighthouse that should not be lit, and bells ringing under the sea.",
		World: "The Gull Isles", Status: "paused", Emblem: "ship", Color: "#1d5f8a", Advancement: "milestone", Schedule: "Every other Sunday", Place: "Online",
		Summary: "The lighthouse on Drowned Isle has been dark for forty years. Last week it lit up, and three fishing boats did not come home.",
		Secrets: "The sahuagin baron Klesh lights the lamp to lure ships onto the reef; the drowned bells are the old temple of the sea goddess, waiting to be rung again."}
	if err := s.store.CreateCampaign(ctx, tides); err != nil {
		return err
	}

	// ---- characters ----
	chars := map[string]int64{}
	for _, d := range demoCharacters(ember.ID, tides.ID) {
		sheet, _ := json.Marshal(d.sheet)
		c := &store.Character{UserID: uid, CampaignID: d.campaign, Name: d.name, Player: d.player, Kind: "pc", Level: d.level, Classes: d.classes, ClassKey: d.classKey,
			Species: d.species, AC: d.ac, HPMax: d.hp, HPCur: d.hpCur, Init: d.init, PP: d.pp, Speed: d.speed, XP: d.xp, Sheet: sheet,
			Token: store.Token{Color: d.color, Emblem: d.classKey, Frame: d.frame}, Status: "active", ShareOn: d.share}
		if c.HPCur == 0 {
			c.HPCur = c.HPMax
		}
		if err := s.store.CreateCharacter(ctx, c); err != nil {
			return err
		}
		chars[d.name] = c.ID
	}
	emberParty := []int64{chars["Thora Emberforge"], chars["Kael Duskwhisper"], chars["Mira Thistledown"], chars["Garrick Vane"]}
	tidesParty := []int64{chars["Varkas Ashscale"], chars["Nyx"], chars["Grukk"]}

	// ---- the codex ----
	entry := func(c *store.Campaign, kind, name, sub, body, secret, status, attitude string, place *int64, revealed, pinned bool, tags ...string) int64 {
		e := &store.Entry{UserID: uid, CampaignID: c.ID, Kind: kind, Name: name, Subtitle: sub, Body: body, Secret: secret, Status: status, Attitude: attitude,
			PlaceID: place, Revealed: revealed, Pinned: pinned, Tags: tags}
		if kind == "npc" && status == "" {
			e.Status = "alive"
		}
		_ = s.store.CreateEntry(ctx, e)
		return e.ID
	}
	cinderfall := entry(ember, "place", "Cinderfall", "A mining city under the mountain", "Black stone houses climb the slope of Mount Aurex. Everything is grey with soot, and the bells of the mine ring at every change of shift.\n\nAbout four thousand people live here, most of them miners and their families.", "The old king's tunnels run under the whole upper town.", "", "", nil, true, true, "city")
	goose := entry(ember, "place", "The Gilded Goose", "Inn on Lantern Street", "The warmest room in Cinderfall: a crooked inn with a gilded goose over the door and the best pie on the coast. The party's rooms are on the top floor.", "", "", "", &cinderfall, true, false, "inn")
	ashpit := entry(ember, "place", "The Ashpit", "The lower town", "Where the slag heaps meet the river. Narrow alleys, cheap gin, and people who don't ask questions.", "Sable's hideout is behind the tannery.", "", "", &cinderfall, true, false)
	emberdeep := entry(ember, "place", "Emberdeep Mines", "The old king's mine", "Seven levels of tunnels, the deepest closed since the Burning. The new shafts break into old dwarf-cut halls.", "Level seven opens into the dragon's warm caves.", "", "", &cinderfall, true, false, "dungeon")
	chapel := entry(ember, "place", "The Sunken Chapel", "A ruined chapel of the sun", "Half swallowed by a landslide; a cold blue fire burns on its altar at night.", "The Ashen Hand meets here every new moon.", "", "", &cinderfall, true, false, "dungeon")
	roost := entry(ember, "place", "Skarnveth's Roost", "A crater near the summit", "Nobody who climbed to the crater came back. Shepherds say the mountain breathes there.", "The young red dragon's lair and hoard — the Ember Crown is in it.", "", "", nil, false, false, "lair")
	entry(ember, "npc", "Old Marla", "Innkeeper of the Gilded Goose", "Round, loud, kind. Knows everyone's business and feeds anyone who is hungry. Lost her husband in the mines.", "She hides Wren in her cellar.", "", "friendly", &goose, true, true, "ally")
	ilsa := entry(ember, "npc", "Captain Ilsa Varn", "Captain of the Lantern Watch", "A tall woman with a burn scar across one cheek. Fair, tired, and short of guards.", "She suspects the Lord Mayor but has no proof.", "", "friendly", &cinderfall, true, false, "watch")
	aldous := entry(ember, "npc", "Brother Aldous", "Priest of the sun", "A gentle old priest who runs the soup kitchen. He asked the party to look into the chapel fires.", "Leader of the Ashen Hand. He wants the crown to wake Ysgarra.", "", "neutral", &cinderfall, true, true, "priest", "villain")
	entry(ember, "npc", "Sable", "Fence and broker of secrets", "Never seen without a grey hood; speaks in a whisper. Everything has a price.", "Sable is Captain Varn's estranged sister.", "", "neutral", &ashpit, true, false)
	entry(ember, "npc", "Lord Mayor Hadric Vell", "Ruler of Cinderfall", "Rich, nervous, always surrounded by guards. Wants the mines open at any cost.", "He pays the Ashen Hand to scare off the miners' union.", "", "hostile", &cinderfall, true, false)
	entry(ember, "npc", "Wren", "A street child", "Ten years old, quick fingers, quicker mouth. Showed the party the way into the Ashpit.", "Her brother Tam was taken by the cult.", "", "friendly", &ashpit, true, false)
	entry(ember, "npc", "Magister Oren Kett", "A retired wizard", "Lives in a leaning tower full of books and cats. Knows the history of King Aurex.", "", "", "friendly", &cinderfall, true, false, "sage")
	skarn := &store.Entry{UserID: uid, CampaignID: ember.ID, Kind: "npc", Name: "Skarnveth", Subtitle: "A young red dragon", Body: "Only a rumour, so far: something huge flew over the mountain at dawn.",
		Secret: "Vain and hungry. She keeps the Ember Crown on her own head.", Status: "alive", Attitude: "hostile", PlaceID: &roost, Monster: "srd:young-red-dragon", Tags: []string{"dragon"}}
	_ = s.store.CreateEntry(ctx, skarn)
	entry(ember, "faction", "The Ashen Hand", "A cult of fire", "Robed figures with soot-black hands. They leave a hand print on the door of those they have chosen.", "Thirty members; Aldous at the head; they meet in the Sunken Chapel.", "", "hostile", nil, true, false, "cult")
	entry(ember, "faction", "The Lantern Watch", "Cinderfall's city watch", "Forty guards with blue lanterns, too few for a city this size.", "", "", "friendly", nil, true, false)
	entry(ember, "lore", "The Fall of King Aurex", "", "King Aurex bound the mountain's fire to his crown and ruled for sixty years. When he died, the fire broke free: the Burning killed half the city in a night.", "Aurex didn't die — he was eaten. Ysgarra the great wyrm took the crown, and lost it to her daughter.", "", "", nil, true, false, "history")
	entry(ember, "handout", "A burned letter", "Found in the chapel", "\"…the seventh level by the new moon. Bring the map. The mother sleeps but the daughter wakes, and the crown must be ready. — A.\"", "", "", "", &chapel, true, true, "clue")
	entry(ember, "handout", "Map of the Emberdeep", "Copied by Magister Kett", "Seven levels, the stairs and the flooded halls; level seven is drawn only as a circle marked \"warm\".", "", "", "", &emberdeep, false, false)

	reef := entry(tides, "place", "Drowned Isle", "A rock with a lighthouse", "A black rock a mile out, with a lighthouse on top and a reef around it like teeth.", "", "", "", nil, true, true)
	entry(tides, "npc", "Harbourmaster Bell", "Keeps the port of Gullhaven", "Ancient, deaf in one ear, never wrong about the weather.", "", "", "friendly", nil, true, false)
	entry(tides, "npc", "Klesh", "A sahuagin baron", "", "Lights the lamp to wreck ships; wants the temple bells silent forever.", "", "hostile", &reef, false, false)

	// ---- quests ----
	quest := func(c *store.Campaign, title, status, summary, secret, reward string, giver, place *int64, objectives ...store.Objective) {
		q := &store.Quest{UserID: uid, CampaignID: c.ID, Title: title, Status: status, Summary: summary, Secret: secret, Reward: reward, GiverID: giver, PlaceID: place, Objectives: objectives, Revealed: true}
		if status == "done" || status == "failed" {
			q.DoneOn = day(-20 - rnd.Intn(30))
		}
		if objectives == nil {
			q.Objectives = []store.Objective{}
		}
		_ = s.store.CreateQuest(ctx, q)
	}
	quest(ember, "Recover the Ember Crown", "active", "Find the lost crown of King Aurex before the Ashen Hand does.", "It is in Skarnveth's hoard.", "The city's gratitude — and a crown", &aldous, &roost,
		store.Objective{Text: "Learn what happened to King Aurex", Done: true}, store.Objective{Text: "Find a map of the Emberdeep", Done: true},
		store.Objective{Text: "Reach the seventh level of the mines"}, store.Objective{Text: "Take the crown"})
	quest(ember, "Who is the Ashen Hand?", "active", "Someone in the city leads the cult. Find out who.", "Brother Aldous.", "200 gp from Captain Varn", &ilsa, &chapel,
		store.Objective{Text: "Watch the Sunken Chapel at the new moon", Done: true}, store.Objective{Text: "Follow the robed man to the upper town"}, store.Objective{Text: "Bring proof to Captain Varn"})
	quest(ember, "The missing miners", "done", "Six miners vanished on level four.", "", "50 gp each and the miners' thanks", nil, &emberdeep,
		store.Objective{Text: "Search level four", Done: true}, store.Objective{Text: "Deal with the goblins", Done: true})
	quest(ember, "Wren's brother", "rumour", "Wren says her brother Tam went to the chapel and never came back.", "He is alive, held on level six.", "", nil, &ashpit)
	quest(ember, "Clear the Old Bridge", "done", "Bandits hold the only bridge into the city.", "", "Free lodging at the Gilded Goose", nil, &cinderfall,
		store.Objective{Text: "Drive off the bandits", Done: true})
	quest(tides, "Darken the lighthouse", "active", "Find who lights the lamp on Drowned Isle — and put it out.", "", "300 gp from the fishing guild", nil, &reef,
		store.Objective{Text: "Reach the island", Done: true}, store.Objective{Text: "Climb the lighthouse"})

	// ---- game nights ----
	type night struct {
		title, recap, loot string
		xp                 int
	}
	nights := []night{
		{"Smoke on the road", "You met on the coast road and found a burned wagon with a soot hand print on its side. In Cinderfall, Old Marla gave you rooms and the first rumours.", "", 300},
		{"The Old Bridge", "Bandits held the Old Bridge. Garrick held the line while Mira cut the rope bridge behind them; their captain surrendered and told of a \"priest who pays in gold\".", "60 gp, a silver locket", 600},
		{"Into the Ashpit", "Wren showed you the way into the lower town. Sable sold you a name — Brother Aldous — and a warning to keep away from the chapel.", "", 450},
		{"Level four", "The miners' tunnels were full of goblins. You found the missing miners alive in a goblin pen and brought them home.", "Potion of healing, 120 gp", 1100},
		{"The leaning tower", "Magister Kett told you the story of King Aurex and the Burning, and copied part of a map of the Emberdeep for you.", "Scroll of shield", 300},
		{"Fire in the chapel", "At night the chapel altar burned blue. Robed figures chanted in a tongue Kael recognised as Draconic.", "", 700},
		{"The new moon", "You watched the Ashen Hand meet in the Sunken Chapel and fought your way out when Mira was spotted.", "Cult robes, 40 gp", 1250},
		{"A letter, half burned", "In the chapel's crypt you found a burned letter signed \"A.\" and a cultist who would only say \"the mother sleeps\".", "", 450},
		{"The Mayor's ball", "At the Lord Mayor's ball you danced, lied and stole a ledger that shows payments to someone called \"the Hand\".", "A ledger, 2 diamonds (50 gp each)", 900},
		{"The watch is short-handed", "Captain Varn asked for help: two guards dead and a soot hand on the barracks door. You tracked the killers to the Ashpit.", "", 800},
		{"Below the slag", "Sable led you through tunnels under the slag heaps; you found the stair to the old king's halls — and the cultists guarding it.", "+1 shortsword", 1350},
		{"Level five", "You went deeper than any miner in a hundred years. Something warm breathes in the dark below.", "Bag of holding", 1600},
	}
	xpTotal := 0
	for i, n := range nights {
		date := day(-7*(len(nights)-i) - 4) // Fridays, more or less
		x := &store.Session{UserID: uid, CampaignID: ember.ID, Number: i + 1, Title: n.title, Date: date, Time: "19:00", Minutes: 240, Status: "played",
			Recap: n.recap, Loot: n.loot, XP: n.xp, Attendance: emberParty,
			Notes: "Good energy tonight. " + []string{"Mira's player loved the rooftop chase.", "Remember: Garrick owes Sable a favour.", "Kael wants to learn Draconic properly.", "Thora is suspicious of Aldous."}[i%4]}
		if i == 6 {
			x.Attendance = emberParty[:3]
		}
		xpTotal += n.xp
		_ = s.store.CreateGameSession(ctx, x)
	}
	next := &store.Session{UserID: uid, CampaignID: ember.ID, Number: len(nights) + 1, Title: "The seventh level", Date: day(4), Time: "19:00", Minutes: 240, Status: "planned",
		Attendance: emberParty, Plan: "- Recap: the warm breath from below\n- Cultists reach level six first?\n- Wren's brother Tam held on level six\n- Prepare Skarnveth's stat block\n- Bring the dragon miniature"}
	_ = s.store.CreateGameSession(ctx, next)
	for i, t := range []string{"The lighthouse", "Bells under the water", "The reef at low tide"} {
		_ = s.store.CreateGameSession(ctx, &store.Session{UserID: uid, CampaignID: tides.ID, Number: i + 1, Title: t, Date: day(-120 + 14*i), Time: "17:00", Minutes: 180,
			Status: "played", Attendance: tidesParty, Recap: []string{"You crossed to Drowned Isle in a borrowed boat and found the lighthouse door barred from the inside.",
				"Divers say bells ring under the bay at midnight. Nyx heard a voice in them.", "At low tide the reef showed a sunken stair — and the sahuagin waiting on it."}[i]})
	}

	// ---- a homebrew monster ----
	wraithData, _ := json.Marshal(map[string]any{"name": "Cinder Wraith", "size": "Medium", "type": "undead", "align": "chaotic evil", "ac": 13, "hp": 45, "hd": "10d8",
		"speed": "0 ft., fly 40 ft. (hover)", "abil": []int{6, 16, 10, 10, 12, 15}, "res": []string{"acid", "cold", "lightning", "thunder"}, "imm": []string{"fire", "necrotic", "poison"},
		"cimm": []string{"charmed", "exhaustion", "grappled", "paralyzed", "petrified", "poisoned", "prone", "restrained"}, "senses": "darkvision 60 ft., passive Perception 11", "pp": 11,
		"lang": "the languages it knew in life", "cr": 3, "xp": 700, "pb": 2,
		"traits":  []map[string]any{{"name": "Ash Form", "desc": "The wraith can move through a space as narrow as 1 inch wide without squeezing. It sheds dim light in a 10-foot radius."}},
		"actions": []map[string]any{{"name": "Burning Touch", "desc": "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 12 (2d8 + 3) fire damage, and the target can't regain hit points until the start of the wraith's next turn.", "hit": 5, "dmg": [][]string{{"2d8+3", "fire"}}}},
		"desc":    "The spirits of miners who died in the Burning, still angry."})
	wraith := &store.Creature{UserID: uid, Name: "Cinder Wraith", Data: wraithData}
	_ = s.store.CreateCreature(ctx, wraith)

	// ---- encounters ----
	enc := func(c *store.Campaign, name, place, notes, read string, plan ...store.PlanLine) *store.Encounter {
		for i := range plan {
			if m, err := s.monsterFor(ctx, uid, plan[i].Ref); err == nil {
				plan[i].Name = m.Name
			}
		}
		e := &store.Encounter{UserID: uid, CampaignID: &c.ID, Name: name, Place: place, Notes: notes, Readaloud: read, Status: "plan", Plan: plan}
		_ = s.store.CreateEncounter(ctx, e)
		return e
	}
	nextID := next.ID
	chapelFight := enc(ember, "Cultists at the stair", "Emberdeep, level six", "Brother Aldous's guard: the priest heals, the veteran holds the stair, the fanatics flee at half health.",
		"Torchlight flickers on a stair cut by dwarven hands. Six robed figures stand around a brazier, and the air smells of hot iron.",
		store.PlanLine{Ref: "srd:priest", N: 1}, store.PlanLine{Ref: "srd:cult-fanatic", N: 2}, store.PlanLine{Ref: "srd:veteran", N: 1}, store.PlanLine{Ref: "srd:cultist", N: 6})
	chapelFight.SessionID = &nextID
	_ = s.store.UpdateEncounter(ctx, chapelFight)
	enc(ember, "Ash in the dark", "Emberdeep, level six", "The wraiths rise from the ash heaps when someone lights a torch.", "",
		store.PlanLine{Ref: fmt.Sprintf("my:%d", wraith.ID), N: 2})
	enc(ember, "The Roost", "Skarnveth's Roost", "Not meant to be fought head on — the party should sneak or bargain.",
		"Heat rolls out of the crater in waves. Gold glitters under a mountain of red scales, and on top of it all, a crown of black iron.",
		store.PlanLine{Ref: "srd:young-red-dragon", N: 1})
	done := enc(ember, "The Old Bridge", "The Old Bridge", "", "", store.PlanLine{Ref: "srd:bandit", N: 5}, store.PlanLine{Ref: "srd:bandit-captain", N: 1})
	done.Status, done.XP, done.FinishedAt = "done", 700, store.Now()
	done.State = store.Fight{Round: 5, Combatants: []store.Combatant{}, Log: []store.LogLine{{Round: 5, Text: "The fight is over: 175 XP each.", At: store.Now()}}}
	_ = s.store.UpdateEncounter(ctx, done)

	// the fight in progress: goblins in the mine
	live := enc(ember, "Goblins in the Emberdeep", "Emberdeep, level five", "The bugbear wants the shiny shield.", "",
		store.PlanLine{Ref: "srd:bugbear", N: 1}, store.PlanLine{Ref: "srd:goblin", N: 4}, store.PlanLine{Ref: "srd:wolf", N: 1})
	cb := []store.Combatant{
		{ID: "c1", Kind: "pc", Ref: fmt.Sprintf("character:%d", chars["Mira Thistledown"]), Name: "Mira Thistledown", Init: 21, InitBonus: 4, AC: 15, HPMax: 38, HP: 31, Conditions: []string{}, Color: "#3f7d4e"},
		{ID: "c2", Kind: "monster", Ref: "srd:goblin", Name: "Goblin 1", Init: 18, InitBonus: 2, AC: 15, HPMax: 7, HP: 0, Conditions: []string{}, Out: true},
		{ID: "c3", Kind: "pc", Ref: fmt.Sprintf("character:%d", chars["Kael Duskwhisper"]), Name: "Kael Duskwhisper", Init: 16, InitBonus: 3, AC: 13, HPMax: 27, HP: 19, Conditions: []string{}, Conc: true, Color: "#4a5bb5"},
		{ID: "c4", Kind: "monster", Ref: "srd:goblin", Name: "Goblin 2", Init: 15, InitBonus: 2, AC: 15, HPMax: 7, HP: 4, Conditions: []string{}},
		{ID: "c5", Kind: "monster", Ref: "srd:wolf", Name: "Wolf", Init: 14, InitBonus: 2, AC: 13, HPMax: 11, HP: 11, Conditions: []string{}},
		{ID: "c6", Kind: "pc", Ref: fmt.Sprintf("character:%d", chars["Garrick Vane"]), Name: "Garrick Vane", Init: 12, InitBonus: 2, AC: 19, HPMax: 44, HP: 30, Conditions: []string{}, Color: "#8a6a2f"},
		{ID: "c7", Kind: "monster", Ref: "srd:bugbear", Name: "Bugbear", Init: 11, InitBonus: 2, AC: 16, HPMax: 27, HP: 15, Conditions: []string{"prone"}},
		{ID: "c8", Kind: "monster", Ref: "srd:goblin", Name: "Goblin 3", Init: 9, InitBonus: 2, AC: 15, HPMax: 7, HP: 7, Conditions: []string{"frightened"}},
		{ID: "c9", Kind: "pc", Ref: fmt.Sprintf("character:%d", chars["Thora Emberforge"]), Name: "Thora Emberforge", Init: 7, InitBonus: -1, AC: 18, HPMax: 48, HP: 48, Conditions: []string{}, Color: "#b8892e"},
		{ID: "c10", Kind: "monster", Ref: "srd:goblin", Name: "Goblin 4", Init: 6, InitBonus: 2, AC: 15, HPMax: 7, HP: 7, Conditions: []string{}, Hidden: true, Note: "Behind the ore carts"},
	}
	live.Status = "running"
	live.State = store.Fight{Round: 3, Turn: 5, Started: store.Now(), Combatants: cb, Log: []store.LogLine{
		{Round: 1, Text: "The fight begins.", At: store.Now()},
		{Round: 1, Text: "Mira hits Goblin 1 with a sneak attack: 16 damage. Goblin 1 is down.", At: store.Now()},
		{Round: 2, Text: "Kael casts Web; the bugbear breaks free.", At: store.Now()},
		{Round: 2, Text: "The bugbear hits Garrick: 14 damage.", At: store.Now()},
		{Round: 3, Text: "Garrick knocks the bugbear prone.", At: store.Now()},
	}}
	_ = s.store.UpdateEncounter(ctx, live)

	// ---- the dice log ----
	for i, r := range []struct {
		label, expr, kind, who string
	}{
		{"Stealth", "1d20+9", "check", "Mira Thistledown"}, {"Shortsword attack", "1d20+7", "attack", "Mira Thistledown"}, {"Sneak attack", "1d6+4+3d6", "damage", "Mira Thistledown"},
		{"Initiative", "1d20+3", "init", "Kael Duskwhisper"}, {"Fire Bolt", "1d20+7", "spell", "Kael Duskwhisper"}, {"Fire Bolt damage", "2d10", "damage", "Kael Duskwhisper"},
		{"Longsword attack", "1d20+7", "attack", "Garrick Vane"}, {"Longsword damage", "1d8+6", "damage", "Garrick Vane"}, {"Wisdom saving throw", "1d20+7", "save", "Thora Emberforge"},
		{"Cure Wounds", "1d8+4", "spell", "Thora Emberforge"}, {"", "4d6kh3", "roll", ""}, {"Perception", "1d20+5", "check", "Thora Emberforge"},
	} {
		res, err := rules.Roll(r.expr)
		if err != nil {
			continue
		}
		detail, _ := json.Marshal(res)
		roll := &store.Roll{UserID: uid, Label: r.label, Expr: res.Expr, Total: res.Total, Detail: detail, Kind: r.kind, CampaignID: &ember.ID}
		if id := chars[r.who]; id > 0 {
			roll.CharacterID = &id
		}
		_ = s.store.AddRoll(ctx, roll)
		_ = i
	}
	s.log.Info("demo data seeded", "campaigns", 2, "characters", len(chars), "xp", xpTotal)
	return nil
}

// demoChar is one demo character, numbers worked out by the rules
// (point buy, species bonuses, average hit points per level, armour).
type demoChar struct {
	name, player, species, classes, classKey, color, frame string
	campaign                                               *int64
	level, ac, hp, hpCur, init, pp, speed, xp              int
	share                                                  bool
	sheet                                                  map[string]any
}

func item(key, name, kind string, qty int, w float64, equipped bool) map[string]any {
	return map[string]any{"id": strings.ReplaceAll(key, "-", "") + fmt.Sprint(qty), "key": key, "name": name, "kind": kind, "qty": qty, "w": w, "equipped": equipped}
}

func spell(key, cls string, prepared, always bool) map[string]any {
	return map[string]any{"key": key, "cls": cls, "prepared": prepared, "always": always}
}

func res(id, name string, max, used int, reset string) map[string]any {
	return map[string]any{"id": id, "name": name, "max": max, "used": used, "reset": reset}
}

func abil(str, dex, con, in, wis, cha int) map[string]int {
	return map[string]int{"str": str, "dex": dex, "con": con, "int": in, "wis": wis, "cha": cha}
}

func baseSheet(species, sub, bg, align string, classes []map[string]any, ab map[string]int, skills []string, xp, hpCur int) map[string]any {
	return map[string]any{"v": 1, "species": species, "subspecies": sub, "background": bg, "alignment": align, "classes": classes, "abilities": ab,
		"bonus_choice": []string{}, "asi": []any{}, "skills": skills, "expertise": []string{}, "langs": []string{"common"}, "tools": []string{}, "profs_extra": "",
		"hp": map[string]int{"cur": hpCur, "temp": 0, "bonus": 0}, "hit_dice_used": map[string]int{}, "death": map[string]int{"ok": 0, "fail": 0},
		"conditions": []string{}, "exhaustion": 0, "inspiration": false, "xp": xp, "ac_bonus": 0, "ac_override": 0, "speed_bonus": 0, "init_bonus": 0,
		"inventory": []any{}, "coins": map[string]int{"cp": 0, "sp": 0, "ep": 0, "gp": 0, "pp": 0}, "spells": []any{}, "slots_used": make([]int, 9), "pact_used": 0,
		"resources": []any{}, "feats": []string{}, "features_extra": []any{}, "attacks_extra": []any{}, "choices": map[string][]string{},
		"traits": map[string]string{}, "bio": map[string]string{}}
}

func demoCharacters(ember, tides int64) []demoChar {
	// Thora: hill dwarf cleric 5 (Life). Point buy 14/8/14/10/15/10, +2 CON, +1 WIS, ASI +2 WIS → 14/8/16/10/18/10.
	// HP 8+3, then 4 × (5+3), +5 dwarven toughness = 48. AC chain mail 16 + shield 2 = 18.
	thora := baseSheet("dwarf", "hill-dwarf", "acolyte", "lawful-good",
		[]map[string]any{{"key": "cleric", "level": 5, "sub": "life", "hp": []int{5, 5, 5, 5}}}, abil(14, 8, 14, 10, 15, 10),
		[]string{"insight", "religion", "medicine", "persuasion"}, 9800, 48)
	thora["asi"] = []any{map[string]any{"class": "cleric", "level": 4, "a": "wis", "b": "wis"}}
	thora["langs"] = []string{"common", "dwarvish", "celestial", "draconic"}
	thora["tools"] = []string{"smiths-tools"}
	thora["inventory"] = []any{item("chain-mail", "Chain Mail", "armor", 1, 55, true), item("shield", "Shield", "shield", 1, 6, true), item("warhammer", "Warhammer", "weapon", 1, 2, true),
		item("crossbow-light", "Crossbow, light", "weapon", 1, 5, false), item("crossbow-bolt", "Crossbow bolt", "gear", 20, 0.075, false), item("priests-pack", "Priest's Pack", "gear", 1, 24, false),
		item("emblem", "Emblem (holy symbol)", "gear", 1, 0, true), map[string]any{"id": "potion1", "magic": "potion-of-healing-common", "name": "Potion of Healing", "kind": "magic", "qty": 2, "w": 0.5}}
	thora["coins"] = map[string]int{"cp": 12, "sp": 40, "ep": 0, "gp": 186, "pp": 0}
	thora["spells"] = []any{spell("sacred-flame", "cleric", true, false), spell("guidance", "cleric", true, false), spell("spare-the-dying", "cleric", true, false), spell("thaumaturgy", "cleric", true, false),
		spell("bless", "cleric", true, true), spell("cure-wounds", "cleric", true, true), spell("lesser-restoration", "cleric", true, true), spell("spiritual-weapon", "cleric", true, true),
		spell("beacon-of-hope", "cleric", true, true), spell("revivify", "cleric", true, true),
		spell("healing-word", "cleric", true, false), spell("shield-of-faith", "cleric", true, false), spell("guiding-bolt", "cleric", true, false), spell("command", "cleric", true, false),
		spell("aid", "cleric", true, false), spell("spirit-guardians", "cleric", true, false), spell("mass-healing-word", "cleric", true, false), spell("dispel-magic", "cleric", true, false),
		spell("sanctuary", "cleric", true, false)}
	thora["slots_used"] = []int{1, 0, 0, 0, 0, 0, 0, 0, 0}
	thora["resources"] = []any{res("cd", "Channel Divinity", 1, 0, "short")}
	thora["traits"] = map[string]string{"personality": "I quote the old hymns for every occasion, and I can't abide a cold forge.", "ideals": "Faith. The sun returns to every valley.",
		"bonds": "The temple in Cinderfall raised me after the mines took my parents.", "flaws": "I trust priests too easily."}
	thora["bio"] = map[string]string{"age": "112", "height": "4'5\"", "weight": "170 lb", "eyes": "Amber", "hair": "Copper, braided", "faith": "The Dawnfather",
		"appearance": "Broad, soot-freckled, a sun disc hammered into her shield.", "backstory": "Raised by the temple after the mine collapse of her childhood; came back to Cinderfall when the fires started."}

	// Kael: high elf wizard 5 (Evocation). 8/14/13/15/12/10 + DEX 2, INT 1, ASI +2 INT → 8/16/13/18/12/10.
	// HP 6+1, 4 × (4+1) = 27. AC 10 + 3 = 13.
	kael := baseSheet("elf", "high-elf", "sage", "neutral-good",
		[]map[string]any{{"key": "wizard", "level": 5, "sub": "evocation", "hp": []int{4, 4, 4, 4}}}, abil(8, 14, 13, 15, 12, 10),
		[]string{"perception", "arcana", "history", "investigation"}, 9800, 19)
	kael["background_name"] = "Sage"
	kael["asi"] = []any{map[string]any{"class": "wizard", "level": 4, "a": "int", "b": "int"}}
	kael["langs"] = []string{"common", "elvish", "draconic", "dwarvish", "sylvan"}
	kael["choices"] = map[string][]string{"high-elf-cantrip": {"ray-of-frost"}}
	kael["inventory"] = []any{item("quarterstaff", "Quarterstaff", "weapon", 1, 4, true), item("dagger", "Dagger", "weapon", 2, 1, false), item("component-pouch", "Component pouch", "gear", 1, 2, true),
		item("spellbook", "Spellbook", "gear", 1, 3, false), item("scholars-pack", "Scholar's Pack", "gear", 1, 10, false),
		map[string]any{"id": "boh", "magic": "bag-of-holding", "name": "Bag of Holding", "kind": "magic", "qty": 1, "w": 15}}
	kael["coins"] = map[string]int{"cp": 0, "sp": 15, "ep": 0, "gp": 142, "pp": 1}
	kael["spells"] = []any{spell("fire-bolt", "wizard", true, false), spell("mage-hand", "wizard", true, false), spell("prestidigitation", "wizard", true, false), spell("light", "wizard", true, false),
		spell("ray-of-frost", "elf", true, true),
		spell("magic-missile", "wizard", true, false), spell("shield", "wizard", true, false), spell("mage-armor", "wizard", true, false), spell("detect-magic", "wizard", false, false),
		spell("sleep", "wizard", false, false), spell("burning-hands", "wizard", true, false), spell("misty-step", "wizard", true, false), spell("scorching-ray", "wizard", true, false),
		spell("web", "wizard", true, false), spell("invisibility", "wizard", false, false), spell("fireball", "wizard", true, false), spell("counterspell", "wizard", true, false), spell("fly", "wizard", false, false)}
	kael["slots_used"] = []int{2, 1, 0, 0, 0, 0, 0, 0, 0}
	kael["resources"] = []any{res("ar", "Arcane Recovery", 1, 0, "long")}
	kael["traits"] = map[string]string{"personality": "I talk to myself in Draconic when I'm nervous.", "ideals": "Knowledge is the path to power and to safety.",
		"bonds": "Magister Kett was my teacher's teacher.", "flaws": "I'll open any old book, cursed or not."}
	kael["bio"] = map[string]string{"age": "140", "eyes": "Silver", "hair": "Black", "appearance": "Ink-stained fingers, a scarf of moth-eaten blue silk."}

	// Mira: lightfoot halfling rogue 5 (Thief). 8/15/14/12/12/11 + DEX 2, CHA 1, ASI DEX+1 CON+1 → 8/18/15/12/12/12.
	// HP 8+2, 4 × (5+2) = 38. AC leather 11 + 4 = 15.
	mira := baseSheet("halfling", "lightfoot-halfling", "", "chaotic-good",
		[]map[string]any{{"key": "rogue", "level": 5, "sub": "thief", "hp": []int{5, 5, 5, 5}}}, abil(8, 15, 14, 12, 12, 11),
		[]string{"stealth", "sleight-of-hand", "acrobatics", "perception", "deception", "investigation"}, 9800, 31)
	mira["background_name"] = "Urchin"
	mira["asi"] = []any{map[string]any{"class": "rogue", "level": 4, "a": "dex", "b": "con"}}
	mira["expertise"] = []string{"stealth", "sleight-of-hand"}
	mira["langs"] = []string{"common", "halfling", "thieves-cant"}
	mira["tools"] = []string{"thieves-tools"}
	mira["inventory"] = []any{item("leather-armor", "Leather Armor", "armor", 1, 10, true),
		map[string]any{"id": "ss1", "key": "shortsword", "name": "Shortsword +1", "kind": "weapon", "qty": 1, "w": 2, "equipped": true, "bonus": 1},
		item("shortbow", "Shortbow", "weapon", 1, 2, false), item("arrow", "Arrow", "gear", 20, 0.05, false), item("dagger", "Dagger", "weapon", 2, 1, true),
		item("thieves-tools", "Thieves' Tools", "tool", 1, 1, false), item("burglars-pack", "Burglar's Pack", "gear", 1, 44.5, false)}
	mira["coins"] = map[string]int{"cp": 33, "sp": 18, "ep": 2, "gp": 97, "pp": 0}
	mira["traits"] = map[string]string{"personality": "I always know the fastest way out.", "ideals": "Nobody should go hungry.", "bonds": "Wren reminds me of me.", "flaws": "I can't leave a locked door alone."}
	mira["bio"] = map[string]string{"age": "27", "appearance": "Small even for a halfling; a grey cloak with too many pockets."}

	// Garrick: human fighter 5 (Champion), Defense. 15/13/14/8/12/10 + 1 each, ASI +2 STR → 18/14/15/9/13/11.
	// HP 10+2, 4 × (6+2) = 44. AC chain mail 16 + shield 2 + Defense 1 = 19.
	garrick := baseSheet("human", "", "", "lawful-neutral",
		[]map[string]any{{"key": "fighter", "level": 5, "sub": "champion", "hp": []int{6, 6, 6, 6}}}, abil(15, 13, 14, 8, 12, 10),
		[]string{"athletics", "intimidation", "perception", "survival"}, 8550, 30)
	garrick["background_name"] = "Soldier"
	garrick["asi"] = []any{map[string]any{"class": "fighter", "level": 4, "a": "str", "b": "str"}}
	garrick["choices"] = map[string][]string{"fighter-fighting-style": {"fighter-fighting-style-defense"}}
	garrick["langs"] = []string{"common", "orc"}
	garrick["inventory"] = []any{item("chain-mail", "Chain Mail", "armor", 1, 55, true), item("shield", "Shield", "shield", 1, 6, true), item("longsword", "Longsword", "weapon", 1, 3, true),
		item("handaxe", "Handaxe", "weapon", 2, 2, false), item("javelin", "Javelin", "weapon", 3, 2, false), item("explorers-pack", "Explorer's Pack", "gear", 1, 59, false)}
	garrick["coins"] = map[string]int{"cp": 0, "sp": 4, "ep": 0, "gp": 210, "pp": 0}
	garrick["resources"] = []any{res("sw", "Second Wind", 1, 1, "short"), res("as", "Action Surge", 1, 0, "short")}
	garrick["traits"] = map[string]string{"personality": "I face problems head-on.", "ideals": "Responsibility.", "bonds": "My old company died at the Old Bridge, twenty years ago.", "flaws": "I obey orders, even bad ones."}

	// Varkas: dragonborn paladin 3 (Devotion), red. 15/10/14/8/10/14 + STR 2, CHA 1 → 17/10/14/8/10/15.
	// HP 10+2, 2 × (6+2) = 28. AC chain mail 16 + shield 2 + Defense 1 = 19.
	varkas := baseSheet("dragonborn", "", "", "lawful-good",
		[]map[string]any{{"key": "paladin", "level": 3, "sub": "devotion", "hp": []int{6, 6}}}, abil(15, 10, 14, 8, 10, 14),
		[]string{"athletics", "persuasion", "religion", "intimidation"}, 0, 28)
	varkas["background_name"] = "Knight of the Order"
	varkas["choices"] = map[string][]string{"draconic-ancestry": {"draconic-ancestry-red"}, "paladin-fighting-style": {"fighting-style-defense"}}
	varkas["langs"] = []string{"common", "draconic"}
	varkas["inventory"] = []any{item("chain-mail", "Chain Mail", "armor", 1, 55, true), item("shield", "Shield", "shield", 1, 6, true), item("longsword", "Longsword", "weapon", 1, 3, true),
		item("javelin", "Javelin", "weapon", 5, 2, false), item("priests-pack", "Priest's Pack", "gear", 1, 24, false)}
	varkas["spells"] = []any{spell("protection-from-evil-and-good", "paladin", true, true), spell("sanctuary", "paladin", true, true), spell("bless", "paladin", true, false),
		spell("cure-wounds", "paladin", true, false), spell("detect-evil-and-good", "paladin", true, false)}
	varkas["resources"] = []any{res("ds", "Divine Sense", 3, 0, "long"), res("loh", "Lay on Hands (hit points)", 15, 0, "long"), res("cd", "Channel Divinity", 1, 0, "short"), res("bw", "Breath Weapon", 1, 0, "short")}

	// Nyx: tiefling warlock 3 (Fiend), Pact of the Tome. 8/14/13/12/10/15 + INT 1, CHA 2 → 8/14/13/13/10/17.
	// HP 8+1, 2 × (5+1) = 21. AC leather 11 + 2 = 13.
	nyx := baseSheet("tiefling", "", "", "chaotic-neutral",
		[]map[string]any{{"key": "warlock", "level": 3, "sub": "fiend", "hp": []int{5, 5}}}, abil(8, 14, 13, 12, 10, 15),
		[]string{"arcana", "deception", "intimidation", "history"}, 0, 21)
	nyx["background_name"] = "Charlatan"
	nyx["choices"] = map[string][]string{"eldritch-invocations": {"eldritch-invocation-agonizing-blast", "eldritch-invocation-devils-sight"}, "pact-boon": {"pact-of-the-tome"}}
	nyx["langs"] = []string{"common", "infernal", "abyssal"}
	nyx["inventory"] = []any{item("leather-armor", "Leather Armor", "armor", 1, 10, true), item("dagger", "Dagger", "weapon", 2, 1, true), item("crossbow-light", "Crossbow, light", "weapon", 1, 5, false),
		item("component-pouch", "Component pouch", "gear", 1, 2, true), item("scholars-pack", "Scholar's Pack", "gear", 1, 10, false)}
	nyx["spells"] = []any{spell("eldritch-blast", "warlock", true, false), spell("minor-illusion", "warlock", true, false), spell("thaumaturgy", "tiefling", true, true),
		spell("hellish-rebuke", "warlock", true, false), spell("command", "warlock", true, false), spell("darkness", "warlock", true, false), spell("invisibility", "warlock", true, false)}
	nyx["pact_used"] = 1

	// Grukk: half-orc barbarian 3 (Berserker). 15/14/14/8/12/8 + STR 2, CON 1 → 17/14/15/8/12/8.
	// HP 12+2, 2 × (7+2) = 32. AC 10 + 2 + 2 = 14 (unarmoured defence).
	grukk := baseSheet("half-orc", "", "", "chaotic-good",
		[]map[string]any{{"key": "barbarian", "level": 3, "sub": "berserker", "hp": []int{7, 7}}}, abil(15, 14, 14, 8, 12, 8),
		[]string{"athletics", "survival", "intimidation"}, 0, 32)
	grukk["background_name"] = "Outlander"
	grukk["langs"] = []string{"common", "orc"}
	grukk["inventory"] = []any{item("greataxe", "Greataxe", "weapon", 1, 7, true), item("handaxe", "Handaxe", "weapon", 2, 2, false), item("javelin", "Javelin", "weapon", 4, 2, false),
		item("explorers-pack", "Explorer's Pack", "gear", 1, 59, false)}
	grukk["resources"] = []any{res("rage", "Rage", 3, 1, "long"), res("re", "Relentless Endurance", 1, 0, "long")}

	// Pip: rock gnome bard 1, not in a campaign yet. 8/14/13/12/10/15 + INT 2, CON 1 → 8/14/14/14/10/15.
	// HP 8 + 2 = 10. AC leather 11 + 2 = 13.
	pip := baseSheet("gnome", "rock-gnome", "", "neutral-good",
		[]map[string]any{{"key": "bard", "level": 1, "sub": "", "hp": []int{}}}, abil(8, 14, 13, 12, 10, 15),
		[]string{"performance", "persuasion", "history", "deception", "sleight-of-hand"}, 0, 10)
	pip["background_name"] = "Entertainer"
	pip["langs"] = []string{"common", "gnomish"}
	pip["tools"] = []string{"lute", "flute", "drum", "tinkers-tools"}
	pip["inventory"] = []any{item("leather-armor", "Leather Armor", "armor", 1, 10, true), item("rapier", "Rapier", "weapon", 1, 2, true), item("dagger", "Dagger", "weapon", 1, 1, false),
		item("lute", "Lute", "tool", 1, 2, false), item("entertainers-pack", "Entertainer's Pack", "gear", 1, 38, false)}
	pip["spells"] = []any{spell("vicious-mockery", "bard", true, false), spell("minor-illusion", "bard", true, false),
		spell("healing-word", "bard", true, false), spell("faerie-fire", "bard", true, false), spell("heroism", "bard", true, false), spell("sleep", "bard", true, false)}
	pip["resources"] = []any{res("bi", "Bardic Inspiration", 2, 0, "long")}

	return []demoChar{
		{name: "Thora Emberforge", player: "Ana", species: "Hill Dwarf", classes: "Cleric 5 (Life)", classKey: "cleric", color: "#b8892e", frame: "gold", campaign: &ember, level: 5, ac: 18, hp: 48, init: -1, pp: 14, speed: 25, xp: 9800, share: true, sheet: thora},
		{name: "Kael Duskwhisper", player: "Marko", species: "High Elf", classes: "Wizard 5 (Evocation)", classKey: "wizard", color: "#4a5bb5", frame: "silver", campaign: &ember, level: 5, ac: 13, hp: 27, hpCur: 19, init: 3, pp: 14, speed: 30, xp: 9800, sheet: kael},
		{name: "Mira Thistledown", player: "Lejla", species: "Lightfoot Halfling", classes: "Rogue 5 (Thief)", classKey: "rogue", color: "#3f7d4e", frame: "bronze", campaign: &ember, level: 5, ac: 15, hp: 38, hpCur: 31, init: 4, pp: 14, speed: 25, xp: 9800, sheet: mira},
		{name: "Garrick Vane", player: "Dino", species: "Human", classes: "Fighter 5 (Champion)", classKey: "fighter", color: "#8a6a2f", frame: "iron", campaign: &ember, level: 5, ac: 19, hp: 44, hpCur: 30, init: 2, pp: 14, speed: 30, xp: 8550, sheet: garrick},
		{name: "Varkas Ashscale", player: "Emir", species: "Dragonborn", classes: "Paladin 3 (Devotion)", classKey: "paladin", color: "#a8323e", frame: "gold", campaign: &tides, level: 3, ac: 19, hp: 28, init: 0, pp: 10, speed: 30, sheet: varkas},
		{name: "Nyx", player: "Sara", species: "Tiefling", classes: "Warlock 3 (Fiend)", classKey: "warlock", color: "#6b3fa0", frame: "silver", campaign: &tides, level: 3, ac: 13, hp: 21, init: 2, pp: 10, speed: 30, sheet: nyx},
		{name: "Grukk", player: "Haris", species: "Half-Orc", classes: "Barbarian 3 (Berserker)", classKey: "barbarian", color: "#7a4a2a", frame: "iron", campaign: &tides, level: 3, ac: 14, hp: 32, init: 2, pp: 11, speed: 30, sheet: grukk},
		{name: "Pip Wizzlebell", player: "", species: "Rock Gnome", classes: "Bard 1", classKey: "bard", color: "#c0508a", frame: "bronze", level: 1, ac: 13, hp: 10, init: 2, pp: 10, speed: 25, sheet: pip},
	}
}
