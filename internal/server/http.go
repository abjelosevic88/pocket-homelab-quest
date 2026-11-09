package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	core "github.com/abjelosevic88/pocket-homelab-core/sdk"
	"github.com/abjelosevic88/pocket-homelab-quest/internal/store"
)

// Router builds the chi router.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	if s.cfg.TrustProxy {
		r.Use(middleware.RealIP)
	}
	r.Use(middleware.RequestID)
	r.Use(s.logging)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))

	r.Get("/pocket-ask.js", s.core.AskWidget("quest"))
	r.Get("/healthz", s.handleHealth)
	r.Get("/readyz", s.handleReady)
	r.Get("/api/health", s.handleHealth)
	if s.cfg.MetricsEnabled {
		r.Get("/metrics", s.handleMetrics)
	}

	r.Route("/api/v1", func(r chi.Router) {
		// the player view and shared sheets: no account, only the link
		r.Group(func(r chi.Router) {
			r.Use(middleware.Timeout(30 * time.Second))
			r.Get("/public/p/{token}", s.handlePublicCampaign)
			r.Get("/public/p/{token}/photos/{id}", s.handlePublicPhoto)
			r.Get("/public/c/{token}", s.handlePublicCharacter)
			r.Get("/public/c/{token}/photo", s.handlePublicCharacterPhoto)
			// the open rules content (SRD, CC-BY-4.0): the same for everyone
			r.Get("/srd/spells", s.handleSRDSpells)
			r.Get("/srd/spells/{key}", s.handleSRDSpell)
			r.Get("/srd/magic-items", s.handleSRDMagic)
			r.Get("/srd/magic-items/{key}", s.handleSRDMagicItem)
			r.Get("/srd/file/{kind}", s.handleSRDFile)
		})

		// imports, uploads and AI can take longer than a request may
		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Post("/import", s.handleImport)
			r.Post("/photos", s.handleUploadPhoto)
			r.Post("/ai/recap", s.handleAIRecap)
			r.Post("/ai/npc", s.handleAINPC)
			r.Post("/ai/backstory", s.handleAIBackstory)
			r.Post("/ai/readaloud", s.handleAIReadaloud)
			r.Post("/ai/ideas", s.handleAIIdeas)
			r.Post("/ai/ask", s.handleAIAsk)
			r.Get("/export.json", s.handleExportJSON)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.Timeout(120 * time.Second))
			r.Post("/auth/login", s.handleLogin)
			r.Post("/auth/setup", s.handleSetup)
			r.Get("/auth/status", s.handleAuthStatus)
			r.Get("/auth/oidc/start", s.handleOIDCStart)
			r.Get("/auth/oidc/callback", s.handleOIDCCallback)

			r.Group(func(r chi.Router) {
				r.Use(s.requireAuth)
				r.Post("/auth/logout", s.handleLogout)
				r.Get("/auth/me", s.handleMe)
				r.Put("/auth/me", s.handleUpdateMe)

				// the table today, and for the rest of the box: Pocket Day, Search, AI
				r.Get("/home", s.handleHome)
				r.Get("/summary", s.handleSummary)
				r.Get("/day/{date}", s.handleDay)
				r.Get("/search", s.handleSearch)

				// campaigns and what is in them
				r.Get("/campaigns", s.handleListCampaigns)
				r.Post("/campaigns", s.handleCreateCampaign)
				r.Get("/campaigns/{id}", s.handleGetCampaign)
				r.Put("/campaigns/{id}", s.handleUpdateCampaign)
				r.Delete("/campaigns/{id}", s.handleDeleteCampaign)
				r.Post("/campaigns/{id}/share", s.handleNewShareLink)

				r.Get("/sessions", s.handleListSessions)
				r.Post("/sessions", s.handleCreateSession)
				r.Get("/sessions/{id}", s.handleGetSession)
				r.Put("/sessions/{id}", s.handleUpdateSession)
				r.Delete("/sessions/{id}", s.handleDeleteSession)
				r.Post("/sessions/{id}/play", s.handlePlaySession)
				r.Post("/sessions/{id}/calendar", s.handleSessionCalendar)
				r.Post("/sessions/{id}/note", s.handleSessionNote)
				r.Post("/sessions/{id}/tasks", s.handleSessionTasks)

				r.Get("/codex", s.handleListEntries)
				r.Post("/codex", s.handleCreateEntry)
				r.Get("/codex/{id}", s.handleGetEntry)
				r.Put("/codex/{id}", s.handleUpdateEntry)
				r.Delete("/codex/{id}", s.handleDeleteEntry)

				r.Get("/quests", s.handleListQuests)
				r.Post("/quests", s.handleCreateQuest)
				r.Put("/quests/{id}", s.handleUpdateQuest)
				r.Delete("/quests/{id}", s.handleDeleteQuest)

				// characters
				r.Get("/characters", s.handleListCharacters)
				r.Post("/characters", s.handleCreateCharacter)
				r.Get("/characters/{id}", s.handleGetCharacter)
				r.Put("/characters/{id}", s.handleUpdateCharacter)
				r.Delete("/characters/{id}", s.handleDeleteCharacter)
				r.Post("/characters/{id}/hp", s.handleCharacterHP)
				r.Post("/characters/{id}/share", s.handleShareCharacter)
				r.Get("/photos/{id}", s.handlePhoto)

				// encounters and the fight
				r.Get("/encounters", s.handleListEncounters)
				r.Post("/encounters", s.handleCreateEncounter)
				r.Get("/encounters/{id}", s.handleGetEncounter)
				r.Put("/encounters/{id}", s.handleUpdateEncounter)
				r.Delete("/encounters/{id}", s.handleDeleteEncounter)
				r.Post("/encounters/{id}/start", s.handleStartEncounter)
				r.Put("/encounters/{id}/fight", s.handleSaveFight)
				r.Post("/encounters/{id}/finish", s.handleFinishEncounter)
				r.Post("/encounters/{id}/reset", s.handleResetEncounter)
				r.Post("/difficulty", s.handleDifficulty)
				r.Get("/tables", s.handleTables)

				// your own monsters
				r.Get("/creatures", s.handleListCreatures)
				r.Post("/creatures", s.handleSaveCreature)
				r.Put("/creatures/{id}", s.handleSaveCreature)
				r.Delete("/creatures/{id}", s.handleDeleteCreature)

				// dice
				r.Get("/rolls", s.handleListRolls)
				r.Post("/rolls", s.handleRoll)
				r.Delete("/rolls", s.handleClearRolls)
				r.Get("/names", s.handleNames)

				// the rules (System Reference Document 5.1)
				r.Get("/srd/monsters", s.handleSRDMonsters)
				r.Get("/srd/monsters/{key}", s.handleSRDMonster)

				// the other Pocket apps
				r.Get("/apps", s.handleApps)
				r.Get("/apps/chats", s.handleChats)
				r.Post("/apps/chat", s.handleShareChat)
				r.Post("/apps/note", s.handleSaveNote)
				r.Get("/apps/calendars", s.handleCalendars)
				r.Get("/apps/busy", s.handleBusy)

				// AI
				r.Get("/ai/status", s.handleAIStatus)
				r.Get("/ai/models", s.handleAIModels)

				r.Post("/integrations/test", s.handleIntegrationTest)
				r.Post("/notify/test", s.handleNotifyTest)

				r.Get("/users", s.handleListUsers)
				r.Post("/users", s.handleCreateUser)
				r.Put("/users/{id}", s.handleUpdateUser)
				r.Delete("/users/{id}", s.handleDeleteUser)

				r.Get("/settings", s.handleGetSettings)
				r.Put("/settings", s.handlePutSettings)
				r.Get("/settings/system", s.handleSystemInfo)

				r.Get("/tokens", s.handleListTokens)
				r.Post("/tokens", s.handleCreateToken)
				r.Delete("/tokens/{id}", s.handleDeleteToken)

				r.Get("/backup", s.handleBackup)
				r.Get("/export.csv", s.handleExportCSV)
			})
		})
	})

	r.NotFound(s.handleSPA)
	return r
}

// ---------- helpers ----------

func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		s.requests.Add(1)
		if ww.Status() >= 500 {
			s.errors.Add(1)
		}
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			return
		}
		s.log.Debug("http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "dur", time.Since(start).String(), "ip", r.RemoteAddr)
	})
}

type apiError struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiError{Error: msg})
}

func (s *Server) fail(w http.ResponseWriter, err error, context string) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, "not found")
		return
	case errors.Is(err, store.ErrConflict), errors.Is(err, core.ErrOperationConflict):
		writeErr(w, http.StatusConflict, "already exists")
		return
	}
	s.log.Error(context, "err", err)
	writeErr(w, http.StatusInternalServerError, context+": "+err.Error())
}

func (s *Server) readBody(r *http.Request) ([]byte, error) {
	return io.ReadAll(http.MaxBytesReader(nil, r.Body, s.cfg.MaxBodyBytes))
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 32<<20))
	return dec.Decode(v)
}

// decodeKeys decodes JSON into v and also reports which top-level keys were
// present, so PUT handlers can tell "not sent" from "sent empty".
func decodeKeys(r *http.Request, v any) (map[string]bool, error) {
	b, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, err
	}
	keys := make(map[string]bool, len(raw))
	for k := range raw {
		keys[k] = true
	}
	return keys, json.Unmarshal(b, v)
}

func idParam(r *http.Request, name string) int64 {
	n, _ := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	return n
}

func queryInt(r *http.Request, name string) int {
	n, _ := strconv.Atoi(r.URL.Query().Get(name))
	return n
}

func queryBool(r *http.Request, name string) bool {
	v := strings.ToLower(r.URL.Query().Get(name))
	return v == "1" || v == "true" || v == "yes"
}

func validDate(s string) bool {
	if s == "" {
		return true
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// ---------- health / metrics ----------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"core_outbox": s.coreOutboxHealth(r.Context()), "status": "ok", "version": Version, "uptime": time.Since(s.started).Round(time.Second).String()})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DB.PingContext(r.Context()); err != nil {
		writeErr(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	counts := s.store.Counts(ctx)
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	fmt.Fprintf(w, "# HELP pocket_quest_info Build info.\n# TYPE pocket_quest_info gauge\npocket_quest_info{version=%q} 1\n", Version)
	fmt.Fprintf(w, "# HELP pocket_quest_uptime_seconds Process uptime.\n# TYPE pocket_quest_uptime_seconds gauge\npocket_quest_uptime_seconds %d\n", int(time.Since(s.started).Seconds()))
	fmt.Fprintf(w, "# HELP pocket_quest_http_requests_total HTTP requests served.\n# TYPE pocket_quest_http_requests_total counter\npocket_quest_http_requests_total %d\n", s.requests.Load())
	fmt.Fprintf(w, "# HELP pocket_quest_http_errors_total HTTP 5xx responses.\n# TYPE pocket_quest_http_errors_total counter\npocket_quest_http_errors_total %d\n", s.errors.Load())
	fmt.Fprintf(w, "# HELP pocket_quest_rows Rows per table.\n# TYPE pocket_quest_rows gauge\n")
	for k, v := range counts {
		fmt.Fprintf(w, "pocket_quest_rows{table=%q} %d\n", k, v)
	}
}

// ---------- static / SPA ----------

func (s *Server) handleSPA(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if s.webFS == nil {
		http.Error(w, "web UI not built (run `make web`)", http.StatusNotFound)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	if f, err := s.webFS.Open(path); err == nil {
		f.Close()
		if strings.HasPrefix(path, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.FileServerFS(s.webFS).ServeHTTP(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	r.URL.Path = "/"
	http.FileServerFS(s.webFS).ServeHTTP(w, r)
}
