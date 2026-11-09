package server

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// Pocket Core app links (docs/links.md in pocket-homelab-core), Quest as
// the target: another Pocket app the person allowed in Core may act here for
// them with a pcx_ token, only within these scopes. Every route not listed
// in linkRoutes stays closed to it (403).

var linkOffers = []core.Offer{
	{Scope: "quest:read", Name: "See your games", Description: "Read your campaigns, game nights (planned and played, with their recaps), characters (level, hit points, armour class), the quest log, encounters and the rules content — for your journal, your calendar, search and Pocket AI. Never the game master's secrets."},
	{Scope: "quest:write", Name: "Plan game nights and roll dice", Description: "Plan a game night, add a person, place or note to a campaign, add a quest, change a character's hit points and roll dice. It may change or remove only the game nights, entries and quests it added itself."},
}

type linkRoute struct {
	methods string
	path    *regexp.Regexp
	scope   string // "" = any linked app
}

var linkRoutes = []linkRoute{
	{"GET", regexp.MustCompile(`^/api/v1/auth/me$`), ""},
	{"GET", regexp.MustCompile(`^/api/v1/(summary|home|search|campaigns|sessions|characters|quests|encounters|rolls|names|day/\d{4}-\d{2}-\d{2})$`), "quest:read"},
	{"GET", regexp.MustCompile(`^/api/v1/(sessions|characters|encounters)/\d+$`), "quest:read"},
	{"GET", regexp.MustCompile(`^/api/v1/srd/(monsters|spells|magic-items)(/[a-z0-9:-]+)?$`), "quest:read"},
	{"POST", regexp.MustCompile(`^/api/v1/(sessions|codex|quests|rolls)$`), "quest:write"},
	{"PUT DELETE", regexp.MustCompile(`^/api/v1/(sessions|codex|quests)/\d+$`), "quest:write"},
	{"POST", regexp.MustCompile(`^/api/v1/characters/\d+/hp$`), "quest:write"},
}

var errLinkScope = errors.New("outside the link's scope")

// linkAllows reports whether a link token with these scopes may make this request.
func linkAllows(scopes []string, r *http.Request) bool {
	for _, lr := range linkRoutes {
		if !strings.Contains(" "+lr.methods+" ", " "+r.Method+" ") || !lr.path.MatchString(r.URL.Path) {
			continue
		}
		if lr.scope == "" {
			return true
		}
		for _, sc := range scopes {
			if sc == lr.scope {
				return true
			}
		}
	}
	return false
}

// linkUser validates a pcx_ token, checks the route against its scopes and
// maps it to the person it acts for. The second value is the acting app's slug.
func (s *Server) linkUser(ctx context.Context, tok string, r *http.Request) (*store.User, string, error) {
	in, err := s.core.Introspect(ctx, tok)
	if err != nil {
		return nil, "", err
	}
	if !in.Active || !in.Delegated() || in.Audience != "quest" || in.User == nil || in.User.Email == "" || in.App == nil || in.App.Slug == "" {
		return nil, "", http.ErrNoCookie
	}
	if !linkAllows(strings.Fields(in.Scope), r) {
		return nil, "", errLinkScope
	}
	u, err := s.coreIdentityUser(ctx, in)
	return u, in.App.Slug, err
}

const linkAppKey ctxKey = 2

// linkApp is the acting app's slug when the request came in on a link token.
func linkApp(ctx context.Context) string {
	a, _ := ctx.Value(linkAppKey).(string)
	return a
}
