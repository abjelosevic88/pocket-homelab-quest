// Package srd is the built-in rules content: the monsters, spells,
// equipment, magic items, classes, species, backgrounds, conditions and rules
// of the System Reference Document 5.1 (CC-BY-4.0, see ATTRIBUTION.md),
// compacted by scripts/srd/convert.py.
package srd

import (
	"bytes"
	"compress/gzip"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
)

//go:embed data/*.json.gz
var dataFS embed.FS

// Kinds are the files there are.
var Kinds = []string{"monsters", "spells", "equipment", "magic_items", "conditions", "damage_types", "languages", "alignments", "schools",
	"weapon_props", "rules", "feats", "skills", "traits", "races", "proficiencies", "features", "classes", "equip_cats", "backgrounds"}

// Gz returns a file as stored (gzipped JSON), ok = false when there is no such kind.
func Gz(kind string) ([]byte, bool) {
	b, err := dataFS.ReadFile("data/" + kind + ".json.gz")
	return b, err == nil
}

// Raw returns a file as plain JSON.
func Raw(kind string) ([]byte, error) {
	gz, ok := Gz(kind)
	if !ok {
		return nil, fmt.Errorf("srd: no %s", kind)
	}
	r, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}

func load(kind string, v any) {
	b, err := Raw(kind)
	if err != nil {
		panic(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		panic(fmt.Sprintf("srd: %s: %v", kind, err))
	}
}

// Action is a trait, action, reaction or legendary action of a monster.
type Action struct {
	Name string      `json:"name"`
	Desc string      `json:"desc"`
	Hit  *int        `json:"hit,omitempty"`
	Dmg  [][2]string `json:"dmg,omitempty"` // [dice, damage type]
	DC   []any       `json:"dc,omitempty"`  // [ability, value]
	Use  string      `json:"use,omitempty"`
}

// Monster is a stat block (built in, or a person's own in the same shape).
type Monster struct {
	Key       string         `json:"key"`
	Name      string         `json:"name"`
	Size      string         `json:"size"`
	Type      string         `json:"type"`
	Sub       string         `json:"sub,omitempty"`
	Align     string         `json:"align,omitempty"`
	AC        int            `json:"ac"`
	ACNote    string         `json:"ac_note,omitempty"`
	HP        int            `json:"hp"`
	HD        string         `json:"hd,omitempty"`
	Speed     string         `json:"speed,omitempty"`
	Walk      int            `json:"walk,omitempty"`
	Abil      [6]int         `json:"abil"`
	Saves     map[string]int `json:"saves,omitempty"`
	Skills    map[string]int `json:"skills,omitempty"`
	Vuln      []string       `json:"vuln,omitempty"`
	Res       []string       `json:"res,omitempty"`
	Imm       []string       `json:"imm,omitempty"`
	CImm      []string       `json:"cimm,omitempty"`
	Senses    string         `json:"senses,omitempty"`
	PP        int            `json:"pp,omitempty"`
	Lang      string         `json:"lang,omitempty"`
	CR        float64        `json:"cr"`
	XP        int            `json:"xp"`
	PB        int            `json:"pb,omitempty"`
	Traits    []Action       `json:"traits"`
	Actions   []Action       `json:"actions"`
	Reactions []Action       `json:"reactions,omitempty"`
	Legendary []Action       `json:"legendary,omitempty"`
	Desc      string         `json:"desc,omitempty"`
}

// Mod is an ability modifier.
func Mod(score int) int {
	if score >= 10 {
		return (score - 10) / 2
	}
	return -((11 - score) / 2)
}

// DexMod is the monster's initiative bonus.
func (m *Monster) DexMod() int { return Mod(m.Abil[1]) }

// MonsterSummary is a monster in a list.
type MonsterSummary struct {
	Key    string  `json:"key"`
	Name   string  `json:"name"`
	Size   string  `json:"size"`
	Type   string  `json:"type"`
	Sub    string  `json:"sub,omitempty"`
	Align  string  `json:"align,omitempty"`
	AC     int     `json:"ac"`
	HP     int     `json:"hp"`
	CR     float64 `json:"cr"`
	XP     int     `json:"xp"`
	Legend bool    `json:"legendary,omitempty"`
	Fly    bool    `json:"fly,omitempty"`
	Swim   bool    `json:"swim,omitempty"`
}

// Spell is a spell (the full description is in Desc).
type Spell struct {
	Key        string            `json:"key"`
	Name       string            `json:"name"`
	Level      int               `json:"level"`
	School     string            `json:"school"`
	Time       string            `json:"time"`
	Range      string            `json:"range"`
	Comp       string            `json:"comp"`
	Mat        string            `json:"mat,omitempty"`
	Dur        string            `json:"dur"`
	Conc       bool              `json:"conc"`
	Ritual     bool              `json:"ritual"`
	Classes    []string          `json:"classes"`
	Subclasses []string          `json:"subclasses,omitempty"`
	Desc       string            `json:"desc,omitempty"`
	Higher     string            `json:"higher,omitempty"`
	DmgType    string            `json:"dmg_type,omitempty"`
	DmgSlot    map[string]string `json:"dmg_slot,omitempty"`
	DmgChar    map[string]string `json:"dmg_char,omitempty"`
	HealSlot   map[string]string `json:"heal_slot,omitempty"`
	Save       string            `json:"save,omitempty"`
	SaveOK     string            `json:"save_ok,omitempty"`
	Attack     string            `json:"attack,omitempty"`
	Area       []any             `json:"area,omitempty"`
}

// MagicItem is a magic item.
type MagicItem struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Cat    string `json:"cat"`
	Rarity string `json:"rarity"`
	Attune bool   `json:"attune"`
	Line   string `json:"line"`
	Desc   string `json:"desc,omitempty"`
}

// Named is anything with a key, a name and a description (conditions, rules…).
type Named struct {
	Key  string `json:"key"`
	Name string `json:"name"`
	Desc string `json:"desc,omitempty"`
	MD   string `json:"md,omitempty"`
}

type db struct {
	monsters   []Monster
	monsterBy  map[string]*Monster
	spells     []Spell
	spellBy    map[string]*Spell
	magic      []MagicItem
	magicBy    map[string]*MagicItem
	conditions []Named
	rules      []Named
	equipment  []map[string]any
	equipBy    map[string]map[string]any
	classes    []map[string]any
}

var (
	once sync.Once
	d    db
)

func get() *db {
	once.Do(func() {
		load("monsters", &d.monsters)
		d.monsterBy = map[string]*Monster{}
		for i := range d.monsters {
			d.monsterBy[d.monsters[i].Key] = &d.monsters[i]
		}
		load("spells", &d.spells)
		d.spellBy = map[string]*Spell{}
		for i := range d.spells {
			d.spellBy[d.spells[i].Key] = &d.spells[i]
		}
		load("magic_items", &d.magic)
		d.magicBy = map[string]*MagicItem{}
		for i := range d.magic {
			d.magicBy[d.magic[i].Key] = &d.magic[i]
		}
		load("conditions", &d.conditions)
		load("rules", &d.rules)
		load("equipment", &d.equipment)
		d.equipBy = map[string]map[string]any{}
		for _, e := range d.equipment {
			if k, _ := e["key"].(string); k != "" {
				d.equipBy[k] = e
			}
		}
		load("classes", &d.classes)
	})
	return &d
}

// Monsters lists every built-in monster.
func Monsters() []Monster { return get().monsters }

// MonsterByKey finds a built-in monster.
func MonsterByKey(key string) (*Monster, bool) {
	m, ok := get().monsterBy[key]
	return m, ok
}

// Summary is a monster as a list shows it.
func (m *Monster) Summary() MonsterSummary {
	sp := strings.ToLower(m.Speed)
	return MonsterSummary{Key: m.Key, Name: m.Name, Size: m.Size, Type: m.Type, Sub: m.Sub, Align: m.Align, AC: m.AC, HP: m.HP, CR: m.CR, XP: m.XP,
		Legend: len(m.Legendary) > 0, Fly: strings.Contains(sp, "fly"), Swim: strings.Contains(sp, "swim")}
}

// MonsterSummaries lists the built-in monsters for a list.
func MonsterSummaries() []MonsterSummary {
	ms := get().monsters
	out := make([]MonsterSummary, len(ms))
	for i := range ms {
		out[i] = ms[i].Summary()
	}
	return out
}

// Spells lists every spell.
func Spells() []Spell { return get().spells }

// SpellByKey finds a spell.
func SpellByKey(key string) (*Spell, bool) {
	s, ok := get().spellBy[key]
	return s, ok
}

// SpellSummaries lists the spells without their long descriptions.
func SpellSummaries() []Spell {
	ss := get().spells
	out := make([]Spell, len(ss))
	for i, s := range ss {
		s.Desc, s.Higher, s.Mat = "", "", ""
		out[i] = s
	}
	return out
}

// MagicItems lists the magic items.
func MagicItems() []MagicItem { return get().magic }

// MagicItemByKey finds a magic item.
func MagicItemByKey(key string) (*MagicItem, bool) {
	m, ok := get().magicBy[key]
	return m, ok
}

// MagicSummaries lists the magic items without their descriptions.
func MagicSummaries() []MagicItem {
	ms := get().magic
	out := make([]MagicItem, len(ms))
	for i, m := range ms {
		m.Desc = ""
		out[i] = m
	}
	return out
}

// EquipmentByKey finds a piece of mundane equipment.
func EquipmentByKey(key string) (map[string]any, bool) {
	e, ok := get().equipBy[key]
	return e, ok
}

// Conditions lists the conditions.
func Conditions() []Named { return get().conditions }

// Rules lists the rule sections.
func Rules() []Named { return get().rules }

// ClassName names a class key ("wizard" → "Wizard").
func ClassName(key string) string {
	for _, c := range get().classes {
		if c["key"] == key {
			n, _ := c["name"].(string)
			return n
		}
	}
	return key
}

// Hit is one search result.
type Hit struct {
	Kind string `json:"kind"` // monster | spell | magic_item | equipment | condition | rule
	Key  string `json:"key"`
	Name string `json:"name"`
	Line string `json:"line"`
}

// Search finds rules content by name (best matches first).
func Search(q string, limit int) []Hit {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return []Hit{}
	}
	if limit <= 0 {
		limit = 20
	}
	type scored struct {
		h Hit
		s int
	}
	var all []scored
	score := func(name string) int {
		n := strings.ToLower(name)
		switch {
		case n == q:
			return 0
		case strings.HasPrefix(n, q):
			return 1
		case strings.Contains(n, " "+q):
			return 2
		case strings.Contains(n, q):
			return 3
		}
		return -1
	}
	db := get()
	for i := range db.monsters {
		m := &db.monsters[i]
		if s := score(m.Name); s >= 0 {
			all = append(all, scored{Hit{"monster", m.Key, m.Name, fmt.Sprintf("%s %s · CR %s", m.Size, m.Type, CRText(m.CR))}, s})
		}
	}
	for _, sp := range db.spells {
		if s := score(sp.Name); s >= 0 {
			all = append(all, scored{Hit{"spell", sp.Key, sp.Name, SpellLevelText(sp.Level, sp.School)}, s})
		}
	}
	for _, m := range db.magic {
		if s := score(m.Name); s >= 0 {
			all = append(all, scored{Hit{"magic_item", m.Key, m.Name, strings.TrimSpace(m.Cat + " · " + m.Rarity)}, s})
		}
	}
	for _, e := range db.equipment {
		name, _ := e["name"].(string)
		if s := score(name); s >= 0 {
			key, _ := e["key"].(string)
			cat, _ := e["cat"].(string)
			all = append(all, scored{Hit{"equipment", key, name, strings.ReplaceAll(cat, "-", " ")}, s + 1})
		}
	}
	for _, c := range db.conditions {
		if s := score(c.Name); s >= 0 {
			all = append(all, scored{Hit{"condition", c.Key, c.Name, "Condition"}, s})
		}
	}
	for _, r := range db.rules {
		if s := score(r.Name); s >= 0 {
			all = append(all, scored{Hit{"rule", r.Key, r.Name, "Rules"}, s + 1})
		}
	}
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].s != all[j].s {
			return all[i].s < all[j].s
		}
		return all[i].h.Name < all[j].h.Name
	})
	out := []Hit{}
	for i := 0; i < len(all) && i < limit; i++ {
		out = append(out, all[i].h)
	}
	return out
}

// CRText writes a challenge rating the way stat blocks do (1/8, 1/4, 1/2, 3).
func CRText(cr float64) string {
	switch cr {
	case 0.125:
		return "1/8"
	case 0.25:
		return "1/4"
	case 0.5:
		return "1/2"
	}
	return fmt.Sprintf("%g", cr)
}

// SpellLevelText is "Cantrip · evocation" or "3rd level · evocation".
func SpellLevelText(level int, school string) string {
	if level == 0 {
		return "Cantrip · " + school
	}
	return Ordinal(level) + " level · " + school
}

// Ordinal is 1st, 2nd, 3rd, 4th…
func Ordinal(n int) string {
	suf := "th"
	switch {
	case n%100 >= 11 && n%100 <= 13:
	case n%10 == 1:
		suf = "st"
	case n%10 == 2:
		suf = "nd"
	case n%10 == 3:
		suf = "rd"
	}
	return fmt.Sprintf("%d%s", n, suf)
}
