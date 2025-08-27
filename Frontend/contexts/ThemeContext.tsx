import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

type ThemeMode = 'system' | 'light' | 'dark' | 'scheduled'
type ThemeSchedule = { darkStart: string; lightStart: string } // HH:mm 24h local

type Theme = {
  isDark: boolean
  mode: ThemeMode
  schedule: ThemeSchedule
  setMode: (m: ThemeMode) => Promise<void>
  setSchedule: (s: ThemeSchedule) => Promise<void>
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
  const systemScheme = useColorScheme()
  const systemDark = systemScheme === 'dark'

  const [mode, setModeState] = useState<ThemeMode>('system')
  const [schedule, setScheduleState] = useState<ThemeSchedule>({ darkStart: '19:00', lightStart: '07:00' })
  const [isDark, setIsDark] = useState<boolean>(systemDark)
  const timerRef = useRef<any>(null)

  const parseTime = (hhmm: string): number => {
    try {
      const [h, m] = (hhmm || '').split(':').map((x) => parseInt(x, 10))
      if (Number.isInteger(h) && Number.isInteger(m)) return (h * 60) + m
      return 0
    } catch { return 0 }
  }

  const isDarkBySchedule = (s: ThemeSchedule): boolean => {
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    const ds = parseTime(s.darkStart)
    const ls = parseTime(s.lightStart)
    if (ds === ls) return systemDark // degenerate, fall back to system
    if (ds < ls) {
      // Dark between ds..ls
      return mins >= ds && mins < ls
    }
    // Wrap midnight: dark if after ds or before ls
    return mins >= ds || mins < ls
  }

  const computeIsDark = (m: ThemeMode, s: ThemeSchedule): boolean => {
    switch (m) {
      case 'light': return false
      case 'dark': return true
      case 'scheduled': return isDarkBySchedule(s)
      case 'system':
      default: return systemDark
    }
  }

  const msUntilNextFlip = (s: ThemeSchedule): number => {
    const now = new Date()
    const toMs = (t: string) => {
      const [hh, mm] = t.split(':').map((x) => parseInt(x, 10))
      const d = new Date(now)
      d.setHours(hh, mm, 0, 0)
      return d
    }
    const candidates: Date[] = []
    const ds = toMs(s.darkStart)
    const ls = toMs(s.lightStart)
    if (ds.getTime() <= now.getTime()) ds.setDate(ds.getDate() + 1)
    if (ls.getTime() <= now.getTime()) ls.setDate(ls.getDate() + 1)
    candidates.push(ds, ls)
    const next = candidates.reduce((a, b) => (a.getTime() < b.getTime() ? a : b))
    return Math.max(250, next.getTime() - now.getTime())
  }

  const scheduleRecompute = (m: ThemeMode, s: ThemeSchedule) => {
    try { if (timerRef.current) clearTimeout(timerRef.current) } catch {}
    if (m === 'scheduled') {
      const delay = msUntilNextFlip(s)
      timerRef.current = setTimeout(() => setIsDark(computeIsDark(m, s)), delay)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const rawMode = await AsyncStorage.getItem('theme_mode')
        const rawSched = await AsyncStorage.getItem('theme_schedule')
        const m = (rawMode as ThemeMode) || 'system'
        const s = rawSched ? JSON.parse(rawSched) as ThemeSchedule : { darkStart: '19:00', lightStart: '07:00' }
        if (!mounted) return
        setModeState(m)
        setScheduleState(s)
        setIsDark(computeIsDark(m, s))
        scheduleRecompute(m, s)
      } catch {
        setIsDark(computeIsDark('system', { darkStart: '19:00', lightStart: '07:00' }))
      }
    })()
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setIsDark((prev) => computeIsDark(mode, schedule))
    })
    return () => { mounted = false; try { if (timerRef.current) clearTimeout(timerRef.current) } catch {}; try { sub?.remove() } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemDark])

  useEffect(() => {
    setIsDark(computeIsDark(mode, schedule))
    scheduleRecompute(mode, schedule)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, schedule])

  const setMode = async (m: ThemeMode) => {
    setModeState(m)
    try { await AsyncStorage.setItem('theme_mode', m) } catch {}
  }

  const setSchedule = async (s: ThemeSchedule) => {
    setScheduleState(s)
    try { await AsyncStorage.setItem('theme_schedule', JSON.stringify(s)) } catch {}
  }

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
    accent: isDark ? '#1E2A38' : '#CFE3FF',
  }), [isDark])

  const value = useMemo(() => ({ isDark, mode, schedule, setMode, setSchedule, colors }), [isDark, mode, schedule, colors])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

