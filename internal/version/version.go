package version

import (
	"os"
	"path/filepath"
	"strings"
)

// Version holds the build version. It is populated by package main via go:embed
// and can also be overridden at link time with -ldflags "-X .../internal/version.Version=...".
var Version = ""

// Set updates Version when a non-empty value is supplied.
func Set(v string) {
	if trimmed := strings.TrimSpace(v); trimmed != "" {
		Version = strings.TrimPrefix(strings.TrimPrefix(trimmed, "v"), "V")
	}
}

// Get returns the active application version, falling back to repo-root VERSION during tests.
func Get() string {
	if v := strings.TrimSpace(Version); v != "" {
		return strings.TrimPrefix(strings.TrimPrefix(v, "v"), "V")
	}
	for _, rel := range []string{"VERSION", "../VERSION", "../../VERSION", "../../../VERSION"} {
		if b, err := os.ReadFile(filepath.Clean(rel)); err == nil {
			if v := strings.TrimSpace(string(b)); v != "" {
				return strings.TrimPrefix(strings.TrimPrefix(v, "v"), "V")
			}
		}
	}
	return "dev"
}
