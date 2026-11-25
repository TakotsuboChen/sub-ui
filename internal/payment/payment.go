package payment

import (
	"bytes"
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/md5"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	syncer "github.com/TakotsuboChen/sub-ui/internal/sync"
	"gorm.io/gorm"
)

type Service struct {
	db         *gorm.DB
	syncEngine *syncer.Engine
}

func NewService(db *gorm.DB, syncEngine *syncer.Engine) *Service {
	return &Service{db: db, syncEngine: syncEngine}
}

type CheckoutResult struct {
	Order   *model.Order `json:"order"`
	PayMode string       `json:"payMode"` // qrcode | redirect | instant
	PayURL  string       `json:"payUrl"`
}

func (s *Service) EnabledChannels() map[string]bool {
	return map[string]bool{
		"epay_alipay": database.GetSetting(s.db, "epay_enabled", "false") == "true" && database.GetSetting(s.db, "epay_api_url", "") != "",
		"epay_wxpay":  database.GetSetting(s.db, "epay_enabled", "false") == "true" && database.GetSetting(s.db, "epay_api_url", "") != "",
		"alipay_f2f":  database.GetSetting(s.db, "alipay_f2f_enabled", "false") == "true" && database.GetSetting(s.db, "alipay_app_id", "") != "",
		"wechat_v3":   database.GetSetting(s.db, "wechat_v3_enabled", "false") == "true" && database.GetSetting(s.db, "wechat_mch_id", "") != "",
		"sandbox":     database.GetSetting(s.db, "sandbox_pay_enabled", "true") == "true",
		"balance":     true,
	}
}

func (s *Service) CreateOrder(ctx context.Context, user *model.User, plan *model.Plan, orderType, channel, publicBaseURL string) (*CheckoutResult, error) {
	if orderType == "" {
		orderType = "plan_purchase"
	}
	amount := plan.PriceCents
	if amount < 0 {
		return nil, errors.New("invalid plan price")
	}

	now := time.Now()
	orderNo := fmt.Sprintf("SUI%s%04d", now.Format("20060102150405"), now.UnixNano()%10000)

	metaBytes, _ := json.Marshal(map[string]any{
		"planName":     plan.Name,
		"durationDays": plan.DurationDays,
		"quotaBytes":   plan.QuotaBytes,
		"resetMode":    plan.ResetMode,
		"cycleDays":    plan.CycleDays,
	})

	order := &model.Order{
		OrderNo:        orderNo,
		UserID:         user.ID,
		PlanID:         &plan.ID,
		OrderType:      orderType,
		AmountCents:    amount,
		PaymentChannel: channel,
		Status:         "pending",
		MetadataJSON:   string(metaBytes),
		ExpiresAt:      now.Add(30 * time.Minute).Unix(),
	}

	if amount == 0 || channel == "balance" {
		if amount > 0 && user.BalanceCents < amount {
			return nil, errors.New("账户余额不足，请选择在线支付或充值")
		}
		order.PaymentChannel = "balance"
		if err := s.db.Create(order).Error; err != nil {
			return nil, err
		}
		if err := s.FulfillOrder(ctx, order.OrderNo, "BALANCE-"+order.OrderNo); err != nil {
			return nil, err
		}
		_ = s.db.First(order, order.ID).Error
		return &CheckoutResult{Order: order, PayMode: "instant"}, nil
	}

	var payMode, payURL string
	var err error

	switch channel {
	case "sandbox":
		if database.GetSetting(s.db, "sandbox_pay_enabled", "true") != "true" {
			return nil, errors.New("测试沙箱支付已关闭")
		}
		payMode = "qrcode"
		payURL = fmt.Sprintf("%s/api/user/orders/%s/sandbox-pay", strings.TrimRight(publicBaseURL, "/"), orderNo)
	case "epay_alipay", "epay_wxpay":
		if database.GetSetting(s.db, "epay_enabled", "false") != "true" {
			return nil, errors.New("易支付通道未开启")
		}
		epayType := "alipay"
		if channel == "epay_wxpay" {
			epayType = "wxpay"
		}
		payURL, err = s.createEpayURL(order, plan.Name, epayType, publicBaseURL)
		payMode = "redirect"
	case "alipay_f2f":
		if database.GetSetting(s.db, "alipay_f2f_enabled", "false") != "true" {
			return nil, errors.New("支付宝当面付未开启")
		}
		payURL, err = s.createAlipayF2F(ctx, order, plan.Name, publicBaseURL)
		payMode = "qrcode"
	case "wechat_v3":
		if database.GetSetting(s.db, "wechat_v3_enabled", "false") != "true" {
			return nil, errors.New("微信支付 V3 未开启")
		}
		payURL, err = s.createWechatNativeV3(ctx, order, plan.Name, publicBaseURL)
		payMode = "qrcode"
	default:
		return nil, fmt.Errorf("不支持的支付方式: %s", channel)
	}
	if err != nil {
		return nil, err
	}

	order.PayURL = payURL
	if err := s.db.Create(order).Error; err != nil {
		return nil, err
	}
	return &CheckoutResult{
		Order:   order,
		PayMode: payMode,
		PayURL:  payURL,
	}, nil
}

func (s *Service) FulfillOrder(ctx context.Context, orderNo, tradeNo string) error {
	var user model.User
	var allowedNodes []uint
	var needProvision bool

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var order model.Order
		if err := tx.Where("order_no = ?", orderNo).First(&order).Error; err != nil {
			return err
		}
		if order.Status == "paid" {
			return nil // Idempotent
		}
		if order.Status != "pending" {
			return fmt.Errorf("订单状态不可核销: %s", order.Status)
		}

		if err := tx.First(&user, order.UserID).Error; err != nil {
			return err
		}

		if order.PaymentChannel == "balance" && order.AmountCents > 0 {
			res := tx.Model(&model.User{}).
				Where("id = ? AND balance_cents >= ?", user.ID, order.AmountCents).
				Update("balance_cents", gorm.Expr("balance_cents - ?", order.AmountCents))
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return errors.New("余额不足")
			}
		}

		now := time.Now().Unix()
		res := tx.Model(&model.Order{}).
			Where("id = ? AND status = ?", order.ID, "pending").
			Updates(map[string]any{
				"status":   "paid",
				"trade_no": tradeNo,
				"paid_at":  now,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil
		}

		if order.OrderType == "balance_topup" {
			return tx.Model(&model.User{}).Where("id = ?", user.ID).
				Update("balance_cents", gorm.Expr("balance_cents + ?", order.AmountCents)).Error
		}

		if order.PlanID == nil {
			return nil
		}
		var plan model.Plan
		if err := tx.First(&plan, *order.PlanID).Error; err != nil {
			return err
		}

		_ = json.Unmarshal([]byte(plan.NodeIDsJSON), &allowedNodes)
		needProvision = true

		if order.OrderType == "traffic_pack" {
			return tx.Model(&model.User{}).Where("id = ?", user.ID).
				Update("quota_bytes", gorm.Expr("quota_bytes + ?", plan.QuotaBytes)).Error
		}

		// Plan purchase or renewal
		var newExpiry int64
		if plan.DurationDays > 0 {
			base := now
			if user.PlanID != nil && *user.PlanID == plan.ID && user.ExpiresAt > now {
				base = user.ExpiresAt
			}
			newExpiry = base + int64(plan.DurationDays)*86400
		}

		updates := map[string]any{
			"plan_id":     plan.ID,
			"quota_bytes": plan.QuotaBytes,
			"expires_at":  newExpiry,
			"reset_mode":  plan.ResetMode,
			"cycle_days":  plan.CycleDays,
			"status":      "active",
		}
		if user.PlanID == nil || *user.PlanID != plan.ID || user.UsedBytes >= user.QuotaBytes {
			updates["used_bytes"] = int64(0)
			updates["next_reset_at"] = syncer.ComputeNextReset(plan.ResetMode, plan.CycleDays, now)
		}
		if plan.DefaultRulePresetID != nil && user.RulePresetID == nil {
			updates["rule_preset_id"] = *plan.DefaultRulePresetID
		}

		if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			return err
		}
		return tx.First(&user, user.ID).Error
	})
	if err != nil {
		return err
	}

	if needProvision && s.syncEngine != nil {
		go func() {
			pCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			_ = s.syncEngine.ProvisionUserToNodes(pCtx, &user, allowedNodes)
		}()
	}
	return nil
}

// --- Epay (易支付 MD5 通用协议) ---

func (s *Service) createEpayURL(order *model.Order, name, epayType, publicBaseURL string) (string, error) {
	apiURL := strings.TrimRight(database.GetSetting(s.db, "epay_api_url", ""), "/")
	pid := database.GetSetting(s.db, "epay_pid", "")
	key := database.GetSetting(s.db, "epay_key", "")
	if apiURL == "" || pid == "" || key == "" {
		return "", errors.New("易支付配置不完整")
	}
	notifyURL := strings.TrimRight(publicBaseURL, "/") + "/api/pay/notify/epay"
	returnURL := strings.TrimRight(publicBaseURL, "/") + "/store"

	params := map[string]string{
		"pid":          pid,
		"type":         epayType,
		"out_trade_no": order.OrderNo,
		"notify_url":   notifyURL,
		"return_url":   returnURL,
		"name":         name,
		"money":        fmt.Sprintf("%.2f", float64(order.AmountCents)/100.0),
	}
	params["sign"] = signEpayMD5(params, key)
	params["sign_type"] = "MD5"

	q := url.Values{}
	for k, v := range params {
		q.Set(k, v)
	}
	return apiURL + "/submit.php?" + q.Encode(), nil
}

func (s *Service) VerifyEpayNotify(params map[string]string) (string, string, error) {
	key := database.GetSetting(s.db, "epay_key", "")
	if key == "" {
		return "", "", errors.New("epay key not configured")
	}
	gotSign := strings.ToLower(strings.TrimSpace(params["sign"]))
	expected := signEpayMD5(params, key)
	if subtle.ConstantTimeCompare([]byte(gotSign), []byte(expected)) != 1 {
		return "", "", errors.New("invalid epay signature")
	}
	if params["trade_status"] != "TRADE_SUCCESS" {
		return "", "", fmt.Errorf("trade not success: %s", params["trade_status"])
	}
	return params["out_trade_no"], params["trade_no"], nil
}

func signEpayMD5(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || k == "sign_type" || strings.TrimSpace(v) == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	sum := md5.Sum([]byte(strings.Join(parts, "&") + key))
	return hex.EncodeToString(sum[:])
}

// --- Alipay Face-to-Face (RSA2) ---

func (s *Service) createAlipayF2F(ctx context.Context, order *model.Order, subject, publicBaseURL string) (string, error) {
	appID := database.GetSetting(s.db, "alipay_app_id", "")
	privPEM := database.GetSetting(s.db, "alipay_private_key", "")
	if appID == "" || privPEM == "" {
		return "", errors.New("支付宝当面付配置不完整")
	}
	privKey, err := parseRSAPrivateKey(privPEM)
	if err != nil {
		return "", fmt.Errorf("解析支付宝应用私钥失败: %w", err)
	}

	bizBytes, _ := json.Marshal(map[string]any{
		"out_trade_no": order.OrderNo,
		"total_amount": fmt.Sprintf("%.2f", float64(order.AmountCents)/100.0),
		"subject":      subject,
	})

	params := map[string]string{
		"app_id":      appID,
		"method":      "alipay.trade.precreate",
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"notify_url":  strings.TrimRight(publicBaseURL, "/") + "/api/pay/notify/alipay",
		"biz_content": string(bizBytes),
	}
	sign, err := signRSA2(buildSortedSignContent(params, false), privKey)
	if err != nil {
		return "", err
	}
	params["sign"] = sign

	form := url.Values{}
	for k, v := range params {
		form.Set(k, v)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://openapi.alipay.com/gateway.do", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var parsed struct {
		Res struct {
			Code   string `json:"code"`
			Msg    string `json:"msg"`
			SubMsg string `json:"sub_msg"`
			QRCode string `json:"qr_code"`
		} `json:"alipay_trade_precreate_response"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.Res.Code != "10000" || parsed.Res.QRCode == "" {
		return "", fmt.Errorf("支付宝下单失败: %s %s", parsed.Res.Msg, parsed.Res.SubMsg)
	}
	return parsed.Res.QRCode, nil
}

func (s *Service) VerifyAlipayNotify(params map[string]string) (string, string, error) {
	pubPEM := database.GetSetting(s.db, "alipay_public_key", "")
	if pubPEM == "" {
		return "", "", errors.New("alipay public key not configured")
	}
	pubKey, err := parseRSAPublicKey(pubPEM)
	if err != nil {
		return "", "", err
	}
	signStr := params["sign"]
	if signStr == "" {
		return "", "", errors.New("missing alipay sign")
	}
	sigBytes, err := base64.StdEncoding.DecodeString(signStr)
	if err != nil {
		return "", "", err
	}
	content := buildSortedSignContent(params, true)
	hash := sha256.Sum256([]byte(content))
	if err := rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hash[:], sigBytes); err != nil {
		return "", "", errors.New("invalid alipay rsa2 signature")
	}
	status := params["trade_status"]
	if status != "TRADE_SUCCESS" && status != "TRADE_FINISHED" {
		return "", "", fmt.Errorf("alipay trade not success: %s", status)
	}
	return params["out_trade_no"], params["trade_no"], nil
}

// --- WeChat Pay Native V3 ---

func (s *Service) createWechatNativeV3(ctx context.Context, order *model.Order, desc, publicBaseURL string) (string, error) {
	appID := database.GetSetting(s.db, "wechat_app_id", "")
	mchID := database.GetSetting(s.db, "wechat_mch_id", "")
	serial := database.GetSetting(s.db, "wechat_mch_serial", "")
	privPEM := database.GetSetting(s.db, "wechat_private_key", "")
	if appID == "" || mchID == "" || serial == "" || privPEM == "" {
		return "", errors.New("微信支付 V3 配置不完整")
	}
	privKey, err := parseRSAPrivateKey(privPEM)
	if err != nil {
		return "", fmt.Errorf("解析微信商户私钥失败: %w", err)
	}

	payload, _ := json.Marshal(map[string]any{
		"appid":        appID,
		"mchid":        mchID,
		"description":  desc,
		"out_trade_no": order.OrderNo,
		"notify_url":   strings.TrimRight(publicBaseURL, "/") + "/api/pay/notify/wechat",
		"amount": map[string]any{
			"total":    order.AmountCents,
			"currency": "CNY",
		},
	})

	apiPath := "/v3/pay/transactions/native"
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	nonce := fmt.Sprintf("%x", time.Now().UnixNano())
	msg := fmt.Sprintf("POST\n%s\n%s\n%s\n%s\n", apiPath, ts, nonce, string(payload))
	sig, err := signRSA2(msg, privKey)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.mch.weixin.qq.com"+apiPath, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf(`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",signature="%s",timestamp="%s",serial_no="%s"`, mchID, nonce, sig, ts, serial))

	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var out struct {
		CodeURL string `json:"code_url"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 || out.CodeURL == "" {
		return "", fmt.Errorf("微信下单失败: %s", out.Message)
	}
	return out.CodeURL, nil
}

func (s *Service) DecryptWechatNotifyResource(ciphertext, nonce, associatedData string) (string, string, error) {
	v3Key := database.GetSetting(s.db, "wechat_api_v3_key", "")
	if len(v3Key) != 32 {
		return "", "", errors.New("invalid wechat api v3 key length")
	}
	ctBytes, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", "", err
	}
	block, err := aes.NewCipher([]byte(v3Key))
	if err != nil {
		return "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}
	plain, err := gcm.Open(nil, []byte(nonce), ctBytes, []byte(associatedData))
	if err != nil {
		return "", "", err
	}
	var txData struct {
		OutTradeNo    string `json:"out_trade_no"`
		TransactionID string `json:"transaction_id"`
		TradeState    string `json:"trade_state"`
	}
	if err := json.Unmarshal(plain, &txData); err != nil {
		return "", "", err
	}
	if txData.TradeState != "SUCCESS" {
		return "", "", fmt.Errorf("wechat trade state: %s", txData.TradeState)
	}
	return txData.OutTradeNo, txData.TransactionID, nil
}

func buildSortedSignContent(params map[string]string, skipSignType bool) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || v == "" || (skipSignType && k == "sign_type") {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	return strings.Join(parts, "&")
}

func signRSA2(content string, key *rsa.PrivateKey) (string, error) {
	h := sha256.Sum256([]byte(content))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

func parseRSAPrivateKey(raw string) (*rsa.PrivateKey, error) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "-----BEGIN") {
		raw = "-----BEGIN PRIVATE KEY-----\n" + raw + "\n-----END PRIVATE KEY-----"
	}
	block, _ := pem.Decode([]byte(raw))
	if block == nil {
		return nil, errors.New("invalid pem private key")
	}
	if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rsaKey, ok := k.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func parseRSAPublicKey(raw string) (*rsa.PublicKey, error) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "-----BEGIN") {
		raw = "-----BEGIN PUBLIC KEY-----\n" + raw + "\n-----END PUBLIC KEY-----"
	}
	block, _ := pem.Decode([]byte(raw))
	if block == nil {
		return nil, errors.New("invalid pem public key")
	}
	k, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaPub, ok := k.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("not an rsa public key")
	}
	return rsaPub, nil
}
