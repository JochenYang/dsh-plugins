import z from '@deepseek-ai/schemastery'

/** Settings namespace serving the pet's user preferences (DSH 设置 → 宠物). */
export const SETTINGS_NS = 'pet'

/** Reaction toggle keys (client gates each pet mood on them). */
export const reactionNames = ['streaming', 'complete', 'error', 'sentiment'] as const
export type ReactionName = typeof reactionNames[number]

/** Animation keys; frame lists are comma-separated atlas cell numbers (1-32). */
export const animationNames = ['idle', 'happy', 'sad', 'think', 'sleep', 'wave'] as const
export type AnimationName = typeof animationNames[number]

/** Corner presets for the floating pet. */
export const cornerNames = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'custom'] as const
export type CornerName = typeof cornerNames[number]

export interface PetAnimations {
  idle: string
  happy: string
  sad: string
  think: string
  sleep: string
  wave: string
}

export interface PetReactions {
  /** Play the thinking animation while the model streams a reply. */
  streaming: boolean
  /** React (happy/wave) when a reply completes. */
  complete: boolean
  /** React sad when a reply ends in an error. */
  error: boolean
  /** Classify reply text sentiment (greeting → wave, positive → happy, apology → sad). */
  sentiment: boolean
}

export interface PetSettings {
  enabled: boolean
  /** Pet display height in px. */
  size: number
  /** Floating corner preset, or 'custom' after dragging. */
  corner: CornerName
  /** Dragged/tuned offset from the docked corner (px). */
  offsetX: number
  offsetY: number
  /** Animation speed multiplier (0.2-3). */
  speed: number
  /** Pet opacity (0.1-1). */
  opacity: number
  reactions: PetReactions
  animations: PetAnimations
}

export const defaultAnimations: PetAnimations = {
  idle: '4,5,6',
  happy: '7,8,11',
  sad: '10,19',
  think: '10,11,7',
  sleep: '22,23,24,25',
  wave: '11,8',
}

export const defaultReactions: PetReactions = {
  streaming: true,
  complete: true,
  error: true,
  sentiment: true,
}

export const PetSettingsSchema: z<PetSettings> = z.object({
  enabled: z.boolean().default(true),
  size: z.number().min(40).max(400).default(120),
  corner: z.union(cornerNames).default('bottom-right'),
  offsetX: z.number().default(16),
  offsetY: z.number().default(16),
  speed: z.number().min(0.2).max(3).default(1),
  opacity: z.number().min(0.1).max(1).default(1),
  reactions: z.object({
    streaming: z.boolean().default(true),
    complete: z.boolean().default(true),
    error: z.boolean().default(true),
    sentiment: z.boolean().default(true),
  }),
  animations: z.object({
    idle: z.string().default(defaultAnimations.idle),
    happy: z.string().default(defaultAnimations.happy),
    sad: z.string().default(defaultAnimations.sad),
    think: z.string().default(defaultAnimations.think),
    sleep: z.string().default(defaultAnimations.sleep),
    wave: z.string().default(defaultAnimations.wave),
  }),
})
