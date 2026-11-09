package srd

import (
	"encoding/json"
	"testing"
)

func TestData(t *testing.T) {
	for _, k := range Kinds {
		b, err := Raw(k)
		if err != nil || !json.Valid(b) {
			t.Fatalf("%s: %v", k, err)
		}
	}
	if n := len(Monsters()); n < 300 {
		t.Fatalf("monsters: %d", n)
	}
	g, ok := MonsterByKey("goblin")
	if !ok || g.AC != 15 || g.HP != 7 || g.XP != 50 || g.CR != 0.25 || g.DexMod() != 2 || len(g.Actions) != 2 {
		t.Fatalf("goblin: %+v", g)
	}
	f, ok := SpellByKey("fireball")
	if !ok || f.Level != 3 || f.Save != "dex" || f.Desc == "" {
		t.Fatalf("fireball: %+v", f)
	}
	if h := Search("fire", 5); len(h) == 0 {
		t.Fatal("search found nothing")
	}
	if CRText(0.125) != "1/8" || CRText(2) != "2" || Ordinal(2) != "2nd" || Ordinal(11) != "11th" || Mod(9) != -1 || Mod(8) != -1 || Mod(15) != 2 {
		t.Fatal("formatting")
	}
}
