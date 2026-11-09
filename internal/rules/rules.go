// Package rules holds the fifth-edition numbers Pocket Quest works with:
// experience and levels, proficiency, encounter budgets, and the dice.
package rules

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"sort"
	"strconv"
	"strings"
)

// LevelXP is the experience a character needs for each level (SRD 5.1,
// "Character Advancement"): index 0 = level 1.
var LevelXP = []int{0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000}

// LevelFor is the level a total of XP reaches.
func LevelFor(xp int) int {
	lv := 1
	for i, need := range LevelXP {
		if xp >= need {
			lv = i + 1
		}
	}
	return lv
}

// NextLevelXP is the XP the next level needs (0 at level 20).
func NextLevelXP(level int) int {
	if level < 1 || level >= 20 {
		return 0
	}
	return LevelXP[level]
}

// Proficiency is the proficiency bonus at a (total character) level.
func Proficiency(level int) int {
	if level < 1 {
		level = 1
	}
	return 2 + (level-1)/4
}

// Budget is the SRD 5.2 "XP Budget per Character" table (Gameplay
// Toolbox, Combat Encounters): Low, Moderate and High for levels 1–20.
var Budget = [20][3]int{
	{50, 75, 100}, {100, 150, 200}, {150, 225, 400}, {250, 375, 500}, {500, 750, 1100},
	{600, 1000, 1400}, {750, 1300, 1700}, {1000, 1700, 2100}, {1300, 2000, 2600}, {1600, 2300, 3100},
	{1900, 2900, 4100}, {2200, 3700, 4700}, {2600, 4200, 5400}, {2900, 4900, 6200}, {3300, 5400, 7800},
	{3800, 6100, 9800}, {4500, 7200, 11700}, {5000, 8700, 14200}, {5500, 10700, 17200}, {6400, 13200, 22000},
}

// Difficulty is what an encounter's XP comes to for a party.
type Difficulty struct {
	Low      int    `json:"low"`
	Moderate int    `json:"moderate"`
	High     int    `json:"high"`
	XP       int    `json:"xp"`
	Rating   string `json:"rating"` // trivial | low | moderate | high | beyond
	Party    int    `json:"party"`
}

// Rate adds up the budget for each character's level and rates the monsters'
// XP against it: under Low = trivial, up to Low = low, up to Moderate =
// moderate, up to High = high, more = beyond high (could be deadly).
func Rate(levels []int, xp int) Difficulty {
	d := Difficulty{XP: xp, Party: len(levels)}
	for _, lv := range levels {
		if lv < 1 {
			lv = 1
		}
		if lv > 20 {
			lv = 20
		}
		b := Budget[lv-1]
		d.Low += b[0]
		d.Moderate += b[1]
		d.High += b[2]
	}
	switch {
	case len(levels) == 0 || xp == 0:
		d.Rating = ""
	case xp < d.Low/2:
		d.Rating = "trivial"
	case xp <= d.Low:
		d.Rating = "low"
	case xp <= d.Moderate:
		d.Rating = "moderate"
	case xp <= d.High:
		d.Rating = "high"
	default:
		d.Rating = "beyond"
	}
	return d
}

// CRXP is the XP for each challenge rating (SRD 5.1 monsters).
var CRXP = map[float64]int{0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
	11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000,
	24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000}

// ---- dice ----

// Die is one die rolled.
type Die struct {
	Sides int  `json:"sides"`
	Value int  `json:"value"`
	Kept  bool `json:"kept"`
}

// Term is one part of an expression: dice (with their rolls) or a number.
type Term struct {
	Sign  int    `json:"sign"` // 1 or -1
	Text  string `json:"text"` // "2d6", "4d6kh3", "+3"
	Dice  []Die  `json:"dice,omitempty"`
	Value int    `json:"value"` // the term's total (before the sign)
}

// Result is a whole roll.
type Result struct {
	Expr  string `json:"expr"`
	Terms []Term `json:"terms"`
	Total int    `json:"total"`
	// For a single d20 (with advantage or not): the natural roll, so a 20 or a 1 can show.
	Natural int  `json:"natural,omitempty"`
	Crit    bool `json:"crit,omitempty"`
	Fumble  bool `json:"fumble,omitempty"`
}

// ErrBadRoll is what an expression the roller cannot read gives.
var ErrBadRoll = errors.New("cannot read that roll: try something like 1d20+5, 2d6+3, 4d6kh3 or 2d20kl1")

func roll(sides int) int {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(sides)))
	if err != nil {
		return 1
	}
	return int(n.Int64()) + 1
}

// Roll reads and rolls an expression: terms of NdS (optionally kh/kl/dh/dl
// with a count, "adv"/"dis" for a d20 with advantage), whole numbers, joined
// by + and -. "d%" is a d100. Up to 100 dice of up to 1000 sides.
func Roll(expr string) (*Result, error) {
	return roller(expr, roll)
}

func roller(expr string, rnd func(int) int) (*Result, error) {
	src := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(expr), " ", ""))
	src = strings.ReplaceAll(src, "d%", "d100")
	if src == "" || len(src) > 120 {
		return nil, ErrBadRoll
	}
	res := &Result{Expr: src}
	dice := 0
	i := 0
	for i < len(src) {
		sign := 1
		if src[i] == '+' || src[i] == '-' {
			if src[i] == '-' {
				sign = -1
			}
			i++
		} else if i > 0 {
			return nil, ErrBadRoll
		}
		j := i
		for j < len(src) && src[j] != '+' && src[j] != '-' {
			j++
		}
		part := src[i:j]
		i = j
		if part == "" {
			return nil, ErrBadRoll
		}
		t := Term{Sign: sign, Text: part}
		if !strings.Contains(part, "d") {
			n, err := strconv.Atoi(part)
			if err != nil || n > 100000 {
				return nil, ErrBadRoll
			}
			t.Value = n
			res.Terms = append(res.Terms, t)
			res.Total += sign * n
			continue
		}
		n, sides, keep, keepHigh, err := parseDice(part)
		if err != nil {
			return nil, err
		}
		dice += n
		if dice > 100 {
			return nil, ErrBadRoll
		}
		for k := 0; k < n; k++ {
			t.Dice = append(t.Dice, Die{Sides: sides, Value: rnd(sides), Kept: true})
		}
		if keep > 0 && keep < n {
			idx := make([]int, n)
			for k := range idx {
				idx[k] = k
			}
			sort.SliceStable(idx, func(a, b int) bool {
				if keepHigh {
					return t.Dice[idx[a]].Value > t.Dice[idx[b]].Value
				}
				return t.Dice[idx[a]].Value < t.Dice[idx[b]].Value
			})
			for k, at := range idx {
				t.Dice[at].Kept = k < keep
			}
		}
		for _, d := range t.Dice {
			if d.Kept {
				t.Value += d.Value
			}
		}
		res.Terms = append(res.Terms, t)
		res.Total += sign * t.Value
	}
	// a d20 test: say when it is a natural 20 or 1
	var d20 []Die
	for _, t := range res.Terms {
		for _, d := range t.Dice {
			if d.Sides == 20 && d.Kept {
				d20 = append(d20, d)
			}
		}
	}
	if len(d20) == 1 {
		res.Natural = d20[0].Value
		res.Crit, res.Fumble = res.Natural == 20, res.Natural == 1
	}
	return res, nil
}

// parseDice reads NdS[kh|kl|dh|dl M] and the adv/dis short forms.
func parseDice(p string) (n, sides, keep int, keepHigh bool, err error) {
	switch {
	case strings.HasSuffix(p, "adv"):
		p = strings.TrimSuffix(p, "adv")
		if p == "d20" || p == "1d20" || p == "" {
			return 2, 20, 1, true, nil
		}
		return 0, 0, 0, false, ErrBadRoll
	case strings.HasSuffix(p, "dis"):
		p = strings.TrimSuffix(p, "dis")
		if p == "d20" || p == "1d20" || p == "" {
			return 2, 20, 1, false, nil
		}
		return 0, 0, 0, false, ErrBadRoll
	}
	mod := ""
	for _, m := range []string{"kh", "kl", "dh", "dl"} {
		if k := strings.Index(p, m); k > 0 {
			mod = p[k:]
			p = p[:k]
			break
		}
	}
	d := strings.Index(p, "d")
	if d < 0 {
		return 0, 0, 0, false, ErrBadRoll
	}
	n = 1
	if d > 0 {
		if n, err = strconv.Atoi(p[:d]); err != nil || n < 1 {
			return 0, 0, 0, false, ErrBadRoll
		}
	}
	if sides, err = strconv.Atoi(p[d+1:]); err != nil || sides < 2 || sides > 1000 || n > 100 {
		return 0, 0, 0, false, ErrBadRoll
	}
	if mod != "" {
		m := 1
		if len(mod) > 2 {
			if m, err = strconv.Atoi(mod[2:]); err != nil || m < 0 || m > n {
				return 0, 0, 0, false, ErrBadRoll
			}
		}
		switch mod[:2] {
		case "kh":
			keep, keepHigh = m, true
		case "kl":
			keep, keepHigh = m, false
		case "dh":
			keep, keepHigh = n-m, false
		case "dl":
			keep, keepHigh = n-m, true
		}
		if keep == 0 {
			return 0, 0, 0, false, ErrBadRoll
		}
	}
	return n, sides, keep, keepHigh, nil
}

// Describe writes a roll as "4d6kh3 (6, 5, 4, ~1) + 2 = 17".
func Describe(r *Result) string {
	var b strings.Builder
	for i, t := range r.Terms {
		if i > 0 || t.Sign < 0 {
			if t.Sign < 0 {
				b.WriteString(" − ")
			} else {
				b.WriteString(" + ")
			}
		}
		if len(t.Dice) == 0 {
			b.WriteString(strconv.Itoa(t.Value))
			continue
		}
		vals := make([]string, len(t.Dice))
		for k, d := range t.Dice {
			vals[k] = strconv.Itoa(d.Value)
			if !d.Kept {
				vals[k] = "~" + vals[k]
			}
		}
		fmt.Fprintf(&b, "%s (%s)", t.Text, strings.Join(vals, ", "))
	}
	fmt.Fprintf(&b, " = %d", r.Total)
	return b.String()
}
