package drivers

import (
	"time"
)

func IsInTrial(d *Driver) bool {
	if d.IgnorePayment || d.BillingEndAt > 0 {
		return true
	}
	trialEnd := d.CreatedAt.Add(7 * 24 * time.Hour)
	return time.Now().Before(trialEnd)
}

func IsNeedToPay(d *Driver) bool {
	if d.IgnorePayment {
		return false
	}
	if d.BillingEndAt == 0 {
		return false
	}
	return time.Now().Unix() > d.BillingEndAt
}

// IsDriverEligible checks if driver's vehicle type matches the ride message
func IsDriverEligible(d *Driver, message string) bool {
	filters := d.CategoryFilters
	if len(filters) == 0 {
		return true
	}

	for _, f := range filters {
		if f.Key == "allTypes" {
			return true
		}
	}

	if message == "" {
		for _, f := range filters {
			if f.Key == "4Seats" {
				return true
			}
		}
		return false
	}

	lowerMsg := toLower(message)

	// Blocked keywords for large vehicles
	largeVehicleKeywords := []string{
		"תשע", "עשר", "11", "12", "ויטו", "קרפד",
		"מיני", "מינית", "מיניבוס",
		"7 מושב", "8 מושב", "9 מושב",
		"שבע", "שמונה",
	}

	for _, f := range filters {
		switch f.Key {
		case "4Seats":
			// Blocked: any large vehicle keywords
			for _, kw := range largeVehicleKeywords {
				if contains(lowerMsg, kw) {
					return false
				}
			}
			return true

		case "6Seats":
			// Accepts 4 and 6 seat rides
			blocked := []string{"7 מושב", "8 מושב", "9 מושב", "תשע", "עשר", "ויטו"}
			for _, kw := range blocked {
				if contains(lowerMsg, kw) {
					return false
				}
			}
			return true

		case "allTypes":
			return true
		}
	}

	return false
}

func toLower(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			result[i] = c + 32
		} else {
			result[i] = c
		}
	}
	return string(result)
}

func contains(s, substr string) bool {
	if len(substr) == 0 {
		return true
	}
	if len(s) < len(substr) {
		return false
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
