export interface ProfileTemplateEntry {
  key: string
  value: string
  isSecret: boolean
}

export interface ProviderPreset {
  id: string
  name: string
  description: string
  entries: ProfileTemplateEntry[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'claude-official',
    name: 'Claude (Official)',
    description: 'Official Anthropic API endpoints with default Claude model names.',
    entries: [
      { key: 'ANTHROPIC_API_KEY', value: '', isSecret: true },
      { key: 'ANTHROPIC_AUTH_TOKEN', value: '', isSecret: true },
      { key: 'ANTHROPIC_BASE_URL', value: '', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_MODEL', value: 'claude-sonnet-4-0', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: 'claude-sonnet-4-0', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: 'claude-3-5-haiku-latest', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: 'claude-opus-4-0', isSecret: false },
      { key: 'CLAUDE_CODE_EFFORT_LEVEL', value: '', isSecret: false },
      { key: 'CLAUDE_CODE_SUBAGENT_MODEL', value: '', isSecret: false },
    ],
  },
  {
    id: 'claude-deepseek',
    name: 'Claude via DeepSeek',
    description: 'DeepSeek Anthropic-compatible endpoint with DeepSeek model names.',
    entries: [
      { key: 'ANTHROPIC_API_KEY', value: '', isSecret: true },
      { key: 'ANTHROPIC_AUTH_TOKEN', value: '', isSecret: true },
      { key: 'ANTHROPIC_BASE_URL', value: 'https://api.deepseek.com/anthropic', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_MODEL', value: 'deepseek-v4-pro[1m]', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: 'deepseek-v4-pro[1m]', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: 'deepseek-v4-flash', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: 'deepseek-v4-pro[1m]', isSecret: false },
      { key: 'CLAUDE_CODE_EFFORT_LEVEL', value: 'max', isSecret: false },
      { key: 'CLAUDE_CODE_SUBAGENT_MODEL', value: 'deepseek-v4-flash', isSecret: false },
    ],
  },
  {
    id: 'claude-glm',
    name: 'Claude via GLM',
    description: 'Zhipu GLM Anthropic-compatible endpoint with GLM model names.',
    entries: [
      { key: 'ANTHROPIC_API_KEY', value: '', isSecret: true },
      { key: 'ANTHROPIC_AUTH_TOKEN', value: '', isSecret: true },
      { key: 'ANTHROPIC_BASE_URL', value: 'https://open.bigmodel.cn/api/paas/v4/anthropic', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_MODEL', value: 'glm-4.5', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: 'glm-4.5', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: 'glm-4-flash', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: 'glm-4.5', isSecret: false },
      { key: 'CLAUDE_CODE_EFFORT_LEVEL', value: '', isSecret: false },
      { key: 'CLAUDE_CODE_SUBAGENT_MODEL', value: '', isSecret: false },
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start with a blank profile and add variables manually.',
    entries: [],
  },
]
