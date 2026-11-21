/**
 * Tripboard's core path with three real accounts:
 *   Alice creates a trip → Bob joins by invite link → both add places and vote
 *   and see each other's changes live → Carol (not invited) sees nothing and
 *   is refused by the server actions.
 *
 * Paid AI calls (suggestPlaces / generateItinerary) are not exercised here —
 * they are verified once by hand against the live app (see WRITEUP.md). This
 * spec only spends one geocoding call (~$0.002) when Alice creates the trip.
 *
 * Needs three test accounts named Alice, Bob and Carol:
 *   npx deepspace test accounts create --email tripboard-alice@deepspace.test --name Alice --password-stdin
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const names = new Set(loadAllTestAccounts().map((a) => a.name))
test.skip(
  !['Alice', 'Bob', 'Carol'].every((n) => names.has(n)),
  'Needs test accounts named Alice, Bob and Carol (npx deepspace test accounts create …)',
)

test.setTimeout(120_000)

/** Call a server action from inside the page, as that page's signed-in user. */
async function action(page: Page, name: string, params: Record<string, unknown>) {
  return page.evaluate(
    async ({ name, params }) => {
      const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const { token } = (await t.json()) as { token: string }
      const r = await fetch(`/api/actions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      })
      return (await r.json()) as { success: boolean; error?: string; data?: unknown }
    },
    { name, params },
  )
}

function card(page: Page, placeName: string) {
  return page.locator(`[data-testid="place-card"][data-place-name="${placeName}"]`)
}

test('trip board: invite, live votes, and privacy for outsiders', async ({ users }) => {
  const [alice, bob, carol] = await users(['Alice', 'Bob', 'Carol'])
  const tripName = `E2E Lisbon ${Date.now().toString(36)}`

  // ── Alice creates a trip ────────────────────────────────────────────────
  await alice.page.goto('/home')
  await alice.page.getByLabel('Trip name').fill(tripName)
  await alice.page.getByLabel('Destination city').fill('Lisbon')
  await alice.page.getByRole('button', { name: 'Create board' }).click()
  await expect(alice.page).toHaveURL(/\/trip\//, { timeout: 30_000 })
  await expect(alice.page.getByTestId('trip-name')).toHaveText(tripName, { timeout: 15_000 })
  const tripUrl = alice.page.url()
  const tripId = tripUrl.split('/trip/')[1]
  const invite = await alice.page.getByTestId('copy-invite').getAttribute('data-invite-url')
  expect(invite).toMatch(/\/join\/[a-f0-9]{40}$/)
  const invitePath = new URL(invite!).pathname

  // ── Carol (no invite) cannot see the board or act on it ─────────────────
  await carol.page.goto(`/trip/${tripId}`)
  await expect(carol.page.getByTestId('trip-missing')).toBeVisible({ timeout: 15_000 })
  const carolAdd = await action(carol.page, 'addPlace', { tripId, name: 'Sneaky place' })
  expect(carolAdd.success).toBe(false)
  expect(carolAdd.error).toMatch(/not on this trip/i)
  const carolPlan = await action(carol.page, 'generateItinerary', { tripId })
  expect(carolPlan.success).toBe(false)

  // ── Bob joins through the invite link ───────────────────────────────────
  await bob.page.goto(invitePath)
  await expect(bob.page.getByText(tripName)).toBeVisible({ timeout: 15_000 })
  await bob.page.getByTestId('join-trip').click()
  await expect(bob.page).toHaveURL(new RegExp(`/trip/${tripId}$`), { timeout: 30_000 })
  await expect(bob.page.getByTestId('trip-name')).toHaveText(tripName, { timeout: 15_000 })

  // Alice sees Bob arrive on the board (presence), without reloading.
  await expect(alice.page.getByTestId('online-count')).toHaveText('2 on the board now', { timeout: 20_000 })

  // ── Bob adds a place; it appears for Alice live ─────────────────────────
  await bob.page.getByTestId('manual-place').fill('Time Out Market')
  await bob.page.getByTestId('manual-add').click()
  await expect(card(alice.page, 'Time Out Market')).toBeVisible({ timeout: 15_000 })

  await alice.page.getByTestId('manual-place').fill('Belém Tower')
  await alice.page.getByTestId('manual-add').click()
  await expect(card(bob.page, 'Belém Tower')).toBeVisible({ timeout: 15_000 })

  // ── Live votes reorder the shortlist for everyone ───────────────────────
  await card(alice.page, 'Belém Tower').getByTestId('vote-button').click()
  await card(bob.page, 'Belém Tower').getByTestId('vote-button').click()
  await expect(card(alice.page, 'Belém Tower').getByTestId('vote-count')).toHaveText('2', { timeout: 15_000 })
  await expect(bob.page.getByTestId('place-card').first()).toHaveAttribute('data-place-name', 'Belém Tower')

  // Un-voting is live too.
  await card(bob.page, 'Belém Tower').getByTestId('vote-button').click()
  await expect(card(alice.page, 'Belém Tower').getByTestId('vote-count')).toHaveText('1', { timeout: 15_000 })

  // Removing a place (with its votes) is live; only the adder may remove it.
  const belemId = await card(bob.page, 'Belém Tower').getAttribute('data-place-id')
  const bobRemove = await action(bob.page, 'removePlace', { tripId, placeId: belemId })
  expect(bobRemove.success).toBe(false)
  expect(bobRemove.error).toMatch(/Only the person who added/)
  await card(alice.page, 'Belém Tower').getByRole('button', { name: 'Remove Belém Tower' }).click()
  await expect(card(bob.page, 'Belém Tower')).toHaveCount(0, { timeout: 15_000 })
  await expect(bob.page.getByTestId('place-card')).toHaveCount(1)

  // Carol still sees nothing after all that activity.
  await carol.page.reload()
  await expect(carol.page.getByTestId('trip-missing')).toBeVisible({ timeout: 15_000 })
})

test('one vote per person per place is enforced by the server', async ({ users }) => {
  const [alice] = await users(['Alice'])
  await alice.page.goto('/home')
  const created = await action(alice.page, 'createTrip', {
    name: `Vote-dupe ${Date.now().toString(36)}`,
    destination: 'Porto',
    startDate: new Date(Date.now() + 86400e3 * 20).toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 86400e3 * 21).toISOString().slice(0, 10),
  })
  expect(created.success).toBe(true)
  const { tripId } = created.data as { tripId: string }
  const added = await action(alice.page, 'addPlace', { tripId, name: 'Livraria Lello' })
  expect(added.success).toBe(true)
  const { placeId } = added.data as { placeId: string }

  await alice.page.goto(`/trip/${tripId}`)
  await expect(card(alice.page, 'Livraria Lello')).toBeVisible({ timeout: 15_000 })
  await card(alice.page, 'Livraria Lello').getByTestId('vote-button').click()
  await expect(card(alice.page, 'Livraria Lello').getByTestId('vote-count')).toHaveText('1', { timeout: 15_000 })

  // A second vote row for the same place — as a forged client write — is refused.
  const toast = alice.page.getByText(/Duplicate|already exists|Vote not saved|not saved/i).first()
  await alice.page.evaluate(
    async ({ tripId, placeId }) => {
      // Reach the same mutation path the UI uses, bypassing the toggle logic.
      const w = window as unknown as { __tripboardForceVote?: (t: string, p: string) => Promise<void> }
      await w.__tripboardForceVote?.(tripId, placeId)
    },
    { tripId, placeId },
  )
  await expect(toast).toBeVisible({ timeout: 10_000 })
  await expect(card(alice.page, 'Livraria Lello').getByTestId('vote-count')).toHaveText('1')
})
