package api

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"strings"

	"github.com/TakotsuboChen/sub-ui/internal/auth"
	"github.com/TakotsuboChen/sub-ui/internal/config"
	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/payment"
	"github.com/TakotsuboChen/sub-ui/internal/sub"
	syncer "github.com/TakotsuboChen/sub-ui/internal/sync"
	"github.com/TakotsuboChen/sub-ui/webdist"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	ErrInviteExpired   = errors.New("invite expired")
	ErrInviteExhausted = errors.New("invite exhausted")
)

type Server struct {
	cfg        *config.Config
	db         *gorm.DB
	syncEngine *syncer.Engine
	subGen     *sub.Generator
	paySvc     *payment.Service
	engine     *gin.Engine
}

func NewServer(cfg *config.Config, db *gorm.DB, syncEngine *syncer.Engine) *Server {
	if cfg.LogLevel != "debug" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	s := &Server{
		cfg:        cfg,
		db:         db,
		syncEngine: syncEngine,
		subGen:     sub.NewGenerator(db),
		paySvc:     payment.NewService(db, syncEngine),
		engine:     r,
	}
	s.registerRoutes()
	return s
}

func (s *Server) Engine() *gin.Engine {
	return s.engine
}

func (s *Server) jwtSecret() string {
	return database.GetSetting(s.db, "jwt_secret", "subui-fallback-secret")
}

func (s *Server) publicBaseURL(c *gin.Context) string {
	if u := database.GetSetting(s.db, "sub_public_base_url", ""); u != "" {
		return strings.TrimRight(u, "/")
	}
	if s.cfg.PublicURL != "" {
		return s.cfg.PublicURL
	}
	scheme := "http"
	if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host
}

func (s *Server) registerRoutes() {
	// Keyed subscription delivery
	s.engine.GET("/s/:token", s.handleSubscription)
	s.engine.HEAD("/s/:token", s.handleSubscription)

	// Payment async callbacks
	s.engine.Any("/api/pay/notify/epay", s.handleEpayNotify)
	s.engine.POST("/api/pay/notify/alipay", s.handleAlipayNotify)
	s.engine.POST("/api/pay/notify/wechat", s.handleWechatNotify)

	// Public & Auth API
	api := s.engine.Group("/api")
	api.GET("/system/public", s.handlePublicMeta)
	api.POST("/setup", s.handleSetup)
	api.POST("/auth/login", s.handleLogin)
	api.POST("/auth/register", s.handleRegister)
	api.POST("/auth/logout", s.handleLogout)

	// Authenticated User Routes
	authed := api.Group("")
	authed.Use(auth.Middleware(s.db, s.jwtSecret))
	{
		authed.GET("/auth/me", s.handleMe)
		authed.GET("/user/dashboard", s.handleUserDashboard)
		authed.POST("/user/sub-token/rotate", s.handleRotateMySubToken)
		authed.PUT("/user/password", s.handleChangePassword)

		authed.GET("/user/rules", s.handleGetMyRules)
		authed.PUT("/user/rules", s.handleSaveMyRules)
		authed.POST("/user/rules/simulate", s.handleSimulateMyRules)
		authed.GET("/user/rules/preview", s.handlePreviewMyRules)

		authed.GET("/user/plans", s.handleListActivePlans)
		authed.GET("/user/orders", s.handleListMyOrders)
		authed.POST("/user/orders", s.handleCreateOrder)
		authed.GET("/user/orders/:orderNo/status", s.handleOrderStatus)
		authed.POST("/user/orders/:orderNo/sandbox-pay", s.handleSandboxPay)
		authed.POST("/user/redeem", s.handleRedeemCDK)

		authed.GET("/user/invites", s.handleListMyInvites)
		authed.POST("/user/invites", s.handleCreateMyInvite)
	}

	// Admin Routes
	admin := api.Group("/admin")
	admin.Use(auth.Middleware(s.db, s.jwtSecret), auth.AdminRequired())
	{
		admin.GET("/overview", s.handleAdminOverview)

		admin.GET("/nodes", s.handleAdminListNodes)
		admin.POST("/nodes", s.handleAdminCreateNode)
		admin.PUT("/nodes/:id", s.handleAdminUpdateNode)
		admin.DELETE("/nodes/:id", s.handleAdminDeleteNode)
		admin.POST("/nodes/:id/test", s.handleAdminTestNode)
		admin.POST("/nodes/sync-all", s.handleAdminSyncAll)
		admin.GET("/nodes/:id/remote", s.handleAdminInspectRemoteNode)
		admin.POST("/nodes/:id/import-client", s.handleAdminImportSUIClient)

		admin.GET("/users", s.handleAdminListUsers)
		admin.POST("/users", s.handleAdminCreateUser)
		admin.PUT("/users/:id", s.handleAdminUpdateUser)
		admin.DELETE("/users/:id", s.handleAdminDeleteUser)
		admin.POST("/users/:id/reset-traffic", s.handleAdminResetUserTraffic)
		admin.POST("/users/:id/provision", s.handleAdminProvisionUser)
		admin.POST("/users/:id/rotate-token", s.handleAdminRotateUserToken)
		admin.GET("/users/:id/bindings", s.handleAdminUserBindings)

		admin.GET("/rule-presets", s.handleAdminListPresets)
		admin.POST("/rule-presets", s.handleAdminCreatePreset)
		admin.PUT("/rule-presets/:id", s.handleAdminUpdatePreset)
		admin.DELETE("/rule-presets/:id", s.handleAdminDeletePreset)
		admin.POST("/rule-presets/import-ini", s.handleAdminImportINI)
		admin.GET("/global-rule-override", s.handleAdminGetGlobalOverride)
		admin.PUT("/global-rule-override", s.handleAdminSaveGlobalOverride)

		admin.GET("/plans", s.handleAdminListPlans)
		admin.POST("/plans", s.handleAdminCreatePlan)
		admin.PUT("/plans/:id", s.handleAdminUpdatePlan)
		admin.DELETE("/plans/:id", s.handleAdminDeletePlan)

		admin.GET("/orders", s.handleAdminListOrders)
		admin.POST("/orders/:orderNo/mark-paid", s.handleAdminMarkOrderPaid)

		admin.GET("/invites", s.handleAdminListInvites)
		admin.POST("/invites/batch", s.handleAdminBatchCreateInvites)
		admin.DELETE("/invites/:id", s.handleAdminDeleteInvite)

		admin.GET("/cdks", s.handleAdminListCDKs)
		admin.POST("/cdks/batch", s.handleAdminBatchCreateCDKs)
		admin.DELETE("/cdks/:id", s.handleAdminDeleteCDK)

		admin.GET("/settings", s.handleAdminGetSettings)
		admin.PUT("/settings", s.handleAdminUpdateSettings)
	}

	s.mountFrontendSPA()
}

func (s *Server) mountFrontendSPA() {
	subFS, err := fs.Sub(webdist.DistFS, "dist")
	if err != nil {
		return
	}
	fileServer := http.FileServer(http.FS(subFS))

	s.engine.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/s/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "endpoint not found"})
			return
		}
		cleanPath := strings.TrimPrefix(p, "/")
		if cleanPath != "" {
			if f, err := subFS.Open(cleanPath); err == nil {
				_ = f.Close()
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}
		indexBytes, err := fs.ReadFile(subFS, "index.html")
		if err != nil {
			c.String(http.StatusOK, "Sub-UI API running. Build frontend assets in web/ to enable UI.")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexBytes)
	})
}

func unmarshalJSON(raw []byte, dst any) error {
	return json.Unmarshal(raw, dst)
}
