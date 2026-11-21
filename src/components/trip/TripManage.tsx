/**
 * Trip management. Organizer: edit name/dates, replace the invite link.
 * Member: leave the trip. The server re-checks every role (src/actions/trips.ts).
 */

import { useState, type FormEvent } from 'react'
import { LogOut, Pencil, RefreshCcw } from 'lucide-react'
import { Button, ConfirmModal, Input, Label, Modal, useToast } from '@/components/ui'
import { callAction } from '@/lib/api'
import type { Trip } from '@/lib/types'

export function TripManage({ tripId, trip, isOrganizer }: { tripId: string; trip: Trip; isOrganizer: boolean }) {
  const { success, error } = useToast()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'rotate' | 'leave' | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(name: string, params: Record<string, unknown>, done: string) {
    setBusy(true)
    const r = await callAction(name, { tripId, ...params })
    setBusy(false)
    if (!r.success) {
      error('Not saved', r.error)
      return false
    }
    success(done)
    return true
  }

  async function leave() {
    if (await run('leaveTrip', {}, 'You left the trip')) {
      // Full load so the records socket reconnects without this trip's rows.
      window.location.assign('/home')
    }
  }

  return (
    <div className="flex flex-wrap gap-1" data-testid="trip-manage">
      {isOrganizer ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} data-testid="edit-trip">
            <Pencil /> Edit trip
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm('rotate')} data-testid="rotate-invite">
            <RefreshCcw /> New invite link
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirm('leave')} data-testid="leave-trip">
          <LogOut /> Leave trip
        </Button>
      )}

      {editing && (
        <EditTripModal
          trip={trip}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={async (v) => {
            if (await run('updateTrip', v, 'Trip updated')) setEditing(false)
          }}
        />
      )}
      <ConfirmModal
        open={confirm === 'rotate'}
        onClose={() => setConfirm(null)}
        loading={busy}
        title="Replace the invite link?"
        description="The current link stops working right away. People already on the trip stay on it; send the new link to anyone else."
        confirmText="Replace link"
        onConfirm={async () => {
          if (await run('rotateInvite', {}, 'New invite link ready — copy it with “Invite link”')) setConfirm(null)
        }}
      />
      <ConfirmModal
        open={confirm === 'leave'}
        onClose={() => setConfirm(null)}
        loading={busy}
        title="Leave this trip?"
        description="You'll stop seeing the board and your votes will be removed. You can rejoin with a current invite link."
        confirmText="Leave trip"
        onConfirm={leave}
      />
    </div>
  )
}

function EditTripModal({
  trip,
  busy,
  onClose,
  onSave,
}: {
  trip: Trip
  busy: boolean
  onClose: () => void
  onSave: (v: { name: string; startDate: string; endDate: string }) => void
}) {
  const [name, setName] = useState(trip.name)
  const [startDate, setStartDate] = useState(trip.startDate)
  const [endDate, setEndDate] = useState(trip.endDate)

  function submit(e: FormEvent) {
    e.preventDefault()
    onSave({ name: name.trim(), startDate, endDate })
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <Modal.Header>
          <Modal.Title>Edit trip</Modal.Title>
          <Modal.Description>The destination is fixed; start a new board to change it.</Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Trip name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">From</Label>
              <Input id="edit-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">To</Label>
              <Input id="edit-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={busy || !name.trim()} data-testid="save-trip">
            Save
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
