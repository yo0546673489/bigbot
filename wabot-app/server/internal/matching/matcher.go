package matching

import (
	"strings"

	"wabot-app/internal/drivers"
)

// ValidateSearchKeyword checks if any of the driver's keywords match the ride's origin/destination.
// originDestination is "origin_destination" or "origin"
func ValidateSearchKeyword(keywords []*drivers.DriverSearchKeyword, originDestination string) *drivers.DriverSearchKeyword {
	if len(keywords) == 0 || originDestination == "" {
		return nil
	}

	idx := GetIndex()
	parts := strings.SplitN(originDestination, "_", 2)
	rideOrigin := ""
	rideDestination := ""
	if len(parts) >= 1 {
		rideOrigin = parts[0]
	}
	if len(parts) >= 2 {
		rideDestination = parts[1]
	}

	for _, kw := range keywords {
		if kw.IsBlocked {
			continue
		}
		kwParts := strings.SplitN(kw.Keyword, "_", 2)
		if len(kwParts) == 2 {
			driverOrigin := kwParts[0]
			driverDestination := kwParts[1]
			// Both origin AND destination must match
			if rideDestination == "" {
				continue // driver wants specific route, ride only has origin
			}
			if idx.MatchAreas(driverOrigin, rideOrigin) && idx.MatchAreas(driverDestination, rideDestination) {
				return kw
			}
		} else {
			driverArea := kwParts[0]
			// Only origin must match
			if idx.MatchAreas(driverArea, rideOrigin) {
				return kw
			}
		}
	}
	return nil
}
