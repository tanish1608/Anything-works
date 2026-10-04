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

export interface ModelVersion {
  id: string
  number: number
  parent_id: string | null
  branch: string
  message: string
  source: string
  status: 'draft' | 'approved' | 'rejected'
  author_id: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  stats: { elements?: number; by_discipline?: Record<string, number>; [k: string]: unknown }
  is_current: boolean
}

export interface MeshLayer {
  discipline: string
  url: string
  context: boolean
}

export interface ViewerManifest {
  version: ModelVersion | null
  layers: MeshLayer[]
}

export interface ElementInfo {
  id: string
  ifc_guid: string
  name: string | null
  ifc_class: string
  discipline: string
  trade: string
  level_id: string | null
  zone_id: string | null
  bbox: number[] | null
  status: 'not_started' | 'in_progress' | 'needs_review' | 'done'
  flags: string[]
  source: string
  confidence: number | null
  open_issues: number
  context: boolean
}

export interface ElementDetail extends ElementInfo {
  props: Record<string, unknown>
  history: EventRow[]
}

export interface Job {
  id: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'failed'
  result: Record<string, unknown> | null
  error: string | null
}

export const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  needs_review: 'Needs review',
  done: 'Done',
}

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type Priority = 'low' | 'medium' | 'high' | 'critical'

export interface Issue {
  id: string
  number: number
  title: string
  description: string
  status: IssueStatus
  priority: Priority
  trade: string | null
  assignee_id: string | null
  assignee_name: string | null
  due_date: string | null
  element_id: string | null
  zone_id: string | null
  level_id: string | null
  anchor: [number, number, number] | null
  sheet_anchor: { sheet_id: string; x: number; y: number } | null
  viewpoint: { position: [number, number, number]; target: [number, number, number]; section?: unknown } | null
  created_by: string | null
  creator_name: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  comment_count: number
}

export interface Attachment {
  id: string
  filename: string
  content_type: string
  size: number
  created_at: string
  url: string
}

export interface Comment {
  id: string
  body: string
  created_at: string
  author: User | null
}

export interface IssueDetail extends Issue {
  comments: Comment[]
  attachments: Attachment[]
}

export interface Notification {
  id: string
  project_id: string | null
  kind: string
  title: string
  body: string
  link: string | null
  created_at: string
  read_at: string | null
}

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}
export const ISSUE_STATUS_COLOR: Record<IssueStatus, string> = {
  open: '#e53935',
  in_progress: '#fb8c00',
  resolved: '#1e88e5',
  closed: '#9e9e9e',
}
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']
