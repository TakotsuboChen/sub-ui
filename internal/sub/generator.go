package sub

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/rules"
	"github.com/TakotsuboChen/sub-ui/internal/sui"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

type AggregatedNode struct {
	Proxies []map[string]any
	Links   []string
}

type Generator struct {
	db *gorm.DB
}

func NewGenerator(db *gorm.DB) *Generator {
	return &Generator{db: db}
}

func DetectTarget(userAgent, queryTarget string) string {
	t := strings.ToLower(strings.TrimSpace(queryTarget))
	switch t {
	case "clash", "mihomo", "meta", "yaml":
		return "clash"
	case "singbox", "sing-box", "json":
		return "singbox"
	case "base64", "b64":
		return "base64"
	case "uri", "plain", "links":
		return "uri"
	}

	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "clash"), strings.Contains(ua, "mihomo"), strings.Contains(ua, "flclash"), strings.Contains(ua, "stash"), strings.Contains(ua, "verge"):
		return "clash"
	case strings.Contains(ua, "sing-box"), strings.Contains(ua, "sfa"), strings.Contains(ua, "sfi"), strings.Contains(ua, "sfm"), strings.Contains(ua, "hiddify"), strings.Contains(ua, "nekobox"):
		return "singbox"
	default:
		return "base64"
	}
}

func (g *Generator) BuildHeaders(user *model.User, siteTitle string, intervalHours int) map[string]string {
	if siteTitle == "" {
		siteTitle = "Sub-UI"
	}
	if intervalHours <= 0 {
		intervalHours = 12
	}
	upload := user.UsedBytes / 4
	download := user.UsedBytes - upload
	userInfo := fmt.Sprintf("upload=%d; download=%d; total=%d; expire=%d", upload, download, user.QuotaBytes, user.ExpiresAt)
	return map[string]string{
		"Subscription-Userinfo":   userInfo,
		"Profile-Update-Interval": strconv.Itoa(intervalHours),
		"Profile-Title":           siteTitle,
		"Content-Disposition":     fmt.Sprintf("attachment; filename=\"%s.yaml\"; filename*=UTF-8''%s.yaml", asciiSafe(siteTitle), url.PathEscape(siteTitle)),
	}
}

func (g *Generator) AggregateUserNodes(ctx context.Context, user *model.User, enableTFO bool) (*AggregatedNode, error) {
	var nodes []model.Node
	if err := g.db.Where("enabled = ?", true).Order("sort_order ASC, id ASC").Find(&nodes).Error; err != nil {
		return nil, err
	}

	var bindings []model.UserNodeBinding
	_ = g.db.Where("user_id = ?", user.ID).Find(&bindings).Error
	bindByNode := make(map[uint]model.UserNodeBinding, len(bindings))
	for _, b := range bindings {
		bindByNode[b.NodeID] = b
	}

	// Check if user has plan-scoped node restrictions
	var allowedNodes map[uint]bool
	if user.PlanID != nil {
		var plan model.Plan
		if err := g.db.First(&plan, *user.PlanID).Error; err == nil {
			var ids []uint
			if json.Unmarshal([]byte(plan.NodeIDsJSON), &ids) == nil && len(ids) > 0 {
				allowedNodes = make(map[uint]bool, len(ids))
				for _, id := range ids {
					allowedNodes[id] = true
				}
			}
		}
	}

	agg := &AggregatedNode{}
	takenNames := map[string]int{}

	for _, node := range nodes {
		if allowedNodes != nil && !allowedNodes[node.ID] {
			continue
		}

		prefix := node.NamePrefix
		if prefix == "" && node.Region != "" {
			prefix = fmt.Sprintf("[%s] ", node.Region)
		}

		if node.NodeType == "external_sub" {
			rawSub := strings.TrimSpace(node.ExternalSubURL)
			if strings.HasPrefix(rawSub, "http://") || strings.HasPrefix(rawSub, "https://") {
				if body, err := fetchExternalText(ctx, rawSub); err == nil {
					g.ingestPlainOrYAML(body, prefix, node.EnableTFO && enableTFO, node.EnableUDP, takenNames, agg)
				}
			} else if rawSub != "" {
				g.ingestPlainOrYAML(rawSub, prefix, node.EnableTFO && enableTFO, node.EnableUDP, takenNames, agg)
			}
			continue
		}

		binding, ok := bindByNode[node.ID]
		if !ok || !binding.SyncedEnable {
			continue
		}

		client, err := sui.NewClient(sui.NodeConfig{
			PanelURL:      node.PanelURL,
			APIToken:      node.APIToken,
			SubBaseURL:    node.SubBaseURL,
			APIProxy:      node.APIProxy,
			SkipTLSVerify: node.SkipTLSVerify,
			Timeout:       10 * time.Second,
		})
		if err != nil {
			continue
		}

		var gotClash bool
		if node.SubBaseURL != "" {
			if rawYAML, fErr := client.FetchSubscription(ctx, binding.SUIClientName, "clash"); fErr == nil {
				var parsed map[string]any
				if yaml.Unmarshal([]byte(rawYAML), &parsed) == nil {
					if rawProxies, ok := parsed["proxies"].([]any); ok {
						for _, item := range rawProxies {
							if pMap, ok := item.(map[string]any); ok {
								name, _ := pMap["name"].(string)
								uniqueName := uniquifyName(prefix+name, takenNames)
								pMap["name"] = uniqueName
								if node.EnableTFO && enableTFO {
									pMap["tfo"] = true
								}
								if node.EnableUDP {
									pMap["udp"] = true
								}
								agg.Proxies = append(agg.Proxies, pMap)
								gotClash = true
							}
						}
					}
				}
			}
			if rawLinks, lErr := client.FetchSubscription(ctx, binding.SUIClientName, ""); lErr == nil {
				for _, line := range decodeBase64Lines(rawLinks) {
					agg.Links = append(agg.Links, renameShareLink(line, prefix))
				}
			}
		}

		// Fallback via /apiv2/clients?id=... if SubBaseURL wasn't reachable
		if !gotClash && binding.SUIClientID > 0 {
			if clList, cErr := client.GetClients(ctx, binding.SUIClientID); cErr == nil && len(clList) > 0 {
				var links []struct {
					Type   string `json:"type"`
					Remark string `json:"remark"`
					URI    string `json:"uri"`
				}
				if json.Unmarshal(clList[0].Links, &links) == nil {
					for _, l := range links {
						if l.URI == "" {
							continue
						}
						agg.Links = append(agg.Links, renameShareLink(l.URI, prefix))
						if pMap, ok := ShareURIToClashProxy(l.URI, prefix, node.EnableTFO && enableTFO, node.EnableUDP); ok {
							pMap["name"] = uniquifyName(fmt.Sprint(pMap["name"]), takenNames)
							agg.Proxies = append(agg.Proxies, pMap)
						}
					}
				}
			}
		}
	}

	return agg, nil
}

func (g *Generator) RenderClashYAML(agg *AggregatedNode, compiled *rules.CompiledConfig) (string, error) {
	proxyNames := make([]string, 0, len(agg.Proxies))
	for _, p := range agg.Proxies {
		if n, ok := p["name"].(string); ok && n != "" {
			proxyNames = append(proxyNames, n)
		}
	}

	clashGroups := make([]map[string]any, 0, len(compiled.ProxyGroups))
	for _, grp := range compiled.ProxyGroups {
		members := make([]string, 0, len(grp.Proxies)+len(proxyNames))
		members = append(members, grp.Proxies...)
		if grp.Filter != "" {
			re, err := regexp.Compile("(?i)" + grp.Filter)
			for _, pn := range proxyNames {
				if err == nil && re.MatchString(pn) {
					members = append(members, pn)
				}
			}
		}
		if len(members) == 0 {
			// Ensure Mihomo never crashes on an empty proxy-group
			if len(proxyNames) > 0 && grp.Filter == "" {
				members = append(members, proxyNames...)
			} else {
				members = append(members, "DIRECT")
			}
		}

		gm := map[string]any{
			"name":    grp.Name,
			"type":    grp.Type,
			"proxies": members,
		}
		if grp.Type == "url-test" || grp.Type == "fallback" || grp.Type == "load-balance" {
			u := grp.URL
			if u == "" {
				u = "http://www.gstatic.com/generate_204"
			}
			iv := grp.Interval
			if iv <= 0 {
				iv = 300
			}
			gm["url"] = u
			gm["interval"] = iv
			if grp.Tolerance > 0 {
				gm["tolerance"] = grp.Tolerance
			}
		}
		clashGroups = append(clashGroups, gm)
	}

	ruleProviders := map[string]any{}
	for _, rs := range compiled.RuleSets {
		if rs.InlineType != "" || rs.URL == "" {
			continue
		}
		behavior := rs.Behavior
		if behavior == "" {
			behavior = "classical"
		}
		ruleProviders[rs.ID] = map[string]any{
			"type":     "http",
			"behavior": behavior,
			"format":   "text",
			"url":      rs.URL,
			"path":     fmt.Sprintf("./ruleset/%s.list", rs.ID),
			"interval": 86400,
		}
	}

	finalRules := make([]string, 0, len(compiled.Timeline))
	for _, item := range compiled.Timeline {
		if item.Overridden {
			continue
		}
		finalRules = append(finalRules, item.RawLine)
	}

	enhancedMode := "fake-ip"
	if compiled.DNSMode == "redir-host" {
		enhancedMode = "redir-host"
	}

	doc := map[string]any{
		"mixed-port":          compiled.MixedPort,
		"allow-lan":           false,
		"mode":                "rule",
		"log-level":           "info",
		"ipv6":                compiled.EnableIPv6,
		"external-controller": "127.0.0.1:9090",
		"tun": map[string]any{
			"enable":              true,
			"stack":               "system",
			"auto-route":          true,
			"auto-detect-interface": true,
			"dns-hijack":          []string{"any:53"},
		},
		"dns": map[string]any{
			"enable":         true,
			"ipv6":           compiled.EnableIPv6,
			"enhanced-mode":  enhancedMode,
			"fake-ip-range":  "198.18.0.1/16",
			"respect-rules":  true,
			"default-nameserver": []string{"223.5.5.5", "119.29.29.29"},
			"nameserver":     []string{"https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"},
			"proxy-server-nameserver": []string{"https://doh.pub/dns-query"},
			"fallback":       []string{"https://1.1.1.1/dns-query", "https://dns.google/dns-query"},
			"fake-ip-filter": []string{"*.lan", "*.local", "localhost.ptlogin2.qq.com"},
		},
		"proxies":        agg.Proxies,
		"proxy-groups":   clashGroups,
		"rule-providers": ruleProviders,
		"rules":          finalRules,
	}

	out, err := yaml.Marshal(doc)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func (g *Generator) RenderSingboxJSON(agg *AggregatedNode, compiled *rules.CompiledConfig) (string, error) {
	outbounds := []map[string]any{
		{"type": "direct", "tag": "DIRECT"},
		{"type": "block", "tag": "REJECT"},
	}

	var nodeTags []string
	for _, p := range agg.Proxies {
		if sb, ok := clashProxyToSingboxOutbound(p); ok {
			tag := fmt.Sprint(sb["tag"])
			nodeTags = append(nodeTags, tag)
			outbounds = append(outbounds, sb)
		}
	}

	for _, grp := range compiled.ProxyGroups {
		members := make([]string, 0, len(grp.Proxies)+len(nodeTags))
		members = append(members, grp.Proxies...)
		if grp.Filter != "" {
			re, err := regexp.Compile("(?i)" + grp.Filter)
			for _, nt := range nodeTags {
				if err == nil && re.MatchString(nt) {
					members = append(members, nt)
				}
			}
		}
		if len(members) == 0 {
			if len(nodeTags) > 0 && grp.Filter == "" {
				members = append(members, nodeTags...)
			} else {
				members = append(members, "DIRECT")
			}
		}
		sbType := "selector"
		if grp.Type == "url-test" || grp.Type == "fallback" {
			sbType = "urltest"
		}
		ob := map[string]any{
			"tag":       grp.Name,
			"type":      sbType,
			"outbounds": members,
		}
		if sbType == "urltest" {
			ob["url"] = "http://www.gstatic.com/generate_204"
			ob["interval"] = "5m"
			ob["tolerance"] = 50
		}
		outbounds = append(outbounds, ob)
	}

	var ruleSets []map[string]any
	srsByID := map[string]string{}
	for _, rs := range compiled.RuleSets {
		if rs.SingboxSRS != "" {
			srsByID[rs.ID] = rs.SingboxSRS
			ruleSets = append(ruleSets, map[string]any{
				"tag":             rs.ID,
				"type":            "remote",
				"format":          "binary",
				"url":             rs.SingboxSRS,
				"download_detour": "DIRECT",
			})
		}
	}

	sbRules := []map[string]any{
		{"action": "sniff"},
		{"protocol": "dns", "action": "hijack-dns"},
		{"ip_is_private": true, "outbound": "DIRECT"},
	}

	finalOutbound := "🚀 节点选择"
	for _, item := range compiled.Timeline {
		if item.Overridden {
			continue
		}
		switch item.Type {
		case "DOMAIN":
			sbRules = append(sbRules, map[string]any{"domain": []string{item.Payload}, "outbound": item.Group})
		case "DOMAIN-SUFFIX":
			sbRules = append(sbRules, map[string]any{"domain_suffix": []string{item.Payload}, "outbound": item.Group})
		case "DOMAIN-KEYWORD":
			sbRules = append(sbRules, map[string]any{"domain_keyword": []string{item.Payload}, "outbound": item.Group})
		case "IP-CIDR", "IP-CIDR6":
			sbRules = append(sbRules, map[string]any{"ip_cidr": []string{item.Payload}, "outbound": item.Group})
		case "RULE-SET":
			if _, ok := srsByID[item.Payload]; ok {
				sbRules = append(sbRules, map[string]any{"rule_set": []string{item.Payload}, "outbound": item.Group})
			}
		case "MATCH":
			finalOutbound = item.Group
		}
	}

	doc := map[string]any{
		"log": map[string]any{"level": "info", "timestamp": true},
		"dns": map[string]any{
			"servers": []map[string]any{
				{"tag": "remote", "address": "https://1.1.1.1/dns-query", "detour": finalOutbound},
				{"tag": "local", "address": "https://223.5.5.5/dns-query", "detour": "DIRECT"},
			},
			"rules": []map[string]any{
				{"outbound": "any", "server": "local"},
			},
			"final": "remote",
		},
		"inbounds": []map[string]any{
			{
				"type":       "tun",
				"address":    []string{"172.19.0.1/30"},
				"auto_route": true,
				"stack":      "system",
			},
			{
				"type":        "mixed",
				"listen":      "127.0.0.1",
				"listen_port": 2080,
			},
		},
		"outbounds": outbounds,
		"route": map[string]any{
			"auto_detect_interface": true,
			"rule_set":              ruleSets,
			"rules":                 sbRules,
			"final":                 finalOutbound,
		},
	}

	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (g *Generator) RenderLinks(agg *AggregatedNode, encodeBase64 bool) string {
	joined := strings.Join(agg.Links, "\n")
	if !encodeBase64 {
		return joined
	}
	return base64.StdEncoding.EncodeToString([]byte(joined))
}

func (g *Generator) ingestPlainOrYAML(body, prefix string, tfo, udp bool, taken map[string]int, agg *AggregatedNode) {
	var parsed map[string]any
	if strings.Contains(body, "proxies:") && yaml.Unmarshal([]byte(body), &parsed) == nil {
		if rawProxies, ok := parsed["proxies"].([]any); ok {
			for _, item := range rawProxies {
				if pMap, ok := item.(map[string]any); ok {
					name, _ := pMap["name"].(string)
					pMap["name"] = uniquifyName(prefix+name, taken)
					if tfo {
						pMap["tfo"] = true
					}
					if udp {
						pMap["udp"] = true
					}
					agg.Proxies = append(agg.Proxies, pMap)
				}
			}
			return
		}
	}
	for _, line := range decodeBase64Lines(body) {
		agg.Links = append(agg.Links, renameShareLink(line, prefix))
		if pMap, ok := ShareURIToClashProxy(line, prefix, tfo, udp); ok {
			pMap["name"] = uniquifyName(fmt.Sprint(pMap["name"]), taken)
			agg.Proxies = append(agg.Proxies, pMap)
		}
	}
}

func ShareURIToClashProxy(uriStr, prefix string, tfo, udp bool) (map[string]any, bool) {
	uriStr = strings.TrimSpace(uriStr)
	if uriStr == "" {
		return nil, false
	}
	if strings.HasPrefix(uriStr, "vmess://") {
		rawB64 := strings.TrimPrefix(uriStr, "vmess://")
		decoded, err := decodeFlexBase64(rawB64)
		if err != nil {
			return nil, false
		}
		var vm map[string]any
		if json.Unmarshal(decoded, &vm) != nil {
			return nil, false
		}
		port := 443
		if pFloat, ok := vm["port"].(float64); ok {
			port = int(pFloat)
		} else if pStr, ok := vm["port"].(string); ok {
			if pInt, err := strconv.Atoi(pStr); err == nil {
				port = pInt
			}
		}
		p := map[string]any{
			"name":    prefix + fmt.Sprint(vm["ps"]),
			"type":    "vmess",
			"server":  vm["add"],
			"port":    port,
			"uuid":    vm["id"],
			"alterId": 0,
			"cipher":  "auto",
			"udp":     udp,
			"tfo":     tfo,
		}
		if vm["tls"] == "tls" {
			p["tls"] = true
			if sni, ok := vm["sni"].(string); ok && sni != "" {
				p["servername"] = sni
			}
		}
		if netType, ok := vm["net"].(string); ok && netType == "ws" {
			p["network"] = "ws"
			p["ws-opts"] = map[string]any{
				"path":    vm["path"],
				"headers": map[string]any{"Host": vm["host"]},
			}
		}
		return p, true
	}

	u, err := url.Parse(uriStr)
	if err != nil || u.Host == "" {
		return nil, false
	}
	port, _ := strconv.Atoi(u.Port())
	if port <= 0 {
		port = 443
	}
	q := u.Query()
	remark, _ := url.QueryUnescape(u.Fragment)
	if remark == "" {
		remark = u.Hostname()
	}
	name := prefix + remark

	switch strings.ToLower(u.Scheme) {
	case "vless":
		p := map[string]any{
			"name":       name,
			"type":       "vless",
			"server":     u.Hostname(),
			"port":       port,
			"uuid":       u.User.Username(),
			"udp":        udp,
			"tfo":        tfo,
			"servername": q.Get("sni"),
		}
		if flow := q.Get("flow"); flow != "" {
			p["flow"] = flow
		}
		if fp := q.Get("fp"); fp != "" {
			p["client-fingerprint"] = fp
		}
		sec := q.Get("security")
		if sec == "tls" || sec == "reality" {
			p["tls"] = true
		}
		if sec == "reality" {
			p["reality-opts"] = map[string]any{
				"public-key": q.Get("pbk"),
				"short-id":   q.Get("sid"),
			}
		}
		if netType := q.Get("type"); netType != "" && netType != "tcp" {
			p["network"] = netType
			if netType == "ws" {
				p["ws-opts"] = map[string]any{
					"path":    q.Get("path"),
					"headers": map[string]any{"Host": q.Get("host")},
				}
			} else if netType == "grpc" {
				p["grpc-opts"] = map[string]any{"grpc-service-name": q.Get("serviceName")}
			}
		}
		return p, true
	case "trojan":
		p := map[string]any{
			"name":     name,
			"type":     "trojan",
			"server":   u.Hostname(),
			"port":     port,
			"password": u.User.Username(),
			"sni":      q.Get("sni"),
			"udp":      udp,
			"tfo":      tfo,
		}
		if q.Get("allowInsecure") == "1" || q.Get("insecure") == "1" {
			p["skip-cert-verify"] = true
		}
		return p, true
	case "hysteria2", "hy2":
		p := map[string]any{
			"name":     name,
			"type":     "hysteria2",
			"server":   u.Hostname(),
			"port":     port,
			"password": u.User.Username(),
			"sni":      q.Get("sni"),
		}
		if mport := q.Get("mport"); mport != "" {
			p["ports"] = mport
		}
		if obfs := q.Get("obfs"); obfs != "" {
			p["obfs"] = obfs
			p["obfs-password"] = q.Get("obfs-password")
		}
		if q.Get("insecure") == "1" {
			p["skip-cert-verify"] = true
		}
		return p, true
	case "tuic":
		pwd, _ := u.User.Password()
		return map[string]any{
			"name":                  name,
			"type":                  "tuic",
			"server":                u.Hostname(),
			"port":                  port,
			"uuid":                  u.User.Username(),
			"password":              pwd,
			"sni":                   q.Get("sni"),
			"congestion-controller": q.Get("congestion_control"),
		}, true
	case "ss":
		userInfo := u.User.Username()
		decoded, err := decodeFlexBase64(userInfo)
		method, pwd := "", ""
		if err == nil && strings.Contains(string(decoded), ":") {
			parts := strings.SplitN(string(decoded), ":", 2)
			method, pwd = parts[0], parts[1]
		} else {
			method = userInfo
			pwd, _ = u.User.Password()
		}
		return map[string]any{
			"name":     name,
			"type":     "ss",
			"server":   u.Hostname(),
			"port":     port,
			"cipher":   method,
			"password": pwd,
			"udp":      udp,
			"tfo":      tfo,
		}, true
	}
	return nil, false
}

func clashProxyToSingboxOutbound(p map[string]any) (map[string]any, bool) {
	t, _ := p["type"].(string)
	tag, _ := p["name"].(string)
	server, _ := p["server"].(string)
	port := p["port"]
	if tag == "" || server == "" {
		return nil, false
	}

	ob := map[string]any{
		"tag":         tag,
		"server":      server,
		"server_port": port,
	}

	switch t {
	case "vless":
		ob["type"] = "vless"
		ob["uuid"] = p["uuid"]
		if flow, ok := p["flow"].(string); ok && flow != "" {
			ob["flow"] = flow
		}
	case "vmess":
		ob["type"] = "vmess"
		ob["uuid"] = p["uuid"]
		ob["security"] = "auto"
	case "trojan":
		ob["type"] = "trojan"
		ob["password"] = p["password"]
	case "hysteria2":
		ob["type"] = "hysteria2"
		ob["password"] = p["password"]
	case "tuic":
		ob["type"] = "tuic"
		ob["uuid"] = p["uuid"]
		ob["password"] = p["password"]
	case "ss":
		ob["type"] = "shadowsocks"
		ob["method"] = p["cipher"]
		ob["password"] = p["password"]
	default:
		return nil, false
	}

	if tlsEnabled, _ := p["tls"].(bool); tlsEnabled || t == "trojan" || t == "hysteria2" || t == "tuic" {
		tlsObj := map[string]any{"enabled": true}
		if sni, ok := p["servername"].(string); ok && sni != "" {
			tlsObj["server_name"] = sni
		} else if sni, ok := p["sni"].(string); ok && sni != "" {
			tlsObj["server_name"] = sni
		}
		if skip, ok := p["skip-cert-verify"].(bool); ok && skip {
			tlsObj["insecure"] = true
		}
		if fp, ok := p["client-fingerprint"].(string); ok && fp != "" {
			tlsObj["utls"] = map[string]any{"enabled": true, "fingerprint": fp}
		}
		if realOpts, ok := p["reality-opts"].(map[string]any); ok {
			tlsObj["reality"] = map[string]any{
				"enabled":    true,
				"public_key": realOpts["public-key"],
				"short_id":   realOpts["short-id"],
			}
		}
		ob["tls"] = tlsObj
	}
	return ob, true
}

func renameShareLink(link, prefix string) string {
	if prefix == "" {
		return link
	}
	if strings.HasPrefix(link, "vmess://") {
		if decoded, err := decodeFlexBase64(strings.TrimPrefix(link, "vmess://")); err == nil {
			var vm map[string]any
			if json.Unmarshal(decoded, &vm) == nil {
				vm["ps"] = prefix + fmt.Sprint(vm["ps"])
				if b, err := json.Marshal(vm); err == nil {
					return "vmess://" + base64.StdEncoding.EncodeToString(b)
				}
			}
		}
		return link
	}
	if idx := strings.LastIndex(link, "#"); idx > 0 {
		frag, _ := url.QueryUnescape(link[idx+1:])
		return link[:idx+1] + url.QueryEscape(prefix+frag)
	}
	return link + "#" + url.QueryEscape(strings.TrimSpace(prefix))
}

func decodeBase64Lines(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if !strings.Contains(trimmed, "://") {
		if decoded, err := decodeFlexBase64(trimmed); err == nil {
			trimmed = string(decoded)
		}
	}
	var out []string
	for _, line := range strings.Split(strings.ReplaceAll(trimmed, "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func decodeFlexBase64(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if m := len(s) % 4; m != 0 {
		s += strings.Repeat("=", 4-m)
	}
	if b, err := base64.StdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(s)
}

func uniquifyName(name string, taken map[string]int) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Node"
	}
	if count := taken[name]; count == 0 {
		taken[name] = 1
		return name
	}
	taken[name]++
	return fmt.Sprintf("%s #%d", name, taken[name])
}

func fetchExternalText(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "ClashMeta/1.18")
	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func asciiSafe(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "sub-ui"
	}
	return b.String()
}
