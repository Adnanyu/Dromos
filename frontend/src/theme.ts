export const colors = {
  // Backgrounds
  background:    '#f6f7f3',
  surface:       '#ffffff',
  card:          '#ffffff',
  cardAlt:       '#eef4ee',
  border:        '#d9dfd8',
  borderBright:  '#aab8ad',

  // Brand
  primary:       '#0d7c66',
  primaryDim:    'rgba(13,124,102,0.12)',
  accent:        '#2f5da8',
  accentDim:     'rgba(47,93,168,0.12)',

  // Activity types
  running:       '#0d7c66',
  cycling:       '#2f5da8',
  hiking:        '#a86422',

  // Difficulty
  easy:          '#22c97e',
  moderate:      '#f5a623',
  hard:          '#f06060',
  extreme:       '#9f7afa',

  // Semantic
  success:       '#22c97e',
  warning:       '#f5a623',
  danger:        '#f06060',
  info:          '#60a5fa',

  // Text
  textPrimary:   '#17201b',
  textSecondary: '#53645a',
  textMuted:     '#849088',
  textInverse:   '#ffffff',

  // Misc
  white:         '#ffffff',
  transparent:   'transparent',
  overlay:       'rgba(23,32,27,0.55)',
} as const

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  '2xl': 32,
  '3xl': 48,
} as const

export const radius = {
  sm:  6,
  md:  10,
  lg:  14,
  xl:  20,
  full: 9999,
} as const

export const fontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 38,
} as const

export const fontWeight = {
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
  bold:    '700' as const,
}

export type ActivityType = 'running' | 'cycling' | 'hiking'
export type Difficulty   = 'easy' | 'moderate' | 'hard' | 'extreme'
export type SurfaceType  = 'road' | 'trail' | 'mixed'

export function activityColor(type: ActivityType): string {
  return colors[type]
}

export function difficultyColor(difficulty: Difficulty): string {
  return colors[difficulty]
}
