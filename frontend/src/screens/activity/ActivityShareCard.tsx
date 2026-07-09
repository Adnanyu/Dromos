import React, { forwardRef } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'

// Matches the union already used inline in ActivitySummaryScreen
// (`{ running: ..., cycling: ..., hiking: ... }[activity.activity_type]`).
// Defined locally rather than imported from types/api since I haven't
// confirmed that type is actually exported from there — worth swapping
// for a shared import if/when one exists.
type ActivityType = 'running' | 'cycling' | 'hiking'

// ── Export resolution ────────────────────────────────────────────────────
// Passed to both MapView.takeSnapshot() (the map background) and
// captureRef()'s resize options (the final composited card) in
// ActivitySummaryScreen, so the two stay pixel-matched. 4:5 covers both
// social feed posts and (cropped) Stories without letterboxing either.
export const EXPORT_W = 1080
export const EXPORT_H = 1350

// On-screen preview size — same 4:5 ratio, just small enough to fit
// comfortably in a modal. captureRef upscales to EXPORT_W/H regardless of
// what size this renders at on-device.
const PREVIEW_W = 320
const PREVIEW_H = Math.round(PREVIEW_W * (EXPORT_H / EXPORT_W))

const EMOJI: Record<ActivityType, string> = {
  running: '🏃',
  cycling: '🚴',
  hiking:  '🥾',
}

interface ActivityShareCardProps {
  mapImageUri:      string
  activityType:     ActivityType
  activityColor:    string
  dateLabel:        string
  distanceLabel:    string
  durationLabel:    string
  paceLabel?:       string
  /** Label for the paceLabel chip — 'PACE' for running/hiking, 'SPEED' for cycling. */
  paceChipLabel?:   string
  elevationLabel?:  string
}

// The thing that actually gets captured to a PNG. Kept as plain
// Views/Text/Image on purpose — no MapView, no other native-surface
// components — because react-native-view-shot's captureRef() can only
// reliably rasterize the standard view hierarchy. `mapImageUri` is a
// pre-rendered snapshot (from MapView.takeSnapshot(), taken by the caller)
// rather than a live map, specifically so this component is just an Image.
export const ActivityShareCard = forwardRef<View, ActivityShareCardProps>(
  function ActivityShareCard(
    { mapImageUri, activityType, activityColor, dateLabel, distanceLabel, durationLabel, paceLabel, paceChipLabel = 'PACE', elevationLabel },
    ref,
  ) {
    return (
      // `collapsable={false}` is required on Android — without it, a plain
      // wrapper View with no visible styling of its own can get optimized
      // out of the native view tree ("view flattening"), which makes
      // captureRef() silently capture the wrong node or a blank image.
      <View ref={ref} collapsable={false} style={styles.card}>
        <Image source={{ uri: mapImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />

        {/* Scrim so white stat text stays legible over any map/terrain */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.82)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.topRow}>
          <View style={[styles.typePill, { backgroundColor: activityColor + 'cc' }]}>
            <Text style={styles.typeEmoji}>{EMOJI[activityType]}</Text>
            <Text style={styles.typeLabel}>{activityType}</Text>
          </View>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
        </View>

        <View style={styles.statsBlock}>
          <Text style={styles.distance}>{distanceLabel}</Text>

          <View style={styles.chipRow}>
            <StatChip label="TIME" value={durationLabel} />
            {paceLabel      && <StatChip label={paceChipLabel} value={paceLabel} />}
            {elevationLabel && <StatChip label="ELEV" value={elevationLabel} />}
          </View>

          <View style={styles.watermarkRow}>
            <View style={[styles.watermarkDot, { backgroundColor: activityColor }]} />
            <Text style={styles.watermark}>STRIDE</Text>
          </View>
        </View>
      </View>
    )
  },
)

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width:  PREVIEW_W,
    height: PREVIEW_H,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },

  topRow: {
    position: 'absolute',
    top:   spacing.lg,
    left:  spacing.lg,
    right: spacing.lg,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  typePill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   4,
    paddingHorizontal: 10,
    borderRadius:      radius.full,
  },
  typeEmoji: { fontSize: 12 },
  typeLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: 'rgba(255,255,255,0.85)',
  },

  statsBlock: {
    position: 'absolute',
    left:   spacing.lg,
    right:  spacing.lg,
    bottom: spacing.lg,
    gap:    spacing.sm,
  },
  distance: {
    fontSize:   40,
    lineHeight: 44,
    fontWeight: fontWeight.bold,
    color:      '#fff',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  chip: { gap: 1 },
  chipValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#fff' },
  chipLabel: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1,
  },

  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  watermarkDot: { width: 6, height: 6, borderRadius: 3 },
  watermark: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 2,
  },
})