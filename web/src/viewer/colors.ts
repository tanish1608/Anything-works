// Element coloring rules. Pure functions so they're easy to test.

export const DISCIPLINE_COLORS: Record<string, string> = {
  architecture: '#c9c4bb',
  structure: '#8d99ae',
  plumbing: '#3a86ff',
  electrical: '#f4a261',
  hvac: '#2ec4b6',
  flooring: '#b08968',
  other: '#9e9e9e',
}

export const DISCIPLINE_LABELS: Record<string, string> = {
  architecture: 'Architecture',
  structure: 'Structure',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  flooring: 'Flooring',
  other: 'Other',
}

export const STATUS_COLORS = {
  issue: '#e53935', // red: open issue
  review: '#ffb300', // amber: needs review
  done: '#43a047', // green: done (verified)
} as const

export const SELECTION_COLOR = '#7c4dff'

export interface ColorInput {
  discipline: string
  status: string
  open_issues: number
}

export type StatusKey = keyof typeof STATUS_COLORS | null

/** Precedence agreed in PLAN.md: red (open issue) > amber (needs review) > green (done) > discipline. */
export function statusKey(el: ColorInput): StatusKey {
  if (el.open_issues > 0) return 'issue'
  if (el.status === 'needs_review') return 'review'
  if (el.status === 'done') return 'done'
  return null
}

export function elementColor(el: ColorInput, statusColoring: boolean): string {
  const k = statusColoring ? statusKey(el) : null
  return k ? STATUS_COLORS[k] : (DISCIPLINE_COLORS[el.discipline] ?? DISCIPLINE_COLORS.other)
}

export const LEGEND = [
  { color: STATUS_COLORS.issue, label: 'Open issue' },
  { color: STATUS_COLORS.review, label: 'Needs review' },
  { color: STATUS_COLORS.done, label: 'Done (verified)' },
]
