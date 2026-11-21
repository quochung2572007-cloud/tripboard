import { describe, expect, it } from 'vitest'
import {
  extractJson,
  rankPlaces,
  renderItineraryEmail,
  parseSuggestionReply,
  rollupForecast,
  searchCacheText,
  tripDates,
  tripHasForecastWindow,
  validateItinerary,
  validateSuggestions,
  validateTripDates,
} from './trip-logic'

describe('searchCacheText', () => {
  it('treats case, spacing and punctuation variants as the same search', () => {
    const a = searchCacheText('Lisbon, PT', 'Pastry  shops!')
    expect(searchCacheText('lisbon pt', ' pastry shops ')).toBe(a)
    expect(searchCacheText('Lisbon, PT', 'pastry shop')).not.toBe(a)
    expect(searchCacheText('Porto, PT', 'pastry shops')).not.toBe(a)
  })
})

describe('dates', () => {
  it('lists inclusive trip dates across a month boundary', () => {
    expect(tripDates('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
  })
  it('validates ranges', () => {
    expect(validateTripDates('2026-12-01', '2026-12-03')).toBeNull()
    expect(validateTripDates('2026-12-03', '2026-12-01')).toMatch(/ends before/)
    expect(validateTripDates('2026-02-30', '2026-03-01')).toMatch(/Pick/)
    expect(validateTripDates('2026-12-01', '2026-12-20')).toMatch(/at most/)
  })
  it('detects whether the trip overlaps the 5-day forecast window', () => {
    expect(tripHasForecastWindow('2026-11-23', '2026-11-26', '2026-11-21')).toBe(true)
    expect(tripHasForecastWindow('2026-11-26', '2026-11-28', '2026-11-21')).toBe(false)
    expect(tripHasForecastWindow('2026-11-10', '2026-11-12', '2026-11-21')).toBe(false)
  })
})

describe('rollupForecast', () => {
  // 2026-11-22T00:00Z = 1795305600
  const base = 1795305600
  const step = (h: number, temp: number, description: string) => ({ dt: base + h * 3600, temp, description, icon: '01n' })
  it('buckets 3h steps by local day with highs, lows and wet flag', () => {
    const days = rollupForecast(
      [step(0, 10, 'clear sky'), step(9, 18, 'clear sky'), step(12, 20, 'few clouds'), step(15, 19, 'clear sky'), step(26, 12, 'light rain'), step(36, 14, 'light rain')],
      -9.1, // Lisbon → UTC-1 approximation
    )
    expect(days.map((d) => d.date)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23'])
    const d22 = days[1]
    expect(d22.high).toBe(20)
    expect(d22.low).toBe(18)
    expect(d22.summary).toBe('clear sky')
    expect(d22.wet).toBe(false)
    expect(days[2].wet).toBe(true)
    expect(d22.icon).toBe('01d')
  })
  it('ignores malformed steps', () => {
    expect(rollupForecast([{ dt: 'x' } as never, null as never], 0)).toEqual([])
  })
})

describe('rankPlaces', () => {
  const places = [
    { id: 'a', name: 'A', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b', name: 'B', createdAt: '2026-01-02T00:00:00Z' },
    { id: 'c', name: 'C', createdAt: '2026-01-03T00:00:00Z' },
  ]
  it('orders by member votes, then by who added first, ignoring non-members', () => {
    const ranked = rankPlaces(
      places,
      [
        { placeId: 'c', userId: 'u1' },
        { placeId: 'c', userId: 'u2' },
        { placeId: 'b', userId: 'u1' },
        { placeId: 'a', userId: 'outsider' },
        { placeId: 'a', userId: 'outsider2' },
      ],
      new Set(['u1', 'u2']),
    )
    expect(ranked.map((r) => [r.place.id, r.votes])).toEqual([
      ['c', 2],
      ['b', 1],
      ['a', 0],
    ])
  })
})

describe('extractJson', () => {
  it('handles fences and surrounding prose', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Sure! {"places":[{"name":"x"}]} hope that helps')).toEqual({ places: [{ name: 'x' }] })
    expect(() => extractJson('no json here')).toThrow()
  })
})

describe('validateSuggestions', () => {
  const sources = [
    { title: 'Time Out', url: 'https://timeout.example/a', text: '...' },
    { title: 'Blog', url: 'https://blog.example/b', text: '...' },
  ]
  it('keeps only cited, unique, named places and attaches the source', () => {
    const out = validateSuggestions(
      {
        places: [
          { name: 'Manteigaria', kind: 'bakery', why: 'Best custard tarts', source: 1 },
          { name: 'manteigaria', kind: 'bakery', why: 'dupe', source: 0 },
          { name: 'Invented Café', kind: 'cafe', why: 'no source', source: 7 },
          { name: '', source: 0 },
          { name: 'Alcôa', kind: 'pastry shop', why: 'Convent sweets', source: 0 },
        ],
      },
      sources,
    )
    expect(out.map((p) => p.name)).toEqual(['Manteigaria', 'Alcôa'])
    expect(out[0].sourceUrl).toBe('https://blog.example/b')
    expect(out[1].sourceTitle).toBe('Time Out')
  })
})

describe('parseSuggestionReply', () => {
  it('parses lines with quotes, bullets and stray pipes in the why', () => {
    const rows = parseSuggestionReply(
      'name | kind | why | source\n' +
        '- Cervejaria Ramiro | seafood | Famous for "prego" steak sandwiches | 4\n' +
        '2. O "Velho" Eurico | tasca | Tiny | family-run | 1\n' +
        'not a place line\n' +
        'Broken | kind | no source |',
    ) as { name: string; why: string; source: number }[]
    expect(rows.map((r) => r.name)).toEqual(['Cervejaria Ramiro', 'O "Velho" Eurico'])
    expect(rows[0].why).toBe('Famous for "prego" steak sandwiches')
    expect(rows[1]).toMatchObject({ why: 'Tiny | family-run', source: 1 })
  })
  it('accepts NONE and falls back to JSON', () => {
    expect(parseSuggestionReply('NONE')).toEqual([])
    expect(parseSuggestionReply('{"places":[{"name":"A","source":0}]}')).toEqual([{ name: 'A', source: 0 }])
    expect(() => parseSuggestionReply('I could not find anything useful.')).toThrow()
  })
})

describe('validateItinerary', () => {
  const dates = ['2026-12-01', '2026-12-02']
  it('normalizes days to the trip dates, three slots each, and strips unknown place ids', () => {
    const it = validateItinerary(
      {
        title: 'Lisbon',
        summary: 'Two days.',
        days: [
          {
            date: '2026-12-01',
            theme: 'Old town',
            slots: [
              { slot: 'morning', placeId: 'p1', title: 'Castle', detail: 'Views' },
              { slot: 'evening', placeId: 'ghost', title: 'Fado', detail: '' },
            ],
          },
        ],
        tips: ['a', 'b', 'c', 'd'],
      },
      dates,
      new Set(['p1']),
    )
    expect(it.days.map((d) => d.date)).toEqual(dates)
    expect(it.days[0].slots.map((s) => s.slot)).toEqual(['morning', 'afternoon', 'evening'])
    expect(it.days[0].slots[0].placeId).toBe('p1')
    expect(it.days[0].slots[2].placeId).toBeNull()
    expect(it.days[0].slots[2].title).toBe('Fado')
    expect(it.days[1].slots[0].title).toBe('Free time')
    expect(it.tips).toHaveLength(3)
  })
  it('rejects a reply with no days', () => {
    expect(() => validateItinerary({ title: 'x' }, dates, new Set())).toThrow()
  })
})

describe('renderItineraryEmail', () => {
  it('escapes user-controlled text', () => {
    const mail = renderItineraryEmail({
      tripName: '<script>x</script>',
      destination: 'Lisbon',
      itinerary: { title: 'T', summary: 'S', tips: [], days: [{ date: '2026-12-01', theme: 'a&b', slots: [{ slot: 'morning', placeId: null, title: '"q"', detail: '' }] }] },
      placeNames: new Map(),
      tripUrl: 'https://tripboard.app.space/trip/1',
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).toContain('a&amp;b')
    expect(mail.subject).toContain('<script>x</script>') // subject is plain text, not HTML
  })
})
