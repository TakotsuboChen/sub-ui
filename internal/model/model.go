package model

import "time"

type User struct {
	ID             uint      `json:"id" gorm:"primaryKey"`
	Username       string    `json:"username" gorm:"size:64;uniqueIndex;not null"`
	Email          string    `json:"email" gorm:"size:128;index"`
	PasswordHash   string    `json:"-" gorm:"size:255;not null"`
	Role           string    `json:"role" gorm:"size:16;default:'user';not null"`
	Status         string    `json:"status" gorm:"size:24;default:'active';not null"`
	SubToken       string    `json:"subToken" gorm:"size:64;uniqueIndex;not null"`
	BalanceCents   int64     `json:"balanceCents" gorm:"default:0;not null"`
	PlanID         *uint     `json:"planId"`
	QuotaBytes     int64     `json:"quotaBytes" gorm:"default:0;not null"`
	UsedBytes      int64     `json:"usedBytes" gorm:"default:0;not null"`
	TotalUsedBytes int64     `json:"totalUsedBytes" gorm:"default:0;not null"`
	ExpiresAt      int64     `json:"expiresAt" gorm:"default:0;not null"`
	ResetMode      string    `json:"resetMode" gorm:"size:32;default:'monthly_anniversary';not null"`
	CycleDays      int       `json:"cycleDays" gorm:"default:30;not null"`
	NextResetAt    int64     `json:"nextResetAt" gorm:"default:0;not null"`
	RulePresetID   *uint     `json:"rulePresetId"`
	InvitedByID    *uint     `json:"invitedById"`
	InviteCodeUsed string    `json:"inviteCodeUsed" gorm:"size:64"`
	LastOnlineAt   int64     `json:"lastOnlineAt" gorm:"default:0;not null"`
	Remark         string    `json:"remark" gorm:"size:255"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type Node struct {
	ID                  uint      `json:"id" gorm:"primaryKey"`
	Name                string    `json:"name" gorm:"size:128;not null"`
	NodeType            string    `json:"nodeType" gorm:"size:24;default:'sui';not null"`
	Region              string    `json:"region" gorm:"size:32;default:'HK'"`
	NamePrefix          string    `json:"namePrefix" gorm:"size:64"`
	PanelURL            string    `json:"panelUrl" gorm:"size:512"`
	APIToken            string    `json:"apiToken" gorm:"size:512"`
	SubBaseURL          string    `json:"subBaseUrl" gorm:"size:512"`
	APIProxy            string    `json:"apiProxy" gorm:"size:255"`
	SkipTLSVerify       bool      `json:"skipTlsVerify" gorm:"default:false;not null"`
	TrafficMultiplier   float64   `json:"trafficMultiplier" gorm:"default:1;not null"`
	DefaultInboundsJSON string    `json:"defaultInboundsJson" gorm:"column:default_inbounds_json;type:text;default:'[]'"`
	ExternalSubURL      string    `json:"externalSubUrl" gorm:"column:external_sub_url;type:text"`
	EnableTFO           bool      `json:"enableTfo" gorm:"column:enable_tfo;default:true;not null"`
	EnableUDP           bool      `json:"enableUdp" gorm:"column:enable_udp;default:true;not null"`
	Enabled             bool      `json:"enabled" gorm:"default:true;not null"`
	SortOrder           int       `json:"sortOrder" gorm:"default:0;not null"`
	OnlineStatus        string    `json:"onlineStatus" gorm:"size:24;default:'unknown'"`
	LastSyncAt          int64     `json:"lastSyncAt" gorm:"default:0;not null"`
	LastError           string    `json:"lastError" gorm:"type:text"`
	CPUUsage            float64   `json:"cpuUsage" gorm:"column:cpu_usage;default:0"`
	MemUsage            float64   `json:"memUsage" gorm:"column:mem_usage;default:0"`
	OnlineCount         int       `json:"onlineCount" gorm:"default:0"`
	SingboxRunning      bool      `json:"singboxRunning" gorm:"default:false"`
	SUIVersion          string    `json:"suiVersion" gorm:"column:sui_version;size:64"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type UserNodeBinding struct {
	ID               uint      `json:"id" gorm:"primaryKey"`
	UserID           uint      `json:"userId" gorm:"uniqueIndex:idx_user_node,priority:1;not null"`
	NodeID           uint      `json:"nodeId" gorm:"uniqueIndex:idx_user_node,priority:2;not null"`
	SUIClientID      uint      `json:"suiClientId" gorm:"column:sui_client_id;default:0;not null"`
	SUIClientName    string    `json:"suiClientName" gorm:"column:sui_client_name;size:128;index;not null"`
	ProtocolUUID     string    `json:"protocolUuid" gorm:"column:protocol_uuid;size:64"`
	ProtocolPassword string    `json:"protocolPassword" gorm:"size:128"`
	LastRawUp        int64     `json:"lastRawUp" gorm:"default:0;not null"`
	LastRawDown      int64     `json:"lastRawDown" gorm:"default:0;not null"`
	SyncedEnable     bool      `json:"syncedEnable" gorm:"default:true;not null"`
	LastError        string    `json:"lastError" gorm:"type:text"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type TrafficLog struct {
	ID            uint64 `json:"id" gorm:"primaryKey;autoIncrement"`
	BucketTime    int64  `json:"bucketTime" gorm:"uniqueIndex:idx_tlog_bucket,priority:1;index;not null"`
	UserID        uint   `json:"userId" gorm:"uniqueIndex:idx_tlog_bucket,priority:2;index;not null"`
	NodeID        uint   `json:"nodeId" gorm:"uniqueIndex:idx_tlog_bucket,priority:3;index;not null"`
	RawUp         int64  `json:"rawUp" gorm:"default:0;not null"`
	RawDown       int64  `json:"rawDown" gorm:"default:0;not null"`
	WeightedBytes int64  `json:"weightedBytes" gorm:"default:0;not null"`
}

type TrafficResetHistory struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	UserID      uint      `json:"userId" gorm:"index;not null"`
	UsedBytes   int64     `json:"usedBytes"`
	QuotaBytes  int64     `json:"quotaBytes"`
	ResetReason string    `json:"resetReason" gorm:"size:32"`
	CreatedAt   time.Time `json:"createdAt"`
}

type RulePreset struct {
	ID            uint      `json:"id" gorm:"primaryKey"`
	Slug          string    `json:"slug" gorm:"size:64;uniqueIndex;not null"`
	Name          string    `json:"name" gorm:"size:128;not null"`
	Description   string    `json:"description" gorm:"size:512"`
	Category      string    `json:"category" gorm:"size:32;default:'builtin'"`
	SourceINIURL  string    `json:"sourceIniUrl" gorm:"size:512"`
	ConfigJSON    string    `json:"configJson" gorm:"type:text;not null"`
	IsDefault     bool      `json:"isDefault" gorm:"default:false;not null"`
	Enabled       bool      `json:"enabled" gorm:"default:true;not null"`
	SortOrder     int       `json:"sortOrder" gorm:"default:0;not null"`
	LastFetchedAt int64     `json:"lastFetchedAt" gorm:"default:0"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type UserRuleOverride struct {
	ID                uint      `json:"id" gorm:"primaryKey"`
	UserID            uint      `json:"userId" gorm:"uniqueIndex;not null"`
	PrependRulesJSON  string    `json:"prependRulesJson" gorm:"type:text;default:'[]'"`
	AppendRulesJSON   string    `json:"appendRulesJson" gorm:"type:text;default:'[]'"`
	DisabledRulesJSON string    `json:"disabledRulesJson" gorm:"type:text;default:'[]'"`
	GroupRewritesJSON string    `json:"groupRewritesJson" gorm:"type:text;default:'{}'"`
	CustomGroupsJSON  string    `json:"customGroupsJson" gorm:"type:text;default:'[]'"`
	EnableTFO         *bool     `json:"enableTfo"`
	EnableAdBlock     *bool     `json:"enableAdBlock"`
	DNSMode           string    `json:"dnsMode" gorm:"size:32"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type Plan struct {
	ID                  uint      `json:"id" gorm:"primaryKey"`
	Name                string    `json:"name" gorm:"size:128;not null"`
	Description         string    `json:"description" gorm:"type:text"`
	Badge               string    `json:"badge" gorm:"size:32"`
	PriceCents          int64     `json:"priceCents" gorm:"default:0;not null"`
	DurationDays        int       `json:"durationDays" gorm:"default:30;not null"`
	QuotaBytes          int64     `json:"quotaBytes" gorm:"default:0;not null"`
	ResetMode           string    `json:"resetMode" gorm:"size:32;default:'monthly_anniversary';not null"`
	CycleDays           int       `json:"cycleDays" gorm:"default:30;not null"`
	NodeIDsJSON         string    `json:"nodeIdsJson" gorm:"type:text;default:'[]'"`
	DefaultRulePresetID *uint     `json:"defaultRulePresetId"`
	MaxDevicesHint      int       `json:"maxDevicesHint" gorm:"default:3"`
	SpeedLimitMbps      int       `json:"speedLimitMbps" gorm:"default:0"`
	SortOrder           int       `json:"sortOrder" gorm:"default:0;not null"`
	Enabled             bool      `json:"enabled" gorm:"default:true;not null"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type Order struct {
	ID             uint      `json:"id" gorm:"primaryKey"`
	OrderNo        string    `json:"orderNo" gorm:"size:64;uniqueIndex;not null"`
	UserID         uint      `json:"userId" gorm:"index;not null"`
	PlanID         *uint     `json:"planId"`
	OrderType      string    `json:"orderType" gorm:"size:32;not null"`
	AmountCents    int64     `json:"amountCents" gorm:"not null"`
	PaymentChannel string    `json:"paymentChannel" gorm:"size:32;not null"`
	TradeNo        string    `json:"tradeNo" gorm:"size:128"`
	PayURL         string    `json:"payUrl" gorm:"type:text"`
	Status         string    `json:"status" gorm:"size:24;default:'pending';index;not null"`
	MetadataJSON   string    `json:"metadataJson" gorm:"type:text"`
	PaidAt         int64     `json:"paidAt" gorm:"default:0;not null"`
	ExpiresAt      int64     `json:"expiresAt" gorm:"default:0;not null"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type InviteCode struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	Code            string    `json:"code" gorm:"size:64;uniqueIndex;not null"`
	CreatorID       uint      `json:"creatorId" gorm:"index;not null"`
	MaxUses         int       `json:"maxUses" gorm:"default:1;not null"`
	UsedCount       int       `json:"usedCount" gorm:"default:0;not null"`
	BonusDays       int       `json:"bonusDays" gorm:"default:0;not null"`
	BonusQuotaBytes int64     `json:"bonusQuotaBytes" gorm:"default:0;not null"`
	ExpiresAt       int64     `json:"expiresAt" gorm:"default:0;not null"`
	Enabled         bool      `json:"enabled" gorm:"default:true;not null"`
	Remark          string    `json:"remark" gorm:"size:255"`
	CreatedAt       time.Time `json:"createdAt"`
}

type RedemptionCode struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	Code         string    `json:"code" gorm:"size:64;uniqueIndex;not null"`
	BatchNo      string    `json:"batchNo" gorm:"size:64;index"`
	RewardType   string    `json:"rewardType" gorm:"size:24;not null"`
	PlanID       *uint     `json:"planId"`
	AmountCents  int64     `json:"amountCents" gorm:"default:0"`
	DurationDays int       `json:"durationDays" gorm:"default:0"`
	QuotaBytes   int64     `json:"quotaBytes" gorm:"default:0"`
	UsedByUserID *uint     `json:"usedByUserId"`
	UsedAt       int64     `json:"usedAt" gorm:"default:0"`
	Enabled      bool      `json:"enabled" gorm:"default:true;not null"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Setting struct {
	Key       string    `json:"key" gorm:"size:128;primaryKey"`
	Value     string    `json:"value" gorm:"type:text;not null"`
	UpdatedAt time.Time `json:"updatedAt"`
}
