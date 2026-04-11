package matching

import (
	"strings"
)

// GetOriginAndDestination extracts origin and destination from a ride message.
// Returns "origin_destination" or "origin" or "" if nothing found.
func GetOriginAndDestination(text string) string {
	if text == "" {
		return ""
	}

	idx := GetIndex()
	lowerText := strings.ToLower(text)

	idx.mu.RLock()
	searchable := make([]string, 0, len(idx.SupportAreas))
	for _, a := range idx.SupportAreas {
		searchable = append(searchable, a)
	}
	idx.mu.RUnlock()

	// Sort longer strings first to avoid partial matches
	sortByLengthDesc(searchable)

	type foundArea struct {
		area   string
		index  int
		length int
	}

	var foundAreas []foundArea
	matchedIndices := make(map[int]bool)

	for _, areaLC := range searchable {
		pos := strings.Index(lowerText, areaLC)
		if pos == -1 {
			continue
		}

		// Check for overlap
		overlaps := false
		for i := pos; i < pos+len(areaLC); i++ {
			if matchedIndices[i] {
				overlaps = true
				break
			}
		}
		if overlaps {
			continue
		}

		// Extract original case from text
		originalArea := text[pos : pos+len(areaLC)]
		foundAreas = append(foundAreas, foundArea{area: originalArea, index: pos, length: len(areaLC)})

		for i := pos; i < pos+len(areaLC); i++ {
			matchedIndices[i] = true
		}
	}

	if len(foundAreas) == 0 {
		return ""
	}

	// Sort by position in text
	for i := 1; i < len(foundAreas); i++ {
		key := foundAreas[i]
		j := i - 1
		for j >= 0 && foundAreas[j].index > key.index {
			foundAreas[j+1] = foundAreas[j]
			j--
		}
		foundAreas[j+1] = key
	}

	if len(foundAreas) >= 2 {
		return foundAreas[0].area + "_" + foundAreas[1].area
	}
	return foundAreas[0].area
}

// HasMinimumTwoCities returns origin_destination if at least 2 cities found, else ""
func HasMinimumTwoCities(text string) string {
	result := GetOriginAndDestination(text)
	if result == "" {
		return ""
	}
	parts := strings.Split(result, "_")
	if len(parts) >= 2 {
		return result
	}
	return ""
}

func sortByLengthDesc(s []string) {
	for i := 1; i < len(s); i++ {
		key := s[i]
		j := i - 1
		for j >= 0 && len(s[j]) < len(key) {
			s[j+1] = s[j]
			j--
		}
		s[j+1] = key
	}
}
