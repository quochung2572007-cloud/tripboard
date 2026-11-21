/**
 * Typed client for server actions (POST /api/actions/<name>).
 * Always resolves to the ActionResult envelope; never throws for HTTP errors.
 */
import { getAuthToken } from 'deepspace'

export type ActionResponse<T> = { success: true; data: T } | { success: false; error: string }

export async function callAction<T>(name: string, params: Record<string, unknown>): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'Please sign in again.' }
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as ActionResponse<T> | { error?: string } | null
    if (!res.ok) return { success: false, error: (body as { error?: string })?.error ?? `Request failed (${res.status})` }
    if (body && 'success' in body) return body
    return { success: false, error: 'Unexpected response from server.' }
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Network error' }
  }
}
