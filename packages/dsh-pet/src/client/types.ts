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
  happy: '11,9,4',
  sad: '10,9',
  think: '10,11,9',
  sleep: '18',
  wave: '11,4',
}

export const defaultReactionsClient: PetReactionsClient = {
  streaming: true,
  complete: true,
  error: true,
  sentiment: true,
}

/** Pet moods: overlay maps each to the same-named animation. */
export type PetMood = 'idle' | 'think' | 'happy' | 'sad' | 'wave' | 'sleep'
