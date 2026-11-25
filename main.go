package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/api"
	"github.com/TakotsuboChen/sub-ui/internal/auth"
	"github.com/TakotsuboChen/sub-ui/internal/config"
	"github.com/TakotsuboChen/sub-ui/internal/database"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/TakotsuboChen/sub-ui/internal/rules"
	syncer "github.com/TakotsuboChen/sub-ui/internal/sync"
)

func main() {
	cfg := config.Load()

	db, err := database.Init(cfg)
	if err != nil {
		log.Fatalf("[sub-ui] database init failed: %v", err)
	}
	if err := rules.SeedBuiltinPresets(db); err != nil {
		log.Fatalf("[sub-ui] seed rule presets failed: %v", err)
	}

	// Optional non-interactive admin bootstrap from env when DB is empty
	if cfg.AdminUser != "" && cfg.AdminPass != "" {
		var count int64
		_ = db.Model(&model.User{}).Count(&count).Error
		if count == 0 {
			hash, hErr := auth.HashPassword(cfg.AdminPass)
			subTok, _ := auth.GenerateRandomHex(16)
			if hErr == nil {
				_ = db.Create(&model.User{
					Username:     cfg.AdminUser,
					PasswordHash: hash,
					Role:         "admin",
					Status:       "active",
					SubToken:     subTok,
				}).Error
				log.Printf("[sub-ui] bootstrapped initial admin user: %s", cfg.AdminUser)
			}
		}
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	syncEngine := syncer.NewEngine(db, cfg.SyncInterval)
	syncEngine.Start(ctx)

	srv := api.NewServer(cfg, db, syncEngine)
	httpSrv := &http.Server{
		Addr:              cfg.Host + ":" + cfg.Port,
		Handler:           srv.Engine(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[sub-ui] listening on http://%s:%s", cfg.Host, cfg.Port)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[sub-ui] http server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("[sub-ui] shutting down gracefully...")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer shutCancel()
	_ = httpSrv.Shutdown(shutCtx)
}
