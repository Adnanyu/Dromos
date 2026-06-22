export const colors = {
  // Backgrounds
  background:    '#07111f',
  surface:       '#0d1e35',
  card:          '#0f2040',
  cardAlt:       '#132648',
  border:        '#1a3550',
  borderBright:  '#254d73',

  // Brand
  primary:       '#00d4aa',   // teal-green: distances, positive stats
  primaryDim:    'rgba(0,212,170,0.15)',
  accent:        '#6366f1',   // indigo: secondary actions
  accentDim:     'rgba(99,102,241,0.15)',

  // Activity types
  running:       '#00d4aa',
  cycling:       '#6366f1',
  hiking:        '#f5a623',

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
  textPrimary:   '#e8f4ff',
  textSecondary: '#7aa8cc',
  textMuted:     '#3d5a7a',
  textInverse:   '#07111f',

  // Misc
  white:         '#ffffff',
  transparent:   'transparent',
  overlay:       'rgba(7,17,31,0.85)',
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
