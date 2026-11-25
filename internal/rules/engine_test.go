package rules_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/TakotsuboChen/sub-ui/internal/config"
	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/rules"
	"github.com/TakotsuboChen/sub-ui/internal/sub"
	"gopkg.in/yaml.v3"
)

func TestRuleOverrideAndClashGeneration(t *testing.T) {
	db, err := database.Init(&config.Config{
		DBDriver: "sqlite",
		DBDSN:    t.TempDir() + "/rules.db",
	})
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		t.Cleanup(func() { _ = sqlDB.Close() })
	}
	if err := rules.SeedBuiltinPresets(db); err != nil {
		t.Fatalf("seed presets: %v", err)
	}

	var preset model.RulePreset
	if err := db.Where("slug = ?", "acl4ssr-full").First(&preset).Error; err != nil {
		t.Fatalf("load acl4ssr-full: %v", err)
	}

	prepend, _ := json.Marshal([]rules.RuleEntry{
		{ID: "u1", Type: "DOMAIN-SUFFIX", Payload: "claude.ai", Group: "🇸🇬 狮城节点", Enabled: true},
	})
	rewrites, _ := json.Marshal(map[string]string{"💬 AI 平台": "🇸🇬 狮城节点"})
	disabled, _ := json.Marshal([]string{"banad"})

	userOv := &model.UserRuleOverride{
		UserID:            1,
		PrependRulesJSON:  string(prepend),
		GroupRewritesJSON: string(rewrites),
		DisabledRulesJSON: string(disabled),
	}

	compiled, err := rules.CompileEffectiveConfig(&preset, nil, userOv)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	if !compiled.EnableTFO {
		t.Fatalf("expected TFO enabled by default")
	}

	res := rules.SimulateMatch(compiled, "api.claude.ai")
	if !res.Matched || res.FinalGroup != "🇸🇬 狮城节点" || res.MatchedItem.Source != "user_override" {
		t.Fatalf("expected user_override match to SG, got %+v", res)
	}

	gen := sub.NewGenerator(db)
	agg := &sub.AggregatedNode{
		Proxies: []map[string]any{
			{"name": "🇭🇰 香港 CMIN2", "type": "vless", "server": "hk.example.com", "port": 443, "uuid": "u", "tfo": true},
			{"name": "🇸🇬 狮城节点 01", "type": "hysteria2", "server": "sg.example.com", "port": 443, "password": "p"},
		},
	}
	yml, err := gen.RenderClashYAML(agg, compiled)
	if err != nil {
		t.Fatalf("render clash yaml: %v", err)
	}
	var doc map[string]any
	if err := yaml.Unmarshal([]byte(yml), &doc); err != nil {
		t.Fatalf("invalid yaml output: %v", err)
	}
	rulesList, _ := doc["rules"].([]any)
	foundClaude := false
	for _, r := range rulesList {
		if r == "DOMAIN-SUFFIX,claude.ai,🇸🇬 狮城节点" {
			foundClaude = true
		}
		if s, ok := r.(string); ok && strings.Contains(s, "RULE-SET,banad,") {
			t.Fatalf("expected disabled banad ruleset omitted from clash yaml")
		}
	}
	if !foundClaude {
		t.Fatalf("missing user prepend rule in clash yaml rules: %v", rulesList[:3])
	}

	sbJSON, err := gen.RenderSingboxJSON(agg, compiled)
	if err != nil {
		t.Fatalf("render singbox json: %v", err)
	}
	if !strings.Contains(sbJSON, `"claude.ai"`) {
		t.Fatalf("missing claude.ai rule in singbox json")
	}
}

func TestParseSubconverterINI(t *testing.T) {
	ini := `
[custom]
ruleset=🎯 全球直连,https://example.com/Direct.list
ruleset=💬 AI 平台,https://example.com/AI.list
ruleset=🎯 全球直连,[]GEOIP,CN
ruleset=🐟 漏网之鱼,[]FINAL
custom_proxy_group=🚀 节点选择` + "`select`" + `[]♻️ 自动选择` + "`[]DIRECT" + `
custom_proxy_group=♻️ 自动选择` + "`url-test`" + `.*` + "`http://www.gstatic.com/generate_204`300,,50" + `
`
	parsed := rules.ParseSubconverterINI(ini)
	if len(parsed.RuleSets) != 4 || len(parsed.ProxyGroups) != 2 {
		t.Fatalf("unexpected ini parse result: rulesets=%d groups=%d", len(parsed.RuleSets), len(parsed.ProxyGroups))
	}
}
