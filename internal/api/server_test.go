package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/TakotsuboChen/sub-ui/internal/api"
	"github.com/TakotsuboChen/sub-ui/internal/config"
	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/rules"
	syncer "github.com/TakotsuboChen/sub-ui/internal/sync"
)

func TestInviteRegistrationCheckoutAndKeyedSubscription(t *testing.T) {
	cfg := &config.Config{
		DBDriver: "sqlite",
		DBDSN:    t.TempDir() + "/api.db",
	}
	db, err := database.Init(cfg)
	if err != nil {
		t.Fatalf("db init: %v", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		t.Cleanup(func() { _ = sqlDB.Close() })
	}
	if err := rules.SeedBuiltinPresets(db); err != nil {
		t.Fatalf("seed presets: %v", err)
	}

	eng := syncer.NewEngine(db, 30)
	srv := api.NewServer(cfg, db, eng)
	ts := httptest.NewServer(srv.Engine())
	defer ts.Close()

	// 1. Setup initial admin
	res := postJSON(t, ts.URL+"/api/setup", "", map[string]any{
		"username": "rootadmin",
		"password": "StrongPassword123!",
		"siteName": "Sub-UI Test",
	})
	if res.StatusCode != 200 {
		t.Fatalf("setup failed: %d", res.StatusCode)
	}
	var setupBody struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(res.Body).Decode(&setupBody)
	res.Body.Close()

	// 2. Enable mandatory invite code registration
	res = doJSON(t, "PUT", ts.URL+"/api/admin/settings", setupBody.Token, map[string]string{
		"invite_code_required": "true",
		"sandbox_pay_enabled":  "true",
	})
	if res.StatusCode != 200 {
		t.Fatalf("update settings failed: %d", res.StatusCode)
	}
	res.Body.Close()

	// 3. Registration without invite code must fail
	res = postJSON(t, ts.URL+"/api/auth/register", "", map[string]any{
		"username": "bob",
		"password": "Password123!",
	})
	if res.StatusCode != 400 {
		t.Fatalf("expected 400 without invite code, got %d", res.StatusCode)
	}
	res.Body.Close()

	// 4. Create invite code and register bob
	res = postJSON(t, ts.URL+"/api/admin/invites/batch", setupBody.Token, map[string]any{
		"count":   1,
		"maxUses": 1,
	})
	var invBody struct {
		Invites []model.InviteCode `json:"invites"`
	}
	_ = json.NewDecoder(res.Body).Decode(&invBody)
	res.Body.Close()

	res = postJSON(t, ts.URL+"/api/auth/register", "", map[string]any{
		"username":   "bob",
		"password":   "Password123!",
		"inviteCode": invBody.Invites[0].Code,
	})
	if res.StatusCode != 200 {
		t.Fatalf("register with invite failed: %d", res.StatusCode)
	}
	var bobAuth struct {
		Token string     `json:"token"`
		User  model.User `json:"user"`
	}
	_ = json.NewDecoder(res.Body).Decode(&bobAuth)
	res.Body.Close()

	// 5. Create plan and pay via sandbox
	res = postJSON(t, ts.URL+"/api/admin/plans", setupBody.Token, map[string]any{
		"name":         "Pro 200G",
		"priceCents":   1990,
		"durationDays": 30,
		"quotaBytes":   200 * 1024 * 1024 * 1024,
		"resetMode":    "monthly_anniversary",
		"cycleDays":    30,
		"enabled":      true,
	})
	var planBody struct {
		Plan model.Plan `json:"plan"`
	}
	_ = json.NewDecoder(res.Body).Decode(&planBody)
	res.Body.Close()

	res = postJSON(t, ts.URL+"/api/user/orders", bobAuth.Token, map[string]any{
		"planId":         planBody.Plan.ID,
		"paymentChannel": "sandbox",
	})
	var orderBody struct {
		Order model.Order `json:"order"`
	}
	_ = json.NewDecoder(res.Body).Decode(&orderBody)
	res.Body.Close()

	res = postJSON(t, ts.URL+"/api/user/orders/"+orderBody.Order.OrderNo+"/sandbox-pay", bobAuth.Token, map[string]any{})
	if res.StatusCode != 200 {
		t.Fatalf("sandbox pay failed: %d", res.StatusCode)
	}
	res.Body.Close()

	// 6. Verify keyed subscription endpoint returns Subscription-Userinfo & YAML
	req, _ := http.NewRequest("GET", ts.URL+"/s/"+bobAuth.User.SubToken+"?target=clash", nil)
	subResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("sub fetch failed: %v", err)
	}
	defer subResp.Body.Close()
	if subResp.StatusCode != 200 {
		t.Fatalf("expected 200 from /s/token, got %d", subResp.StatusCode)
	}
	if subResp.Header.Get("Subscription-Userinfo") == "" {
		t.Fatalf("missing Subscription-Userinfo header")
	}

	// 7. Verify public meta exposes repository version
	metaResp, err := http.Get(ts.URL + "/api/system/public")
	if err != nil {
		t.Fatalf("public meta failed: %v", err)
	}
	defer metaResp.Body.Close()
	var metaBody struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(metaResp.Body).Decode(&metaBody); err != nil {
		t.Fatalf("decode public meta: %v", err)
	}
	if metaBody.Version != "1.0.0-Alpha-1" {
		t.Fatalf("expected version 1.0.0-Alpha-1, got %q", metaBody.Version)
	}
}

func postJSON(t *testing.T, urlStr, token string, body any) *http.Response {
	return doJSON(t, "POST", urlStr, token, body)
}

func doJSON(t *testing.T, method, urlStr, token string, body any) *http.Response {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, urlStr, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, urlStr, err)
	}
	return resp
}
