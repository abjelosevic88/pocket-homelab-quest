# API

Everything the web app does goes through this JSON API at `/api/v1`. Sign in with the session cookie, or send a personal token (Settings → API & shortcuts) as `Authorization: Bearer pqst_…`. Everything is per person: another account's ids answer 404.

## The table

| Call | What it is |
|---|---|
| `GET /home` (`?campaign=ID`) | The campaign at hand: next and last game night, the party, open quests, pinned codex entries, a fight in progress, encounters ready, the last rolls |
| `GET /summary` | Running campaigns, game nights in the next 30 days, recent recaps, every active character with hit points — for Homepage, Pocket Day and Pocket AI |
| `GET /day/YYYY-MM-DD` | Game nights on a day |
| `GET /search?q=` | Your campaigns, characters, codex, quests, game nights and encounters first, then monsters, spells, items, conditions and rules |

## Campaigns

| Call | What it is |
|---|---|
| `GET/POST /campaigns`, `GET/PUT/DELETE /campaigns/{id}` | A campaign (`name tagline world status emblem color summary secrets house_rules advancement schedule place share_on photo_id`). `GET` returns it with its party, game nights, codex, quests and encounters, and `player_url` when the players' page is on |
| `POST /campaigns/{id}/share` | A new players' link (the old one stops working) |
| `GET/POST /sessions` (`?campaign&status&from&to&desc&limit`), `GET/PUT/DELETE /sessions/{id}` | Game nights (`number title date time minutes status plan recap notes xp loot attendance`). New ones get the next number and the whole party; planned ones go on Pocket Calendar if you want |
| `POST /sessions/{id}/play` | `{"xp": 450, "attendance": [1,2,3], "recap": "…"}` marks it played and gives each character there the XP (playing it again gives only the difference); answers `level_up` with the names that reached a new level |
| `POST /sessions/{id}/calendar` | `{"on": true}` / `false`: on or off Pocket Calendar |
| `POST /sessions/{id}/note` | The game night (recap, treasure, prep, notes) as a note in Pocket Notes |
| `POST /sessions/{id}/tasks` | Each line of the prep as a task in Pocket Tasks, due the day before |
| `GET/POST /codex` (`?campaign&kind`), `GET/PUT/DELETE /codex/{id}` | People, places, factions, items, lore and handouts (`kind name subtitle body secret status attitude place_id monster revealed pinned tags photo_id`) |
| `GET/POST /quests` (`?campaign`), `PUT/DELETE /quests/{id}` | The quest log (`title status giver_id place_id summary secret reward objectives revealed`) |

## Characters

| Call | What it is |
|---|---|
| `GET /characters` (`?campaign&status&sheets=1`), `POST /characters`, `GET/PUT/DELETE /characters/{id}` | A character: the whole `sheet` (JSON, worked out by the web app's rules engine) and the columns lists need (`level classes class_key species ac hp_max hp_cur hp_temp init pp speed xp`), `token {color emblem frame}`, `photo_id`, `status` |
| `POST /characters/{id}/hp` | `{"damage": 7}`, `{"heal": 5}`, `{"temp": 4}` or `{"set": 20}` — temporary hit points soak damage first and don't stack |
| `POST /characters/{id}/share` | A read-only link to the sheet (`/c/…`) |

## Encounters and the fight

| Call | What it is |
|---|---|
| `GET/POST /encounters` (`?campaign&session&status`), `GET/PUT/DELETE /encounters/{id}` | An encounter (`name place readaloud notes campaign_id session_id plan [{"ref":"srd:goblin","n":4}]`). `GET` adds `difficulty` (SRD 5.2 XP budget for the campaign's party), the `costs` and the stat `blocks` |
| `POST /difficulty` | `{"campaign_id": 1, "plan": [...]}` or `{"levels": [5,5,5,5], "plan": [...]}` → `low moderate high xp rating` (`trivial low moderate high beyond`) |
| `POST /encounters/{id}/start` | `{"party": true, "roll_hp": false, "group_init": true, "roll_player": false}` → a fight: monsters with hit points and rolled initiative, the party, sorted |
| `PUT /encounters/{id}/fight` | `{"state": {...}, "sort": true, "log": "Garrick is hit."}` saves the fight; the party's hit points go back to their sheets |
| `POST /encounters/{id}/finish` | `{"award": true}` ends it and shares the beaten monsters' XP among the player characters |
| `POST /encounters/{id}/reset` | Back to the plan |
| `GET /tables` | Experience per level, the XP budget table, XP per challenge rating |
| `GET/POST /creatures`, `PUT/DELETE /creatures/{id}` | Your own monsters, `{"data": {stat block}}` in the same shape as the built-in ones (`ref` `my:ID`) |

## Dice and names

| Call | What it is |
|---|---|
| `POST /rolls` | `{"expr": "1d20+5", "label": "Stealth", "kind": "check", "character_id": 2}` — rolled on the server, logged (`"quiet": true` = not logged). Expressions: `NdS`, `+`/`-` terms, `kh`/`kl`/`dh`/`dl` (`4d6kh3`), `d20adv`/`d20dis`, `d%` |
| `GET /rolls` (`?character&limit`), `DELETE /rolls` | The log (the last 500) |
| `GET /names?kind=dwarf&n=8` | Made-up names for a species, a `tavern` or a `place` |

## The rules (SRD 5.1)

| Call | What it is |
|---|---|
| `GET /srd/monsters`, `GET /srd/monsters/{ref}` | Every monster (yours first, `mine: true`) and a whole stat block (`srd:goblin`, `my:3`) |
| `GET /srd/spells`, `GET /srd/spells/{key}` | Spells (the list without descriptions) — no sign-in needed |
| `GET /srd/magic-items`, `GET /srd/magic-items/{key}` | Magic items — no sign-in needed |
| `GET /srd/file/{kind}` | A whole file as the builder uses it: `classes races backgrounds traits features skills proficiencies languages alignments equipment equip_cats conditions damage_types weapon_props schools feats rules` — no sign-in needed |

## The players' page (no account)

| Call | What it is |
|---|---|
| `GET /public/p/{token}` | The campaign as the players may see it: the party, recaps, the next game night, revealed codex entries, the quest log, the fight in progress (hidden combatants left out; monsters' health in words, numbers or not at all, as the game master chose) |
| `GET /public/p/{token}/photos/{id}` | A picture on that page (only those) |
| `GET /public/c/{token}`, `GET /public/c/{token}/photo` | A shared character sheet |

## AI (Pocket AI or your own OpenAI key)

`POST /ai/recap` `{"session_id"}` · `POST /ai/npc` `{"campaign_id", "kind", "hint"}` · `POST /ai/backstory` `{"character_id", "hint"}` · `POST /ai/readaloud` `{"encounter_id"}` or `{"entry_id"}` · `POST /ai/ideas` `{"campaign_id"}` · `POST /ai/ask` `{"question", "campaign_id"}` → `{"text"}` (NPCs: `{"entry"}`). Nothing is saved until you keep it.

## Other Pocket apps acting for you

With a `pcx_` token from Pocket Core another app reaches only: `quest:read` — `GET summary, home, search, campaigns, sessions, characters, quests, encounters, rolls, names, day/{date}`, `GET sessions/{id}, characters/{id}, encounters/{id}`, `GET srd/monsters|spells|magic-items` (campaign secrets and quest secrets are blanked); `quest:write` — `POST sessions, codex, quests, rolls`, `PUT/DELETE` of the game nights, entries and quests it added itself, `POST characters/{id}/hp`.

Events on the Core bus: `quest.session_planned`, `quest.session_played`, `quest.character_created`, `quest.character_leveled`, `quest.encounter_finished`, `quest.quest_completed`.

## Data

`GET /export.json` (`?photos=0` without pictures) · `GET /export.csv?what=characters|sessions` · `POST /import` (a Pocket Quest export; again and again, nothing is doubled) · `GET /backup` (admins: the whole database).
