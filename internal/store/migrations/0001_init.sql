CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'member',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '',
  token_hash   TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL DEFAULT '',
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Box-wide settings (title, setup flag); everything else is personal.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE user_settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, key)
);

CREATE TABLE cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL
);

-- ---------- Pocket Quest: everything below is per person ----------
-- Dates YYYY-MM-DD, times HH:MM; rules content (monsters, spells, classes)
-- is built in (internal/srd), only what a person makes lives here.

-- Pictures: a portrait, an NPC, a map, a handout, a campaign banner.
-- The browser shrinks them first (1600 px and a 480 px thumbnail, JPEG).
CREATE TABLE photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'portrait',
  mime       TEXT NOT NULL DEFAULT 'image/jpeg',
  data       BLOB NOT NULL,
  thumb      BLOB,
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  bytes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX photos_user ON photos(user_id, kind);

-- A campaign (or a one-shot): its world, its party, its secrets.
CREATE TABLE campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  tagline     TEXT NOT NULL DEFAULT '',
  world       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',     -- active | paused | done
  emblem      TEXT NOT NULL DEFAULT 'dragon',
  color       TEXT NOT NULL DEFAULT '#9f1d35',
  photo_id    INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  summary     TEXT NOT NULL DEFAULT '',            -- what the players know
  secrets     TEXT NOT NULL DEFAULT '',            -- the game master's notes, never shared
  house_rules TEXT NOT NULL DEFAULT '',
  advancement TEXT NOT NULL DEFAULT 'xp',          -- xp | milestone
  schedule    TEXT NOT NULL DEFAULT '',            -- "Every other Friday, 19:00"
  place       TEXT NOT NULL DEFAULT '',            -- where you play
  share_token TEXT NOT NULL DEFAULT '',
  share_on    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX campaigns_user ON campaigns(user_id, status);
CREATE INDEX campaigns_share ON campaigns(share_token);

-- A character: the whole sheet is JSON (sheet), the numbers lists and the
-- table need are copied into columns when it is saved.
CREATE TABLE characters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  player      TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'pc',          -- pc | companion
  level       INTEGER NOT NULL DEFAULT 1,
  classes     TEXT NOT NULL DEFAULT '',            -- "Fighter 3 · Wizard 2"
  class_key   TEXT NOT NULL DEFAULT '',            -- the first class
  species     TEXT NOT NULL DEFAULT '',
  ac          INTEGER NOT NULL DEFAULT 10,
  hp_max      INTEGER NOT NULL DEFAULT 1,
  hp_cur      INTEGER NOT NULL DEFAULT 1,
  hp_temp     INTEGER NOT NULL DEFAULT 0,
  init        INTEGER NOT NULL DEFAULT 0,
  pp          INTEGER NOT NULL DEFAULT 10,         -- passive Perception
  speed       INTEGER NOT NULL DEFAULT 30,
  xp          INTEGER NOT NULL DEFAULT 0,
  sheet       TEXT NOT NULL DEFAULT '{}',
  token       TEXT NOT NULL DEFAULT '{}',          -- {"color":"#…","emblem":"…","frame":"gold"}
  photo_id    INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active',      -- active | retired | dead
  share_token TEXT NOT NULL DEFAULT '',
  share_on    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX characters_user ON characters(user_id, status, campaign_id);
CREATE INDEX characters_share ON characters(share_token);

-- A game night: planned, played (with its recap) or called off.
CREATE TABLE nights (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  number       INTEGER NOT NULL DEFAULT 1,
  title        TEXT NOT NULL DEFAULT '',
  date         TEXT NOT NULL DEFAULT '',
  time         TEXT NOT NULL DEFAULT '',
  minutes      INTEGER NOT NULL DEFAULT 240,
  status       TEXT NOT NULL DEFAULT 'planned',    -- planned | played | cancelled
  plan         TEXT NOT NULL DEFAULT '',            -- the game master's prep (private)
  recap        TEXT NOT NULL DEFAULT '',            -- what happened (shared with players)
  notes        TEXT NOT NULL DEFAULT '',            -- private notes after the game
  xp           INTEGER NOT NULL DEFAULT 0,          -- awarded to each character there
  loot         TEXT NOT NULL DEFAULT '',
  attendance   TEXT NOT NULL DEFAULT '[]',          -- character ids
  calendar_ref TEXT NOT NULL DEFAULT '',
  calendar_url TEXT NOT NULL DEFAULT '',
  reminded     TEXT NOT NULL DEFAULT '',            -- the date a reminder went out
  source       TEXT NOT NULL DEFAULT '',            -- the app that added it ('' = here)
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX nights_user ON nights(user_id, campaign_id, date);

-- The campaign's world: people, places, factions, items, lore and handouts.
-- body is what players may learn (when revealed), secret never leaves here.
CREATE TABLE codex (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'npc',         -- npc | place | faction | item | lore | handout
  name        TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',            -- "Innkeeper of the Gilded Goose"
  body        TEXT NOT NULL DEFAULT '',
  secret      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT '',            -- npc: alive | dead | missing
  attitude    TEXT NOT NULL DEFAULT '',            -- friendly | neutral | hostile
  place_id    INTEGER REFERENCES codex(id) ON DELETE SET NULL,
  monster     TEXT NOT NULL DEFAULT '',            -- a stat block: srd:<key> or my:<id>
  photo_id    INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  revealed    INTEGER NOT NULL DEFAULT 0,
  pinned      INTEGER NOT NULL DEFAULT 0,
  tags        TEXT NOT NULL DEFAULT '[]',
  source      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX codex_user ON codex(user_id, campaign_id, kind);

-- The quest log.
CREATE TABLE quests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',      -- rumour | active | done | failed
  giver_id    INTEGER REFERENCES codex(id) ON DELETE SET NULL,
  place_id    INTEGER REFERENCES codex(id) ON DELETE SET NULL,
  summary     TEXT NOT NULL DEFAULT '',
  secret      TEXT NOT NULL DEFAULT '',
  reward      TEXT NOT NULL DEFAULT '',
  objectives  TEXT NOT NULL DEFAULT '[]',          -- [{"text":"…","done":false}]
  revealed    INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  done_on     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX quests_user ON quests(user_id, campaign_id, status);

-- An encounter: planned monsters (plan) and, once it runs, the fight itself
-- (state: round, whose turn, every combatant's hit points and conditions, the log).
CREATE TABLE encounters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  session_id  INTEGER REFERENCES nights(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  place       TEXT NOT NULL DEFAULT '',
  readaloud   TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'plan',        -- plan | running | done
  plan        TEXT NOT NULL DEFAULT '[]',          -- [{"ref":"srd:goblin","n":4}]
  state       TEXT NOT NULL DEFAULT '{}',
  xp          INTEGER NOT NULL DEFAULT 0,
  finished_at TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX encounters_user ON encounters(user_id, status, campaign_id);

-- Your own monsters (homebrew), in the same shape as the built-in ones.
CREATE TABLE creatures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  photo_id   INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX creatures_user ON creatures(user_id, name);

-- The dice log.
CREATE TABLE rolls (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  label        TEXT NOT NULL DEFAULT '',
  expr         TEXT NOT NULL,
  total        INTEGER NOT NULL DEFAULT 0,
  detail       TEXT NOT NULL DEFAULT '{}',
  kind         TEXT NOT NULL DEFAULT 'roll',       -- roll | check | save | attack | damage | init | death | hit_die
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX rolls_user ON rolls(user_id, created_at);
