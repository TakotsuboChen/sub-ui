package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Host         string
	Port         string
	PublicURL    string
	DBDriver     string
	DBDSN        string
	JWTSecret    string
	LogLevel     string
	SyncInterval int
	AdminUser    string
	AdminPass    string
}

func Load() *Config {
	syncInterval := 30
	if raw := strings.TrimSpace(os.Getenv("SUBUI_SYNC_INTERVAL")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 5 {
			syncInterval = v
		}
	}
	return &Config{
		Host:         getEnv("SUBUI_HOST", "0.0.0.0"),
		Port:         getEnv("SUBUI_PORT", "8080"),
		PublicURL:    strings.TrimRight(getEnv("SUBUI_PUBLIC_URL", ""), "/"),
		DBDriver:     strings.ToLower(getEnv("SUBUI_DB_DRIVER", "sqlite")),
		DBDSN:        getEnv("SUBUI_DB_DSN", "data/sub-ui.db"),
		JWTSecret:    os.Getenv("SUBUI_JWT_SECRET"),
		LogLevel:     strings.ToLower(getEnv("SUBUI_LOG_LEVEL", "info")),
		SyncInterval: syncInterval,
		AdminUser:    strings.TrimSpace(os.Getenv("SUBUI_ADMIN_USER")),
		AdminPass:    os.Getenv("SUBUI_ADMIN_PASS"),
	}
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
