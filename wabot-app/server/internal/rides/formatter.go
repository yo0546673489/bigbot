package rides

import (
	"net/url"
	"regexp"
	"strings"
)

var waLinkRegex = regexp.MustCompile(`wa\.me/(\d+)(?:\?text=([^\s]+))?`)
var priceRegex = regexp.MustCompile(`(\d+)\s*ש`)

// originDestParser is set by the processor to avoid import cycle
var originDestParser func(string) string

func SetOriginDestParser(fn func(string) string) {
	originDestParser = fn
}

// ParseRideFromMessage parses a WhatsApp group message into a Ride
func ParseRideFromMessage(msg *IncomingMessage, specialGroup string) *Ride {
	if originDestParser == nil {
		return nil
	}

	body := msg.Body
	originDest := originDestParser(body)
	if originDest == "" {
		return nil
	}

	parts := strings.SplitN(originDest, "_", 2)
	origin := parts[0]
	destination := ""
	if len(parts) == 2 {
		destination = parts[1]
	}

	ride := &Ride{
		MessageID:      msg.MessageID,
		GroupID:        msg.GroupID,
		GroupName:      msg.GroupName,
		OriginRaw:      origin,
		DestinationRaw: destination,
		Origin:         strings.TrimSpace(origin),
		Destination:    strings.TrimSpace(destination),
		Body:           body,
		BodyClean:      CleanBody(body),
		SenderPhone:    msg.SenderPhone,
		SenderName:     msg.FromName,
		Timestamp:      msg.Timestamp,
		IsSpecialGroup: msg.GroupID == specialGroup,
	}

	// Extract price
	if m := priceRegex.FindStringSubmatch(body); m != nil {
		ride.Price = m[1]
	}

	// Extract wa.me link
	if m := waLinkRegex.FindStringSubmatch(body); m != nil {
		ride.HasLink = true
		ride.LinkPhone = m[1]
		if len(m) > 2 && m[2] != "" {
			decoded, err := url.QueryUnescape(strings.ReplaceAll(m[2], "+", " "))
			if err == nil {
				ride.LinkText = decoded
			} else {
				ride.LinkText = m[2]
			}
		}
	}

	ride.Buttons = buildButtons(ride)
	return ride
}

func buildButtons(r *Ride) []Button {
	var btns []Button
	if r.HasLink {
		btns = append(btns, Button{ID: "send_link", Label: "שלח לסדרן"})
		btns = append(btns, Button{ID: "reply_group", Label: "ת לקבוצה"})
	} else {
		btns = append(btns, Button{ID: "reply_group", Label: "ת"})
		btns = append(btns, Button{ID: "reply_private", Label: "ת לפרטי"})
	}
	if r.IsSpecialGroup {
		btns = append(btns, Button{ID: "reply_group_n", Label: "ן"})
	}
	return btns
}

// CleanBody removes wa.me links, phone numbers, and quoted lines
func CleanBody(body string) string {
	phoneOnlyRe := regexp.MustCompile(`^[\d\+\-\s]+$`)
	lines := strings.Split(body, "\n")
	var clean []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, ">") {
			continue
		}
		if strings.Contains(trimmed, "wa.me/") {
			continue
		}
		if phoneOnlyRe.MatchString(trimmed) {
			continue
		}
		clean = append(clean, trimmed)
	}
	result := strings.Join(clean, "\n")
	result = strings.ReplaceAll(result, "*", "")
	return strings.TrimSpace(result)
}
