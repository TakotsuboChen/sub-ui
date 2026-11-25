package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/auth"
	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/rules"
	"github.com/TakotsuboChen/sub-ui/internal/sub"
	syncer "github.com/TakotsuboChen/sub-ui/internal/sync"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (s *Server) handleUserDashboard(c *gin.Context) {
	u := auth.CurrentUser(c)

	var plan *model.Plan
	var allowedNodes map[uint]bool
	if u.PlanID != nil {
		var p model.Plan
		if err := s.db.First(&p, *u.PlanID).Error; err == nil {
			plan = &p
			var ids []uint
			if json.Unmarshal([]byte(p.NodeIDsJSON), &ids) == nil && len(ids) > 0 {
				allowedNodes = make(map[uint]bool, len(ids))
				for _, id := range ids {
					allowedNodes[id] = true
				}
			}
		}
	}

	var allNodes []model.Node
	_ = s.db.Where("enabled = ?", true).Order("sort_order ASC, id ASC").Find(&allNodes).Error

	type nodeView struct {
		ID                uint    `json:"id"`
		Name              string  `json:"name"`
		Region            string  `json:"region"`
		NodeType          string  `json:"nodeType"`
		TrafficMultiplier float64 `json:"trafficMultiplier"`
		OnlineStatus      string  `json:"onlineStatus"`
		OnlineCount       int     `json:"onlineCount"`
		LastSyncAt        int64   `json:"lastSyncAt"`
		EnabledForUser    bool    `json:"enabledForUser"`
	}
	nodeViews := make([]nodeView, 0, len(allNodes))
	nodeNameMap := map[uint]string{}
	for _, n := range allNodes {
		nodeNameMap[n.ID] = n.Name
		okForUser := allowedNodes == nil || allowedNodes[n.ID]
		nodeViews = append(nodeViews, nodeView{
			ID:                n.ID,
			Name:              n.Name,
			Region:            n.Region,
			NodeType:          n.NodeType,
			TrafficMultiplier: n.TrafficMultiplier,
			OnlineStatus:      n.OnlineStatus,
			OnlineCount:       n.OnlineCount,
			LastSyncAt:        n.LastSyncAt,
			EnabledForUser:    okForUser,
		})
	}

	since := time.Now().Add(-14 * 24 * time.Hour).Unix()
	var logs []model.TrafficLog
	_ = s.db.Where("user_id = ? AND bucket_time >= ?", u.ID, since).Order("bucket_time ASC").Find(&logs).Error

	type dayAgg struct {
		Date          string `json:"date"`
		RawUp         int64  `json:"rawUp"`
		RawDown       int64  `json:"rawDown"`
		WeightedBytes int64  `json:"weightedBytes"`
	}
	dailyMap := map[string]*dayAgg{}
	nodeUsageMap := map[uint]int64{}
	for _, l := range logs {
		d := time.Unix(l.BucketTime, 0).Format("01-02")
		entry, ok := dailyMap[d]
		if !ok {
			entry = &dayAgg{Date: d}
			dailyMap[d] = entry
		}
		entry.RawUp += l.RawUp
		entry.RawDown += l.RawDown
		entry.WeightedBytes += l.WeightedBytes
		nodeUsageMap[l.NodeID] += l.WeightedBytes
	}

	dailySeries := make([]dayAgg, 0, 14)
	for i := 13; i >= 0; i-- {
		d := time.Now().AddDate(0, 0, -i).Format("01-02")
		if entry, ok := dailyMap[d]; ok {
			dailySeries = append(dailySeries, *entry)
		} else {
			dailySeries = append(dailySeries, dayAgg{Date: d})
		}
	}

	type nodeBreakdown struct {
		NodeID   uint   `json:"nodeId"`
		NodeName string `json:"nodeName"`
		Bytes    int64  `json:"bytes"`
	}
	breakdown := make([]nodeBreakdown, 0, len(nodeUsageMap))
	for nid, bytes := range nodeUsageMap {
		name := nodeNameMap[nid]
		if name == "" {
			name = "未知节点"
		}
		breakdown = append(breakdown, nodeBreakdown{NodeID: nid, NodeName: name, Bytes: bytes})
	}

	var resets []model.TrafficResetHistory
	_ = s.db.Where("user_id = ?", u.ID).Order("id DESC").Limit(10).Find(&resets).Error

	baseURL := s.publicBaseURL(c)
	subURL := baseURL + "/s/" + u.SubToken

	c.JSON(http.StatusOK, gin.H{
		"user":          u,
		"plan":          plan,
		"subUrl":        subURL,
		"nodes":         nodeViews,
		"dailyTraffic":  dailySeries,
		"nodeBreakdown": breakdown,
		"resetHistory":  resets,
	})
}

func (s *Server) handleRotateMySubToken(c *gin.Context) {
	u := auth.CurrentUser(c)
	token, err := auth.GenerateRandomHex(16)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := s.db.Model(&model.User{}).Where("id = ?", u.ID).Update("sub_token", token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u.SubToken = token
	c.JSON(http.StatusOK, gin.H{
		"subToken": token,
		"subUrl":   s.publicBaseURL(c) + "/s/" + token,
	})
}

func (s *Server) handleChangePassword(c *gin.Context) {
	u := auth.CurrentUser(c)
	var req struct {
		OldPassword string `json:"oldPassword" binding:"required"`
		NewPassword string `json:"newPassword" binding:"required,min=6,max=128"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码长度至少6位"})
		return
	}
	if !auth.CheckPassword(u.PasswordHash, req.OldPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "原密码错误"})
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := s.db.Model(&model.User{}).Where("id = ?", u.ID).Update("password_hash", hash).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) handleGetMyRules(c *gin.Context) {
	u := auth.CurrentUser(c)
	var presets []model.RulePreset
	_ = s.db.Where("enabled = ?", true).Order("sort_order ASC, id ASC").Find(&presets).Error

	activePreset, err := s.resolveUserPreset(u, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "暂无可用规则预设"})
		return
	}
	globalOv := s.loadOverride(0)
	userOv := s.loadOverride(u.ID)
	if userOv == nil {
		userOv = &model.UserRuleOverride{
			UserID:            u.ID,
			PrependRulesJSON:  "[]",
			AppendRulesJSON:   "[]",
			DisabledRulesJSON: "[]",
			GroupRewritesJSON: "{}",
			CustomGroupsJSON:  "[]",
		}
	}

	compiled, err := rules.CompileEffectiveConfig(activePreset, globalOv, userOv)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"presets":        presets,
		"selectedPreset": activePreset,
		"override":       userOv,
		"globalOverride": globalOv,
		"compiled":       compiled,
		"allowOverride":  database.GetSetting(s.db, "allow_user_rule_override", "true") == "true",
	})
}

func (s *Server) handleSaveMyRules(c *gin.Context) {
	u := auth.CurrentUser(c)
	if database.GetSetting(s.db, "allow_user_rule_override", "true") != "true" && u.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "管理员已禁止用户自定义规则覆盖"})
		return
	}

	var req struct {
		RulePresetID      *uint  `json:"rulePresetId"`
		PrependRulesJSON  string `json:"prependRulesJson"`
		AppendRulesJSON   string `json:"appendRulesJson"`
		DisabledRulesJSON string `json:"disabledRulesJson"`
		GroupRewritesJSON string `json:"groupRewritesJson"`
		CustomGroupsJSON  string `json:"customGroupsJson"`
		EnableTFO         *bool  `json:"enableTfo"`
		EnableAdBlock     *bool  `json:"enableAdBlock"`
		DNSMode           string `json:"dnsMode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.RulePresetID != nil {
		_ = s.db.Model(&model.User{}).Where("id = ?", u.ID).Update("rule_preset_id", *req.RulePresetID).Error
		u.RulePresetID = req.RulePresetID
	}

	var existing model.UserRuleOverride
	if err := s.db.Where("user_id = ?", u.ID).First(&existing).Error; err != nil {
		existing = model.UserRuleOverride{UserID: u.ID}
	}
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

	preset, _ := s.resolveUserPreset(u, "")
	compiled, _ := rules.CompileEffectiveConfig(preset, s.loadOverride(0), &existing)
	c.JSON(http.StatusOK, gin.H{"override": existing, "compiled": compiled})
}

func (s *Server) handleSimulateMyRules(c *gin.Context) {
	u := auth.CurrentUser(c)
	var req struct {
		Target string `json:"target" binding:"required"`
		Preset string `json:"preset"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入测试域名或 IP"})
		return
	}
	preset, err := s.resolveUserPreset(u, req.Preset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	compiled, err := rules.CompileEffectiveConfig(preset, s.loadOverride(0), s.loadOverride(u.ID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	res := rules.SimulateMatch(compiled, req.Target)
	c.JSON(http.StatusOK, res)
}

func (s *Server) handlePreviewMyRules(c *gin.Context) {
	u := auth.CurrentUser(c)
	target := sub.DetectTarget("", c.DefaultQuery("target", "clash"))
	preset, err := s.resolveUserPreset(u, c.Query("preset"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	compiled, err := rules.CompileEffectiveConfig(preset, s.loadOverride(0), s.loadOverride(u.ID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	agg, err := s.subGen.AggregateUserNodes(c.Request.Context(), u, compiled.EnableTFO)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var content string
	switch target {
	case "singbox":
		content, err = s.subGen.RenderSingboxJSON(agg, compiled)
	case "uri":
		content = s.subGen.RenderLinks(agg, false)
	default:
		content, err = s.subGen.RenderClashYAML(agg, compiled)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"target": target, "content": content, "nodeCount": len(agg.Proxies)})
}

func (s *Server) handleListActivePlans(c *gin.Context) {
	var plans []model.Plan
	_ = s.db.Where("enabled = ?", true).Order("sort_order ASC, id ASC").Find(&plans).Error
	c.JSON(http.StatusOK, gin.H{
		"plans":    plans,
		"channels": s.paySvc.EnabledChannels(),
	})
}

func (s *Server) handleListMyOrders(c *gin.Context) {
	u := auth.CurrentUser(c)
	var orders []model.Order
	_ = s.db.Where("user_id = ?", u.ID).Order("id DESC").Limit(50).Find(&orders).Error
	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func (s *Server) handleCreateOrder(c *gin.Context) {
	u := auth.CurrentUser(c)
	var req struct {
		PlanID         uint   `json:"planId" binding:"required"`
		OrderType      string `json:"orderType"`
		PaymentChannel string `json:"paymentChannel" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择套餐和支付方式"})
		return
	}

	var plan model.Plan
	if err := s.db.Where("id = ? AND enabled = ?", req.PlanID, true).First(&plan).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "套餐不存在或已下架"})
		return
	}

	orderType := req.OrderType
	if orderType == "" {
		if u.PlanID != nil && *u.PlanID == plan.ID {
			orderType = "plan_renew"
		} else {
			orderType = "plan_purchase"
		}
	}

	res, err := s.paySvc.CreateOrder(c.Request.Context(), u, &plan, orderType, req.PaymentChannel, s.publicBaseURL(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (s *Server) handleOrderStatus(c *gin.Context) {
	u := auth.CurrentUser(c)
	var order model.Order
	if err := s.db.Where("order_no = ? AND user_id = ?", c.Param("orderNo"), u.ID).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": order})
}

func (s *Server) handleSandboxPay(c *gin.Context) {
	u := auth.CurrentUser(c)
	if database.GetSetting(s.db, "sandbox_pay_enabled", "true") != "true" {
		c.JSON(http.StatusForbidden, gin.H{"error": "沙箱支付已关闭"})
		return
	}
	var order model.Order
	if err := s.db.Where("order_no = ? AND user_id = ?", c.Param("orderNo"), u.ID).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "订单不存在"})
		return
	}
	if order.PaymentChannel != "sandbox" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非沙箱订单不可模拟支付"})
		return
	}
	if err := s.paySvc.FulfillOrder(c.Request.Context(), order.OrderNo, "SANDBOX-"+order.OrderNo); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = s.db.First(&order, order.ID).Error
	c.JSON(http.StatusOK, gin.H{"order": order})
}

func (s *Server) handleRedeemCDK(c *gin.Context) {
	u := auth.CurrentUser(c)
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入兑换码"})
		return
	}
	codeStr := strings.TrimSpace(req.Code)
	now := time.Now().Unix()
	var allowedNodes []uint
	var needProvision bool

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var cdk model.RedemptionCode
		if err := tx.Where("code = ? AND enabled = ?", codeStr, true).First(&cdk).Error; err != nil {
			return gorm.ErrRecordNotFound
		}
		if cdk.UsedByUserID != nil {
			return ErrInviteExhausted
		}
		res := tx.Model(&model.RedemptionCode{}).
			Where("id = ? AND used_by_user_id IS NULL", cdk.ID).
			Updates(map[string]any{"used_by_user_id": u.ID, "used_at": now})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrInviteExhausted
		}

		switch cdk.RewardType {
		case "balance":
			return tx.Model(&model.User{}).Where("id = ?", u.ID).
				Update("balance_cents", gorm.Expr("balance_cents + ?", cdk.AmountCents)).Error
		case "quota":
			return tx.Model(&model.User{}).Where("id = ?", u.ID).
				Update("quota_bytes", gorm.Expr("quota_bytes + ?", cdk.QuotaBytes)).Error
		case "plan":
			if cdk.PlanID != nil {
				var plan model.Plan
				if err := tx.First(&plan, *cdk.PlanID).Error; err != nil {
					return err
				}
				_ = json.Unmarshal([]byte(plan.NodeIDsJSON), &allowedNodes)
				days := plan.DurationDays
				if cdk.DurationDays > 0 {
					days = cdk.DurationDays
				}
				var expiry int64
				if days > 0 {
					base := now
					if u.ExpiresAt > now {
						base = u.ExpiresAt
					}
					expiry = base + int64(days)*86400
				}
				needProvision = true
				return tx.Model(&model.User{}).Where("id = ?", u.ID).Updates(map[string]any{
					"plan_id":       plan.ID,
					"quota_bytes":   plan.QuotaBytes,
					"used_bytes":    0,
					"expires_at":    expiry,
					"reset_mode":    plan.ResetMode,
					"cycle_days":    plan.CycleDays,
					"next_reset_at": syncer.ComputeNextReset(plan.ResetMode, plan.CycleDays, now),
					"status":        "active",
				}).Error
			}
		}
		return nil
	})

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusBadRequest, gin.H{"error": "兑换码无效或已禁用"})
			return
		}
		if err == ErrInviteExhausted {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该兑换码已被使用"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = s.db.First(u, u.ID).Error
	if needProvision {
		go func() {
			pCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			_ = s.syncEngine.ProvisionUserToNodes(pCtx, u, allowedNodes)
		}()
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "user": u})
}

func (s *Server) handleListMyInvites(c *gin.Context) {
	u := auth.CurrentUser(c)
	var codes []model.InviteCode
	_ = s.db.Where("creator_id = ?", u.ID).Order("id DESC").Find(&codes).Error

	var invitedCount int64
	_ = s.db.Model(&model.User{}).Where("invited_by_id = ?", u.ID).Count(&invitedCount).Error

	c.JSON(http.StatusOK, gin.H{
		"invites":      codes,
		"invitedCount": invitedCount,
	})
}

func (s *Server) handleCreateMyInvite(c *gin.Context) {
	u := auth.CurrentUser(c)
	if u.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "普通用户请使用管理员分配的邀请码"})
		return
	}
	code, err := auth.GenerateRandomHex(6)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	inv := &model.InviteCode{
		Code:      strings.ToUpper(code),
		CreatorID: u.ID,
		MaxUses:   1,
		Enabled:   true,
	}
	if err := s.db.Create(inv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"invite": inv})
}

func nonEmptyOr(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}
