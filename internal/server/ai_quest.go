package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/abjelosevic88/pocket-homelab-quest/internal/srd"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// Pocket AI at the table: a recap from the game master's notes, an NPC, a
// backstory, read-aloud text for a scene, ideas for the next game night,
// and answers to rules questions. Each needs the AI switch on (Settings →
// AI) and Pocket AI or an OpenAI-compatible key.

const aiVoice = "You help a game master and players run a fifth-edition fantasy tabletop role-playing game (5E rules, the System Reference Document 5.1). " +
	"Write plain, vivid English. No headings unless asked, no meta talk about being an AI. Never name real-world products, publishers or settings; " +
	"invent names that fit the campaign. Keep to what you are asked."

// aiStart checks the switch and takes one of the AI slots.
func (s *Server) aiStart(w http.ResponseWriter, r *http.Request) (store.Settings, func(), bool) {
	st := s.settingsOf(r.Context(), actorID(r.Context()))
	if !st.AIHelp {
		writeErr(w, http.StatusBadRequest, "AI help is switched off (Settings → AI)")
		return st, nil, false
	}
	select {
	case s.aiSem <- struct{}{}:
		return st, func() { <-s.aiSem }, true
	default:
		writeErr(w, http.StatusTooManyRequests, "the AI is busy; try again in a moment")
		return st, nil, false
	}
}

// campaignBrief is what the AI knows of a campaign (the game master's own
// secrets only when secrets is true).
func (s *Server) campaignBrief(ctx context.Context, uid, id int64, secrets bool) string {
	c, err := s.store.GetCampaign(ctx, uid, id)
	if err != nil {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Campaign: %s", c.Name)
	if c.Tagline != "" {
		b.WriteString(" — " + c.Tagline)
	}
	if c.World != "" {
		b.WriteString("\nWorld: " + c.World)
	}
	if c.Summary != "" {
		b.WriteString("\nWhat the players know: " + clip(c.Summary, 1500))
	}
	if secrets && c.Secrets != "" {
		b.WriteString("\nThe game master's secrets: " + clip(c.Secrets, 1500))
	}
	party, _ := s.store.ListCharacters(ctx, uid, store.CharacterFilter{CampaignID: id, Status: "active"})
	if len(party) > 0 {
		b.WriteString("\nThe party:")
		for _, p := range party {
			fmt.Fprintf(&b, "\n- %s, %s %s (level %d)", p.Name, p.Species, p.Classes, p.Level)
		}
	}
	entries, _ := s.store.ListEntries(ctx, uid, id, "", false)
	n := 0
	for _, e := range entries {
		if e.Kind != "npc" && e.Kind != "place" && e.Kind != "faction" {
			continue
		}
		if n == 0 {
			b.WriteString("\nPeople, places and factions:")
		}
		if n++; n > 25 {
			break
		}
		fmt.Fprintf(&b, "\n- %s (%s)", e.Name, firstNonEmpty(e.Subtitle, kindWord(e.Kind)))
	}
	quests, _ := s.store.ListQuests(ctx, uid, id, false)
	for i, q := range quests {
		if i == 0 {
			b.WriteString("\nQuests:")
		}
		if i >= 10 {
			break
		}
		fmt.Fprintf(&b, "\n- %s (%s)", q.Title, q.Status)
	}
	return b.String()
}

func (s *Server) aiRun(w http.ResponseWriter, r *http.Request, system, prompt string, asJSON bool, v any) (string, bool) {
	st, done, ok := s.aiStart(w, r)
	if !ok {
		return "", false
	}
	defer done()
	ctx := r.Context()
	cl, _, why := s.aiFor(ctx, actorID(ctx), st)
	if cl == nil {
		writeErr(w, http.StatusBadRequest, firstNonEmpty(why, "no AI set up (Settings → AI)"))
		return "", false
	}
	if v != nil {
		if err := cl.JSON(ctx, system, prompt, v); err != nil {
			writeErr(w, http.StatusBadGateway, "AI: "+err.Error())
			return "", false
		}
		return "", true
	}
	out, err := cl.Complete(ctx, system, prompt, asJSON)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "AI: "+err.Error())
		return "", false
	}
	return strings.TrimSpace(out), true
}

// handleAIRecap writes a session's recap from the prep, the notes and the fights.
func (s *Server) handleAIRecap(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		SessionID int64  `json:"session_id"`
		Notes     string `json:"notes"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	x, err := s.store.GetSession(ctx, uid, in.SessionID)
	if err != nil {
		s.fail(w, err, "session")
		return
	}
	notes := firstNonEmpty(strings.TrimSpace(in.Notes), x.Notes)
	if notes == "" && x.Plan == "" {
		writeErr(w, http.StatusBadRequest, "write a few notes about what happened first")
		return
	}
	var b strings.Builder
	b.WriteString(s.campaignBrief(ctx, uid, x.CampaignID, false))
	fmt.Fprintf(&b, "\n\nSession %d", x.Number)
	if x.Title != "" {
		b.WriteString(": " + x.Title)
	}
	if x.Plan != "" {
		b.WriteString("\nWhat the game master planned (may not all have happened): " + clip(x.Plan, 3000))
	}
	b.WriteString("\nThe game master's notes of what happened: " + clip(notes, 6000))
	encs, _ := s.store.ListEncounters(ctx, uid, store.EncounterFilter{SessionID: x.ID})
	for _, e := range encs {
		if e.Status == "done" {
			fmt.Fprintf(&b, "\nFight: %s (%d rounds)", e.Name, e.State.Round)
		}
	}
	if x.Loot != "" {
		b.WriteString("\nTreasure: " + clip(x.Loot, 800))
	}
	b.WriteString("\n\nWrite the recap the players read before the next game night: 2 to 4 short paragraphs, past tense, second person plural is fine " +
		"(\"you\"), only what the characters saw and did — no secrets. End with one line starting \"Where we left off:\".")
	text, ok := s.aiRun(w, r, aiVoice, b.String(), false, nil)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"text": text})
}

type aiNPC struct {
	Name     string   `json:"name"`
	Subtitle string   `json:"subtitle"`
	Body     string   `json:"body"`
	Secret   string   `json:"secret"`
	Attitude string   `json:"attitude"`
	Tags     []string `json:"tags"`
	Voice    string   `json:"voice"`
}

// handleAINPC makes up a person for the campaign (not saved until you keep it).
func (s *Server) handleAINPC(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		CampaignID int64  `json:"campaign_id"`
		Hint       string `json:"hint"`
		Kind       string `json:"kind"` // npc | place | faction | item | lore
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if in.Kind == "" || !oneOf(in.Kind, store.EntryKinds) {
		in.Kind = "npc"
	}
	what := map[string]string{"npc": "a non-player character", "place": "a place (a town, a dungeon, an inn, a ruin…)", "faction": "a faction or organisation",
		"item": "a notable item or treasure (not a rules-breaking one)", "lore": "a piece of lore, legend or history", "handout": "a handout the players find (a letter, a map note, a notice)"}[in.Kind]
	prompt := s.campaignBrief(ctx, uid, in.CampaignID, true) + "\n\nMake up " + what + " for this campaign."
	if h := strings.TrimSpace(in.Hint); h != "" {
		prompt += "\nThe game master wants: " + clip(h, 600)
	}
	prompt += "\nAnswer as JSON: {\"name\": \"…\", \"subtitle\": \"a few words: role or kind\", \"body\": \"2-3 short paragraphs the players may learn (looks, manner, what is known)\", " +
		"\"secret\": \"1 paragraph only the game master knows (motives, hidden truth, a hook)\", \"attitude\": \"friendly|neutral|hostile or empty\", " +
		"\"voice\": \"for a person: how to play them at the table in one line, else empty\", \"tags\": [\"2-4 short tags\"]}"
	var out aiNPC
	if _, ok := s.aiRun(w, r, aiVoice, prompt, true, &out); !ok {
		return
	}
	if !oneOf(out.Attitude, store.Attitudes) {
		out.Attitude = ""
	}
	if out.Voice != "" {
		out.Body = strings.TrimSpace(out.Body + "\n\nAt the table: " + out.Voice)
	}
	writeJSON(w, http.StatusOK, map[string]any{"entry": out, "kind": in.Kind})
}

// handleAIBackstory writes a character's backstory from their sheet.
func (s *Server) handleAIBackstory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		CharacterID int64  `json:"character_id"`
		Name        string `json:"name"`
		Species     string `json:"species"`
		Classes     string `json:"classes"`
		Background  string `json:"background"`
		Alignment   string `json:"alignment"`
		Traits      string `json:"traits"`
		Hint        string `json:"hint"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	brief := ""
	if in.CharacterID > 0 {
		c, err := s.store.GetCharacter(ctx, uid, in.CharacterID)
		if err != nil {
			s.fail(w, err, "character")
			return
		}
		in.Name, in.Species, in.Classes = firstNonEmpty(in.Name, c.Name), firstNonEmpty(in.Species, c.Species), firstNonEmpty(in.Classes, c.Classes)
		if c.CampaignID != nil {
			brief = s.campaignBrief(ctx, uid, *c.CampaignID, false) + "\n\n"
		}
	}
	prompt := brief + fmt.Sprintf("Write the backstory of %s, a %s %s", firstNonEmpty(in.Name, "a new adventurer"), firstNonEmpty(in.Species, "human"), firstNonEmpty(in.Classes, "adventurer"))
	if in.Background != "" {
		prompt += ", background: " + in.Background
	}
	if in.Alignment != "" {
		prompt += ", alignment: " + in.Alignment
	}
	if in.Traits != "" {
		prompt += ".\nPersonality, ideals, bonds and flaws: " + clip(in.Traits, 1500)
	}
	if h := strings.TrimSpace(in.Hint); h != "" {
		prompt += "\nThe player wants: " + clip(h, 600)
	}
	prompt += "\n\nThree short paragraphs: where they come from, what made them leave, and what they want now. End with one loose thread the game master could use. Leave room for the table to fill in."
	text, ok := s.aiRun(w, r, aiVoice, prompt, false, nil)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"text": text})
}

// handleAIReadaloud writes the boxed text a game master reads out for a scene.
func (s *Server) handleAIReadaloud(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		EncounterID int64  `json:"encounter_id"`
		EntryID     int64  `json:"entry_id"`
		Hint        string `json:"hint"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	var b strings.Builder
	switch {
	case in.EncounterID > 0:
		e, err := s.store.GetEncounter(ctx, uid, in.EncounterID)
		if err != nil {
			s.fail(w, err, "encounter")
			return
		}
		if e.CampaignID != nil {
			b.WriteString(s.campaignBrief(ctx, uid, *e.CampaignID, false) + "\n\n")
		}
		fmt.Fprintf(&b, "The scene: %s", e.Name)
		if e.Place != "" {
			b.WriteString(", at " + e.Place)
		}
		var foes []string
		for _, l := range e.Plan {
			if m, err := s.monsterFor(ctx, uid, l.Ref); err == nil {
				foes = append(foes, fmt.Sprintf("%d × %s (%s %s)", l.N, m.Name, strings.ToLower(m.Size), m.Type))
			}
		}
		if len(foes) > 0 {
			b.WriteString("\nWho is there: " + strings.Join(foes, ", "))
		}
		if e.Notes != "" {
			b.WriteString("\nThe game master's notes: " + clip(e.Notes, 1500))
		}
	case in.EntryID > 0:
		e, err := s.store.GetEntry(ctx, uid, in.EntryID)
		if err != nil {
			s.fail(w, err, "entry")
			return
		}
		b.WriteString(s.campaignBrief(ctx, uid, e.CampaignID, false) + "\n\n")
		fmt.Fprintf(&b, "The scene: the party arrives at %s (%s).\n%s", e.Name, firstNonEmpty(e.Subtitle, kindWord(e.Kind)), clip(e.Body, 2000))
	default:
		writeErr(w, http.StatusBadRequest, "pick the encounter or the place")
		return
	}
	if h := strings.TrimSpace(in.Hint); h != "" {
		b.WriteString("\nThe game master wants: " + clip(h, 600))
	}
	b.WriteString("\n\nWrite read-aloud text: 3 to 5 sentences in the second person and present tense, what the characters see, hear and smell as the scene opens. " +
		"Do not say what the characters think or do, and do not give away hidden things or numbers.")
	text, ok := s.aiRun(w, r, aiVoice, b.String(), false, nil)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"text": text})
}

// handleAIIdeas suggests what could happen at the next game night.
func (s *Server) handleAIIdeas(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		CampaignID int64  `json:"campaign_id"`
		Hint       string `json:"hint"`
	}
	if err := decode(r, &in); err != nil || in.CampaignID == 0 {
		writeErr(w, http.StatusBadRequest, "pick the campaign")
		return
	}
	var b strings.Builder
	b.WriteString(s.campaignBrief(ctx, uid, in.CampaignID, true))
	last, _ := s.store.ListSessions(ctx, uid, store.SessionFilter{CampaignID: in.CampaignID, Status: "played", Desc: true, Limit: 2})
	for _, x := range last {
		fmt.Fprintf(&b, "\n\nSession %d recap: %s", x.Number, clip(firstNonEmpty(x.Recap, x.Notes), 1500))
	}
	if h := strings.TrimSpace(in.Hint); h != "" {
		b.WriteString("\n\nThe game master wants: " + clip(h, 600))
	}
	b.WriteString("\n\nSuggest three ideas for the next game night, each as a short paragraph starting with a bold title: one that follows a loose thread, " +
		"one that puts a character's backstory or bond in play, one surprise. Then a list of 3 short things to prepare.")
	text, ok := s.aiRun(w, r, aiVoice, b.String(), false, nil)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"text": text})
}

// handleAIAsk answers a question (rules, ideas) with the campaign and the
// rules sections that match in view.
func (s *Server) handleAIAsk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := actorID(ctx)
	var in struct {
		Question   string `json:"question"`
		CampaignID int64  `json:"campaign_id"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.Question) == "" {
		writeErr(w, http.StatusBadRequest, "ask a question")
		return
	}
	var b strings.Builder
	if in.CampaignID > 0 {
		b.WriteString(s.campaignBrief(ctx, uid, in.CampaignID, false) + "\n\n")
	}
	// rules text that might matter (a condition or a section named in the question)
	q := strings.ToLower(in.Question)
	for _, c := range srd.Conditions() {
		if strings.Contains(q, strings.ToLower(c.Name)) {
			fmt.Fprintf(&b, "Rules — %s: %s\n\n", c.Name, clip(c.Desc, 1500))
		}
	}
	for _, h := range srd.Search(lastWords(q), 3) {
		switch h.Kind {
		case "spell":
			if sp, ok := srd.SpellByKey(h.Key); ok {
				fmt.Fprintf(&b, "Spell — %s (%s): %s\n\n", sp.Name, srd.SpellLevelText(sp.Level, sp.School), clip(sp.Desc, 1500))
			}
		case "monster":
			if m, ok := srd.MonsterByKey(h.Key); ok {
				fmt.Fprintf(&b, "Monster — %s: AC %d, %d hit points, CR %s\n\n", m.Name, m.AC, m.HP, srd.CRText(m.CR))
			}
		}
	}
	b.WriteString("Question: " + clip(in.Question, 2000) + "\n\nAnswer briefly. For a rules question, give the rule as the 5E SRD has it and say when a table often rules otherwise.")
	text, ok := s.aiRun(w, r, aiVoice, b.String(), false, nil)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"text": text})
}

// lastWords keeps the end of a question (where the thing asked about usually is).
func lastWords(q string) string {
	f := strings.Fields(strings.Trim(q, "?!. "))
	if len(f) > 2 {
		f = f[len(f)-2:]
	}
	return strings.Join(f, " ")
}
