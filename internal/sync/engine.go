package syncer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/auth"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/sui"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var safeNameRe = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

type Engine struct {
	db       *gorm.DB
	interval time.Duration
	mu       sync.Mutex
	running  bool
}

func NewEngine(db *gorm.DB, intervalSec int) *Engine {
	if intervalSec < 5 {
		intervalSec = 30
	}
	return &Engine{
		db:       db,
		interval: time.Duration(intervalSec) * time.Second,
	}
}

func (e *Engine) Start(ctx context.Context) {
	ticker := time.NewTicker(e.interval)
	go func() {
		defer ticker.Stop()
		// Run initial check shortly after boot.
		select {
		case <-time.After(3 * time.Second):
			_, _ = e.SyncAll(ctx)
		case <-ctx.Done():
			return
		}
		for {
			select {
			case <-ticker.C:
				_, _ = e.SyncAll(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
}

type SyncSummary struct {
	NodesPolled int      `json:"nodesPolled"`
	NodesOnline int      `json:"nodesOnline"`
	DeltaBytes  int64    `json:"deltaBytes"`
	ResetsCount int      `json:"resetsCount"`
	Errors      []string `json:"errors,omitempty"`
}

func (e *Engine) NewNodeClient(node *model.Node) (*sui.Client, error) {
	return sui.NewClient(sui.NodeConfig{
		PanelURL:      node.PanelURL,
		APIToken:      node.APIToken,
		SubBaseURL:    node.SubBaseURL,
		APIProxy:      node.APIProxy,
		SkipTLSVerify: node.SkipTLSVerify,
		Timeout:       12 * time.Second,
	})
}

func (e *Engine) SyncAll(ctx context.Context) (*SyncSummary, error) {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return &SyncSummary{}, nil
	}
	e.running = true
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		e.running = false
		e.mu.Unlock()
	}()

	summary := &SyncSummary{}
	var nodes []model.Node
	if err := e.db.Where("enabled = ? AND node_type = ?", true, "sui").Order("sort_order ASC, id ASC").Find(&nodes).Error; err != nil {
		return summary, err
	}

	type nodeResult struct {
		node    model.Node
		clients []sui.ClientObj
		onlines *sui.OnlinesObj
		status  map[string]any
		subURI  string
		err     error
	}

	results := make([]nodeResult, len(nodes))
	var wg sync.WaitGroup
	for i := range nodes {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			n := nodes[idx]
			res := nodeResult{node: n}
			client, err := e.NewNodeClient(&n)
			if err != nil {
				res.err = err
				results[idx] = res
				return
			}
			cCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
			defer cancel()

			if n.SubBaseURL == "" {
				if loadObj, lErr := client.Load(cCtx); lErr == nil && loadObj != nil {
					res.subURI = loadObj.SubURI
					res.clients = loadObj.Clients
					res.onlines = &loadObj.Onlines
				}
			}
			if res.clients == nil {
				clients, err := client.GetClients(cCtx)
				if err != nil {
					res.err = err
					results[idx] = res
					return
				}
				res.clients = clients
			}
			if res.onlines == nil {
				res.onlines, _ = client.GetOnlines(cCtx)
			}
			res.status, _ = client.GetStatus(cCtx)
			results[idx] = res
		}(i)
	}
	wg.Wait()

	now := time.Now().Unix()
	bucket := now - (now % 3600)

	// Map online usernames per node
	onlineUsersByNode := make(map[uint]map[string]bool)
	remoteClientsByNode := make(map[uint]map[string]sui.ClientObj)

	for _, res := range results {
		summary.NodesPolled++
		updates := map[string]any{
			"last_sync_at": now,
		}
		if res.err != nil {
			updates["online_status"] = "offline"
			updates["last_error"] = res.err.Error()
			summary.Errors = append(summary.Errors, fmt.Sprintf("%s: %v", res.node.Name, res.err))
			e.db.Model(&model.Node{}).Where("id = ?", res.node.ID).Updates(updates)
			continue
		}

		summary.NodesOnline++
		updates["online_status"] = "online"
		updates["last_error"] = ""
		if res.subURI != "" && res.node.SubBaseURL == "" {
			updates["sub_base_url"] = strings.TrimRight(res.subURI, "/")
		}
		if res.onlines != nil {
			updates["online_count"] = len(res.onlines.User)
			m := make(map[string]bool, len(res.onlines.User))
			for _, u := range res.onlines.User {
				m[u] = true
			}
			onlineUsersByNode[res.node.ID] = m
		}
		if res.status != nil {
			if cpu, ok := extractFloat(res.status["cpu"]); ok {
				updates["cpu_usage"] = cpu
			}
			if memMap, ok := res.status["mem"].(map[string]any); ok {
				if cur, ok1 := extractFloat(memMap["current"]); ok1 {
					if tot, ok2 := extractFloat(memMap["total"]); ok2 && tot > 0 {
						updates["mem_usage"] = math.Round((cur/tot)*1000) / 10
					}
				}
			}
			if sbd, ok := res.status["sbd"].(map[string]any); ok {
				if running, ok := sbd["running"].(bool); ok {
					updates["singbox_running"] = running
				}
				if ver, ok := sbd["version"].(string); ok {
					updates["sui_version"] = ver
				}
			}
		}
		e.db.Model(&model.Node{}).Where("id = ?", res.node.ID).Updates(updates)

		cMap := make(map[string]sui.ClientObj, len(res.clients))
		for _, cl := range res.clients {
			cMap[cl.Name] = cl
		}
		remoteClientsByNode[res.node.ID] = cMap
	}

	// Process delta traffic per binding
	var bindings []model.UserNodeBinding
	if err := e.db.Find(&bindings).Error; err == nil && len(bindings) > 0 {
		nodeMap := make(map[uint]model.Node, len(nodes))
		for _, n := range nodes {
			nodeMap[n.ID] = n
		}
		for i := range bindings {
			b := &bindings[i]
			cMap, ok := remoteClientsByNode[b.NodeID]
			if !ok {
				continue
			}
			cl, found := cMap[b.SUIClientName]
			if !found {
				continue
			}

			var deltaUp, deltaDown int64
			if cl.Up >= b.LastRawUp {
				deltaUp = cl.Up - b.LastRawUp
			} else {
				deltaUp = cl.Up
			}
			if cl.Down >= b.LastRawDown {
				deltaDown = cl.Down - b.LastRawDown
			} else {
				deltaDown = cl.Down
			}

			node := nodeMap[b.NodeID]
			mult := node.TrafficMultiplier
			if mult < 0 {
				mult = 0
			}
			weighted := int64(math.Round(float64(deltaUp+deltaDown) * mult))

			bUpdates := map[string]any{
				"last_raw_up":   cl.Up,
				"last_raw_down": cl.Down,
				"synced_enable": cl.Enable,
				"sui_client_id": cl.ID,
			}
			e.db.Model(&model.UserNodeBinding{}).Where("id = ?", b.ID).Updates(bUpdates)

			isOnlineNow := onlineUsersByNode[b.NodeID][b.SUIClientName]
			if weighted > 0 || isOnlineNow {
				userUpdates := map[string]any{}
				if weighted > 0 {
					userUpdates["used_bytes"] = gorm.Expr("used_bytes + ?", weighted)
					userUpdates["total_used_bytes"] = gorm.Expr("total_used_bytes + ?", weighted)
					summary.DeltaBytes += weighted
				}
				if isOnlineNow {
					userUpdates["last_online_at"] = now
				} else if cl.OnlineAt > 0 {
					userUpdates["last_online_at"] = gorm.Expr("CASE WHEN last_online_at < ? THEN ? ELSE last_online_at END", cl.OnlineAt, cl.OnlineAt)
				}
				if len(userUpdates) > 0 {
					e.db.Model(&model.User{}).Where("id = ?", b.UserID).Updates(userUpdates)
				}
			}

			if deltaUp > 0 || deltaDown > 0 {
				tlog := model.TrafficLog{
					BucketTime:    bucket,
					UserID:        b.UserID,
					NodeID:        b.NodeID,
					RawUp:         deltaUp,
					RawDown:       deltaDown,
					WeightedBytes: weighted,
				}
				_ = e.db.Clauses(clause.OnConflict{
					Columns: []clause.Column{{Name: "bucket_time"}, {Name: "user_id"}, {Name: "node_id"}},
					DoUpdates: clause.Assignments(map[string]any{
						"raw_up":         gorm.Expr("traffic_logs.raw_up + ?", deltaUp),
						"raw_down":       gorm.Expr("traffic_logs.raw_down + ?", deltaDown),
						"weighted_bytes": gorm.Expr("traffic_logs.weighted_bytes + ?", weighted),
					}),
				}).Create(&tlog).Error
			}
		}
	}

	// Process periodic resets and quota/expiry enforcement
	resets, err := e.enforcePolicies(ctx, now, nodes, remoteClientsByNode)
	if err != nil {
		log.Printf("[sync] enforce policies error: %v", err)
	}
	summary.ResetsCount = resets

	return summary, nil
}

func (e *Engine) enforcePolicies(ctx context.Context, now int64, nodes []model.Node, remoteClients map[uint]map[string]sui.ClientObj) (int, error) {
	var users []model.User
	if err := e.db.Where("role != ? OR quota_bytes > 0 OR expires_at > 0", "admin").Find(&users).Error; err != nil {
		return 0, err
	}

	nodeMap := make(map[uint]model.Node, len(nodes))
	for _, n := range nodes {
		nodeMap[n.ID] = n
	}

	resets := 0
	for i := range users {
		u := &users[i]
		didReset := false

		// 1. Periodic reset check (only if not expired)
		notExpired := u.ExpiresAt == 0 || u.ExpiresAt > now
		if u.NextResetAt > 0 && now >= u.NextResetAt && notExpired && u.Status != "disabled" {
			_ = e.db.Create(&model.TrafficResetHistory{
				UserID:      u.ID,
				UsedBytes:   u.UsedBytes,
				QuotaBytes:  u.QuotaBytes,
				ResetReason: "scheduled",
			}).Error
			nextReset := ComputeNextReset(u.ResetMode, u.CycleDays, now)
			u.UsedBytes = 0
			u.NextResetAt = nextReset
			if u.Status == "exhausted" {
				u.Status = "active"
			}
			_ = e.db.Model(&model.User{}).Where("id = ?", u.ID).Updates(map[string]any{
				"used_bytes":    0,
				"next_reset_at": nextReset,
				"status":        u.Status,
			}).Error
			didReset = true
			resets++
		}

		// 2. Compute effective enabled status
		expired := u.ExpiresAt > 0 && now >= u.ExpiresAt
		exhausted := u.QuotaBytes > 0 && u.UsedBytes >= u.QuotaBytes
		desiredStatus := u.Status
		if u.Status != "disabled" {
			if expired {
				desiredStatus = "expired"
			} else if exhausted {
				desiredStatus = "exhausted"
			} else {
				desiredStatus = "active"
			}
			if desiredStatus != u.Status {
				u.Status = desiredStatus
				_ = e.db.Model(&model.User{}).Where("id = ?", u.ID).Update("status", desiredStatus).Error
			}
		}

		shouldEnable := desiredStatus == "active"

		// Check user's bindings against remote state or forced reset
		var bindings []model.UserNodeBinding
		if err := e.db.Where("user_id = ?", u.ID).Find(&bindings).Error; err != nil {
			continue
		}
		for _, b := range bindings {
			node, ok := nodeMap[b.NodeID]
			if !ok {
				continue
			}
			cMap, online := remoteClients[b.NodeID]
			if !online {
				continue
			}
			remoteCl, exists := cMap[b.SUIClientName]
			if !exists {
				continue
			}

			// Determine allowed node-side safety cap
			safetyVolume := computeNodeSafetyCap(u, &node, remoteCl.Up+remoteCl.Down)
			needStateSync := remoteCl.Enable != shouldEnable ||
				(u.ExpiresAt != remoteCl.Expiry) ||
				(safetyVolume != remoteCl.Volume && absInt64(safetyVolume-remoteCl.Volume) > 64*1024*1024)

			if didReset || needStateSync {
				client, err := e.NewNodeClient(&node)
				if err != nil {
					continue
				}
				fullList, err := client.GetClients(ctx, remoteCl.ID)
				if err != nil || len(fullList) == 0 {
					continue
				}
				full := fullList[0]
				full.Enable = shouldEnable
				full.Expiry = u.ExpiresAt
				full.Volume = safetyVolume
				if didReset {
					// Sending Up=0 & Down=0 instructs S-UI to roll counters into TotalUp/TotalDown for this client only.
					full.Up = 0
					full.Down = 0
				}
				if _, err := client.SaveClient(ctx, "edit", &full); err != nil {
					_ = e.db.Model(&model.UserNodeBinding{}).Where("id = ?", b.ID).Update("last_error", err.Error()).Error
					continue
				}
				updates := map[string]any{
					"synced_enable": shouldEnable,
					"last_error":    "",
				}
				if didReset {
					updates["last_raw_up"] = int64(0)
					updates["last_raw_down"] = int64(0)
				}
				_ = e.db.Model(&model.UserNodeBinding{}).Where("id = ?", b.ID).Updates(updates).Error

				if !shouldEnable && remoteCl.Enable {
					_ = client.CloseSessions(ctx, full.Name)
				}
			}
		}
	}
	return resets, nil
}

func (e *Engine) ResetUserTraffic(ctx context.Context, user *model.User, reason string) error {
	now := time.Now().Unix()
	_ = e.db.Create(&model.TrafficResetHistory{
		UserID:      user.ID,
		UsedBytes:   user.UsedBytes,
		QuotaBytes:  user.QuotaBytes,
		ResetReason: reason,
	}).Error

	newStatus := user.Status
	if newStatus == "exhausted" && (user.ExpiresAt == 0 || user.ExpiresAt > now) {
		newStatus = "active"
	}
	nextReset := ComputeNextReset(user.ResetMode, user.CycleDays, now)
	if err := e.db.Model(&model.User{}).Where("id = ?", user.ID).Updates(map[string]any{
		"used_bytes":    0,
		"status":        newStatus,
		"next_reset_at": nextReset,
	}).Error; err != nil {
		return err
	}
	user.UsedBytes = 0
	user.Status = newStatus
	user.NextResetAt = nextReset

	var bindings []model.UserNodeBinding
	if err := e.db.Where("user_id = ?", user.ID).Find(&bindings).Error; err != nil {
		return err
	}
	for _, b := range bindings {
		var node model.Node
		if err := e.db.First(&node, b.NodeID).Error; err != nil || !node.Enabled || node.NodeType != "sui" {
			continue
		}
		client, err := e.NewNodeClient(&node)
		if err != nil {
			continue
		}
		fullList, err := client.GetClients(ctx, b.SUIClientID)
		if err != nil || len(fullList) == 0 {
			continue
		}
		full := fullList[0]
		full.Up = 0
		full.Down = 0
		full.Enable = newStatus == "active"
		full.Expiry = user.ExpiresAt
		full.Volume = computeNodeSafetyCap(user, &node, 0)
		if _, err := client.SaveClient(ctx, "edit", &full); err != nil {
			_ = e.db.Model(&model.UserNodeBinding{}).Where("id = ?", b.ID).Update("last_error", err.Error()).Error
			continue
		}
		_ = e.db.Model(&model.UserNodeBinding{}).Where("id = ?", b.ID).Updates(map[string]any{
			"last_raw_up":   0,
			"last_raw_down": 0,
			"synced_enable": full.Enable,
			"last_error":    "",
		}).Error
	}
	return nil
}

func (e *Engine) ProvisionUserToNodes(ctx context.Context, user *model.User, allowedNodeIDs []uint) error {
	var nodes []model.Node
	if err := e.db.Where("enabled = ? AND node_type = ?", true, "sui").Find(&nodes).Error; err != nil {
		return err
	}
	allowedSet := make(map[uint]bool, len(allowedNodeIDs))
	for _, id := range allowedNodeIDs {
		allowedSet[id] = true
	}
	allowAll := len(allowedNodeIDs) == 0

	shouldEnableUser := user.Status == "active" &&
		(user.ExpiresAt == 0 || user.ExpiresAt > time.Now().Unix()) &&
		(user.QuotaBytes == 0 || user.UsedBytes < user.QuotaBytes)

	for _, node := range nodes {
		inPlan := allowAll || allowedSet[node.ID]
		var binding model.UserNodeBinding
		err := e.db.Where("user_id = ? AND node_id = ?", user.ID, node.ID).First(&binding).Error

		if !inPlan {
			if err == nil && binding.SyncedEnable {
				if client, cErr := e.NewNodeClient(&node); cErr == nil {
					if fullList, gErr := client.GetClients(ctx, binding.SUIClientID); gErr == nil && len(fullList) > 0 {
						full := fullList[0]
						full.Enable = false
						_, _ = client.SaveClient(ctx, "edit", &full)
						_ = client.CloseSessions(ctx, full.Name)
						_ = e.db.Model(&model.UserNodeBinding{}).Where("id = ?", binding.ID).Update("synced_enable", false).Error
					}
				}
			}
			continue
		}

		client, cErr := e.NewNodeClient(&node)
		if cErr != nil {
			continue
		}

		if err == gorm.ErrRecordNotFound {
			uStr := uuid.NewString()
			pwd, _ := auth.GenerateRandomHex(12)
			suiName := fmt.Sprintf("subui_%d_%s", user.ID, sanitizeClientName(user.Username))
			inbJSON := json.RawMessage(node.DefaultInboundsJSON)
			if len(inbJSON) < 2 {
				inbJSON = json.RawMessage("[]")
			}

			newClient := &sui.ClientObj{
				Enable:   shouldEnableUser,
				Name:     suiName,
				Config:   sui.BuildDefaultClientConfig(uStr, pwd),
				Inbounds: inbJSON,
				Links:    json.RawMessage("[]"),
				Volume:   computeNodeSafetyCap(user, &node, 0),
				Expiry:   user.ExpiresAt,
				Desc:     fmt.Sprintf("Managed by Sub-UI (uid=%d)", user.ID),
				Group:    "sub-ui",
				Remark:   user.Username,
			}
			saved, sErr := client.SaveClient(ctx, "new", newClient)
			if sErr != nil {
				_ = e.db.Create(&model.UserNodeBinding{
					UserID:           user.ID,
					NodeID:           node.ID,
					SUIClientName:    suiName,
					ProtocolUUID:     uStr,
					ProtocolPassword: pwd,
					SyncedEnable:     false,
					LastError:        sErr.Error(),
				}).Error
				continue
			}

			var suiID uint
			for _, item := range saved {
				if item.Name == suiName {
					suiID = item.ID
					break
				}
			}
			if suiID == 0 {
				if all, aErr := client.GetClients(ctx); aErr == nil {
					for _, item := range all {
						if item.Name == suiName {
							suiID = item.ID
							break
						}
					}
				}
			}

			_ = e.db.Create(&model.UserNodeBinding{
				UserID:           user.ID,
				NodeID:           node.ID,
				SUIClientID:      suiID,
				SUIClientName:    suiName,
				ProtocolUUID:     uStr,
				ProtocolPassword: pwd,
				SyncedEnable:     shouldEnableUser,
			}).Error
		} else if err == nil {
			fullList, gErr := client.GetClients(ctx, binding.SUIClientID)
			if gErr != nil || len(fullList) == 0 {
				continue
			}
			full := fullList[0]
			full.Enable = shouldEnableUser
			full.Expiry = user.ExpiresAt
			full.Volume = computeNodeSafetyCap(user, &node, full.Up+full.Down)
			if _, sErr := client.SaveClient(ctx, "edit", &full); sErr == nil {
				_ = e.db.Model(&model.UserNodeBinding{}).Where("id = ?", binding.ID).Updates(map[string]any{
					"synced_enable": shouldEnableUser,
					"last_error":    "",
				}).Error
				if !shouldEnableUser {
					_ = client.CloseSessions(ctx, full.Name)
				}
			}
		}
	}
	return nil
}

func ComputeNextReset(mode string, cycleDays int, nowUnix int64) int64 {
	t := time.Unix(nowUnix, 0).UTC()
	switch mode {
	case "monthly_first":
		firstNext := time.Date(t.Year(), t.Month()+1, 1, 0, 0, 0, 0, time.UTC)
		return firstNext.Unix()
	case "monthly_anniversary":
		if cycleDays <= 0 {
			cycleDays = 30
		}
		return nowUnix + int64(cycleDays)*86400
	default:
		return 0
	}
}

func computeNodeSafetyCap(user *model.User, node *model.Node, currentNodeRaw int64) int64 {
	if user.QuotaBytes <= 0 || node.TrafficMultiplier <= 0 {
		return 0
	}
	rem := user.QuotaBytes - user.UsedBytes
	if rem <= 0 {
		return maxInt64(1, currentNodeRaw)
	}
	remRaw := int64(math.Ceil(float64(rem) / node.TrafficMultiplier))
	return currentNodeRaw + remRaw
}

func sanitizeClientName(s string) string {
	clean := safeNameRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "_")
	if clean == "" {
		return "user"
	}
	if len(clean) > 24 {
		clean = clean[:24]
	}
	return clean
}

func extractFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int64:
		return float64(n), true
	case int:
		return float64(n), true
	default:
		return 0, false
	}
}

func absInt64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
