package rules

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/model"
	"gorm.io/gorm"
)

type ProxyGroupDef struct {
	Name      string   `json:"name"`
	Type      string   `json:"type"` // select, url-test, fallback, load-balance
	Proxies   []string `json:"proxies,omitempty"`
	Filter    string   `json:"filter,omitempty"`
	URL       string   `json:"url,omitempty"`
	Interval  int      `json:"interval,omitempty"`
	Tolerance int      `json:"tolerance,omitempty"`
}

type RuleSetDef struct {
	ID         string `json:"id"`
	Group      string `json:"group"`
	Behavior   string `json:"behavior"` // classical, domain, ipcidr
	URL        string `json:"url,omitempty"`
	SingboxSRS string `json:"singboxSrs,omitempty"`
	InlineType string `json:"inlineType,omitempty"` // GEOIP, FINAL, MATCH
	InlineArg  string `json:"inlineArg,omitempty"`  // CN, LAN, private
	IsAdBlock  bool   `json:"isAdBlock,omitempty"`
	Disabled   bool   `json:"disabled,omitempty"`
}

type RuleEntry struct {
	ID       string `json:"id"`
	Type     string `json:"type"`    // DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD, IP-CIDR, GEOIP, PROCESS-NAME, SRC-IP-CIDR, DST-PORT
	Payload  string `json:"payload"` // e.g., openai.com, 192.168.0.0/16
	Group    string `json:"group"`   // target proxy group or DIRECT / REJECT
	NoResolv bool   `json:"noResolve,omitempty"`
	Comment  string `json:"comment,omitempty"`
	Enabled  bool   `json:"enabled"`
}

type PresetConfig struct {
	ClashMixedPort int             `json:"clashMixedPort"`
	DNSMode        string          `json:"dnsMode"` // fake-ip | redir-host
	EnableIPv6     bool            `json:"enableIpv6"`
	EnableTFO      bool            `json:"enableTfo"`
	ProxyGroups    []ProxyGroupDef `json:"proxyGroups"`
	RuleSets       []RuleSetDef    `json:"ruleSets"`
	StaticRules    []RuleEntry     `json:"staticRules,omitempty"`
}

type CompiledRuleItem struct {
	Source     string `json:"source"` // user_override | global_override | preset_static | preset_ruleset | final
	Kind       string `json:"kind"`   // rule | ruleset
	ID         string `json:"id"`
	Type       string `json:"type"`
	Payload    string `json:"payload"`
	Group      string `json:"group"`
	RawLine    string `json:"rawLine"`
	Overridden bool   `json:"overridden,omitempty"`
	Comment    string `json:"comment,omitempty"`
}

type CompiledConfig struct {
	PresetSlug   string             `json:"presetSlug"`
	PresetName   string             `json:"presetName"`
	DNSMode      string             `json:"dnsMode"`
	EnableIPv6   bool               `json:"enableIpv6"`
	EnableTFO    bool               `json:"enableTfo"`
	MixedPort    int                `json:"mixedPort"`
	ProxyGroups  []ProxyGroupDef    `json:"proxyGroups"`
	RuleSets     []RuleSetDef       `json:"ruleSets"`
	Timeline     []CompiledRuleItem `json:"timeline"`
	GroupRewrite map[string]string  `json:"groupRewrites"`
}

func SeedBuiltinPresets(db *gorm.DB) error {
	presets := []model.RulePreset{
		{
			Slug:        "acl4ssr-full",
			Name:        "ACL4SSR 全分组完整版",
			Description: "对标 ACL4SSR_Online_Full 全分组：覆盖 22+ 细粒度策略组（地区自动测速分组、AI 平台、电报、油管、奈飞、B 站、游戏、微软、苹果、去广告、直连分流）。",
			Category:    "acl4ssr",
			SourceINIURL: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Full.ini",
			ConfigJSON:  mustJSON(buildACL4SSRFullPreset()),
			IsDefault:   true,
			Enabled:     true,
			SortOrder:   1,
		},
		{
			Slug:        "ai-streaming",
			Name:        "AI & 流媒体分流专版",
			Description: "内置常见 AI 平台（OpenAI / Claude / Gemini / Cursor）与流媒体独立策略组，不预设特定地区倾向，可在规则工作台自由指派出口节点组，默认启用原生 TFO 0-RTT。",
			Category:    "builtin",
			ConfigJSON:  mustJSON(buildAIStreamingPreset()),
			IsDefault:   false,
			Enabled:     true,
			SortOrder:   2,
		},
		{
			Slug:        "acl4ssr-mini",
			Name:        "ACL4SSR 精简极速版",
			Description: "轻量级规则集（节点选择、自动测速、AI 平台、广告拦截、直连分流），低内存客户端与路由器首选。",
			Category:    "acl4ssr",
			SourceINIURL: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini.ini",
			ConfigJSON:  mustJSON(buildACL4SSRMiniPreset()),
			IsDefault:   false,
			Enabled:     true,
			SortOrder:   3,
		},
		{
			Slug:        "minimal-global",
			Name:        "极简直连与全局代理版",
			Description: "仅含 LAN/CN 直连绕过与其余流量统一代理，适合搭配自定义覆盖规则从零微调。",
			Category:    "builtin",
			ConfigJSON:  mustJSON(buildMinimalPreset()),
			IsDefault:   false,
			Enabled:     true,
			SortOrder:   4,
		},
	}

	for _, p := range presets {
		var existing model.RulePreset
		if err := db.Where("slug = ?", p.Slug).First(&existing).Error; err != nil {
			if err := db.Create(&p).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func buildACL4SSRFullPreset() PresetConfig {
	const base = "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/"
	const srs = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/"
	return PresetConfig{
		ClashMixedPort: 7890,
		DNSMode:        "fake-ip",
		EnableIPv6:     false,
		EnableTFO:      true,
		ProxyGroups: []ProxyGroupDef{
			{Name: "🚀 节点选择", Type: "select", Proxies: []string{"♻️ 自动选择", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🇹🇼 台湾节点", "🇰🇷 韩国节点", "🚀 手动切换", "DIRECT"}},
			{Name: "🚀 手动切换", Type: "select", Filter: ".*"},
			{Name: "♻️ 自动选择", Type: "url-test", Filter: ".*", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "💬 AI 平台", Type: "select", Proxies: []string{"🚀 节点选择", "♻️ 自动选择", "🚀 手动切换", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点"}},
			{Name: "📲 电报消息", Type: "select", Proxies: []string{"🚀 节点选择", "♻️ 自动选择", "🇸🇬 狮城节点", "🇭🇰 香港节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "DIRECT"}},
			{Name: "📹 油管视频", Type: "select", Proxies: []string{"🚀 节点选择", "♻️ 自动选择", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "DIRECT"}},
			{Name: "🎥 奈飞视频", Type: "select", Proxies: []string{"🎥 奈飞节点", "🚀 节点选择", "🇸🇬 狮城节点", "🇭🇰 香港节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "DIRECT"}},
			{Name: "📺 巴哈姆特", Type: "select", Proxies: []string{"🇹🇼 台湾节点", "🚀 节点选择", "DIRECT"}},
			{Name: "📺 哔哩哔哩", Type: "select", Proxies: []string{"🎯 全球直连", "🇹🇼 台湾节点", "🇭🇰 香港节点"}},
			{Name: "🌍 国外媒体", Type: "select", Proxies: []string{"🚀 节点选择", "♻️ 自动选择", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "DIRECT"}},
			{Name: "🌏 国内媒体", Type: "select", Proxies: []string{"🎯 全球直连", "🇭🇰 香港节点", "🇹🇼 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点"}},
			{Name: "📢 谷歌 FCM", Type: "select", Proxies: []string{"DIRECT", "🚀 节点选择", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇺🇲 美国节点"}},
			{Name: "Ⓜ️ 微软Bing", Type: "select", Proxies: []string{"🎯 全球直连", "🚀 节点选择", "🇺🇲 美国节点", "🇸🇬 狮城节点"}},
			{Name: "Ⓜ️ 微软云盘", Type: "select", Proxies: []string{"🎯 全球直连", "🚀 节点选择", "🇭🇰 香港节点", "🇸🇬 狮城节点"}},
			{Name: "Ⓜ️ 微软服务", Type: "select", Proxies: []string{"🎯 全球直连", "🚀 节点选择", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇺🇲 美国节点"}},
			{Name: "🍎 苹果服务", Type: "select", Proxies: []string{"🎯 全球直连", "🚀 节点选择", "🇺🇲 美国节点", "🇭🇰 香港节点", "🇸🇬 狮城节点"}},
			{Name: "🎮 游戏平台", Type: "select", Proxies: []string{"🎯 全球直连", "🚀 节点选择", "🇭🇰 香港节点", "🇯🇵 日本节点", "🇺🇲 美国节点"}},
			{Name: "🎶 网易音乐", Type: "select", Proxies: []string{"🎯 全球直连", "🚀 节点选择"}},
			{Name: "🎯 全球直连", Type: "select", Proxies: []string{"DIRECT", "🚀 节点选择", "♻️ 自动选择"}},
			{Name: "🛑 广告拦截", Type: "select", Proxies: []string{"REJECT", "DIRECT"}},
			{Name: "🍃 应用净化", Type: "select", Proxies: []string{"REJECT", "DIRECT"}},
			{Name: "🐟 漏网之鱼", Type: "select", Proxies: []string{"🚀 节点选择", "♻️ 自动选择", "DIRECT", "🇭🇰 香港节点", "🇸🇬 狮城节点"}},
			{Name: "🇭🇰 香港节点", Type: "url-test", Filter: "(港|HK|Hong Kong|HongKong|🇭🇰)", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "🇸🇬 狮城节点", Type: "url-test", Filter: "(新加坡|坡|狮城|SG|Singapore|🇸🇬)", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "🇯🇵 日本节点", Type: "url-test", Filter: "(日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan|🇯🇵)", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "🇺🇲 美国节点", Type: "url-test", Filter: "(美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|西雅图|芝加哥|US|United States|🇺🇸)", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "🇹🇼 台湾节点", Type: "url-test", Filter: "(台|新北|彰化|TW|Taiwan|🇹🇼)", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "🇰🇷 韩国节点", Type: "url-test", Filter: "(KR|Korea|KOR|首尔|韩|🇰🇷)", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "🎥 奈飞节点", Type: "select", Filter: "(NF|奈飞|解锁|Netflix|Media)"},
		},
		RuleSets: []RuleSetDef{
			{ID: "lan", Group: "🎯 全球直连", Behavior: "classical", URL: base + "LocalAreaNetwork.list", SingboxSRS: srs + "geoip/private.srs"},
			{ID: "unban", Group: "🎯 全球直连", Behavior: "classical", URL: base + "UnBan.list"},
			{ID: "banad", Group: "🛑 广告拦截", Behavior: "classical", URL: base + "BanAD.list", SingboxSRS: srs + "geosite/category-ads-all.srs", IsAdBlock: true},
			{ID: "banprogramad", Group: "🍃 应用净化", Behavior: "classical", URL: base + "BanProgramAD.list", IsAdBlock: true},
			{ID: "googlefcm", Group: "📢 谷歌 FCM", Behavior: "classical", URL: base + "Ruleset/GoogleFCM.list", SingboxSRS: srs + "geosite/googlefcm.srs"},
			{ID: "googlecn", Group: "🎯 全球直连", Behavior: "classical", URL: base + "GoogleCN.list", SingboxSRS: srs + "geosite/google-cn.srs"},
			{ID: "steamcn", Group: "🎯 全球直连", Behavior: "classical", URL: base + "Ruleset/SteamCN.list", SingboxSRS: srs + "geosite/steam@cn.srs"},
			{ID: "bing", Group: "Ⓜ️ 微软Bing", Behavior: "classical", URL: base + "Bing.list", SingboxSRS: srs + "geosite/bing.srs"},
			{ID: "onedrive", Group: "Ⓜ️ 微软云盘", Behavior: "classical", URL: base + "OneDrive.list", SingboxSRS: srs + "geosite/onedrive.srs"},
			{ID: "microsoft", Group: "Ⓜ️ 微软服务", Behavior: "classical", URL: base + "Microsoft.list", SingboxSRS: srs + "geosite/microsoft.srs"},
			{ID: "apple", Group: "🍎 苹果服务", Behavior: "classical", URL: base + "Apple.list", SingboxSRS: srs + "geosite/apple.srs"},
			{ID: "telegram", Group: "📲 电报消息", Behavior: "classical", URL: base + "Telegram.list", SingboxSRS: srs + "geosite/telegram.srs"},
			{ID: "ai", Group: "💬 AI 平台", Behavior: "classical", URL: base + "Ruleset/AI.list", SingboxSRS: srs + "geosite/category-ai-!cn.srs"},
			{ID: "openai", Group: "💬 AI 平台", Behavior: "classical", URL: base + "Ruleset/OpenAi.list", SingboxSRS: srs + "geosite/openai.srs"},
			{ID: "netease", Group: "🎶 网易音乐", Behavior: "classical", URL: base + "Ruleset/NetEaseMusic.list"},
			{ID: "epic", Group: "🎮 游戏平台", Behavior: "classical", URL: base + "Ruleset/Epic.list"},
			{ID: "sony", Group: "🎮 游戏平台", Behavior: "classical", URL: base + "Ruleset/Sony.list"},
			{ID: "steam", Group: "🎮 游戏平台", Behavior: "classical", URL: base + "Ruleset/Steam.list", SingboxSRS: srs + "geosite/steam.srs"},
			{ID: "youtube", Group: "📹 油管视频", Behavior: "classical", URL: base + "Ruleset/YouTube.list", SingboxSRS: srs + "geosite/youtube.srs"},
			{ID: "netflix", Group: "🎥 奈飞视频", Behavior: "classical", URL: base + "Ruleset/Netflix.list", SingboxSRS: srs + "geosite/netflix.srs"},
			{ID: "bahamut", Group: "📺 巴哈姆特", Behavior: "classical", URL: base + "Ruleset/Bahamut.list", SingboxSRS: srs + "geosite/bahamut.srs"},
			{ID: "bilibili", Group: "📺 哔哩哔哩", Behavior: "classical", URL: base + "Ruleset/Bilibili.list", SingboxSRS: srs + "geosite/bilibili.srs"},
			{ID: "chinamedia", Group: "🌏 国内媒体", Behavior: "classical", URL: base + "ChinaMedia.list"},
			{ID: "proxymedia", Group: "🌍 国外媒体", Behavior: "classical", URL: base + "ProxyMedia.list"},
			{ID: "proxylite", Group: "🚀 节点选择", Behavior: "classical", URL: base + "ProxyLite.list", SingboxSRS: srs + "geosite/geolocation-!cn.srs"},
			{ID: "chinadomain", Group: "🎯 全球直连", Behavior: "classical", URL: base + "ChinaDomain.list", SingboxSRS: srs + "geosite/cn.srs"},
			{ID: "chinaip", Group: "🎯 全球直连", Behavior: "classical", URL: base + "ChinaIp.list"},
			{ID: "geoip_cn", Group: "🎯 全球直连", InlineType: "GEOIP", InlineArg: "CN", SingboxSRS: srs + "geoip/cn.srs"},
			{ID: "final", Group: "🐟 漏网之鱼", InlineType: "FINAL"},
		},
	}
}

func buildAIStreamingPreset() PresetConfig {
	p := buildACL4SSRFullPreset()
	// Keep group selection region-neutral so admins/users bind their own nodes via Group Rewrites
	for i := range p.ProxyGroups {
		switch p.ProxyGroups[i].Name {
		case "💬 AI 平台":
			p.ProxyGroups[i].Proxies = []string{"🚀 节点选择", "♻️ 自动选择", "🚀 手动切换", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点"}
		case "📹 油管视频":
			p.ProxyGroups[i].Proxies = []string{"🚀 节点选择", "♻️ 自动选择", "🚀 手动切换", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "DIRECT"}
		case "🚀 节点选择":
			p.ProxyGroups[i].Proxies = []string{"♻️ 自动选择", "🚀 手动切换", "🇭🇰 香港节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🇹🇼 台湾节点", "🇰🇷 韩国节点", "DIRECT"}
		}
	}
	p.StaticRules = []RuleEntry{
		{ID: "ai_anthropic", Type: "DOMAIN-SUFFIX", Payload: "anthropic.com", Group: "💬 AI 平台", Enabled: true, Comment: "Claude API & Console"},
		{ID: "ai_claude", Type: "DOMAIN-SUFFIX", Payload: "claude.ai", Group: "💬 AI 平台", Enabled: true, Comment: "Claude Web"},
		{ID: "ai_gemini", Type: "DOMAIN-SUFFIX", Payload: "generativelanguage.googleapis.com", Group: "💬 AI 平台", Enabled: true, Comment: "Gemini API"},
		{ID: "ai_cursor", Type: "DOMAIN-SUFFIX", Payload: "cursor.sh", Group: "💬 AI 平台", Enabled: true, Comment: "Cursor AI"},
	}
	return p
}

func buildACL4SSRMiniPreset() PresetConfig {
	const base = "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/"
	const srs = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/"
	return PresetConfig{
		ClashMixedPort: 7890,
		DNSMode:        "fake-ip",
		EnableIPv6:     false,
		EnableTFO:      true,
		ProxyGroups: []ProxyGroupDef{
			{Name: "🚀 节点选择", Type: "select", Proxies: []string{"♻️ 自动选择", "🚀 手动切换", "DIRECT"}},
			{Name: "🚀 手动切换", Type: "select", Filter: ".*"},
			{Name: "♻️ 自动选择", Type: "url-test", Filter: ".*", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "💬 AI 平台", Type: "select", Proxies: []string{"🚀 节点选择", "♻️ 自动选择", "🚀 手动切换"}},
			{Name: "🛑 广告拦截", Type: "select", Proxies: []string{"REJECT", "DIRECT"}},
			{Name: "🎯 全球直连", Type: "select", Proxies: []string{"DIRECT", "🚀 节点选择"}},
			{Name: "🐟 漏网之鱼", Type: "select", Proxies: []string{"🚀 节点选择", "♻️ 自动选择", "DIRECT"}},
		},
		RuleSets: []RuleSetDef{
			{ID: "lan", Group: "🎯 全球直连", Behavior: "classical", URL: base + "LocalAreaNetwork.list", SingboxSRS: srs + "geoip/private.srs"},
			{ID: "banad", Group: "🛑 广告拦截", Behavior: "classical", URL: base + "BanAD.list", SingboxSRS: srs + "geosite/category-ads-all.srs", IsAdBlock: true},
			{ID: "ai", Group: "💬 AI 平台", Behavior: "classical", URL: base + "Ruleset/AI.list", SingboxSRS: srs + "geosite/category-ai-!cn.srs"},
			{ID: "proxylite", Group: "🚀 节点选择", Behavior: "classical", URL: base + "ProxyLite.list", SingboxSRS: srs + "geosite/geolocation-!cn.srs"},
			{ID: "chinadomain", Group: "🎯 全球直连", Behavior: "classical", URL: base + "ChinaDomain.list", SingboxSRS: srs + "geosite/cn.srs"},
			{ID: "geoip_cn", Group: "🎯 全球直连", InlineType: "GEOIP", InlineArg: "CN", SingboxSRS: srs + "geoip/cn.srs"},
			{ID: "final", Group: "🐟 漏网之鱼", InlineType: "FINAL"},
		},
	}
}

func buildMinimalPreset() PresetConfig {
	return PresetConfig{
		ClashMixedPort: 7890,
		DNSMode:        "fake-ip",
		EnableIPv6:     false,
		EnableTFO:      true,
		ProxyGroups: []ProxyGroupDef{
			{Name: "🚀 节点选择", Type: "select", Proxies: []string{"♻️ 自动选择", "DIRECT"}},
			{Name: "♻️ 自动选择", Type: "url-test", Filter: ".*", URL: "http://www.gstatic.com/generate_204", Interval: 300, Tolerance: 50},
			{Name: "🎯 全球直连", Type: "select", Proxies: []string{"DIRECT", "🚀 节点选择"}},
			{Name: "🐟 漏网之鱼", Type: "select", Proxies: []string{"🚀 节点选择", "DIRECT"}},
		},
		RuleSets: []RuleSetDef{
			{ID: "geoip_private", Group: "🎯 全球直连", InlineType: "GEOIP", InlineArg: "PRIVATE"},
			{ID: "geoip_cn", Group: "🎯 全球直连", InlineType: "GEOIP", InlineArg: "CN"},
			{ID: "final", Group: "🐟 漏网之鱼", InlineType: "FINAL"},
		},
	}
}

func FetchAndParseSubconverterINI(iniURL string) (*PresetConfig, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(iniURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch ini http %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	return ParseSubconverterINI(string(b)), nil
}

func ParseSubconverterINI(content string) *PresetConfig {
	cfg := &PresetConfig{
		ClashMixedPort: 7890,
		DNSMode:        "fake-ip",
		EnableTFO:      true,
	}

	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	rsIdx := 0
	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "[") {
			continue
		}
		if strings.HasPrefix(line, "ruleset=") {
			val := strings.TrimPrefix(line, "ruleset=")
			parts := strings.SplitN(val, ",", 2)
			if len(parts) != 2 {
				continue
			}
			group := strings.TrimSpace(parts[0])
			target := strings.TrimSpace(parts[1])
			rsIdx++
			id := fmt.Sprintf("ini_rs_%d", rsIdx)

			if strings.HasPrefix(target, "[]") {
				inline := strings.TrimPrefix(target, "[]")
				if strings.EqualFold(inline, "FINAL") {
					cfg.RuleSets = append(cfg.RuleSets, RuleSetDef{ID: id, Group: group, InlineType: "FINAL"})
				} else if strings.HasPrefix(strings.ToUpper(inline), "GEOIP,") {
					arg := strings.TrimSpace(strings.SplitN(inline, ",", 2)[1])
					cfg.RuleSets = append(cfg.RuleSets, RuleSetDef{ID: id, Group: group, InlineType: "GEOIP", InlineArg: arg})
				}
				continue
			}
			isAd := strings.Contains(group, "广告") || strings.Contains(group, "净化") || strings.Contains(strings.ToLower(target), "banad")
			cfg.RuleSets = append(cfg.RuleSets, RuleSetDef{
				ID:        id,
				Group:     group,
				Behavior:  "classical",
				URL:       target,
				IsAdBlock: isAd,
			})
		} else if strings.HasPrefix(line, "custom_proxy_group=") {
			val := strings.TrimPrefix(line, "custom_proxy_group=")
			parts := strings.Split(val, "`")
			if len(parts) < 3 {
				continue
			}
			grp := ProxyGroupDef{
				Name: strings.TrimSpace(parts[0]),
				Type: strings.TrimSpace(parts[1]),
			}
			for _, item := range parts[2:] {
				item = strings.TrimSpace(item)
				if item == "" {
					continue
				}
				if strings.HasPrefix(item, "[]") {
					grp.Proxies = append(grp.Proxies, strings.TrimPrefix(item, "[]"))
				} else if strings.HasPrefix(item, "http://") || strings.HasPrefix(item, "https://") {
					grp.URL = item
				} else if strings.Contains(item, ",") {
					// e.g. 300,,50
					segs := strings.Split(item, ",")
					if len(segs) >= 1 {
						if iv, err := strconv.Atoi(strings.TrimSpace(segs[0])); err == nil && iv > 0 {
							grp.Interval = iv
						}
					}
					if len(segs) >= 3 {
						if tol, err := strconv.Atoi(strings.TrimSpace(segs[2])); err == nil && tol > 0 {
							grp.Tolerance = tol
						}
					}
				} else if item == ".*" {
					grp.Filter = ".*"
				} else {
					grp.Filter = item
				}
			}
			if grp.Type == "url-test" && grp.URL == "" {
				grp.URL = "http://www.gstatic.com/generate_204"
				grp.Interval = 300
				grp.Tolerance = 50
			}
			cfg.ProxyGroups = append(cfg.ProxyGroups, grp)
		}
	}
	return cfg
}

type parsedOverride struct {
	PrependRules  []RuleEntry
	AppendRules   []RuleEntry
	DisabledSet   map[string]bool
	GroupRewrites map[string]string
	CustomGroups  []ProxyGroupDef
	EnableTFO     *bool
	EnableAdBlock *bool
	DNSMode       string
}

func decodeOverride(ov *model.UserRuleOverride) parsedOverride {
	out := parsedOverride{
		DisabledSet:   map[string]bool{},
		GroupRewrites: map[string]string{},
	}
	if ov == nil {
		return out
	}
	_ = json.Unmarshal([]byte(ov.PrependRulesJSON), &out.PrependRules)
	_ = json.Unmarshal([]byte(ov.AppendRulesJSON), &out.AppendRules)
	var disabled []string
	_ = json.Unmarshal([]byte(ov.DisabledRulesJSON), &disabled)
	for _, d := range disabled {
		out.DisabledSet[d] = true
	}
	_ = json.Unmarshal([]byte(ov.GroupRewritesJSON), &out.GroupRewrites)
	_ = json.Unmarshal([]byte(ov.CustomGroupsJSON), &out.CustomGroups)
	out.EnableTFO = ov.EnableTFO
	out.EnableAdBlock = ov.EnableAdBlock
	out.DNSMode = ov.DNSMode
	return out
}

func CompileEffectiveConfig(preset *model.RulePreset, globalOv, userOv *model.UserRuleOverride) (*CompiledConfig, error) {
	var pCfg PresetConfig
	if err := json.Unmarshal([]byte(preset.ConfigJSON), &pCfg); err != nil {
		return nil, err
	}
	if pCfg.ClashMixedPort <= 0 {
		pCfg.ClashMixedPort = 7890
	}
	if pCfg.DNSMode == "" {
		pCfg.DNSMode = "fake-ip"
	}

	g := decodeOverride(globalOv)
	u := decodeOverride(userOv)

	mergedRewrites := map[string]string{}
	for k, v := range g.GroupRewrites {
		if strings.TrimSpace(v) != "" {
			mergedRewrites[k] = v
		}
	}
	for k, v := range u.GroupRewrites {
		if strings.TrimSpace(v) != "" {
			mergedRewrites[k] = v
		}
	}

	disabled := map[string]bool{}
	for k := range g.DisabledSet {
		disabled[k] = true
	}
	for k := range u.DisabledSet {
		disabled[k] = true
	}

	enableTFO := pCfg.EnableTFO
	if g.EnableTFO != nil {
		enableTFO = *g.EnableTFO
	}
	if u.EnableTFO != nil {
		enableTFO = *u.EnableTFO
	}

	enableAdBlock := true
	if g.EnableAdBlock != nil {
		enableAdBlock = *g.EnableAdBlock
	}
	if u.EnableAdBlock != nil {
		enableAdBlock = *u.EnableAdBlock
	}

	dnsMode := pCfg.DNSMode
	if g.DNSMode != "" {
		dnsMode = g.DNSMode
	}
	if u.DNSMode != "" {
		dnsMode = u.DNSMode
	}

	rewriteGroup := func(grp string) string {
		if target, ok := mergedRewrites[grp]; ok && target != "" {
			return target
		}
		return grp
	}

	// Merge proxy groups (preset + global custom + user custom)
	groupIndex := map[string]int{}
	groups := make([]ProxyGroupDef, 0, len(pCfg.ProxyGroups)+len(g.CustomGroups)+len(u.CustomGroups))
	upsertGroup := func(grp ProxyGroupDef) {
		if idx, exists := groupIndex[grp.Name]; exists {
			groups[idx] = grp
		} else {
			groupIndex[grp.Name] = len(groups)
			groups = append(groups, grp)
		}
	}
	for _, grp := range pCfg.ProxyGroups {
		upsertGroup(grp)
	}
	for _, grp := range g.CustomGroups {
		upsertGroup(grp)
	}
	for _, grp := range u.CustomGroups {
		upsertGroup(grp)
	}

	out := &CompiledConfig{
		PresetSlug:   preset.Slug,
		PresetName:   preset.Name,
		DNSMode:      dnsMode,
		EnableIPv6:   pCfg.EnableIPv6,
		EnableTFO:    enableTFO,
		MixedPort:    pCfg.ClashMixedPort,
		ProxyGroups:  groups,
		GroupRewrite: mergedRewrites,
	}

	addRuleEntry := func(source string, r RuleEntry) {
		if !r.Enabled || disabled[r.ID] {
			return
		}
		grp := rewriteGroup(r.Group)
		line := fmt.Sprintf("%s,%s,%s", strings.ToUpper(r.Type), r.Payload, grp)
		if r.NoResolv && (strings.Contains(strings.ToUpper(r.Type), "CIDR") || strings.EqualFold(r.Type, "GEOIP")) {
			line += ",no-resolve"
		}
		out.Timeline = append(out.Timeline, CompiledRuleItem{
			Source:  source,
			Kind:    "rule",
			ID:      r.ID,
			Type:    strings.ToUpper(r.Type),
			Payload: r.Payload,
			Group:   grp,
			RawLine: line,
			Comment: r.Comment,
		})
	}

	// 1. User prepend rules (highest priority)
	for _, r := range u.PrependRules {
		addRuleEntry("user_override", r)
	}
	// 2. Global admin prepend rules
	for _, r := range g.PrependRules {
		addRuleEntry("global_override", r)
	}
	// 3. Preset static rules
	for _, r := range pCfg.StaticRules {
		addRuleEntry("preset_static", r)
	}

	// 4. Preset RuleSets (excluding trailing GEOIP/FINAL so AppendRules sit right before fallback)
	var trailing []RuleSetDef
	for _, rs := range pCfg.RuleSets {
		if disabled[rs.ID] || (!enableAdBlock && rs.IsAdBlock) {
			out.Timeline = append(out.Timeline, CompiledRuleItem{
				Source:     "preset_ruleset",
				Kind:       "ruleset",
				ID:         rs.ID,
				Type:       "RULE-SET",
				Payload:    rs.ID,
				Group:      rs.Group,
				RawLine:    fmt.Sprintf("# [已禁用] %s -> %s", rs.ID, rs.Group),
				Overridden: true,
			})
			continue
		}
		if rs.InlineType != "" {
			trailing = append(trailing, rs)
			continue
		}
		rsCopy := rs
		rsCopy.Group = rewriteGroup(rs.Group)
		out.RuleSets = append(out.RuleSets, rsCopy)
		out.Timeline = append(out.Timeline, CompiledRuleItem{
			Source:     "preset_ruleset",
			Kind:       "ruleset",
			ID:         rsCopy.ID,
			Type:       "RULE-SET",
			Payload:    rsCopy.ID,
			Group:      rsCopy.Group,
			RawLine:    fmt.Sprintf("RULE-SET,%s,%s", rsCopy.ID, rsCopy.Group),
			Overridden: rsCopy.Group != rs.Group,
		})
	}

	// 5. Append rules before fallback GEOIP/FINAL
	for _, r := range u.AppendRules {
		addRuleEntry("user_override", r)
	}
	for _, r := range g.AppendRules {
		addRuleEntry("global_override", r)
	}

	// 6. Trailing GEOIP / FINAL
	for _, rs := range trailing {
		grp := rewriteGroup(rs.Group)
		rsCopy := rs
		rsCopy.Group = grp
		out.RuleSets = append(out.RuleSets, rsCopy)
		raw := fmt.Sprintf("MATCH,%s", grp)
		typ := "MATCH"
		payload := ""
		if strings.EqualFold(rs.InlineType, "GEOIP") {
			typ = "GEOIP"
			payload = rs.InlineArg
			raw = fmt.Sprintf("GEOIP,%s,%s,no-resolve", rs.InlineArg, grp)
		}
		out.Timeline = append(out.Timeline, CompiledRuleItem{
			Source:  "final",
			Kind:    "inline",
			ID:      rs.ID,
			Type:    typ,
			Payload: payload,
			Group:   grp,
			RawLine: raw,
		})
	}

	return out, nil
}

type MatchTestResult struct {
	Target      string            `json:"target"`
	Matched     bool              `json:"matched"`
	MatchedItem *CompiledRuleItem `json:"matchedItem,omitempty"`
	FinalGroup  string            `json:"finalGroup"`
}

func SimulateMatch(compiled *CompiledConfig, target string) MatchTestResult {
	host := strings.ToLower(strings.TrimSpace(target))
	if host == "" {
		return MatchTestResult{Target: target}
	}

	for i := range compiled.Timeline {
		item := compiled.Timeline[i]
		if item.Overridden {
			continue
		}
		if item.Kind == "rule" {
			p := strings.ToLower(strings.TrimSpace(item.Payload))
			hit := false
			switch item.Type {
			case "DOMAIN":
				hit = host == p
			case "DOMAIN-SUFFIX":
				hit = host == p || strings.HasSuffix(host, "."+p)
			case "DOMAIN-KEYWORD":
				hit = strings.Contains(host, p)
			case "DOMAIN-REGEX":
				if re, err := regexp.Compile(item.Payload); err == nil {
					hit = re.MatchString(host)
				}
			case "IP-CIDR", "IP-CIDR6":
				hit = strings.HasPrefix(host, strings.Split(p, "/")[0])
			}
			if hit {
				return MatchTestResult{
					Target:      target,
					Matched:     true,
					MatchedItem: &item,
					FinalGroup:  item.Group,
				}
			}
		} else if item.Kind == "ruleset" {
			if hitHintRuleSet(item.ID, host) {
				return MatchTestResult{
					Target:      target,
					Matched:     true,
					MatchedItem: &item,
					FinalGroup:  item.Group,
				}
			}
		} else if item.Type == "GEOIP" && strings.EqualFold(item.Payload, "CN") && strings.HasSuffix(host, ".cn") {
			return MatchTestResult{
				Target:      target,
				Matched:     true,
				MatchedItem: &item,
				FinalGroup:  item.Group,
			}
		} else if item.Type == "MATCH" {
			return MatchTestResult{
				Target:      target,
				Matched:     true,
				MatchedItem: &item,
				FinalGroup:  item.Group,
			}
		}
	}

	return MatchTestResult{Target: target, FinalGroup: "🚀 节点选择"}
}

func hitHintRuleSet(id, host string) bool {
	hints := map[string][]string{
		"ai":          {"claude.ai", "anthropic.com", "chatgpt.com", "openai.com", "generativelanguage.googleapis.com", "perplexity.ai", "grok.com"},
		"openai":      {"openai.com", "chatgpt.com", "oaistatic.com", "oaiusercontent.com"},
		"telegram":    {"t.me", "telegram.org", "tdesktop.com"},
		"youtube":     {"youtube.com", "youtu.be", "ytimg.com", "googlevideo.com"},
		"netflix":     {"netflix.com", "nflxvideo.net", "nflximg.net"},
		"bilibili":    {"bilibili.com", "bilivideo.com", "biliapi.net"},
		"apple":       {"apple.com", "icloud.com", "mzstatic.com"},
		"microsoft":   {"microsoft.com", "live.com", "office.com", "windowsupdate.com"},
		"bing":        {"bing.com", "bingapis.com"},
		"onedrive":    {"onedrive.live.com", "sharepoint.com"},
		"steam":       {"steampowered.com", "steamcommunity.com", "steamstatic.com"},
		"googlefcm":   {"mtalk.google.com", "fcm.googleapis.com"},
		"chinadomain": {"baidu.com", "qq.com", "weixin.qq.com", "taobao.com", "alipay.com", "jd.com", "aliyun.com"},
		"proxylite":   {"google.com", "github.com", "x.com", "twitter.com", "wikipedia.org", "reddit.com"},
	}
	for _, dom := range hints[id] {
		if host == dom || strings.HasSuffix(host, "."+dom) {
			return true
		}
	}
	return false
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
