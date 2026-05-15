export interface PresetEntry {
  key: string
  value: string
  isSecret: boolean
}

export interface ProviderPreset {
  id: string
  name: string
  descriptionEn: string
  descriptionZh: string
  link?: string
  entries: PresetEntry[]
}