package syncer_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/config"
	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/sui"
	syncer "github.com/TakotsuboChen/sub-ui/internal/sync"
)

type mockSUIServer struct {
	mu      sync.Mutex
	clients map[string]sui.ClientObj
	kicked  []string
}

func newMockSUI(initial []sui.ClientObj) (*mockSUIServer, *httptest.Server) {
	m := &mockSUIServer{clients: map[string]sui.ClientObj{}}
	for _, cl := range initial {
		m.clients[cl.Name] = cl
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Token") != "tok-secret" {
			http.Error(w, "bad token", 401)
			return
		}
		m.mu.Lock()
		defer m.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/apiv2/clients"):
			list := make([]sui.ClientObj, 0, len(m.clients))
			for _, cl := range m.clients {
				list = append(list, cl)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"obj":     map[string]any{"clients": list},
			})
		case strings.HasSuffix(r.URL.Path, "/apiv2/onlines"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"obj":     map[string]any{"user": []string{"alice"}},
			})
		case strings.HasSuffix(r.URL.Path, "/apiv2/status"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"obj":     map[string]any{"cpu": 12.5, "sbd": map[string]any{"running": true}},
			})
		case strings.HasSuffix(r.URL.Path, "/apiv2/save"):
			_ = r.ParseForm()
			var cl sui.ClientObj
			_ = json.Unmarshal([]byte(r.FormValue("data")), &cl)
			if cl.Up == 0 && cl.Down == 0 {
				if old, ok := m.clients[cl.Name]; ok {
					cl.TotalUp = old.TotalUp + old.Up
					cl.TotalDown = old.TotalDown + old.Down
				}
			}
			m.clients[cl.Name] = cl
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"obj":     map[string]any{"clients": []sui.ClientObj{cl}},
			})
		case strings.HasSuffix(r.URL.Path, "/apiv2/closeSessions"):
			_ = r.ParseForm()
			m.kicked = append(m.kicked, r.FormValue("u"))
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true})
		}
	}))
	return m, srv
}

func TestDistributedTrafficSyncQuotaAndReset(t *testing.T) {
	db, err := database.Init(&config.Config{
		DBDriver: "sqlite",
		DBDSN:    t.TempDir() + "/test.db",
	})
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		t.Cleanup(func() { _ = sqlDB.Close() })
	}

	hkMock, hkSrv := newMockSUI([]sui.ClientObj{
		{ID: 1, Name: "alice", Enable: true, Up: 1000, Down: 3000}, // 4000 bytes
	})
	defer hkSrv.Close()

	sgMock, sgSrv := newMockSUI([]sui.ClientObj{
		{ID: 2, Name: "alice", Enable: true, Up: 1000, Down: 1000}, // 2000 bytes * 1.5 = 3000 bytes
	})
	defer sgSrv.Close()

	user := model.User{
		Username:     "alice",
		PasswordHash: "x",
		Role:         "user",
		Status:       "active",
		SubToken:     "tok_alice",
		QuotaBytes:   6000, // HK(4000*1.0) + SG(2000*1.5) = 7000 > 6000 -> triggers disable & kick
		ResetMode:    "monthly_anniversary",
		CycleDays:    30,
		NextResetAt:  time.Now().Add(24 * time.Hour).Unix(),
	}
	db.Create(&user)

	hkNode := model.Node{Name: "HK", NodeType: "sui", PanelURL: hkSrv.URL, APIToken: "tok-secret", TrafficMultiplier: 1.0, Enabled: true}
	sgNode := model.Node{Name: "SG", NodeType: "sui", PanelURL: sgSrv.URL, APIToken: "tok-secret", TrafficMultiplier: 1.5, Enabled: true}
	db.Create(&hkNode)
	db.Create(&sgNode)

	db.Create(&model.UserNodeBinding{UserID: user.ID, NodeID: hkNode.ID, SUIClientID: 1, SUIClientName: "alice", SyncedEnable: true})
	db.Create(&model.UserNodeBinding{UserID: user.ID, NodeID: sgNode.ID, SUIClientID: 2, SUIClientName: "alice", SyncedEnable: true})

	eng := syncer.NewEngine(db, 30)
	sum, err := eng.SyncAll(context.Background())
	if err != nil {
		t.Fatalf("sync all: %v", err)
	}
	if sum.NodesOnline != 2 || sum.DeltaBytes != 7000 {
		t.Fatalf("unexpected summary: %+v", sum)
	}

	var refreshed model.User
	db.First(&refreshed, user.ID)
	if refreshed.Status != "exhausted" || refreshed.UsedBytes != 7000 {
		t.Fatalf("expected exhausted with 7000 used, got status=%s used=%d", refreshed.Status, refreshed.UsedBytes)
	}

	hkMock.mu.Lock()
	hkEnabled := hkMock.clients["alice"].Enable
	hkKicked := len(hkMock.kicked)
	hkMock.mu.Unlock()
	sgMock.mu.Lock()
	sgEnabled := sgMock.clients["alice"].Enable
	sgMock.mu.Unlock()
	if hkEnabled || sgEnabled || hkKicked == 0 {
		t.Fatalf("expected both HK and SG disabled and sessions kicked, got hk=%v sg=%v kicked=%d", hkEnabled, sgEnabled, hkKicked)
	}

	// Test periodic / manual reset re-enables both nodes and rolls S-UI traffic counters
	if err := eng.ResetUserTraffic(context.Background(), &refreshed, "manual"); err != nil {
		t.Fatalf("reset traffic: %v", err)
	}
	db.First(&refreshed, user.ID)
	if refreshed.Status != "active" || refreshed.UsedBytes != 0 {
		t.Fatalf("expected active and 0 used after reset, got %s %d", refreshed.Status, refreshed.UsedBytes)
	}
	hkMock.mu.Lock()
	hkClientAfter := hkMock.clients["alice"]
	hkMock.mu.Unlock()
	if !hkClientAfter.Enable || hkClientAfter.Up != 0 || hkClientAfter.TotalDown != 3000 {
		t.Fatalf("expected HK client re-enabled and traffic rolled into TotalDown, got %+v", hkClientAfter)
	}
}
