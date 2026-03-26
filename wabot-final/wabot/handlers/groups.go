package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"time"
	"wabot/types"

	waTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// GetAllGroups fetches all groups for a specific bot phone number
func (s *WhatsAppHandlers) GetAllGroups(botPhone string) (*[]types.GroupInfo, error) {
	client, clientErr := s.bot.GetClient(botPhone)
	if clientErr != nil {
		s.bot.GetLogger().Warnf("Failed to get client for %s: %v", botPhone, clientErr)
	}
	groups, err := client.GetJoinedGroups(context.Background())
	if err != nil {
		s.bot.GetLogger().Warnf("Failed to get joined groups for %s: %v", botPhone, err)
	}

	groupInfos := make([]types.GroupInfo, len(groups))
	for i, group := range groups {
		participants := make([]types.GroupParticipantInfo, 0)
		for _, participant := range group.Participants {
			participants = append(participants, types.GroupParticipantInfo{
				JID:          participant.JID.String(),
				PhoneNumber:  participant.PhoneNumber.String(),
				LID:          participant.LID.String(),
				IsAdmin:      participant.IsAdmin,
				IsSuperAdmin: participant.IsSuperAdmin,
				DisplayName:  participant.DisplayName,
			})
		}
		groupInfos[i] = types.GroupInfo{
			JID:          group.JID.String(),
			Name:         group.GroupName.Name,
			Participants: participants,
			Description:  group.GroupTopic.Topic,
		}
	}
	return &groupInfos, nil
}

// getGroupParticipants fetches all participants in a WhatsApp group
func (s *WhatsAppHandlers) retrieveGroupInfo(groupJID waTypes.JID, botPhone string) (types.GroupInfo, error) {
	groupID := groupJID.User

	// Create context for Redis operations with longer timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// First, try to get from Redis cache
	cachedInfo, err := s.getCachedGroupInfo(ctx, groupID)
	if err != nil {
		s.bot.GetLogger().Debugf("Failed to get cached group info for %s: %v", groupID, err)
	} else if cachedInfo != nil {
		s.bot.GetLogger().Debugf("Using cached group info for group %s", groupID)
		return *cachedInfo, nil
	}

	// Check rate limiting before making request
	if !s.rateLimitGroupInfoRequest() {
		s.bot.GetLogger().Debugf("Rate limited, skipping group info request for %s", groupID)
		return types.GroupInfo{
			JID:          groupJID.String(),
			Name:         "Rate Limited",
			Participants: []types.GroupParticipantInfo{},
		}, nil
	}

	// Get the specific client that received this message
	client, err := s.bot.GetClient(botPhone)

	if err != nil {
		return types.GroupInfo{}, fmt.Errorf("failed to get bot client for phone %s: %v", botPhone, err)
	}

	if !client.IsConnected() {
		return types.GroupInfo{}, fmt.Errorf("bot client for phone %s is not connected", botPhone)
	}

	// Use the specific client to get group info with rate limiting
	groupInfo, err := client.GetGroupInfo(context.Background(), groupJID)
	if err != nil {
		// Check if it's a rate limit error
		if strings.Contains(err.Error(), "429") || strings.Contains(err.Error(), "rate-overlimit") {
			s.bot.GetLogger().Warnf("Rate limited when getting group info for %s, using cached data if available", groupID)
			// Return empty group info but don't fail completely
			return types.GroupInfo{
				JID:          groupJID.String(),
				Name:         "Rate Limited",
				Participants: []types.GroupParticipantInfo{},
			}, nil
		}
		return types.GroupInfo{}, fmt.Errorf("failed to get group info from bot client %s: %v", botPhone, err)
	}

	// Convert GroupParticipant to GroupParticipantInfo
	participants := make([]types.GroupParticipantInfo, 0, len(groupInfo.Participants))
	for _, participant := range groupInfo.Participants {
		participantInfo := types.GroupParticipantInfo{
			JID:          participant.JID.String(),
			PhoneNumber:  participant.PhoneNumber.String(),
			LID:          participant.LID.String(),
			IsAdmin:      participant.IsAdmin,
			IsSuperAdmin: participant.IsSuperAdmin,
			DisplayName:  participant.DisplayName,
		}
		participants = append(participants, participantInfo)
	}

	result := types.GroupInfo{
		JID:          groupInfo.JID.String(),
		Name:         groupInfo.GroupName.Name,
		Participants: participants,
		Description:  groupInfo.GroupTopic.Topic,
	}

	// Cache the result in Redis
	err = s.setCachedGroupInfo(ctx, groupID, result)
	if err != nil {
		s.bot.GetLogger().Debugf("Failed to cache group info for %s: %v", groupID, err)
	}
	return result, nil
}

// handleGroupInfoEvent handles group information changes including participant changes
func (h *WhatsAppHandlers) handleGroupInfoEvent(eventData *types.EventData) {
	groupInfo, ok := eventData.Data.(*events.GroupInfo)
	if !ok {
		h.bot.GetLogger().Errorf("Failed to cast event data to GroupInfo for bot %s", eventData.BotPhone)
		return
	}

	groupID := groupInfo.JID.User
	botPhone := eventData.BotPhone

	h.bot.GetLogger().Infof("Group info event for group %s via bot %s", groupID, botPhone)

	// Handle participant changes
	if len(groupInfo.Join) > 0 {
		h.bot.GetLogger().Infof("Group %s: %d participants joined", groupID, len(groupInfo.Join))
		h.handleParticipantsJoined(groupInfo, botPhone)
	}

	if len(groupInfo.Leave) > 0 {
		h.bot.GetLogger().Infof("Group %s: %d participants left", groupID, len(groupInfo.Leave))
		h.handleParticipantsLeft(groupInfo, botPhone)
	}

	if len(groupInfo.Promote) > 0 {
		h.bot.GetLogger().Infof("Group %s: %d participants promoted", groupID, len(groupInfo.Promote))
		h.handleParticipantsPromoted(groupInfo, botPhone)
	}

	if len(groupInfo.Demote) > 0 {
		h.bot.GetLogger().Infof("Group %s: %d participants demoted", groupID, len(groupInfo.Demote))
		h.handleParticipantsDemoted(groupInfo, botPhone)
	}

	// Handle other group changes
	if groupInfo.Name != nil {
		h.bot.GetLogger().Infof("Group %s name changed to: %s", groupID, groupInfo.Name.Name)
	}

	if groupInfo.Topic != nil {
		h.bot.GetLogger().Infof("Group %s topic changed to: %s", groupID, groupInfo.Topic.Topic)
	}

	// Clear cache for this group since info has changed
	if h.redisService != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		err := h.redisService.DeleteGroupInfo(ctx, groupID)
		if err != nil {
			h.bot.GetLogger().Debugf("Failed to clear cache for group %s: %v", groupID, err)
		} else {
			h.bot.GetLogger().Debugf("Cleared cache for group %s due to info change", groupID)
		}
	}

	newGroupInfo, err := h.retrieveGroupInfo(groupInfo.JID, botPhone)
	if err != nil {
		h.bot.GetLogger().Warnf("Failed to get group info for %s: %v", groupID, err)
	}

	// Use a new context for the debounced cache update
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	h.setCachedGroupInfoDebounced(ctx, groupID, newGroupInfo)
}

// handleParticipantsJoined handles when participants join a group
func (h *WhatsAppHandlers) handleParticipantsJoined(groupInfo *events.GroupInfo, botPhone string) {
	groupID := groupInfo.JID.User

	for _, participantJID := range groupInfo.Join {
		participantPhone := participantJID.User
		h.bot.GetLogger().Infof("Participant %s joined group %s via bot %s", participantPhone, groupID, botPhone)

		// You can add custom logic here for when participants join
		// For example, send welcome messages, log to database, etc.
	}
}

// handleParticipantsLeft handles when participants leave a group
func (h *WhatsAppHandlers) handleParticipantsLeft(groupInfo *events.GroupInfo, botPhone string) {
	groupID := groupInfo.JID.User

	for _, participantJID := range groupInfo.Leave {
		participantPhone := participantJID.User
		h.bot.GetLogger().Infof("Participant %s left group %s via bot %s", participantPhone, groupID, botPhone)

		// You can add custom logic here for when participants leave
		// For example, log to database, send notifications, etc.
	}
}

// handleParticipantsPromoted handles when participants are promoted to admin
func (h *WhatsAppHandlers) handleParticipantsPromoted(groupInfo *events.GroupInfo, botPhone string) {
	groupID := groupInfo.JID.User

	for _, participantJID := range groupInfo.Promote {
		participantPhone := participantJID.User
		h.bot.GetLogger().Infof("Participant %s was promoted to admin in group %s via bot %s", participantPhone, groupID, botPhone)

		// You can add custom logic here for when participants are promoted
		// For example, send congratulations, update database, etc.
	}
}

// handleParticipantsDemoted handles when participants are demoted from admin
func (h *WhatsAppHandlers) handleParticipantsDemoted(groupInfo *events.GroupInfo, botPhone string) {
	groupID := groupInfo.JID.User

	for _, participantJID := range groupInfo.Demote {
		participantPhone := participantJID.User
		h.bot.GetLogger().Infof("Participant %s was demoted from admin in group %s via bot %s", participantPhone, groupID, botPhone)

		// You can add custom logic here for when participants are demoted
		// For example, log to database, send notifications, etc.
	}
}

// extractJIDValue safely extracts a JID value from a field, handling both JID structs and strings
func (h *WhatsAppHandlers) extractJIDValue(field reflect.Value) string {
	if !field.IsValid() {
		return ""
	}

	// Handle JID field which might be a types.JID struct or string
	if field.Type().String() == "types.JID" {
		// Extract the User field from JID struct
		if jidUserField := field.FieldByName("User"); jidUserField.IsValid() {
			return jidUserField.String()
		}
		// If User field is not available, try to get the string representation
		return field.String()
	}

	return field.String()
}

// handleGroupCreatedEvent handles when a new group is created
func (h *WhatsAppHandlers) handleGroupCreatedEvent(eventData *types.EventData) {
	botPhone := eventData.BotPhone
	h.bot.GetLogger().Infof("Group created event for bot %s", botPhone)

	// Use reflection to extract data from the struct
	eventValue := reflect.ValueOf(eventData.Data)
	if eventValue.Kind() == reflect.Ptr && !eventValue.IsNil() {
		eventValue = eventValue.Elem()
	}

	if eventValue.Kind() != reflect.Struct {
		h.bot.GetLogger().Errorf("Event data is not a struct for bot %s", botPhone)
		return
	}

	// Extract group data into types.GroupInfo struct
	groupInfo := &types.GroupInfo{}

	// Extract basic fields that exist in the current GroupInfo struct
	if field := eventValue.FieldByName("Name"); field.IsValid() {
		groupInfo.Name = field.String()
	}
	if field := eventValue.FieldByName("JID"); field.IsValid() {
		groupInfo.JID = h.extractJIDValue(field) + "@g.us"
	}

	// Extract Participants array
	if participantsField := eventValue.FieldByName("Participants"); participantsField.IsValid() && participantsField.Kind() == reflect.Slice {
		participants := make([]types.GroupParticipantInfo, participantsField.Len())
		for i := 0; i < participantsField.Len(); i++ {
			participant := participantsField.Index(i)
			if participant.Kind() == reflect.Struct {
				participantInfo := types.GroupParticipantInfo{}

				if field := participant.FieldByName("JID"); field.IsValid() {
					participantInfo.JID = h.extractJIDValue(field) + "@lid"
				}
				if field := participant.FieldByName("PhoneNumber"); field.IsValid() {
					participantInfo.PhoneNumber = h.extractJIDValue(field) + "@s.whatsapp.net"
				}
				if field := participant.FieldByName("LID"); field.IsValid() {
					participantInfo.LID = h.extractJIDValue(field) + "@lid"
				}
				if field := participant.FieldByName("IsAdmin"); field.IsValid() {
					participantInfo.IsAdmin = field.Bool()
				}
				if field := participant.FieldByName("IsSuperAdmin"); field.IsValid() {
					participantInfo.IsSuperAdmin = field.Bool()
				}
				if field := participant.FieldByName("DisplayName"); field.IsValid() {
					participantInfo.DisplayName = field.String()
				}

				participants[i] = participantInfo
			}
		}
		groupInfo.Participants = participants
	}

	h.bot.GetLogger().Infof("Extracted group info: %s", groupInfo.Name)

	go h.forwardGroupCreationToServer(groupInfo, botPhone)
}

// forwardGroupCreationToServer forwards group creation event to the main server
func (h *WhatsAppHandlers) forwardGroupCreationToServer(groupData *types.GroupInfo, botPhone string) {
	jsonData, err := json.Marshal(groupData)
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to marshal group creation data: %v", err)
		return
	}

	resp, err := h.bot.GetHTTPClient().Post(
		h.bot.GetConfig().ServerURL+"/api/waweb/group-created",
		"application/json",
		bytes.NewBuffer(jsonData),
	)

	if err != nil {
		h.bot.GetLogger().Errorf("Failed to forward group creation to server: %v", err)
		return
	}
	defer resp.Body.Close()

	h.bot.GetLogger().Infof("Group creation event forwarded to server for bot %s", botPhone)
}
