package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/auth"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/rules"
	"github.com/TakotsuboChen/sub-ui/internal/sui"
	syncer "github.com/TakotsuboChen/sub-ui/internal/sync"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (s *Server) handleAdminOverview(c *gin.Context) {
	var totalUsers, activeUsers, onlineUsers, totalNodes, onlineNodes, paidOrders int64
	var revenueCents int64

	_ = s.db.Model(&model.User{}).Count(&totalUsers).Error
	_ = s.db.Model(&model.User{}).Where("status = ?", "active").Count(&activeUsers).Error
	_ = s.db.Model(&model.User{}).Where("last_online_at >= ?", time.Now().Add(-5*time.Minute).Unix()).Count(&onlineUsers).Error
	_ = s.db.Model(&model.Node{}).Where("enabled = ?", true).Count(&totalNodes).Error
	_ = s.db.Model(&model.Node{}).Where("enabled = ? AND online_status = ?", true, "online").Count(&onlineNodes).Error
	_ = s.db.Model(&model.Order{}).Where("status = ?", "paid").Count(&paidOrders).Error
	_ = s.db.Model(&model.Order{}).Where("status = ?", "paid").Select("COALESCE(SUM(amount_cents),0)").Scan(&revenueCents).Error

	since := time.Now().Add(-14 * 24 * time.Hour).Unix()
	var tLogs []model.TrafficLog
	_ = s.db.Where("bucket_time >= ?", since).Order("bucket_time ASC").Find(&tLogs).Error

	type dayTraffic struct {
		Date          string `json:"date"`
		WeightedBytes int64  `json:"weightedBytes"`
		RawBytes      int64  `json:"rawBytes"`
	}
	dayMap := map[string]*dayTraffic{}
	var totalTraffic14d int64
	for _, l := range tLogs {
		d := time.Unix(l.BucketTime, 0).Format("01-02")
		entry, ok := dayMap[d]
		if !ok {
			entry = &dayTraffic{Date: d}
			dayMap[d] = entry
		}
		entry.WeightedBytes += l.WeightedBytes
		entry.RawBytes += l.RawUp + l.RawDown
		totalTraffic14d += l.WeightedBytes
	}
	series := make([]dayTraffic, 0, 14)
	for i := 13; i >= 0; i-- {
		d := time.Now().AddDate(0, 0, -i).Format("01-02")
		if entry, ok := dayMap[d]; ok {
			series = append(series, *entry)
		} else {
			series = append(series, dayTraffic{Date: d})
		}
	}

	var nodes []model.Node
	_ = s.db.Order("sort_order ASC, id ASC").Find(&nodes).Error

	c.JSON(http.StatusOK, gin.H{
		"kpi": gin.H{
			"totalUsers":      totalUsers,
			"activeUsers":     activeUsers,
			"onlineUsers":     onlineUsers,
			"totalNodes":      totalNodes,
			"onlineNodes":     onlineNodes,
			"paidOrders":      paidOrders,
			"revenueCents":    revenueCents,
			"totalTraffic14d": totalTraffic14d,
		},
		"trafficSeries": series,
		"nodes":         nodes,
	})
}

// --- Nodes ---

func (s *Server) handleAdminListNodes(c *gin.Context) {
	var nodes []model.Node
	_ = s.db.Order("sort_order ASC, id ASC").Find(&nodes).Error
	c.JSON(http.StatusOK, gin.H{"nodes": nodes})
}

func (s *Server) handleAdminCreateNode(c *gin.Context) {
	var node model.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if node.NodeType == "" {
		node.NodeType = "sui"
	}
	if node.TrafficMultiplier < 0 {
		node.TrafficMultiplier = 1
	}
	if node.DefaultInboundsJSON == "" {
		node.DefaultInboundsJSON = "[]"
	}
	node.OnlineStatus = "unknown"
	if err := s.db.Create(&node).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"node": node})
}

func (s *Server) handleAdminUpdateNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var existing model.Node
	if err := s.db.First(&existing, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "节点不存在"})
		return
	}
	var req model.Node
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.ID = existing.ID
	req.CreatedAt = existing.CreatedAt
	if req.APIToken == "" {
		req.APIToken = existing.APIToken
	}
	if err := s.db.Save(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"node": req})
}

func (s *Server) handleAdminDeleteNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	_ = s.db.Where("node_id = ?", id).Delete(&model.UserNodeBinding{}).Error
	_ = s.db.Delete(&model.Node{}, id).Error
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleAdminTestNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var node model.Node
	if err := s.db.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "节点不存在"})
		return
	}
	if node.NodeType != "sui" {
		c.JSON(http.StatusOK, gin.H{"ok": true, "message": "外部订阅源格式校验通过"})
		return
	}
	client, err := s.syncEngine.NewNodeClient(&node)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	loadObj, err := client.Load(ctx)
	if err != nil {
		_ = s.db.Model(&model.Node{}).Where("id = ?", node.ID).Updates(map[string]any{
			"online_status": "offline",
			"last_error":    err.Error(),
		}).Error
		c.JSON(http.StatusBadGateway, gin.H{"ok": false, "error": err.Error()})
		return
	}
	updates := map[string]any{
		"online_status": "online",
		"last_error":    "",
		"last_sync_at":  time.Now().Unix(),
	}
	if loadObj.SubURI != "" && node.SubBaseURL == "" {
		updates["sub_base_url"] = strings.TrimRight(loadObj.SubURI, "/")
	}
	_ = s.db.Model(&model.Node{}).Where("id = ?", node.ID).Updates(updates).Error

	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"subURI":       loadObj.SubURI,
		"inboundCount": len(loadObj.Inbounds),
		"clientCount":  len(loadObj.Clients),
		"onlineUsers":  len(loadObj.Onlines.User),
	})
}

func (s *Server) handleAdminSyncAll(c *gin.Context) {
	summary, err := s.syncEngine.SyncAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, summary)
}

func (s *Server) handleAdminInspectRemoteNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var node model.Node
	if err := s.db.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "节点不存在"})
		return
	}
	client, err := s.syncEngine.NewNodeClient(&node)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	loadObj, err := client.Load(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"inbounds": loadObj.Inbounds,
		"clients":  loadObj.Clients,
		"onlines":  loadObj.Onlines,
		"subURI":   loadObj.SubURI,
	})
}

func (s *Server) handleAdminImportSUIClient(c *gin.Context) {
	nodeID, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		UserID        uint   `json:"userId" binding:"required"`
		SUIClientID   uint   `json:"suiClientId" binding:"required"`
		SUIClientName string `json:"suiClientName" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var node model.Node
	if err := s.db.First(&node, nodeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "节点不存在"})
		return
	}
	client, err := s.syncEngine.NewNodeClient(&node)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	list, err := client.GetClients(c.Request.Context(), req.SUIClientID)
	if err != nil || len(list) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取远端 S-UI 客户端失败"})
		return
	}
	remote := list[0]
	var binding model.UserNodeBinding
	_ = s.db.Where("user_id = ? AND node_id = ?", req.UserID, node.ID).First(&binding).Error
	binding.UserID = req.UserID
	binding.NodeID = node.ID
	binding.SUIClientID = remote.ID
	binding.SUIClientName = remote.Name
	binding.LastRawUp = remote.Up
	binding.LastRawDown = remote.Down
	binding.SyncedEnable = remote.Enable
	binding.LastError = ""
	if err := s.db.Save(&binding).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"binding": binding})
}

// --- Users ---

func (s *Server) handleAdminListUsers(c *gin.Context) {
	var users []model.User
	q := s.db.Order("id DESC")
	if kw := strings.TrimSpace(c.Query("q")); kw != "" {
		like := "%" + kw + "%"
		q = q.Where("username LIKE ? OR email LIKE ? OR remark LIKE ?", like, like, like)
	}
	_ = q.Find(&users).Error
	c.JSON(http.StatusOK, gin.H{"users": users})
}

func (s *Server) handleAdminCreateUser(c *gin.Context) {
	var req struct {
		Username   string `json:"username" binding:"required,min=3"`
		Password   string `json:"password" binding:"required,min=6"`
		Email      string `json:"email"`
		Role       string `json:"role"`
		PlanID     *uint  `json:"planId"`
		QuotaBytes int64  `json:"quotaBytes"`
		ExpiresAt  int64  `json:"expiresAt"`
		ResetMode  string `json:"resetMode"`
		CycleDays  int    `json:"cycleDays"`
		Remark     string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	subTok, _ := auth.GenerateRandomHex(16)
	role := "user"
	if req.Role == "admin" {
		role = "admin"
	}
	resetMode := req.ResetMode
	if resetMode == "" {
		resetMode = "monthly_anniversary"
	}
	cycleDays := req.CycleDays
	if cycleDays <= 0 {
		cycleDays = 30
	}

	user := &model.User{
		Username:     strings.TrimSpace(req.Username),
		Email:        strings.TrimSpace(req.Email),
		PasswordHash: hash,
		Role:         role,
		Status:       "active",
		SubToken:     subTok,
		PlanID:       req.PlanID,
		QuotaBytes:   req.QuotaBytes,
		ExpiresAt:    req.ExpiresAt,
		ResetMode:    resetMode,
		CycleDays:    cycleDays,
		NextResetAt:  syncer.ComputeNextReset(resetMode, cycleDays, time.Now().Unix()),
		Remark:       req.Remark,
	}
	if err := s.db.Create(user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (s *Server) handleAdminUpdateUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var existing model.User
	if err := s.db.First(&existing, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	var req struct {
		Email        string `json:"email"`
		Role         string `json:"role"`
		Status       string `json:"status"`
		BalanceCents *int64 `json:"balanceCents"`
		PlanID       *uint  `json:"planId"`
		QuotaBytes   *int64 `json:"quotaBytes"`
		UsedBytes    *int64 `json:"usedBytes"`
		ExpiresAt    *int64 `json:"expiresAt"`
		ResetMode    string `json:"resetMode"`
		CycleDays    *int   `json:"cycleDays"`
		RulePresetID *uint  `json:"rulePresetId"`
		Password     string `json:"password"`
		Remark       string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]any{
		"email":  req.Email,
		"remark": req.Remark,
	}
	if req.Role == "admin" || req.Role == "user" {
		updates["role"] = req.Role
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}
	if req.BalanceCents != nil {
		updates["balance_cents"] = *req.BalanceCents
	}
	if req.PlanID != nil {
		updates["plan_id"] = *req.PlanID
	}
	if req.QuotaBytes != nil {
		updates["quota_bytes"] = *req.QuotaBytes
	}
	if req.UsedBytes != nil {
		updates["used_bytes"] = *req.UsedBytes
	}
	if req.ExpiresAt != nil {
		updates["expires_at"] = *req.ExpiresAt
	}
	if req.ResetMode != "" {
		updates["reset_mode"] = req.ResetMode
	}
	if req.CycleDays != nil {
		updates["cycle_days"] = *req.CycleDays
	}
	if req.RulePresetID != nil {
		updates["rule_preset_id"] = *req.RulePresetID
	}
	if strings.TrimSpace(req.Password) != "" {
		if hash, err := auth.HashPassword(req.Password); err == nil {
			updates["password_hash"] = hash
		}
	}

	if err := s.db.Model(&model.User{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = s.db.First(&existing, existing.ID).Error

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = s.syncEngine.ProvisionUserToNodes(ctx, &existing, s.planAllowedNodes(existing.PlanID))
	}()

	c.JSON(http.StatusOK, gin.H{"user": existing})
}

func (s *Server) handleAdminDeleteUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	me := auth.CurrentUser(c)
	if uint(id) == me.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除当前登录管理员"})
		return
	}
	var bindings []model.UserNodeBinding
	_ = s.db.Where("user_id = ?", id).Find(&bindings).Error
	for _, b := range bindings {
		var node model.Node
		if s.db.First(&node, b.NodeID).Error == nil && node.NodeType == "sui" && b.SUIClientID > 0 {
			if cl, err := s.syncEngine.NewNodeClient(&node); err == nil {
				_ = cl.DeleteClient(c.Request.Context(), b.SUIClientID)
			}
		}
	}
	_ = s.db.Where("user_id = ?", id).Delete(&model.UserNodeBinding{}).Error
	_ = s.db.Where("user_id = ?", id).Delete(&model.UserRuleOverride{}).Error
	_ = s.db.Delete(&model.User{}, id).Error
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleAdminResetUserTraffic(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var u model.User
	if err := s.db.First(&u, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if err := s.syncEngine.ResetUserTraffic(c.Request.Context(), &u, "manual"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

func (s *Server) handleAdminProvisionUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var u model.User
	if err := s.db.First(&u, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if err := s.syncEngine.ProvisionUserToNodes(c.Request.Context(), &u, s.planAllowedNodes(u.PlanID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var bindings []model.UserNodeBinding
	_ = s.db.Where("user_id = ?", u.ID).Find(&bindings).Error
	c.JSON(http.StatusOK, gin.H{"bindings": bindings})
}

func (s *Server) handleAdminRotateUserToken(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	tok, _ := auth.GenerateRandomHex(16)
	_ = s.db.Model(&model.User{}).Where("id = ?", id).Update("sub_token", tok).Error
	c.JSON(http.StatusOK, gin.H{"subToken": tok})
}

func (s *Server) handleAdminUserBindings(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var bindings []model.UserNodeBinding
	_ = s.db.Where("user_id = ?", id).Find(&bindings).Error
	c.JSON(http.StatusOK, gin.H{"bindings": bindings})
}

// --- Rule Presets & Global Override ---

func (s *Server) handleAdminListPresets(c *gin.Context) {
	var presets []model.RulePreset
	_ = s.db.Order("sort_order ASC, id ASC").Find(&presets).Error
	c.JSON(http.StatusOK, gin.H{"presets": presets})
}

func (s *Server) handleAdminCreatePreset(c *gin.Context) {
	var p model.RulePreset
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if p.Slug == "" {
		p.Slug = "preset-" + uuid.NewString()[:8]
	}
	if p.IsDefault {
		_ = s.db.Model(&model.RulePreset{}).Where("is_default = ?", true).Update("is_default", false).Error
	}
	if err := s.db.Create(&p).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"preset": p})
}

func (s *Server) handleAdminUpdatePreset(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var existing model.RulePreset
	if err := s.db.First(&existing, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "规则预设不存在"})
		return
	}
	var req model.RulePreset
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.ID = existing.ID
	req.CreatedAt = existing.CreatedAt
	if req.IsDefault {
		_ = s.db.Model(&model.RulePreset{}).Where("id != ?", req.ID).Update("is_default", false).Error
	}
	if err := s.db.Save(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"preset": req})
}

func (s *Server) handleAdminDeletePreset(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	_ = s.db.Delete(&model.RulePreset{}, id).Error
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleAdminImportINI(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		INIURL      string `json:"iniUrl"`
		INIContent  string `json:"iniContent"`
		IsDefault   bool   `json:"isDefault"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var parsed *rules.PresetConfig
	var err error
	if strings.TrimSpace(req.INIContent) != "" {
		parsed = rules.ParseSubconverterINI(req.INIContent)
	} else if strings.TrimSpace(req.INIURL) != "" {
		parsed, err = rules.FetchAndParseSubconverterINI(req.INIURL)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "拉取 INI 失败: " + err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 INI 链接或内容"})
		return
	}
	cfgBytes, _ := json.Marshal(parsed)
	if req.IsDefault {
		_ = s.db.Model(&model.RulePreset{}).Where("is_default = ?", true).Update("is_default", false).Error
	}
	p := &model.RulePreset{
		Slug:          "ini-" + uuid.NewString()[:8],
		Name:          req.Name,
		Description:   req.Description,
		Category:      "acl4ssr",
		SourceINIURL:  req.INIURL,
		ConfigJSON:    string(cfgBytes),
		IsDefault:     req.IsDefault,
		Enabled:       true,
		LastFetchedAt: time.Now().Unix(),
	}
	if err := s.db.Create(p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"preset": p})
}

func (s *Server) handleAdminGetGlobalOverride(c *gin.Context) {
	ov := s.loadOverride(0)
	if ov == nil {
		ov = &model.UserRuleOverride{UserID: 0, PrependRulesJSON: "[]", AppendRulesJSON: "[]", DisabledRulesJSON: "[]", GroupRewritesJSON: "{}", CustomGroupsJSON: "[]"}
	}
	c.JSON(http.StatusOK, gin.H{"override": ov})
}

func (s *Server) handleAdminSaveGlobalOverride(c *gin.Context) {
	var req model.UserRuleOverride
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var existing model.UserRuleOverride
	_ = s.db.Where("user_id = 0").First(&existing).Error
	existing.UserID = 0
	existing.PrependRulesJSON = nonEmptyOr(req.PrependRulesJSON, "[]")
	existing.AppendRulesJSON = nonEmptyOr(req.AppendRulesJSON, "[]")
	existing.DisabledRulesJSON = nonEmptyOr(req.DisabledRulesJSON, "[]")
	existing.GroupRewritesJSON = nonEmptyOr(req.GroupRewritesJSON, "{}")
	existing.CustomGroupsJSON = nonEmptyOr(req.CustomGroupsJSON, "[]")
	existing.EnableTFO = req.EnableTFO
	existing.EnableAdBlock = req.EnableAdBlock
	existing.DNSMode = req.DNSMode
	if err := s.db.Save(&existing).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"override": existing})
}

// --- Plans & Orders & Invites & CDKs ---

func (s *Server) handleAdminListPlans(c *gin.Context) {
	var plans []model.Plan
	_ = s.db.Order("sort_order ASC, id ASC").Find(&plans).Error
	c.JSON(http.StatusOK, gin.H{"plans": plans})
}

func (s *Server) handleAdminCreatePlan(c *gin.Context) {
	var p model.Plan
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if p.NodeIDsJSON == "" {
		p.NodeIDsJSON = "[]"
	}
	if err := s.db.Create(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"plan": p})
}

func (s *Server) handleAdminUpdatePlan(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var existing model.Plan
	if err := s.db.First(&existing, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "套餐不存在"})
		return
	}
	var req model.Plan
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.ID = existing.ID
	req.CreatedAt = existing.CreatedAt
	if err := s.db.Save(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"plan": req})
}

func (s *Server) handleAdminDeletePlan(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	_ = s.db.Delete(&model.Plan{}, id).Error
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleAdminListOrders(c *gin.Context) {
	var orders []model.Order
	_ = s.db.Order("id DESC").Limit(100).Find(&orders).Error
	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func (s *Server) handleAdminMarkOrderPaid(c *gin.Context) {
	if err := s.paySvc.FulfillOrder(c.Request.Context(), c.Param("orderNo"), "MANUAL-"+time.Now().Format("20060102150405")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleAdminListInvites(c *gin.Context) {
	var codes []model.InviteCode
	_ = s.db.Order("id DESC").Find(&codes).Error
	c.JSON(http.StatusOK, gin.H{"invites": codes})
}

func (s *Server) handleAdminBatchCreateInvites(c *gin.Context) {
	me := auth.CurrentUser(c)
	var req struct {
		Count           int    `json:"count"`
		MaxUses         int    `json:"maxUses"`
		BonusDays       int    `json:"bonusDays"`
		BonusQuotaBytes int64  `json:"bonusQuotaBytes"`
		ExpiresAt       int64  `json:"expiresAt"`
		Remark          string `json:"remark"`
		Prefix          string `json:"prefix"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Count <= 0 || req.Count > 100 {
		req.Count = 5
	}
	if req.MaxUses < 0 {
		req.MaxUses = 1
	}
	created := make([]model.InviteCode, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		rnd, _ := auth.GenerateRandomHex(5)
		code := strings.ToUpper(req.Prefix + rnd)
		item := model.InviteCode{
			Code:            code,
			CreatorID:       me.ID,
			MaxUses:         req.MaxUses,
			BonusDays:       req.BonusDays,
			BonusQuotaBytes: req.BonusQuotaBytes,
			ExpiresAt:       req.ExpiresAt,
			Enabled:         true,
			Remark:          req.Remark,
		}
		if err := s.db.Create(&item).Error; err == nil {
			created = append(created, item)
		}
	}
	c.JSON(http.StatusOK, gin.H{"invites": created})
}

func (s *Server) handleAdminDeleteInvite(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	_ = s.db.Delete(&model.InviteCode{}, id).Error
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleAdminListCDKs(c *gin.Context) {
	var codes []model.RedemptionCode
	_ = s.db.Order("id DESC").Limit(200).Find(&codes).Error
	c.JSON(http.StatusOK, gin.H{"cdks": codes})
}

func (s *Server) handleAdminBatchCreateCDKs(c *gin.Context) {
	var req struct {
		Count        int    `json:"count"`
		RewardType   string `json:"rewardType" binding:"required"`
		PlanID       *uint  `json:"planId"`
		AmountCents  int64  `json:"amountCents"`
		DurationDays int    `json:"durationDays"`
		QuotaBytes   int64  `json:"quotaBytes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Count <= 0 || req.Count > 100 {
		req.Count = 10
	}
	batch := fmt.Sprintf("B%s", time.Now().Format("0601021504"))
	created := make([]model.RedemptionCode, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		rnd, _ := auth.GenerateRandomHex(8)
		code := "SUB-" + strings.ToUpper(rnd[:4]+"-"+rnd[4:8]+"-"+rnd[8:12])
		item := model.RedemptionCode{
			Code:         code,
			BatchNo:      batch,
			RewardType:   req.RewardType,
			PlanID:       req.PlanID,
			AmountCents:  req.AmountCents,
			DurationDays: req.DurationDays,
			QuotaBytes:   req.QuotaBytes,
			Enabled:      true,
		}
		if err := s.db.Create(&item).Error; err == nil {
			created = append(created, item)
		}
	}
	c.JSON(http.StatusOK, gin.H{"cdks": created})
}

func (s *Server) handleAdminDeleteCDK(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	_ = s.db.Delete(&model.RedemptionCode{}, id).Error
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleAdminGetSettings(c *gin.Context) {
	var rows []model.Setting
	_ = s.db.Where("key != ?", "jwt_secret").Find(&rows).Error
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		out[r.Key] = r.Value
	}
	c.JSON(http.StatusOK, gin.H{"settings": out})
}

func (s *Server) handleAdminUpdateSettings(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for k, v := range req {
		if k == "jwt_secret" {
			continue
		}
		_ = s.db.Save(&model.Setting{Key: k, Value: v}).Error
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) planAllowedNodes(planID *uint) []uint {
	if planID == nil {
		return nil
	}
	var p model.Plan
	if err := s.db.First(&p, *planID).Error; err != nil {
		return nil
	}
	var ids []uint
	_ = json.Unmarshal([]byte(p.NodeIDsJSON), &ids)
	return ids
}

var _ = sui.ClientObj{}
var _ = gorm.ErrRecordNotFound
