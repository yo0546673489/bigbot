package matching

import (
	"bufio"
	"embed"
	"log"
	"strings"
	"sync"
)

//go:embed data
var dataFS embed.FS

// AreasIndex holds all area data in memory
type AreasIndex struct {
	mu           sync.RWMutex
	SupportAreas []string            // list of known city/area names (lowercase)
	Shortcuts    map[string]string   // short -> full (lowercase)
	RelatedToMain map[string]string  // related -> main (lowercase)
	MainToRelated map[string][]string // main -> []related (lowercase)
}

var globalIndex *AreasIndex
var indexOnce sync.Once

func GetIndex() *AreasIndex {
	indexOnce.Do(func() {
		globalIndex = &AreasIndex{
			Shortcuts:    make(map[string]string),
			RelatedToMain: make(map[string]string),
			MainToRelated: make(map[string][]string),
		}
		globalIndex.loadFromEmbed()
	})
	return globalIndex
}

// ReloadFromFiles re-reads files (call after DB changes)
func (idx *AreasIndex) ReloadFromFiles() {
	idx.mu.Lock()
	defer idx.mu.Unlock()
	idx.loadFromEmbed()
}

func (idx *AreasIndex) loadFromEmbed() {
	idx.SupportAreas = nil

	// Load support areas
	if data, err := dataFS.ReadFile("data/support-areas.txt"); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line != "" {
				idx.SupportAreas = append(idx.SupportAreas, strings.ToLower(line))
			}
		}
	} else {
		log.Printf("AreasIndex: failed to load support-areas.txt: %v", err)
	}

	// Load shortcuts
	idx.Shortcuts = make(map[string]string)
	if data, err := dataFS.ReadFile("data/support-areas-shortcut.txt"); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			// Format: "בב - בני ברק"
			parts := strings.SplitN(line, " - ", 2)
			if len(parts) == 2 {
				short := strings.ToLower(strings.TrimSpace(parts[0]))
				full := strings.ToLower(strings.TrimSpace(parts[1]))
				idx.Shortcuts[short] = full
				// Also add to support areas if not already there
				idx.SupportAreas = append(idx.SupportAreas, short)
			}
		}
	} else {
		log.Printf("AreasIndex: failed to load support-areas-shortcut.txt: %v", err)
	}

	// Load related areas
	idx.RelatedToMain = make(map[string]string)
	idx.MainToRelated = make(map[string][]string)

	if data, err := dataFS.ReadFile("data/related-areas.txt"); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		var currentMain string
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			// Section header: [ירושלים]
			if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
				currentMain = strings.ToLower(line[1 : len(line)-1])
				continue
			}
			if currentMain != "" {
				related := strings.ToLower(line)
				idx.RelatedToMain[related] = currentMain
				idx.MainToRelated[currentMain] = append(idx.MainToRelated[currentMain], related)
				// Also add related areas to support areas
				idx.SupportAreas = append(idx.SupportAreas, related)
			}
		}
	} else {
		log.Printf("AreasIndex: failed to load related-areas.txt: %v", err)
	}

	log.Printf("AreasIndex loaded: %d areas, %d shortcuts, %d related",
		len(idx.SupportAreas), len(idx.Shortcuts), len(idx.RelatedToMain))
}

// RLock exposes read lock for external packages
func (idx *AreasIndex) RLock() { idx.mu.RLock() }

// RUnlock exposes read unlock for external packages
func (idx *AreasIndex) RUnlock() { idx.mu.RUnlock() }

// Normalize resolves a shortcut to its full name (lowercase)
func (idx *AreasIndex) Normalize(area string) string {
	key := strings.ToLower(strings.TrimSpace(area))
	idx.mu.RLock()
	if full, ok := idx.Shortcuts[key]; ok {
		idx.mu.RUnlock()
		return full
	}
	idx.mu.RUnlock()
	return key
}

// IsRelated checks if area1 is a neighborhood/sub-area of area2 (or vice versa)
func (idx *AreasIndex) IsRelated(area1, area2 string) bool {
	n1 := idx.Normalize(area1)
	n2 := idx.Normalize(area2)

	idx.mu.RLock()
	defer idx.mu.RUnlock()

	// area1 is related to area2 (area2 is the main)
	if main, ok := idx.RelatedToMain[n1]; ok && main == n2 {
		return true
	}
	// area2 is in the related list of area1 (area1 is main)
	if rels, ok := idx.MainToRelated[n1]; ok {
		for _, r := range rels {
			if r == n2 {
				return true
			}
		}
	}
	return false
}

// MatchAreas returns true if two area strings refer to the same place
func (idx *AreasIndex) MatchAreas(area1, area2 string) bool {
	n1 := idx.Normalize(area1)
	n2 := idx.Normalize(area2)

	if n1 == n2 {
		return true
	}
	if idx.IsRelated(area1, area2) {
		return true
	}
	if idx.IsRelated(area2, area1) {
		return true
	}
	return false
}
