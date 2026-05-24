package provider

// PresetEntry is one environment variable slot in a provider preset.
type PresetEntry struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	IsSecret bool   `json:"isSecret"`
}

// Preset is a full provider template with bilingual descriptions and env entries.
type Preset struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	DescriptionEn string        `json:"descriptionEn"`
	DescriptionZh string        `json:"descriptionZh"`
	Link          string        `json:"link,omitempty"`
	Entries       []PresetEntry `json:"entries"`
}

// GetPresets returns all built-in provider presets.
func GetPresets() []Preset {
	return []Preset{
		{
			ID:            "claude-official",
			Name:          "Claude (Official)",
			DescriptionEn: "Official Anthropic API endpoints with default Claude model names.",
			DescriptionZh: "Anthropic 官方 API 端点，附带默认 Claude 模型名称。",
			Entries: []PresetEntry{
				{Key: "ANTHROPIC_API_KEY", Value: "", IsSecret: true},
				{Key: "ANTHROPIC_AUTH_TOKEN", Value: "", IsSecret: true},
				{Key: "ANTHROPIC_BASE_URL", Value: "", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_MODEL", Value: "claude-sonnet-4-0", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_SONNET_MODEL", Value: "claude-sonnet-4-0", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", Value: "claude-3-5-haiku-latest", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_OPUS_MODEL", Value: "claude-opus-4-0", IsSecret: false},
				{Key: "CLAUDE_CODE_EFFORT_LEVEL", Value: "", IsSecret: false},
				{Key: "CLAUDE_CODE_SUBAGENT_MODEL", Value: "", IsSecret: false},
			},
		},
		{
			ID:            "claude-deepseek",
			Name:          "Claude via DeepSeek",
			DescriptionEn: "DeepSeek Anthropic-compatible endpoint with DeepSeek model names. Suffix '[1m]' means 1M context window on DeepSeek.",
			DescriptionZh: "DeepSeek Anthropic 兼容端点，附带 DeepSeek 模型名称。后缀“[1m]”表示 DeepSeek 的 1M 上下文窗口。",
			Entries: []PresetEntry{
				{Key: "ANTHROPIC_API_KEY", Value: "", IsSecret: true},
				{Key: "ANTHROPIC_AUTH_TOKEN", Value: "", IsSecret: true},
				{Key: "ANTHROPIC_BASE_URL", Value: "https://api.deepseek.com/anthropic", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_MODEL", Value: "deepseek-v4-pro[1m]", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_SONNET_MODEL", Value: "deepseek-v4-pro[1m]", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", Value: "deepseek-v4-flash", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_OPUS_MODEL", Value: "deepseek-v4-pro[1m]", IsSecret: false},
				{Key: "CLAUDE_CODE_EFFORT_LEVEL", Value: "max", IsSecret: false},
				{Key: "CLAUDE_CODE_SUBAGENT_MODEL", Value: "deepseek-v4-flash", IsSecret: false},
			},
		},
		{
			ID:            "claude-glm",
			Name:          "Claude via GLM",
			DescriptionEn: "Zhipu GLM Anthropic-compatible endpoint with GLM model names.",
			DescriptionZh: "智谱 GLM Anthropic 兼容端点，附带 GLM 模型名称。",
			Entries: []PresetEntry{
				{Key: "ANTHROPIC_API_KEY", Value: "", IsSecret: true},
				{Key: "ANTHROPIC_AUTH_TOKEN", Value: "", IsSecret: true},
				{Key: "ANTHROPIC_BASE_URL", Value: "https://open.bigmodel.cn/api/paas/v4/anthropic", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_MODEL", Value: "glm5.1", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_SONNET_MODEL", Value: "glm5.1", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", Value: "glm-4-flash", IsSecret: false},
				{Key: "ANTHROPIC_DEFAULT_OPUS_MODEL", Value: "glm5.1", IsSecret: false},
				{Key: "CLAUDE_CODE_EFFORT_LEVEL", Value: "", IsSecret: false},
				{Key: "CLAUDE_CODE_SUBAGENT_MODEL", Value: "", IsSecret: false},
			},
		},
		{
			ID:            "claude-maxx",
			Name:          "Maxx (Free)",
			DescriptionEn: "Free token provider for Claude Code, thanks to the Maxx developer. Multi-provider AI proxy with admin UI, routing, and usage tracking.",
			DescriptionZh: "免费 Claude Code token 提供商，感谢 Maxx 开发者。多模型 AI 代理，自带管理界面、路由和用量追踪。",
			Link:          "https://github.com/awsl-project/maxx",
			Entries: []PresetEntry{
				{Key: "ANTHROPIC_AUTH_TOKEN", Value: "maxx_dbaea2a29fff547a532f9151e294a7dd0daad81d960a93dde8d1ed0bc53972e9", IsSecret: true},
				{Key: "ANTHROPIC_BASE_URL", Value: "https://maxx-direct.cloverstd.com/project/haoc/", IsSecret: false},
			},
		},
		{
			ID:            "custom",
			Name:          "Custom",
			DescriptionEn: "Start with a blank profile and add variables manually.",
			DescriptionZh: "从空白配置开始，手动添加变量。",
			Entries:       []PresetEntry{},
		},
	}
}
