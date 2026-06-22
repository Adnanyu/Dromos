import React, { useState } from 'react'
import {
  View, TextInput, Text, TouchableOpacity, StyleSheet,
  type TextInputProps, type ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, fontSize, fontWeight, spacing } from '../../theme'

interface InputProps extends TextInputProps {
  label?:       string
  error?:       string
  containerStyle?: ViewStyle
  leftIcon?:    string
  rightIcon?:   string
  onRightIconPress?: () => void
}

export function Input({
  label, error, containerStyle, leftIcon, rightIcon, onRightIconPress,
  secureTextEntry, ...props
}: InputProps) {
  const [secure, setSecure] = useState(secureTextEntry ?? false)
  const isPassword = secureTextEntry === true

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View style={[styles.inputRow, error && styles.inputRowError]}>
        {leftIcon && (
          <Ionicons name={leftIcon as any} size={18} color={colors.textMuted} style={styles.leftIcon} />
        )}

        <TextInput
          {...props}
          secureTextEntry={secure}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, leftIcon && styles.inputWithLeft]}
        />

        {isPassword ? (
          <TouchableOpacity onPress={() => setSecure(s => !s)} style={styles.rightIcon}>
            <Ionicons name={secure ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : rightIcon ? (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon}>
            <Ionicons name={rightIcon as any} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 6 },

  label: {
    fontSize:   fontSize.sm,
    fontWeight: fontWeight.medium,
    color:      colors.textSecondary,
  },

  inputRow: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: colors.card,
    borderRadius:   radius.md,
    borderWidth:    0.5,
    borderColor:    colors.border,
    overflow:       'hidden',
  },
  inputRowError: { borderColor: colors.danger },

  leftIcon:  { paddingLeft: spacing.md },
  rightIcon: { paddingHorizontal: spacing.md },

  input: {
    flex:            1,
    color:           colors.textPrimary,
    fontSize:        fontSize.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  inputWithLeft: { paddingLeft: spacing.sm },

  error: {
    fontSize: fontSize.xs,
    color:    colors.danger,
    marginTop: 2,
  },
})
