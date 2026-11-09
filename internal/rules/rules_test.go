package rules

import (
	"testing"
)

func seq(vals ...int) func(int) int {
	i := 0
	return func(int) int { v := vals[i%len(vals)]; i++; return v }
}

func TestLevels(t *testing.T) {
	cases := map[int]int{0: 1, 299: 1, 300: 2, 899: 2, 900: 3, 6500: 5, 355000: 20, 999999: 20}
	for xp, want := range cases {
		if got := LevelFor(xp); got != want {
			t.Errorf("LevelFor(%d) = %d, want %d", xp, got, want)
		}
	}
	for lv, want := range map[int]int{1: 2, 4: 2, 5: 3, 9: 4, 13: 5, 17: 6, 20: 6} {
		if got := Proficiency(lv); got != want {
			t.Errorf("Proficiency(%d) = %d, want %d", lv, got, want)
		}
	}
}

func TestBudgetExamples(t *testing.T) {
	// the SRD 5.2 worked examples
	if d := Rate([]int{1, 1, 1, 1}, 200); d.Low != 200 || d.Rating != "low" {
		t.Errorf("four level 1, 200 XP: %+v", d)
	}
	if d := Rate([]int{3, 3, 3, 3, 3}, 1125); d.Moderate != 1125 || d.Rating != "moderate" {
		t.Errorf("five level 3, 1125 XP: %+v", d)
	}
	if d := Rate([]int{15, 15, 15, 15, 15, 15}, 46000); d.High != 46800 || d.Rating != "high" {
		t.Errorf("six level 15, 46000 XP: %+v", d)
	}
	if d := Rate([]int{1, 1, 1, 1}, 900); d.Rating != "beyond" {
		t.Errorf("way over: %+v", d)
	}
}

func TestRoll(t *testing.T) {
	r, err := roller("2d6+3", seq(4, 5))
	if err != nil || r.Total != 12 {
		t.Fatalf("2d6+3 = %v %v", r, err)
	}
	r, _ = roller("4d6kh3", seq(6, 1, 4, 5))
	if r.Total != 15 || r.Terms[0].Dice[1].Kept {
		t.Fatalf("4d6kh3 = %+v", r)
	}
	r, _ = roller("d20adv+5", seq(3, 20))
	if r.Total != 25 || !r.Crit || r.Natural != 20 {
		t.Fatalf("adv = %+v", r)
	}
	r, _ = roller("1d20dis-1", seq(3, 20))
	if r.Total != 2 || r.Natural != 3 {
		t.Fatalf("dis = %+v", r)
	}
	r, _ = roller("1d8+1d6-2", seq(8, 1))
	if r.Total != 7 {
		t.Fatalf("mixed = %+v", r)
	}
	for _, bad := range []string{"", "d", "2d", "d1", "101d6", "1d20++2", "abc", "4d6kh9", "2d6x"} {
		if _, err := roller(bad, seq(1)); err == nil {
			t.Errorf("%q should not read", bad)
		}
	}
	if s := Describe(&Result{Terms: []Term{{Sign: 1, Text: "2d6", Dice: []Die{{6, 4, true}, {6, 2, false}}, Value: 4}, {Sign: -1, Text: "1", Value: 1}}, Total: 3}); s != "2d6 (4, ~2) − 1 = 3" {
		t.Errorf("describe: %q", s)
	}
}
