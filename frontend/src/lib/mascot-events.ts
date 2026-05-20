export const MOLE_OPEN_BURROW_EVENT = 'mole:open-burrow'

export type MoleOpenBurrowDetail = {
  profileColor?: string
}

export const MOLE_SPEAK_WAILS_EVENT = 'mole:speak'

export type MoleSpeakDetail = {
  type: 'success' | 'error' | 'info'
  text: string
  duration?: number
}
