package httpapi

import (
	"context"
	"errors"

	"stride/activity_service/internal/activity"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	RedisAddr      string
	UserServiceURL string
	SocialServiceURL string
	NotificationServiceURL string
}

type Server struct {
	app     *fiber.App
	tracker activity.Service

}

func NewServer(cfg Config, tracker activity.Service) Server {
	server := Server{
		app: fiber.New(fiber.Config{
			AppName:      "STRIDE Activity Service",
			ErrorHandler: errorHandler,
		}),
		tracker: tracker,
	}
	server.routes()
	return server
}

func (s Server) Listen(addr string) error {
	return s.app.Listen(addr)
}

func (s Server) routes() {
	s.app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "activity-service"})
	})

	s.app.Post("/activities", s.startActivity)
	s.app.Patch("/activities/:id", s.updateActivity)
	s.app.Get("/activities/:id", s.getActivity)
	s.app.Get("/users/:id/activities", s.listUserActivities)

	s.app.Use("/activities/live/:id", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	s.app.Get("/activities/live/:id", websocket.New(s.activityWebSocket))
}

func (s Server) startActivity(c *fiber.Ctx) error {
	userID, err := userContext(c)
	if err != nil {
		return err
	}
	var req activity.StartActivityRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON body")
	}
	created, err := s.tracker.Start(c.UserContext(), userID, req)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": created})
}

func (s Server) updateActivity(c *fiber.Ctx) error {
	userID, err := userContext(c)
	if err != nil {
		return err
	}
	var req activity.UpdateActivityRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON body")
	}
	updated, err := s.tracker.UpdateStatus(c.UserContext(), c.Params("id"), userID, req.Status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fiber.ErrNotFound
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(fiber.Map{"data": updated})
}

func (s Server) getActivity(c *fiber.Ctx) error {
	found, err := s.tracker.Get(c.UserContext(), c.Params("id"))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fiber.ErrNotFound
		}
		return err
	}
	return c.JSON(fiber.Map{"data": found})
}

func (s Server) listUserActivities(c *fiber.Ctx) error {
	activities, err := s.tracker.ListUserActivities(c.UserContext(), c.Params("id"), c.QueryInt("limit", 50))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"data": activities})
}

func (s Server) activityWebSocket(conn *websocket.Conn) {
	defer conn.Close()

	activityID := conn.Params("id")
	ctx := context.Background()
	found, err := s.tracker.Get(ctx, activityID)
	if err != nil {
		_ = conn.WriteJSON(fiber.Map{"type": "error", "message": "activity not found"})
		return
	}

	// Use a pointer so IngestGPSBatch can update the running totals in memory
	// across successive batches without re-querying the database.
	act := &found

	for {
		var msg activity.GPSBatchMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}
		if msg.Type != "gps_batch" {
			_ = conn.WriteJSON(fiber.Map{"type": "error", "message": "unsupported message type"})
			continue
		}
		stats, err := s.tracker.IngestGPSBatch(ctx, act, msg.Points)
		if err != nil {
			_ = conn.WriteJSON(fiber.Map{"type": "error", "message": err.Error()})
			continue
		}
		_ = conn.WriteJSON(fiber.Map{"type": "stats", "data": stats})
	}
}

func userContext(c *fiber.Ctx) (string, error) {
	userID := c.Get("X-User-Id")
	if userID == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "expected X-User-Id from authenticated API gateway")
	}
	return userID, nil
}

func errorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := err.Error()
	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		code = fiberErr.Code
		message = fiberErr.Message
	}
	return c.Status(code).JSON(fiber.Map{"error": fiber.Map{"message": message}})
}