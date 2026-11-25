package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/rules"
	"github.com/TakotsuboChen/sub-ui/internal/sub"
	"github.com/gin-gonic/gin"
)

func (s *Server) handleSubscription(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if token == "" {
		c.String(http.StatusBadRequest, "missing subscription token")
		return
	}

	var user model.User
	if err := s.db.Where("sub_token = ?", token).First(&user).Error; err != nil {
		c.String(http.StatusNotFound, "invalid subscription key")
		return
	}

	now := time.Now().Unix()
	if user.Status == "disabled" {
		c.String(http.StatusForbidden, "account disabled")
		return
	}
	if user.ExpiresAt > 0 && now >= user.ExpiresAt {
		c.String(http.StatusForbidden, "subscription expired")
		return
	}
	if user.QuotaBytes > 0 && user.UsedBytes >= user.QuotaBytes {
		c.String(http.StatusForbidden, "traffic quota exceeded")
		return
	}

	title := database.GetSetting(s.db, "sub_profile_title", "Sub-UI")
	intervalHours, _ := strconv.Atoi(database.GetSetting(s.db, "sub_update_interval_hours", "12"))
	headers := s.subGen.BuildHeaders(&user, title, intervalHours)
	for k, v := range headers {
		c.Header(k, v)
	}

	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return
	}

	queryTarget := c.Query("target")
	if queryTarget == "" {
		queryTarget = c.Query("format")
	}
	target := sub.DetectTarget(c.GetHeader("User-Agent"), queryTarget)

	preset, err := s.resolveUserPreset(&user, c.Query("preset"))
	if err != nil {
		c.String(http.StatusInternalServerError, "no rule preset configured")
		return
	}
	globalOv := s.loadOverride(0)
	userOv := s.loadOverride(user.ID)
	compiled, err := rules.CompileEffectiveConfig(preset, globalOv, userOv)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}

	agg, err := s.subGen.AggregateUserNodes(c.Request.Context(), &user, compiled.EnableTFO)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}

	switch target {
	case "clash":
		out, err := s.subGen.RenderClashYAML(agg, compiled)
		if err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		c.Header("Content-Type", "text/yaml; charset=utf-8")
		c.String(http.StatusOK, out)
	case "singbox":
		out, err := s.subGen.RenderSingboxJSON(agg, compiled)
		if err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		c.Header("Content-Type", "application/json; charset=utf-8")
		c.String(http.StatusOK, out)
	case "uri":
		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.String(http.StatusOK, s.subGen.RenderLinks(agg, false))
	default:
		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.String(http.StatusOK, s.subGen.RenderLinks(agg, true))
	}
}

func (s *Server) resolveUserPreset(user *model.User, overrideSlug string) (*model.RulePreset, error) {
	var preset model.RulePreset
	if overrideSlug != "" {
		if err := s.db.Where("slug = ? AND enabled = ?", overrideSlug, true).First(&preset).Error; err == nil {
			return &preset, nil
		}
	}
	if user.RulePresetID != nil {
		if err := s.db.Where("id = ? AND enabled = ?", *user.RulePresetID, true).First(&preset).Error; err == nil {
			return &preset, nil
		}
	}
	if err := s.db.Where("is_default = ? AND enabled = ?", true, true).First(&preset).Error; err == nil {
		return &preset, nil
	}
	if err := s.db.Where("enabled = ?", true).Order("sort_order ASC, id ASC").First(&preset).Error; err != nil {
		return nil, err
	}
	return &preset, nil
}

func (s *Server) loadOverride(userID uint) *model.UserRuleOverride {
	var ov model.UserRuleOverride
	if err := s.db.Where("user_id = ?", userID).First(&ov).Error; err != nil {
		return nil
	}
	return &ov
}
