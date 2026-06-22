package activity

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type NotificationClient struct {
	baseURL string
	client  *http.Client
}

func NewNotificationClient(baseURL string) NotificationClient {
	return NotificationClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 2 * time.Second},
	}
}

func (c NotificationClient) ActivityCompleted(ctx context.Context, userID string, activityID string, distanceM float64) error {
	body, err := json.Marshal(map[string]any{
		"user_id":     userID,
		"type":        "activity.completed",
		"title":       "Activity completed",
		"body":        "Nice work. Your activity has been saved.",
		"activity_id": activityID,
		"metadata": map[string]any{
			"distance_m": distanceM,
		},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/notifications", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Service-Name", "activity-service")

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("notification creation failed with status %d", resp.StatusCode)
	}
	return nil
}

