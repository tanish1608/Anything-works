export type Role = 'owner' | 'pm' | 'trade' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
}

export interface Project {
  id: string
  name: string
  address: string | null
  settings: Record<string, unknown>
  created_at: string
  my_role: Role
}

export interface Member {
  id: string
  user: User
  role: Role
  trades: string[]
  zone_ids: string[] | null
}

export interface Zone {
  id: string
  level_id: string
  name: string
  code: string | null
  kind: string
  polygon: [number, number][] | null
  qr_token: string
}

export interface Level {
  id: string
  building_id: string
  name: string
  index: number
  elevation_m: number
  height_m: number
  zones: Zone[]
}

export interface Building {
  id: string
  project_id: string
  name: string
  levels: Level[]
}

export interface EventRow {
  id: number
  actor_name: string | null
  at: string
  type: string
  entity_type: string
  entity_id: string
  zone_id: string | null
  evidence_ids: string[]
  data: Record<string, unknown>
  message: string | null
}

export interface Trade {
  code: string
  name: string
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  pm: 'Project manager',
  trade: 'Trade',
  viewer: 'Viewer',
}

export const can = {
  editStructure: (r: Role) => r === 'owner' || r === 'pm',
  manageMembers: (r: Role) => r === 'owner' || r === 'pm',
}
