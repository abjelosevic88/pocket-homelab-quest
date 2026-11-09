// Package names makes up fantasy names: people by species, taverns, and
// places. The syllables are Pocket Quest's own.
package names

import (
	"math/rand"
	"strings"
)

type parts struct{ start, mid, end []string }

var people = map[string]parts{
	"human": {
		start: []string{"Al", "Bren", "Cor", "Da", "El", "Fen", "Gar", "Hal", "Is", "Jor", "Ka", "Lis", "Mar", "Ne", "Os", "Per", "Ro", "Sa", "Tam", "Ul", "Ver", "Wil", "Ya", "Zo"},
		mid:   []string{"", "", "a", "e", "i", "o", "an", "el", "ar", "en"},
		end:   []string{"ric", "na", "ton", "wyn", "da", "mund", "ra", "ric", "ssa", "ian", "ette", "bert", "lyn", "drick", "mira", "on"},
	},
	"dwarf": {
		start: []string{"Bal", "Bor", "Dur", "Gim", "Grun", "Har", "Kil", "Mor", "Nor", "Orn", "Rur", "Thor", "Tor", "Vond", "Bru", "Dag", "Ed", "Hel"},
		mid:   []string{"", "", "a", "i", "u", "rim", "gar"},
		end:   []string{"din", "grim", "ric", "dred", "ga", "na", "vik", "mar", "dra", "rak", "bek", "lin", "hild", "unn"},
	},
	"elf": {
		start: []string{"Ae", "Ara", "Cael", "Ela", "Fae", "Ga", "Ilm", "Ith", "Lae", "Mi", "Nae", "Quel", "Ri", "Sha", "Syl", "Tha", "Va", "Ye"},
		mid:   []string{"", "la", "li", "ri", "the", "ne", "ra", "lo", "dri"},
		end:   []string{"rion", "wen", "las", "riel", "thas", "nor", "lith", "dil", "mira", "nae", "vyre", "sar", "ndra", "thil"},
	},
	"halfling": {
		start: []string{"An", "Bel", "Cal", "Dim", "Eld", "Fin", "Ger", "Hob", "Kel", "Lid", "Mer", "Ned", "Or", "Pip", "Ros", "Sam", "Tob", "Wil"},
		mid:   []string{"", "", "a", "i", "o", "be"},
		end:   []string{"do", "la", "bo", "ry", "ric", "wise", "nie", "fry", "ly", "kin", "mer", "ra", "by"},
	},
	"gnome": {
		start: []string{"Al", "Bim", "Bod", "Dim", "Fon", "Gim", "Jeb", "Nack", "Orr", "Ros", "Seb", "Tink", "Wren", "Zook", "Fizz", "Nim"},
		mid:   []string{"", "ble", "wick", "le", "bo", "ni"},
		end:   []string{"wick", "kin", "ster", "dle", "dottle", "bell", "nock", "ella", "bin", "sprocket", "pip", "wiz"},
	},
	"dragonborn": {
		start: []string{"Ar", "Bal", "Don", "Ghe", "Hes", "Kri", "Med", "Na", "Pan", "Rho", "Sha", "Sor", "Tor", "Uad", "Vor", "Kava"},
		mid:   []string{"", "a", "ash", "rak", "ja", "an"},
		end:   []string{"jhan", "asar", "aar", "esh", "rinn", "kor", "thar", "ra", "zith", "ndrax", "hun", "vys"},
	},
	"half-orc": {
		start: []string{"Dench", "Feng", "Gell", "Hen", "Holg", "Imsh", "Kep", "Krusk", "Mhur", "Ront", "Shump", "Thokk", "Baggi", "Emen", "Ovak", "Yev"},
		mid:   []string{"", "", "a", "u"},
		end:   []string{"", "", "ash", "ga", "ra", "ka", "uk", "ma", "dra", "gor"},
	},
	"tiefling": {
		start: []string{"Ak", "Am", "Bar", "Dam", "Ek", "Ia", "Kal", "Lev", "Mor", "Nem", "Ori", "Pel", "Ska", "Za", "Cri", "Mal"},
		mid:   []string{"", "a", "e", "o", "ra", "me"},
		end:   []string{"menos", "non", "akas", "kos", "thos", "riel", "lith", "nia", "ria", "vos", "xis", "ssa"},
	},
}

// Titles are put in front of a tiefling's "virtue" names now and then.
var virtues = []string{"Hope", "Ember", "Quiet", "Sorrow", "Whisper", "Story", "Torment", "Song", "Patience", "Reverie"}

var surnames = []string{"Ashford", "Blackwood", "Brightwater", "Copperkettle", "Dawnbringer", "Emberfall", "Fairwind", "Greymantle", "Hollowell", "Ironfoot",
	"Lightfoot", "Mossbottom", "Nightbreeze", "Oakenshield", "Proudfellow", "Quickwater", "Ravenscar", "Stonebrook", "Thistledown", "Underbough", "Whitlock", "Wyrmbane"}

var dwarfClans = []string{"Battlehammer", "Deepdelver", "Fireforge", "Frostbeard", "Gravelgut", "Ironfist", "Stoneshield", "Strakeln", "Torunn", "Ungart"}

var tavernA = []string{"Gilded", "Prancing", "Drunken", "Sleeping", "Rusty", "Laughing", "Silver", "Wandering", "Crooked", "Copper", "Golden", "Howling", "Jolly", "Lonely", "Merry", "Salty", "Wise", "Stubborn"}
var tavernB = []string{"Goose", "Griffon", "Dragon", "Pony", "Tankard", "Lantern", "Owl", "Stag", "Mermaid", "Boar", "Kettle", "Anvil", "Wyvern", "Crow", "Barrel", "Toad", "Badger", "Candle"}

var placeA = []string{"Raven", "Thorn", "Mist", "Ash", "Frost", "Amber", "Iron", "Wolf", "Elder", "Storm", "Briar", "Silver", "Hollow", "Dusk", "Stone", "Willow"}
var placeB = []string{"ford", "moor", "vale", "watch", "hollow", "reach", "crest", "mere", "haven", "gate", "fall", "wick", "barrow", "spire", "dale", "keep"}

// Species are the kinds of name there are.
var Species = []string{"human", "dwarf", "elf", "halfling", "gnome", "dragonborn", "half-elf", "half-orc", "tiefling"}

func pick(r *rand.Rand, l []string) string { return l[r.Intn(len(l))] }

func word(r *rand.Rand, p parts) string {
	w := pick(r, p.start) + pick(r, p.mid) + pick(r, p.end)
	// no triple letters, no doubled vowels at the joins
	var b strings.Builder
	for i, c := range w {
		if i >= 2 && byte(c) == w[i-1] && w[i-1] == w[i-2] {
			continue
		}
		b.WriteRune(c)
	}
	return b.String()
}

// Person makes up a full name for a species.
func Person(r *rand.Rand, species string) string {
	sp := species
	if sp == "half-elf" {
		if r.Intn(2) == 0 {
			sp = "elf"
		} else {
			sp = "human"
		}
	}
	p, ok := people[sp]
	if !ok {
		p = people["human"]
	}
	first := word(r, p)
	switch sp {
	case "dwarf":
		return first + " " + pick(r, dwarfClans)
	case "dragonborn":
		return first + " of Clan " + word(r, people["dragonborn"])
	case "half-orc":
		if r.Intn(3) == 0 {
			return first + " " + pick(r, surnames)
		}
		return first
	case "tiefling":
		if r.Intn(4) == 0 {
			return pick(r, virtues)
		}
		return first
	case "elf":
		return first + " " + word(r, people["elf"])
	}
	return first + " " + pick(r, surnames)
}

// Tavern makes up the name of an inn.
func Tavern(r *rand.Rand) string {
	if r.Intn(4) == 0 {
		return "The " + pick(r, tavernB) + " and " + pick(r, tavernB)
	}
	return "The " + pick(r, tavernA) + " " + pick(r, tavernB)
}

// Place makes up the name of a town or a spot on the map.
func Place(r *rand.Rand) string {
	return pick(r, placeA) + pick(r, placeB)
}

// Make makes n names of a kind: a species, "tavern" or "place".
func Make(r *rand.Rand, kind string, n int) []string {
	out := []string{}
	seen := map[string]bool{}
	for tries := 0; len(out) < n && tries < n*10; tries++ {
		var v string
		switch kind {
		case "tavern":
			v = Tavern(r)
		case "place":
			v = Place(r)
		default:
			v = Person(r, kind)
		}
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}
