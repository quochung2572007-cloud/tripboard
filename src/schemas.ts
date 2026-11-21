/**
 * Collection Schemas — single source of truth, imported by worker and frontend.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import {
  itinerariesSchema,
  placesSchema,
  teamMembersSchema,
  tripsSchema,
  usageCountersSchema,
  votesSchema,
} from './schemas/trip-schemas'

export const schemas: CollectionSchema[] = [
  usersSchema,
  tripsSchema,
  teamMembersSchema,
  placesSchema,
  votesSchema,
  itinerariesSchema,
  usageCountersSchema,
]
