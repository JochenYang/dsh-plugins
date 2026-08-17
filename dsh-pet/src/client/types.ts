/** Client-side mirror of the server pet settings namespace (server: src/settings.ts). */
export interface PetAnimationsClient {
  idle: string
  happy: string
  sad: string
  think: string
  sleep: string
  wave: string
}

export interface PetReactionsClient {
  streaming: boolean
  complete: boolean
  error: boolean
  sentiment: boolean
}

export interface PetSettingsClient {
  enabled: boolean
  size: number
  corner: string
  offsetX: number
  offsetY: number
  speed: number
  opacity: number
  reactions: PetReactionsClient
  animations: PetAnimationsClient
}

export const defaultAnimationsClient: PetAnimationsClient = {
  idle: '4,5,6',
  happy: '7,8,11',
  sad: '10,19',
  think: '10,11,7',
  sleep: '22,23,24,25',
  wave: '11,8',
}

export const defaultReactionsClient: PetReactionsClient = {
  streaming: true,
  complete: true,
  error: true,
  sentiment: true,
}

/** Pet moods: overlay maps each to the same-named animation. */
export type PetMood = 'idle' | 'think' | 'happy' | 'sad' | 'wave' | 'sleep'
