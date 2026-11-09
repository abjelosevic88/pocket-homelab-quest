package store

import (
	"encoding/json"
	"strings"
)

// User is an account on this box.
type User struct {
	ID           int64  `json:"id"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	PasswordHash string `json:"-"`
	Role         string `json:"role"` // admin | member
	CreatedAt    string `json:"created_at"`
}

// APIToken is a personal access token (hash stored, plaintext shown once).
type APIToken struct {
	ID         int64   `json:"id"`
	UserID     int64   `json:"user_id"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	LastUsedAt *string `json:"last_used_at"`
	CreatedAt  string  `json:"created_at"`
}

// Photo is a picture: a portrait, an NPC, a map, a handout, a banner.
type Photo struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"-"`
	Kind      string `json:"kind"`
	Mime      string `json:"mime"`
	Data      []byte `json:"-"`
	Thumb     []byte `json:"-"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Bytes     int    `json:"bytes"`
	CreatedAt string `json:"created_at"`
}

// Campaign is a campaign or a one-shot.
type Campaign struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"-"`
	Name        string `json:"name"`
	Tagline     string `json:"tagline"`
	World       string `json:"world"`
	Status      string `json:"status"`
	Emblem      string `json:"emblem"`
	Color       string `json:"color"`
	PhotoID     *int64 `json:"photo_id"`
	Summary     string `json:"summary"`
	Secrets     string `json:"secrets"`
	HouseRules  string `json:"house_rules"`
	Advancement string `json:"advancement"`
	Schedule    string `json:"schedule"`
	Place       string `json:"place"`
	ShareToken  string `json:"share_token"`
	ShareOn     bool   `json:"share_on"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`

	// worked out on read
	Party       int    `json:"party"`        // active characters in it
	PartyLevel  int    `json:"party_level"`  // their average level
	Sessions    int    `json:"sessions"`     // played
	NextSession string `json:"next_session"` // date of the next planned one
	OpenQuests  int    `json:"open_quests"`
	PhotoURL    string `json:"photo_url"`
}

// Token is how a character looks on a list and on the initiative tracker
// when there is no portrait (or around it).
type Token struct {
	Color  string `json:"color,omitempty"`
	Emblem string `json:"emblem,omitempty"`
	Frame  string `json:"frame,omitempty"` // gold | silver | bronze | iron
}

// Character is a player character (or a companion). Sheet is the whole
// character sheet; the columns are what lists and the table need.
type Character struct {
	ID         int64           `json:"id"`
	UserID     int64           `json:"-"`
	CampaignID *int64          `json:"campaign_id"`
	Name       string          `json:"name"`
	Player     string          `json:"player"`
	Kind       string          `json:"kind"`
	Level      int             `json:"level"`
	Classes    string          `json:"classes"`
	ClassKey   string          `json:"class_key"`
	Species    string          `json:"species"`
	AC         int             `json:"ac"`
	HPMax      int             `json:"hp_max"`
	HPCur      int             `json:"hp_cur"`
	HPTemp     int             `json:"hp_temp"`
	Init       int             `json:"init"`
	PP         int             `json:"pp"`
	Speed      int             `json:"speed"`
	XP         int             `json:"xp"`
	Sheet      json.RawMessage `json:"sheet,omitempty"`
	Token      Token           `json:"token"`
	PhotoID    *int64          `json:"photo_id"`
	Status     string          `json:"status"`
	ShareToken string          `json:"share_token"`
	ShareOn    bool            `json:"share_on"`
	CreatedAt  string          `json:"created_at"`
	UpdatedAt  string          `json:"updated_at"`

	CampaignName string `json:"campaign_name"`
	PhotoURL     string `json:"photo_url"`
	ThumbURL     string `json:"thumb_url"`
}

// Session is one game night.
type Session struct {
	ID          int64   `json:"id"`
	UserID      int64   `json:"-"`
	CampaignID  int64   `json:"campaign_id"`
	Number      int     `json:"number"`
	Title       string  `json:"title"`
	Date        string  `json:"date"`
	Time        string  `json:"time"`
	Minutes     int     `json:"minutes"`
	Status      string  `json:"status"`
	Plan        string  `json:"plan"`
	Recap       string  `json:"recap"`
	Notes       string  `json:"notes"`
	XP          int     `json:"xp"`
	Loot        string  `json:"loot"`
	Attendance  []int64 `json:"attendance"`
	CalendarRef string  `json:"calendar_ref"`
	CalendarURL string  `json:"calendar_url"`
	Reminded    string  `json:"-"`
	Source      string  `json:"source"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`

	CampaignName string `json:"campaign_name"`
	Encounters   int    `json:"encounters"`
}

// Entry is one thing in a campaign's codex: a person, a place, a faction,
// an item, a piece of lore or a handout.
type Entry struct {
	ID         int64    `json:"id"`
	UserID     int64    `json:"-"`
	CampaignID int64    `json:"campaign_id"`
	Kind       string   `json:"kind"`
	Name       string   `json:"name"`
	Subtitle   string   `json:"subtitle"`
	Body       string   `json:"body"`
	Secret     string   `json:"secret"`
	Status     string   `json:"status"`
	Attitude   string   `json:"attitude"`
	PlaceID    *int64   `json:"place_id"`
	Monster    string   `json:"monster"`
	PhotoID    *int64   `json:"photo_id"`
	Revealed   bool     `json:"revealed"`
	Pinned     bool     `json:"pinned"`
	Tags       []string `json:"tags"`
	Source     string   `json:"source"`
	CreatedAt  string   `json:"created_at"`
	UpdatedAt  string   `json:"updated_at"`

	PlaceName string `json:"place_name"`
	PhotoURL  string `json:"photo_url"`
	ThumbURL  string `json:"thumb_url"`
}

// Objective is one step of a quest.
type Objective struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

// Quest is an entry in the quest log.
type Quest struct {
	ID         int64       `json:"id"`
	UserID     int64       `json:"-"`
	CampaignID int64       `json:"campaign_id"`
	Title      string      `json:"title"`
	Status     string      `json:"status"`
	GiverID    *int64      `json:"giver_id"`
	PlaceID    *int64      `json:"place_id"`
	Summary    string      `json:"summary"`
	Secret     string      `json:"secret"`
	Reward     string      `json:"reward"`
	Objectives []Objective `json:"objectives"`
	Revealed   bool        `json:"revealed"`
	Sort       int         `json:"sort"`
	DoneOn     string      `json:"done_on"`
	Source     string      `json:"source"`
	CreatedAt  string      `json:"created_at"`
	UpdatedAt  string      `json:"updated_at"`

	GiverName string `json:"giver_name"`
	PlaceName string `json:"place_name"`
}

// PlanLine is one kind of monster in an encounter plan.
type PlanLine struct {
	Ref  string `json:"ref"` // srd:<key> | my:<id>
	N    int    `json:"n"`
	Name string `json:"name,omitempty"`
}

// Combatant is one creature in a running fight.
type Combatant struct {
	ID         string   `json:"id"`
	Kind       string   `json:"kind"` // pc | monster | npc
	Ref        string   `json:"ref"`  // character:<id> | srd:<key> | my:<id> | ""
	Name       string   `json:"name"`
	Init       int      `json:"init"`
	InitBonus  int      `json:"init_bonus"`
	AC         int      `json:"ac"`
	HPMax      int      `json:"hp_max"`
	HP         int      `json:"hp"`
	Temp       int      `json:"temp"`
	Conditions []string `json:"conditions"`
	Conc       bool     `json:"conc"` // concentrating on a spell
	Hidden     bool     `json:"hidden"`
	Note       string   `json:"note"`
	Color      string   `json:"color,omitempty"`
	Legendary  int      `json:"legendary,omitempty"` // legendary actions left this round
	Saves      [2]int   `json:"saves"`               // death saves: successes, failures
	Out        bool     `json:"out"`                 // left the fight (dead, fled)
}

// LogLine is one line of a fight's log.
type LogLine struct {
	Round int    `json:"round"`
	Text  string `json:"text"`
	At    string `json:"at"`
}

// Fight is a running encounter's state.
type Fight struct {
	Round      int         `json:"round"`
	Turn       int         `json:"turn"` // index into Combatants (in initiative order)
	Started    string      `json:"started,omitempty"`
	Combatants []Combatant `json:"combatants"`
	Log        []LogLine   `json:"log"`
}

// Encounter is a planned or running fight.
type Encounter struct {
	ID         int64      `json:"id"`
	UserID     int64      `json:"-"`
	CampaignID *int64     `json:"campaign_id"`
	SessionID  *int64     `json:"session_id"`
	Name       string     `json:"name"`
	Place      string     `json:"place"`
	Readaloud  string     `json:"readaloud"`
	Notes      string     `json:"notes"`
	Status     string     `json:"status"`
	Plan       []PlanLine `json:"plan"`
	State      Fight      `json:"state"`
	XP         int        `json:"xp"`
	FinishedAt string     `json:"finished_at"`
	CreatedAt  string     `json:"created_at"`
	UpdatedAt  string     `json:"updated_at"`

	CampaignName string `json:"campaign_name"`
}

// Creature is one of a person's own monsters; Data is a stat block in the
// same shape as the built-in ones (srd.Monster).
type Creature struct {
	ID        int64           `json:"id"`
	UserID    int64           `json:"-"`
	Name      string          `json:"name"`
	Data      json.RawMessage `json:"data"`
	PhotoID   *int64          `json:"photo_id"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
	PhotoURL  string          `json:"photo_url"`
}

// Roll is one roll in the dice log.
type Roll struct {
	ID          int64           `json:"id"`
	UserID      int64           `json:"-"`
	CampaignID  *int64          `json:"campaign_id"`
	CharacterID *int64          `json:"character_id"`
	Label       string          `json:"label"`
	Expr        string          `json:"expr"`
	Total       int             `json:"total"`
	Detail      json.RawMessage `json:"detail"`
	Kind        string          `json:"kind"`
	CreatedAt   string          `json:"created_at"`

	CharacterName string `json:"character_name"`
}

// Values the API checks against.
var (
	CampaignStates  = []string{"active", "paused", "done"}
	Advancements    = []string{"xp", "milestone"}
	CharacterStates = []string{"active", "retired", "dead"}
	CharacterKinds  = []string{"pc", "companion"}
	SessionStates   = []string{"planned", "played", "cancelled"}
	EntryKinds      = []string{"npc", "place", "faction", "item", "lore", "handout"}
	NPCStates       = []string{"", "alive", "dead", "missing"}
	Attitudes       = []string{"", "friendly", "neutral", "hostile"}
	QuestStates     = []string{"rumour", "active", "done", "failed"}
	EncounterStates = []string{"plan", "running", "done"}
	RollKinds       = []string{"roll", "check", "save", "attack", "damage", "init", "death", "hit_die", "spell"}
	Frames          = []string{"", "gold", "silver", "bronze", "iron"}
)

// Conn is one person's connection to a sibling Pocket app.
type Conn struct {
	Mode      string `json:"mode,omitempty"`
	URL       string `json:"url,omitempty"`
	Token     string `json:"token,omitempty"`
	PublicURL string `json:"public_url,omitempty"`
}

// Settings are the box-wide values plus one person's preferences and their
// own connections.
type Settings struct {
	Title         string `json:"title"`
	SetupComplete bool   `json:"setup_complete"`

	DateFormat string `json:"date_format"`
	TimeFormat string `json:"time_format"`
	WeekStart  int    `json:"week_start"` // 1 = Monday, 7 = Sunday

	// At the table.
	Campaign      int64  `json:"campaign"`       // the campaign Today opens on (0 = the most recent)
	DiceMotion    bool   `json:"dice_motion"`    // tumble the dice before showing a roll
	CritRule      string `json:"crit_rule"`      // double | max (double the dice, or max the extra dice)
	HPOnLevel     string `json:"hp_on_level"`    // average | roll
	Encumbrance   bool   `json:"encumbrance"`    // the variant: speed drops past 5 × and 10 × Strength
	ShowSecrets   bool   `json:"show_secrets"`   // secrets open by default (off when you play on a shared screen)
	PlayerMonster string `json:"player_monster"` // how players see a monster's health: words | hidden | numbers

	// Other apps.
	CalendarID   int64  `json:"calendar_id"`   // Pocket Calendar calendar for game nights (0 = the default one)
	AutoCalendar bool   `json:"auto_calendar"` // put planned game nights on the calendar
	ChatTo       string `json:"chat_to"`       // the party's Pocket Chat conversation
	NotesFolder  string `json:"notes_folder"`  // where recaps go in Pocket Notes
	AIHelp       bool   `json:"ai_help"`

	// Notifications.
	NotifySessions bool   `json:"notify_sessions"` // the day before a game night
	NotifyHour     int    `json:"notify_hour"`
	NotifyLevel    bool   `json:"notify_level"` // a character has the XP for a new level
	NotifyURL      string `json:"notify_url"`
	NotifyFormat   string `json:"notify_format"` // apprise | ntfy | json

	// Each sibling Pocket app, by slug.
	Conns map[string]Conn `json:"conns"`

	// AI: Pocket AI through Core, or an OpenAI-compatible API with the
	// person's own key.
	AIProvider    string `json:"ai_provider"` // auto | pocket | openai
	AIPocketModel string `json:"ai_pocket_model"`
	OpenAIKey     string `json:"openai_api_key"`
	OpenAIModel   string `json:"openai_model"`
	OpenAIBaseURL string `json:"openai_base_url"`
}

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// CleanTags trims, de-duplicates and caps a list of tags.
func CleanTags(in []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.TrimSpace(strings.TrimPrefix(t, "#"))
		k := strings.ToLower(t)
		if t == "" || seen[k] || len(out) >= 20 {
			continue
		}
		seen[k] = true
		out = append(out, t)
	}
	return out
}
