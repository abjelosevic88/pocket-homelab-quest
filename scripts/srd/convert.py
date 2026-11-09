#!/usr/bin/env python3
"""Turn the 5e SRD 5.1 data (github.com/5e-bits/5e-database, src/2014/en) into
the compact files Pocket Quest embeds (internal/srd/data/*.json.gz).

    git clone --depth 1 https://github.com/5e-bits/5e-database /tmp/5e-database
    python3 -I scripts/srd/convert.py /tmp/5e-database/src/2014/en internal/srd/data

The content is from the System Reference Document 5.1 by Wizards of the Coast
LLC, licensed CC-BY-4.0 (see internal/srd/ATTRIBUTION.md). The pictures the
database points at are not used.
"""
import gzip
import json
import os
import re
import sys

SRC, OUT = sys.argv[1], sys.argv[2]


def load(name):
    with open(os.path.join(SRC, "5e-SRD-" + name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def write(name, data):
    os.makedirs(OUT, exist_ok=True)
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with gzip.GzipFile(os.path.join(OUT, name + ".json.gz"), "wb", mtime=0, compresslevel=9) as f:
        f.write(raw)
    print(f"{name:14} {len(data) if isinstance(data, (list, dict)) else '':>5} {len(raw)//1024:>6} KB")


def text(v):
    if v is None:
        return ""
    if isinstance(v, list):
        return "\n\n".join(x for x in v if x)
    return str(v)


def ref(v):
    return v["index"] if isinstance(v, dict) and "index" in v else v


ABIL = ["str", "dex", "con", "int", "wis", "cha"]

# ---------- small lookups ----------

skills = [{"key": s["index"], "name": s["name"], "ability": s["ability_score"]["index"], "desc": text(s.get("desc"))} for s in load("Skills")]
write("skills", skills)

conditions = [{"key": c["index"], "name": c["name"], "desc": text(c.get("desc"))} for c in load("Conditions")]
write("conditions", conditions)

write("damage_types", [{"key": d["index"], "name": d["name"], "desc": text(d.get("desc"))} for d in load("Damage-Types")])
write("languages", [{"key": l["index"], "name": l["name"], "type": l.get("type", ""), "script": l.get("script") or "", "speakers": l.get("typical_speakers", [])} for l in load("Languages")])
write("alignments", [{"key": a["index"], "name": a["name"], "abbr": a.get("abbreviation", ""), "desc": a.get("desc", "")} for a in load("Alignments")])
write("schools", [{"key": s["index"], "name": s["name"], "desc": s.get("desc", "")} for s in load("Magic-Schools")])
write("weapon_props", [{"key": p["index"], "name": p["name"], "desc": text(p.get("desc"))} for p in load("Weapon-Properties")])
write("rules", [{"key": r["index"], "name": r["name"], "md": r.get("desc", "")} for r in load("Rule-Sections")])
write("feats", [{"key": f["index"], "name": f["name"], "desc": text(f.get("desc")),
                 "prereq": [{"ability": p["ability_score"]["index"], "min": p["minimum_score"]} for p in f.get("prerequisites", []) if "ability_score" in p]} for f in load("Feats")])

# ---------- equipment ----------

cats = {c["index"]: [ref(e) for e in c.get("equipment", [])] for c in load("Equipment-Categories")}
cat_names = {c["index"]: c["name"] for c in load("Equipment-Categories")}

equipment = []
for e in load("Equipment"):
    o = {"key": e["index"], "name": e["name"], "cat": e["equipment_category"]["index"], "w": e.get("weight", 0) or 0}
    if e.get("cost"):
        o["cost"] = [e["cost"]["quantity"], e["cost"]["unit"]]
    if e.get("desc"):
        o["desc"] = text(e["desc"])
    if e.get("weapon_category"):
        o["weapon"] = {
            "cat": e["weapon_category"].lower(), "range": e["weapon_range"].lower(),
            "dmg": (e.get("damage") or {}).get("damage_dice", ""), "type": ref((e.get("damage") or {}).get("damage_type", "")) or "",
            "props": [ref(p) for p in e.get("properties", [])],
            "reach": (e.get("range") or {}).get("normal"), "long": (e.get("range") or {}).get("long"),
        }
        if e.get("throw_range"):
            o["weapon"]["throw"] = [e["throw_range"].get("normal"), e["throw_range"].get("long")]
        if e.get("two_handed_damage"):
            o["weapon"]["two"] = e["two_handed_damage"]["damage_dice"]
        if e.get("special"):
            o["desc"] = text(e["special"])
    if e.get("armor_category"):
        ac = e.get("armor_class") or {}
        o["armor"] = {"cat": e["armor_category"].lower(), "base": ac.get("base", 10), "dex": bool(ac.get("dex_bonus")),
                      "max": ac.get("max_bonus"), "str": e.get("str_minimum", 0) or 0, "stealth": bool(e.get("stealth_disadvantage"))}
    if e.get("gear_category"):
        o["gear"] = e["gear_category"]["index"]
    if e.get("tool_category"):
        o["tool"] = e["tool_category"]
    if e.get("vehicle_category"):
        o["vehicle"] = e["vehicle_category"]
    if e.get("contents"):
        o["contents"] = [[ref(c["item"]), c["quantity"]] for c in e["contents"]]
    if e.get("quantity") and e["quantity"] > 1:
        o["qty"] = e["quantity"]
    equipment.append(o)
write("equipment", equipment)

magic = []
for m in load("Magic-Items"):
    if m.get("variants"):  # the "+1, +2 or +3" umbrella entries: keep the real variants only
        continue
    desc = m.get("desc") or []
    head = desc[0] if desc else ""
    body = text(desc[1:]) if len(desc) > 1 else ""
    magic.append({"key": m["index"], "name": m["name"], "cat": cat_names.get(m["equipment_category"]["index"], m["equipment_category"]["name"]),
                  "rarity": (m.get("rarity") or {}).get("name", ""), "attune": "requires attunement" in head.lower(), "line": head, "desc": body})
write("magic_items", magic)

# ---------- spells ----------

spells = []
for s in load("Spells"):
    comp = ", ".join(s.get("components", []))
    o = {"key": s["index"], "name": s["name"], "level": s["level"], "school": s["school"]["index"], "time": s.get("casting_time", ""),
         "range": s.get("range", ""), "comp": comp, "mat": s.get("material", ""), "dur": s.get("duration", ""),
         "conc": bool(s.get("concentration")), "ritual": bool(s.get("ritual")), "classes": [ref(c) for c in s.get("classes", [])],
         "subclasses": [ref(c) for c in s.get("subclasses", [])], "desc": text(s.get("desc")), "higher": text(s.get("higher_level"))}
    dmg = s.get("damage") or {}
    if isinstance(dmg, list):
        dmg = dmg[0] if dmg else {}
    if dmg.get("damage_type"):
        o["dmg_type"] = ref(dmg["damage_type"])
    if dmg.get("damage_at_slot_level"):
        o["dmg_slot"] = dmg["damage_at_slot_level"]
    if dmg.get("damage_at_character_level"):
        o["dmg_char"] = dmg["damage_at_character_level"]
    if s.get("heal_at_slot_level"):
        o["heal_slot"] = s["heal_at_slot_level"]
    if s.get("dc"):
        o["save"] = ref(s["dc"]["dc_type"])
        o["save_ok"] = s["dc"].get("dc_success", "")
    if s.get("attack_type"):
        o["attack"] = s["attack_type"]
    if s.get("area_of_effect"):
        o["area"] = [s["area_of_effect"]["type"], s["area_of_effect"]["size"]]
    spells.append(o)
write("spells", spells)

# ---------- monsters ----------


def prof_map(m, prefix):
    out = {}
    for p in m.get("proficiencies", []):
        k = p["proficiency"]["index"]
        if k.startswith(prefix):
            out[k[len(prefix):]] = p["value"]
    return out


def actions(lst):
    out = []
    for a in lst or []:
        o = {"name": a["name"], "desc": a.get("desc", "")}
        if a.get("attack_bonus") is not None:
            o["hit"] = a["attack_bonus"]
        dm = []
        for d in a.get("damage", []) or []:
            if "damage_dice" in d:
                dm.append([d["damage_dice"], ref(d.get("damage_type", "")) or ""])
            elif "from" in d:  # a choice of damage: take the first
                opts = d["from"].get("options", [])
                if opts and "damage_dice" in opts[0]:
                    dm.append([opts[0]["damage_dice"], ref(opts[0].get("damage_type", "")) or ""])
        if dm:
            o["dmg"] = dm
        if a.get("dc"):
            o["dc"] = [ref(a["dc"]["dc_type"]), a["dc"].get("dc_value")]
        if a.get("usage"):
            u = a["usage"]
            if u.get("type") == "per day":
                o["use"] = f"{u.get('times')}/Day"
            elif u.get("type") == "recharge on roll":
                o["use"] = f"Recharge {u.get('min_value')}–6" if u.get("min_value", 6) < 6 else "Recharge 6"
            elif u.get("type") == "recharge after rest":
                o["use"] = "Recharges after a " + " or ".join(u.get("rest_types", ["rest"])) + " rest"
        out.append(o)
    return out


def speed(sp):
    order = ["walk", "burrow", "climb", "fly", "swim"]
    parts = []
    for k in order:
        if k in sp:
            v = sp[k]
            parts.append(v if k == "walk" else f"{k} {v}")
    if sp.get("hover"):
        parts[-1] += " (hover)"
    return ", ".join(parts)


def senses(se):
    parts = [f"{k.replace('_', ' ')} {v}" for k, v in se.items() if k != "passive_perception"]
    parts.append(f"passive Perception {se.get('passive_perception', 10)}")
    return ", ".join(parts)


def walk_ft(sp):
    m = re.match(r"(\d+)", sp.get("walk", "0 ft."))
    return int(m.group(1)) if m else 0


monsters = []
for m in load("Monsters"):
    ac = m["armor_class"][0]
    note = ac.get("type", "")
    if ac.get("armor"):
        note = ", ".join(x["name"].lower() for x in ac["armor"])
    elif note in ("dex",):
        note = ""
    elif note == "natural":
        note = "natural armor"
    elif note == "spell":
        note = (ac.get("spell") or {}).get("name", "").lower()
    elif note == "condition":
        note = ""
    o = {"key": m["index"], "name": m["name"], "size": m["size"], "type": m["type"], "sub": m.get("subtype") or "",
         "align": m.get("alignment", ""), "ac": ac["value"], "ac_note": note, "hp": m["hit_points"], "hd": m.get("hit_points_roll") or m.get("hit_dice", ""),
         "speed": speed(m.get("speed", {})), "walk": walk_ft(m.get("speed", {})),
         "abil": [m[a] for a in ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]],
         "saves": prof_map(m, "saving-throw-"), "skills": prof_map(m, "skill-"),
         "vuln": m.get("damage_vulnerabilities", []), "res": m.get("damage_resistances", []), "imm": m.get("damage_immunities", []),
         "cimm": [ref(c) for c in m.get("condition_immunities", [])], "senses": senses(m.get("senses", {})),
         "pp": m.get("senses", {}).get("passive_perception", 10),
         "lang": m.get("languages", "") or "—", "cr": m["challenge_rating"], "xp": m.get("xp", 0), "pb": m.get("proficiency_bonus", 2),
         "traits": actions(m.get("special_abilities")), "actions": actions(m.get("actions")),
         "reactions": actions(m.get("reactions")), "legendary": actions(m.get("legendary_actions"))}
    if m.get("desc"):
        o["desc"] = text(m["desc"])
    for k in list(o):
        if o[k] in ([], {}, ""):
            if k not in ("traits", "actions"):
                del o[k]
    monsters.append(o)
write("monsters", monsters)

# ---------- races ----------

traits = {}
for t in load("Traits"):
    traits[t["index"]] = {"name": t["name"], "desc": text(t.get("desc"))}
    spec = t.get("trait_specific") or {}
    if spec.get("damage_type"):
        traits[t["index"]]["damage"] = ref(spec["damage_type"])
    if spec.get("breath_weapon"):
        bw = spec["breath_weapon"]
        traits[t["index"]]["breath"] = {"area": [bw["area_of_effect"]["type"], bw["area_of_effect"]["size"]], "save": ref(bw["dc"]["dc_type"])}
    if spec.get("subtrait_options"):
        traits[t["index"]]["choose"] = [ref(x["item"]) for x in spec["subtrait_options"]["from"]["options"]]
    if spec.get("spell_options"):
        so = spec["spell_options"]
        traits[t["index"]]["spells"] = {"n": so.get("choose", 1), "from": [ref(x["item"]) for x in so["from"].get("options", [])]}
    if t.get("proficiencies"):
        traits[t["index"]]["profs"] = [ref(p) for p in t["proficiencies"]]
    if t.get("proficiency_choices"):
        pc = t["proficiency_choices"]
        traits[t["index"]]["prof_choice"] = {"n": pc.get("choose", 1), "from": [ref(x["item"]) for x in pc["from"].get("options", []) if x.get("item")]}
    if t.get("language_options"):
        lo = t["language_options"]
        traits[t["index"]]["langs"] = lo.get("choose", 1)
write("traits", traits)


def options(opt):
    """An option set as {choose, from:[keys]} (resource lists come back empty)."""
    if not opt:
        return None
    f = opt.get("from", {})
    out = []
    for x in f.get("options", []):
        if x.get("option_type") == "reference":
            out.append(ref(x["item"]))
        elif x.get("option_type") == "ability_bonus":
            out.append(ref(x["ability_score"]))
    return {"choose": opt.get("choose", 1), "from": out, "any": f.get("option_set_type") == "resource_list"}


subraces = {}
for s in load("Subraces"):
    subraces.setdefault(s["race"]["index"], []).append({
        "key": s["index"], "name": s["name"], "desc": s.get("desc", ""),
        "bonus": {ref(b["ability_score"]): b["bonus"] for b in s.get("ability_bonuses", [])},
        "traits": [ref(t) for t in s.get("racial_traits", [])],
        "profs": [ref(p) for p in s.get("starting_proficiencies", [])],
    })

races = []
for r in load("Races"):
    races.append({
        "key": r["index"], "name": r["name"], "speed": r["speed"], "size": r["size"],
        "bonus": {ref(b["ability_score"]): b["bonus"] for b in r.get("ability_bonuses", [])},
        "bonus_choice": options(r.get("ability_bonus_options")),
        "langs": [ref(l) for l in r.get("languages", [])], "lang_choice": options(r.get("language_options")),
        "lang_desc": r.get("language_desc", ""),
        "profs": [ref(p) for p in r.get("starting_proficiencies", [])], "prof_choice": options(r.get("starting_proficiency_options")),
        "traits": [ref(t) for t in r.get("traits", [])],
        "age": r.get("age", ""), "align": r.get("alignment", ""), "size_desc": r.get("size_description", ""),
        "subraces": subraces.get(r["index"], []),
    })
write("races", races)

# ---------- proficiencies (to name what classes and races grant) ----------

write("proficiencies", {p["index"]: {"name": p["name"], "type": p["type"]} for p in load("Proficiencies")})

# ---------- classes ----------

features = {}
for f in load("Features"):
    o = {"name": f["name"], "class": ref(f["class"]), "level": f["level"], "desc": text(f.get("desc"))}
    if f.get("subclass"):
        o["sub"] = ref(f["subclass"])
    if f.get("parent"):
        o["parent"] = ref(f["parent"])
    spec = f.get("feature_specific") or {}
    if spec.get("subfeature_options"):
        so = spec["subfeature_options"]
        o["choose"] = {"n": so.get("choose", 1), "from": [ref(x["item"]) for x in so["from"].get("options", []) if x.get("item")]}
    if spec.get("expertise_options"):
        eo = spec["expertise_options"]
        o["expertise"] = eo.get("choose", 2)
    features[f["index"]] = o
write("features", features)

levels = {}
for lv in load("Levels"):
    key = ref(lv.get("subclass")) if lv.get("subclass") else ref(lv["class"])
    o = {"level": lv["level"], "features": [ref(f) for f in lv.get("features", [])]}
    if not lv.get("subclass"):
        o["pb"] = lv.get("prof_bonus", 2)
        o["asi"] = lv.get("ability_score_bonuses", 0)
    sc = lv.get("spellcasting")
    if sc:
        o["cantrips"] = sc.get("cantrips_known", 0)
        if "spells_known" in sc:
            o["known"] = sc["spells_known"]
        o["slots"] = [sc.get(f"spell_slots_level_{i}", 0) for i in range(1, 10)]
    if lv.get("class_specific"):
        o["extra"] = lv["class_specific"]
    if lv.get("subclass_specific"):
        o["sub_extra"] = lv["subclass_specific"]
    levels.setdefault(key, []).append(o)
for k in levels:
    levels[k].sort(key=lambda x: x["level"])


def equip_opt(o):
    """One option of a starting-equipment choice: a list of [kind, key, n]."""
    t = o.get("option_type")
    if t == "counted_reference":
        return [["item", ref(o["of"]), o.get("count", 1)]]
    if t == "reference":
        return [["item", ref(o["item"]), 1]]
    if t == "multiple":
        out = []
        for x in o["items"]:
            out += equip_opt(x)
        return out
    if t == "choice":
        ch = o["choice"]
        f = ch.get("from", {})
        if f.get("option_set_type") == "equipment_category":
            return [["any", ref(f["equipment_category"]), ch.get("choose", 1)]]
        return [["any", "", ch.get("choose", 1)]]
    return []


subclass_list = {}
for s in load("Subclasses"):
    subclass_list.setdefault(ref(s["class"]), []).append({"key": s["index"], "name": s["name"], "flavor": s.get("subclass_flavor", ""), "desc": text(s.get("desc")),
                                                         "spells": [[sp.get("prerequisites", [{}])[0].get("index", "").split("-")[-1], ref(sp["spell"])] for sp in s.get("spells", [])]})

classes = []
for c in load("Classes"):
    choices = []
    for pc in c.get("proficiency_choices", []):
        f = pc.get("from", {})
        keys = []
        for x in f.get("options", []):
            if x.get("option_type") == "reference":
                keys.append(ref(x["item"]))
            elif x.get("option_type") == "choice":  # e.g. "a musical instrument"
                for y in x["choice"]["from"].get("options", []):
                    if y.get("option_type") == "reference":
                        keys.append(ref(y["item"]))
        choices.append({"n": pc.get("choose", 1), "desc": pc.get("desc", ""), "from": keys})
    eq_choices = []
    for eo in c.get("starting_equipment_options", []):
        f = eo.get("from", {})
        if f.get("option_set_type") == "equipment_category":
            eq_choices.append({"desc": eo.get("desc", ""), "n": eo.get("choose", 1), "options": [[["any", ref(f["equipment_category"]), eo.get("choose", 1)]]]})
            continue
        eq_choices.append({"desc": eo.get("desc", ""), "n": eo.get("choose", 1), "options": [equip_opt(x) for x in f.get("options", [])]})
    sc = c.get("spellcasting")
    mc = c.get("multi_classing") or {}
    prereq = []
    for p in mc.get("prerequisites", []):
        prereq.append([[ref(p["ability_score"]), p["minimum_score"]]])
    if mc.get("prerequisite_options"):
        prereq.append([[ref(x["ability_score"]), x["minimum_score"]] for x in mc["prerequisite_options"]["from"]["options"]])
    classes.append({
        "key": c["index"], "name": c["name"], "hd": c["hit_die"],
        "saves": [ref(s) for s in c.get("saving_throws", [])],
        "profs": [ref(p) for p in c.get("proficiencies", []) if not ref(p).startswith("saving-throw-")],
        "prof_choices": choices,
        "equipment": [[ref(e["equipment"]), e["quantity"]] for e in c.get("starting_equipment", [])],
        "equip_choices": eq_choices,
        "casting": ({"ability": ref(sc["spellcasting_ability"]), "level": sc.get("level", 1),
                     "info": [{"name": i["name"], "desc": text(i["desc"])} for i in sc.get("info", [])]} if sc else None),
        "mc_prereq": prereq,
        "mc_profs": [ref(p) for p in mc.get("proficiencies", [])],
        "levels": levels.get(c["index"], []),
        "subclasses": [dict(s, levels=levels.get(s["key"], [])) for s in subclass_list.get(c["index"], [])],
    })
write("classes", classes)

# equipment categories the starting-equipment choices name ("any martial weapon")
used = set()
for c in classes:
    for ch in c["equip_choices"]:
        for opt in ch["options"]:
            for kind, key, _ in opt:
                if kind == "any" and key:
                    used.add(key)
for b in load("Backgrounds"):
    for eo in b.get("starting_equipment_options", []):
        f = eo.get("from", {})
        if f.get("option_set_type") == "equipment_category":
            used.add(ref(f["equipment_category"]))
write("equip_cats", {k: {"name": cat_names[k], "items": cats[k]} for k in sorted(used)})

# ---------- backgrounds ----------

bgs = []
for b in load("Backgrounds"):
    eq_opts = []
    for eo in b.get("starting_equipment_options", []):
        f = eo.get("from", {})
        if f.get("option_set_type") == "equipment_category":
            eq_opts.append(ref(f["equipment_category"]))
    pc = b.get("personality_traits", {})

    def strings(o):
        out = []
        for x in (o or {}).get("from", {}).get("options", []):
            if x.get("option_type") == "string":
                out.append(x["string"])
            elif x.get("option_type") == "ideal":
                out.append(x["desc"])
        return out
    bgs.append({"key": b["index"], "name": b["name"], "skills": [ref(p) for p in b.get("starting_proficiencies", [])],
                "langs": (b.get("language_options") or {}).get("choose", 0),
                "equipment": [[ref(e["equipment"]), e["quantity"]] for e in b.get("starting_equipment", [])],
                "equip_any": eq_opts, "gold": (b.get("starting_gold") or {}).get("quantity", 0),
                "feature": {"name": b["feature"]["name"], "desc": text(b["feature"]["desc"])},
                "traits": strings(pc), "ideals": strings(b.get("ideals")), "bonds": strings(b.get("bonds")), "flaws": strings(b.get("flaws"))})
write("backgrounds", bgs)
