package database

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/TakotsuboChen/sub-ui/internal/config"
	"github.com/TakotsuboChen/sub-ui/internal/model"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Init(cfg *config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector
	switch cfg.DBDriver {
	case "postgres", "postgresql":
		dialector = postgres.Open(cfg.DBDSN)
	default:
		if dir := filepath.Dir(cfg.DBDSN); dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("create db directory: %w", err)
			}
		}
		dialector = sqlite.Open(cfg.DBDSN + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)")
	}

	logLevel := logger.Silent
	if cfg.LogLevel == "debug" {
		logLevel = logger.Info
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if sqlDB, err := db.DB(); err == nil {
		if cfg.DBDriver != "postgres" && cfg.DBDriver != "postgresql" {
			sqlDB.SetMaxOpenConns(1)
		} else {
			sqlDB.SetMaxOpenConns(15)
			sqlDB.SetMaxIdleConns(5)
		}
		sqlDB.SetConnMaxLifetime(time.Hour)
	}

	if err := db.AutoMigrate(
		&model.User{},
		&model.Node{},
		&model.UserNodeBinding{},
		&model.TrafficLog{},
		&model.TrafficResetHistory{},
		&model.RulePreset{},
		&model.UserRuleOverride{},
		&model.Plan{},
		&model.Order{},
		&model.InviteCode{},
		&model.RedemptionCode{},
		&model.Setting{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}

	if err := seedDefaults(db, cfg); err != nil {
		return nil, err
	}

	return db, nil
}

func seedDefaults(db *gorm.DB, cfg *config.Config) error {
	defaults := map[string]string{
		"site_name":                 "Sub-UI",
		"site_subtitle":             "S-UI 多节点订阅聚合与精细化分流控制面板",
		"announcement":              "",
		"registration_enabled":      "true",
		"invite_code_required":      "false",
		"allow_user_rule_override":  "true",
		"sub_profile_title":         "Sub-UI",
		"sub_update_interval_hours": "12",
		"sub_public_base_url":       cfg.PublicURL,
		"epay_enabled":              "false",
		"epay_api_url":              "",
		"epay_pid":                  "",
		"epay_key":                  "",
		"alipay_f2f_enabled":        "false",
		"alipay_app_id":             "",
		"alipay_private_key":        "",
		"alipay_public_key":         "",
		"wechat_v3_enabled":         "false",
		"wechat_app_id":             "",
		"wechat_mch_id":             "",
		"wechat_mch_serial":         "",
		"wechat_private_key":        "",
		"wechat_api_v3_key":         "",
		"sandbox_pay_enabled":       "true",
	}

	for key, val := range defaults {
		var existing model.Setting
		if err := db.Where("key = ?", key).First(&existing).Error; err != nil {
			if err := db.Create(&model.Setting{Key: key, Value: val}).Error; err != nil {
				return err
			}
		}
	}

	var jwtSetting model.Setting
	if err := db.Where("key = ?", "jwt_secret").First(&jwtSetting).Error; err != nil || jwtSetting.Value == "" {
		secret := cfg.JWTSecret
		if secret == "" {
			buf := make([]byte, 32)
			if _, rErr := rand.Read(buf); rErr != nil {
				return rErr
			}
			secret = hex.EncodeToString(buf)
		}
		_ = db.Save(&model.Setting{Key: "jwt_secret", Value: secret}).Error
	}

	var globalOverride model.UserRuleOverride
	if err := db.Where("user_id = 0").First(&globalOverride).Error; err != nil {
		_ = db.Create(&model.UserRuleOverride{
			UserID:            0,
			PrependRulesJSON:  "[]",
			AppendRulesJSON:   "[]",
			DisabledRulesJSON: "[]",
			GroupRewritesJSON: "{}",
			CustomGroupsJSON:  "[]",
		}).Error
	}

	return nil
}

func GetSetting(db *gorm.DB, key, fallback string) string {
	var s model.Setting
	if err := db.Where("key = ?", key).First(&s).Error; err != nil {
		return fallback
	}
	if s.Value == "" {
		return fallback
	}
	return s.Value
}

func GetSettingMap(db *gorm.DB) (map[string]string, error) {
	var rows []model.Setting
	if err := db.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		out[r.Key] = r.Value
	}
	return out, nil
}
