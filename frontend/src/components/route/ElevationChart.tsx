import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg'
import type { ElevationPoint } from '../../types/api'
import { colors, fontSize } from '../../theme'
import { useUnits } from '../../hooks/useUnits'
import { formatDistance, formatElevation } from '../../utils/format'

interface ElevationChartProps {
  profile: ElevationPoint[]
  width:   number
  height?: number
}

export function ElevationChart({ profile, width, height = 100 }: ElevationChartProps) {
  // Read units from store — no prop needed
  const units = useUnits()

  const { pathD, gradientD, minEle, maxEle, totalDist } = useMemo(() => {
    if (profile.length < 2) return { pathD: '', gradientD: '', minEle: 0, maxEle: 0, totalDist: 0 }

    const pad = { t: 14, b: 26, l: 4, r: 4 }
    const w   = width  - pad.l - pad.r
    const h   = height - pad.t - pad.b

    const elevations = profile.map(p => p.elevation_m)
    const minEle     = Math.min(...elevations)
    const maxEle     = Math.max(...elevations)
    const totalDist  = profile[profile.length - 1].distance_m
    const eleRange   = maxEle - minEle || 1

    const toX = (d: number) => pad.l + (d / totalDist) * w
    const toY = (e: number) => pad.t + h - ((e - minEle) / eleRange) * h

    const pts = profile.map(p => [toX(p.distance_m), toY(p.elevation_m)])

    const pathD = pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ')

    const gradientD =
      `${pathD} L${pts[pts.length - 1][0].toFixed(1)},${(pad.t + h).toFixed(1)}` +
      ` L${pts[0][0].toFixed(1)},${(pad.t + h).toFixed(1)} Z`

    return { pathD, gradientD, minEle, maxEle, totalDist }
  }, [profile, width, height])

  if (profile.length < 2) return null

  const midDist = totalDist / 2

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Elevation profile</Text>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor={colors.primary} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        <Path d={gradientD} fill="url(#elev)" />
        <Path d={pathD} stroke={colors.primary} strokeWidth={1.5} fill="none"
              strokeLinecap="round" strokeLinejoin="round" />

        {/* X-axis — distance labels */}
        <SvgText x={4}          y={height - 6} fill={colors.textMuted} fontSize={9} textAnchor="start">
          {formatDistance(0, units)}
        </SvgText>
        <SvgText x={width / 2}  y={height - 6} fill={colors.textMuted} fontSize={9} textAnchor="middle">
          {formatDistance(midDist, units)}
        </SvgText>
        <SvgText x={width - 4}  y={height - 6} fill={colors.textMuted} fontSize={9} textAnchor="end">
          {formatDistance(totalDist, units)}
        </SvgText>

        {/* Y-axis — elevation labels */}
        <SvgText x={width - 4}  y={18}          fill={colors.textMuted} fontSize={9} textAnchor="end">
          {formatElevation(maxEle, units)}
        </SvgText>
        <SvgText x={width - 4}  y={height - 30} fill={colors.textMuted} fontSize={9} textAnchor="end">
          {formatElevation(minEle, units)}
        </SvgText>
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  label: {
    fontSize: fontSize.xs, color: colors.textMuted,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
})
