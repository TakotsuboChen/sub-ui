package sui

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/proxy"
)

type NodeConfig struct {
	PanelURL      string
	APIToken      string
	SubBaseURL    string
	APIProxy      string
	SkipTLSVerify bool
	Timeout       time.Duration
}

type APIResponse struct {
	Success bool            `json:"success"`
	Msg     string          `json:"msg"`
	Obj     json.RawMessage `json:"obj"`
}

type ClientObj struct {
	ID         uint            `json:"id,omitempty"`
	Enable     bool            `json:"enable"`
	Name       string          `json:"name"`
	Config     json.RawMessage `json:"config,omitempty"`
	Inbounds   json.RawMessage `json:"inbounds"`
	Links      json.RawMessage `json:"links,omitempty"`
	Volume     int64           `json:"volume"`
	Expiry     int64           `json:"expiry"`
	Down       int64           `json:"down"`
	Up         int64           `json:"up"`
	Desc       string          `json:"desc"`
	Group      string          `json:"group"`
	Remark     string          `json:"remark"`
	CreatedAt  int64           `json:"createdAt"`
	OnlineAt   int64           `json:"onlineAt"`
	DelayStart bool            `json:"delayStart"`
	AutoReset  bool            `json:"autoReset"`
	ResetDays  int             `json:"resetDays"`
	NextReset  int64           `json:"nextReset"`
	TotalUp    int64           `json:"totalUp"`
	TotalDown  int64           `json:"totalDown"`
}

type InboundObj struct {
	ID      uint            `json:"id"`
	Type    string          `json:"type"`
	Tag     string          `json:"tag"`
	TlsID   uint            `json:"tls_id"`
	Enable  bool            `json:"enable"`
	Options json.RawMessage `json:"options,omitempty"`
	Addrs   json.RawMessage `json:"addrs,omitempty"`
	OutJSON json.RawMessage `json:"out_json,omitempty"`
}

type OnlinesObj struct {
	Inbound  []string `json:"inbound"`
	User     []string `json:"user"`
	Outbound []string `json:"outbound"`
}

type LoadObj struct {
	SubURI   string       `json:"subURI"`
	Clients  []ClientObj  `json:"clients"`
	Inbounds []InboundObj `json:"inbounds"`
	Onlines  OnlinesObj   `json:"onlines"`
}

type Client struct {
	cfg        NodeConfig
	httpClient *http.Client
}

func NewClient(cfg NodeConfig) (*Client, error) {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 12 * time.Second
	}
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: cfg.SkipTLSVerify}, // #nosec G402 user-controlled option per node
		MaxIdleConns:    10,
		IdleConnTimeout: 30 * time.Second,
	}

	if proxyStr := strings.TrimSpace(cfg.APIProxy); proxyStr != "" {
		u, err := url.Parse(proxyStr)
		if err != nil {
			return nil, fmt.Errorf("invalid api_proxy url: %w", err)
		}
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
			tr.Proxy = http.ProxyURL(u)
		case "socks5", "socks5h":
			var auth *proxy.Auth
			if u.User != nil {
				pwd, _ := u.User.Password()
				auth = &proxy.Auth{User: u.User.Username(), Password: pwd}
			}
			dialer, err := proxy.SOCKS5("tcp", u.Host, auth, &net.Dialer{Timeout: timeout})
			if err != nil {
				return nil, fmt.Errorf("create socks5 dialer: %w", err)
			}
			tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
				return dialer.Dial(network, addr)
			}
		default:
			return nil, fmt.Errorf("unsupported api_proxy scheme: %s", u.Scheme)
		}
	}

	cfg.PanelURL = strings.TrimRight(strings.TrimSpace(cfg.PanelURL), "/")
	cfg.SubBaseURL = strings.TrimRight(strings.TrimSpace(cfg.SubBaseURL), "/")

	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Transport: tr,
			Timeout:   timeout,
		},
	}, nil
}

func (c *Client) apiURL(path string) string {
	return c.cfg.PanelURL + "/apiv2/" + strings.TrimLeft(path, "/")
}

func (c *Client) doGet(ctx context.Context, endpoint string) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL(endpoint), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Token", c.cfg.APIToken)
	return c.execAPI(req)
}

func (c *Client) doPostForm(ctx context.Context, endpoint string, form url.Values) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL(endpoint), strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Token", c.cfg.APIToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return c.execAPI(req)
}

func (c *Client) execAPI(req *http.Request) (json.RawMessage, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("s-ui http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var apiResp APIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("decode s-ui response: %w", err)
	}
	if !apiResp.Success {
		if apiResp.Msg == "" {
			return nil, errors.New("s-ui api error")
		}
		return nil, errors.New(apiResp.Msg)
	}
	return apiResp.Obj, nil
}

func (c *Client) Load(ctx context.Context) (*LoadObj, error) {
	raw, err := c.doGet(ctx, "load")
	if err != nil {
		return nil, err
	}
	var out LoadObj
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) GetClients(ctx context.Context, ids ...uint) ([]ClientObj, error) {
	endpoint := "clients"
	if len(ids) > 0 {
		parts := make([]string, 0, len(ids))
		for _, id := range ids {
			parts = append(parts, strconv.FormatUint(uint64(id), 10))
		}
		endpoint += "?id=" + strings.Join(parts, ",")
	}
	raw, err := c.doGet(ctx, endpoint)
	if err != nil {
		return nil, err
	}
	var wrapper struct {
		Clients []ClientObj `json:"clients"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Clients, nil
}

func (c *Client) GetInbounds(ctx context.Context) ([]InboundObj, error) {
	raw, err := c.doGet(ctx, "inbounds")
	if err != nil {
		return nil, err
	}
	var wrapper struct {
		Inbounds []InboundObj `json:"inbounds"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Inbounds, nil
}

func (c *Client) GetOnlines(ctx context.Context) (*OnlinesObj, error) {
	raw, err := c.doGet(ctx, "onlines")
	if err != nil {
		return nil, err
	}
	var out OnlinesObj
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) GetStatus(ctx context.Context) (map[string]any, error) {
	raw, err := c.doGet(ctx, "status?r=cpu,mem,sbd")
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *Client) SaveClient(ctx context.Context, action string, client *ClientObj) ([]ClientObj, error) {
	payload, err := json.Marshal(client)
	if err != nil {
		return nil, err
	}
	form := url.Values{}
	form.Set("object", "clients")
	form.Set("action", action)
	form.Set("data", string(payload))

	raw, err := c.doPostForm(ctx, "save", form)
	if err != nil {
		return nil, err
	}
	var wrapper struct {
		Clients []ClientObj `json:"clients"`
	}
	_ = json.Unmarshal(raw, &wrapper)
	return wrapper.Clients, nil
}

func (c *Client) DeleteClient(ctx context.Context, suiClientID uint) error {
	form := url.Values{}
	form.Set("object", "clients")
	form.Set("action", "del")
	form.Set("data", strconv.FormatUint(uint64(suiClientID), 10))
	_, err := c.doPostForm(ctx, "save", form)
	return err
}

func (c *Client) CloseSessions(ctx context.Context, clientName string) error {
	if strings.TrimSpace(clientName) == "" {
		return nil
	}
	form := url.Values{}
	form.Set("u", clientName)
	_, err := c.doPostForm(ctx, "closeSessions", form)
	return err
}

func (c *Client) FetchSubscription(ctx context.Context, clientName, format string) (string, error) {
	if c.cfg.SubBaseURL == "" {
		return "", errors.New("subBaseUrl is empty")
	}
	target := strings.TrimRight(c.cfg.SubBaseURL, "/") + "/" + url.PathEscape(clientName)
	if format != "" {
		target += "?format=" + url.QueryEscape(format)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return "", err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("s-ui sub http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return string(body), nil
}

func BuildDefaultClientConfig(uuidStr, password string) json.RawMessage {
	cfg := map[string]map[string]any{
		"mixed":       {"password": password},
		"socks":       {"password": password},
		"http":        {"password": password},
		"shadowsocks": {"password": password},
		"shadowsocks16": {
			"password": password,
		},
		"vmess":     {"uuid": uuidStr, "alterId": 0},
		"vless":     {"uuid": uuidStr, "flow": "xtls-rprx-vision"},
		"trojan":    {"password": password},
		"naive":     {"password": password},
		"hysteria":  {"auth_str": password},
		"hysteria2": {"password": password},
		"tuic":      {"uuid": uuidStr, "password": password},
		"anytls":    {"password": password},
	}
	b, _ := json.Marshal(cfg)
	return b
}
