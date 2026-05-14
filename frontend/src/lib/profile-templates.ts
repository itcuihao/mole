export interface ProfileTemplateEntry {
  key: string
  value: string
  isSecret: boolean
}

export interface ProfileTemplate {
  id: string
  name: string
  family: string
  description: string
  entries: ProfileTemplateEntry[]
}

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: 'anthropic-claude',
    name: 'Anthropic Claude',
    family: 'Anthropic',
    description: 'Official Anthropic-style variables for Claude sessions.',
    entries: [
      { key: 'ANTHROPIC_API_KEY', value: '', isSecret: true },
      { key: 'ANTHROPIC_DEFAULT_MODEL', value: 'claude-sonnet-4-0', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: 'claude-sonnet-4-0', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: 'claude-3-5-haiku-latest', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: 'claude-opus-4-0', isSecret: false },
    ],
  },
  {
    id: 'claude-compatible-self-hosted',
    name: 'Claude Compatible / Self-hosted',
    family: 'Anthropic Compatible',
    description: 'Self-hosted or proxy-backed Claude-compatible endpoints.',
    entries: [
      { key: 'ANTHROPIC_API_KEY', value: 'tp-', isSecret: true },
      { key: 'ANTHROPIC_AUTH_TOKEN', value: 'tp-', isSecret: true },
      { key: 'ANTHROPIC_BASE_URL', value: 'https://token-plan-cn.xiaomimimo.com/anthropic', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_MODEL', value: 'mimo-v2.5-pro', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: 'mimo-v2.5-pro', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: 'mimo-v2.5-pro', isSecret: false },
      { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: 'mimo-v2.5-pro', isSecret: false },
      { key: 'NODE_EXTRA_CA_CERTS', value: '', isSecret: false },
      { key: 'NODE_USE_SYSTEM_CA', value: '0', isSecret: false },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    family: 'OpenAI Compatible',
    description: 'OpenAI-compatible variables prefilled for DeepSeek.',
    entries: [
      { key: 'OPENAI_API_KEY', value: '', isSecret: true },
      { key: 'OPENAI_BASE_URL', value: 'https://api.deepseek.com/v1', isSecret: false },
      { key: 'OPENAI_MODEL', value: 'deepseek-chat', isSecret: false },
    ],
  },
  {
    id: 'glm',
    name: 'GLM',
    family: 'OpenAI Compatible',
    description: 'OpenAI-compatible variables prefilled for GLM endpoints.',
    entries: [
      { key: 'OPENAI_API_KEY', value: '', isSecret: true },
      { key: 'OPENAI_BASE_URL', value: 'https://open.bigmodel.cn/api/paas/v4', isSecret: false },
      { key: 'OPENAI_MODEL', value: 'glm-4.5', isSecret: false },
    ],
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    family: 'OpenAI Compatible',
    description: 'Generic OpenAI-compatible providers and self-hosted gateways.',
    entries: [
      { key: 'OPENAI_API_KEY', value: '', isSecret: true },
      { key: 'OPENAI_BASE_URL', value: 'https://api.openai.com/v1', isSecret: false },
      { key: 'OPENAI_MODEL', value: 'gpt-4.1', isSecret: false },
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    family: 'Custom',
    description: 'Start with a blank profile and add variables manually.',
    entries: [],
  },
]
