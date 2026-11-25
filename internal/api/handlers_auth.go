package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/auth"
	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/version"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (s *Server) handlePublicMeta(c *gin.Context) {
	var count int64
	_ = s.db.Model(&model.User{}).Where("role = ?", "admin").Count(&count).Error

	c.JSON(http.StatusOK, gin.H{
		"version":               version.Get(),
		"siteName":              database.GetSetting(s.db, "site_name", "Sub-UI"),
		"siteSubtitle":        database.GetSetting(s.db, "site_subtitle", "S-UI 多节点订阅聚合与精细化分流控制面板"),
		"announcement":        database.GetSetting(s.db, "announcement", ""),
		"registrationEnabled": database.GetSetting(s.db, "registration_enabled", "true") == "true",
		"inviteCodeRequired":  database.GetSetting(s.db, "invite_code_required", "false") == "true",
		"allowUserRuleOverride": database.GetSetting(s.db, "allow_user_rule_override", "true") == "true",
		"setupRequired":       count == 0,
		"paymentChannels":     s.paySvc.EnabledChannels(),
	})
}

func (s *Server) handleSetup(c *gin.Context) {
	var count int64
	if err := s.db.Model(&model.User{}).Count(&count).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if count > 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "系统已初始化，请直接登录"})
		return
	}

	var req struct {
		Username string `json:"username" binding:"required,min=3,max=48"`
		Password string `json:"password" binding:"required,min=6,max=128"`
		Email    string `json:"email"`
		SiteName string `json:"siteName"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名至少3位，密码至少6位"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	subToken, err := auth.GenerateRandomHex(16)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	admin := &model.User{
		Username:     strings.TrimSpace(req.Username),
		Email:        strings.TrimSpace(req.Email),
		PasswordHash: hash,
		Role:         "admin",
		Status:       "active",
		SubToken:     subToken,
	}
	if err := s.db.Create(admin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(req.SiteName) != "" {
		_ = s.db.Save(&model.Setting{Key: "site_name", Value: strings.TrimSpace(req.SiteName)}).Error
	}

	s.respondWithAuth(c, admin)
}

func (s *Server) handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入用户名和密码"})
		return
	}

	var user model.User
	uname := strings.TrimSpace(req.Username)
	if err := s.db.Where("username = ? OR (email != '' AND email = ?)", uname, uname).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}
	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}
	if user.Status == "disabled" {
		c.JSON(http.StatusForbidden, gin.H{"error": "账号已被管理员禁用"})
		return
	}

	s.respondWithAuth(c, &user)
}

func (s *Server) handleRegister(c *gin.Context) {
	if database.GetSetting(s.db, "registration_enabled", "true") != "true" {
		c.JSON(http.StatusForbidden, gin.H{"error": "当前已关闭新用户注册"})
		return
	}

	var req struct {
		Username   string `json:"username" binding:"required,min=3,max=48"`
		Password   string `json:"password" binding:"required,min=6,max=128"`
		Email      string `json:"email"`
		InviteCode string `json:"inviteCode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名至少3位，密码至少6位"})
		return
	}

	uname := strings.TrimSpace(req.Username)
	var existing int64
	_ = s.db.Model(&model.User{}).Where("username = ?", uname).Count(&existing).Error
	if existing > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
		return
	}

	inviteRequired := database.GetSetting(s.db, "invite_code_required", "false") == "true"
	codeStr := strings.TrimSpace(req.InviteCode)
	if inviteRequired && codeStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前站点开启了邀请码注册，请填写邀请码"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	subToken, err := auth.GenerateRandomHex(16)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var newUser model.User
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var inviterID *uint
		var bonusDays int
		var bonusQuota int64
		now := time.Now().Unix()

		if codeStr != "" {
			var inv model.InviteCode
			if err := tx.Where("code = ? AND enabled = ?", codeStr, true).First(&inv).Error; err != nil {
				return gorm.ErrRecordNotFound
			}
			if inv.ExpiresAt > 0 && inv.ExpiresAt < now {
				return ErrInviteExpired
			}
			if inv.MaxUses > 0 && inv.UsedCount >= inv.MaxUses {
				return ErrInviteExhausted
			}
			res := tx.Model(&model.InviteCode{}).
				Where("id = ? AND (max_uses = 0 OR used_count < max_uses)", inv.ID).
				Update("used_count", gorm.Expr("used_count + 1"))
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return ErrInviteExhausted
			}
			inviterID = &inv.CreatorID
			bonusDays = inv.BonusDays
			bonusQuota = inv.BonusQuotaBytes
		}

		var defaultPreset model.RulePreset
		var presetID *uint
		if tx.Where("is_default = ? AND enabled = ?", true, true).First(&defaultPreset).Error == nil {
			presetID = &defaultPreset.ID
		}

		var expiresAt int64
		if bonusDays > 0 {
			expiresAt = now + int64(bonusDays)*86400
		}

		newUser = model.User{
			Username:       uname,
			Email:          strings.TrimSpace(req.Email),
			PasswordHash:   hash,
			Role:           "user",
			Status:         "active",
			SubToken:       subToken,
			QuotaBytes:     bonusQuota,
			ExpiresAt:      expiresAt,
			RulePresetID:   presetID,
			InvitedByID:    inviterID,
			InviteCodeUsed: codeStr,
		}
		return tx.Create(&newUser).Error
	})
	if err != nil {
		switch err {
		case gorm.ErrRecordNotFound:
			c.JSON(http.StatusBadRequest, gin.H{"error": "邀请码不存在或已禁用"})
		case ErrInviteExpired:
			c.JSON(http.StatusBadRequest, gin.H{"error": "邀请码已过期"})
		case ErrInviteExhausted:
			c.JSON(http.StatusBadRequest, gin.H{"error": "邀请码使用次数已用尽"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	s.respondWithAuth(c, &newUser)
}

func (s *Server) handleLogout(c *gin.Context) {
	c.SetCookie("subui_token", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleMe(c *gin.Context) {
	u := auth.CurrentUser(c)
	c.JSON(http.StatusOK, gin.H{"user": u})
}

func (s *Server) respondWithAuth(c *gin.Context, u *model.User) {
	token, err := auth.IssueJWT(s.jwtSecret(), u, 7*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.SetCookie("subui_token", token, 7*86400, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  u,
	})
}
