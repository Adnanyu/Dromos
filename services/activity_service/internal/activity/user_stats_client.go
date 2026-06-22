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

type UserStatsClient struct {
	baseURL string
	client  *http.Client
}

func NewUserStatsClient(baseURL string) UserStatsClient {
	return UserStatsClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 2 * time.Second},
	}
}

func (c UserStatsClient) ActivityCompleted(ctx context.Context, userID string, distanceM float64) error {
	body, err := json.Marshal(map[string]float64{"distance_m": distanceM})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/users/"+userID+"/stats/activity-completed", bytes.NewReader(body))
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
		return fmt.Errorf("user stats update failed with status %d", resp.StatusCode)
	}
	return nil
}

