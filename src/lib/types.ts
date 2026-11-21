/** Client-side record shapes (fields under `record.data`). */
import type { DailyForecast, ItineraryDay } from './trip-logic'

export interface Trip {
  name: string
  destination: string
  country?: string
  lat?: number
  lon?: number
  startDate: string
  endDate: string
  inviteToken?: string
  forecast?: DailyForecast[] | null
  forecastAt?: number
  generating?: boolean
  generatingBy?: string
  generatingAt?: number
  lastEmailAt?: number
}

export interface Member {
  teamId: string
  userId: string
  status: 'active' | 'left'
  role: 'organizer' | 'member'
}

export interface Place {
  tripId: string
  name: string
  kind?: string
  why?: string
  note?: string
  sourceUrl?: string
  sourceTitle?: string
  origin: 'search' | 'manual'
}

export interface Vote {
  tripId: string
  placeId: string
  userId?: string
}

export interface ItineraryRecord {
  tripId: string
  version: number
  title: string
  summary: string
  days: ItineraryDay[]
  tips: string[]
  usedWeather: boolean
  model: string
}
