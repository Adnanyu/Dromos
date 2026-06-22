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

type SocialFeedClient struct {
	baseURL string
	client  *http.Client
}

func NewSocialFeedClient(baseURL string) SocialFeedClient {
	return SocialFeedClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 2 * time.Second},
	}
}

func (c SocialFeedClient) ActivityCompleted(ctx context.Context, userID string, activityID string, distanceM float64) error {
	body, err := json.Marshal(map[string]any{
		"user_id":     userID,
		"activity_id": activityID,
		"distance_m":  distanceM,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/feed/activity-completed", bytes.NewReader(body))
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
	if resp.StatusCode >= 300 {
		return fmt.Errorf("social feed update failed with status %d", resp.StatusCode)
	}
	return nil
}

