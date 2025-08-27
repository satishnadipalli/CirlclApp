import React, { createContext, useContext, useMemo } from 'react'
import { useColorScheme } from 'react-native'

type Theme = {
  isDark: boolean
  colors: {
    background: string
    surface: string
    surface2: string
    text: string
    muted: string
    primary: string
    border: string
    success: string
    danger: string
    accent: string
  }
}

const ThemeContext = createContext<Theme | null>(null)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  const colors = useMemo(() => ({
    background: isDark ? '#0B0F14' : '#FFFFFF',
    surface: isDark ? '#11161D' : '#F7F8FA',
    surface2: isDark ? '#0E1318' : '#EEF1F7',
    text: isDark ? '#EAF0F6' : '#111213',
    muted: isDark ? '#95A2B3' : '#707B85',
    primary: '#007AFF',
    border: isDark ? '#1E252D' : '#E6E9EF',
    success: '#2E7D32',
    danger: '#D32F2F',
    accent: '#CFE3FF',
  }), [isDark])
  const value = useMemo(() => ({ isDark, colors }), [isDark, colors])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

