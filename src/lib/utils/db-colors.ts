/**
 * Shared traffic light logic for DB% (dækningsbidrag) display.
 * All components should use these functions for consistent color coding.
 */

export interface DBThresholds {
  green: number  // >= green = green
  yellow: number // >= yellow = yellow
  red: number    // < red = red (blocks sending)
}

/** Default thresholds (used when settings haven't loaded yet) */
export const DEFAULT_DB_THRESHOLDS: DBThresholds = {
  green: 35,
  yellow: 20,
  red: 10,
}

export type DBColorLevel = 'green' | 'yellow' | 'red'

export function getDBLevel(percentage: number, thresholds: DBThresholds = DEFAULT_DB_THRESHOLDS): DBColorLevel {
  if (percentage >= thresholds.green) return 'green'
  if (percentage >= thresholds.yellow) return 'yellow'
  return 'red'
}

/** Tailwind text color classes */
export function getDBTextColor(percentage: number, thresholds?: DBThresholds): string {
  const level = getDBLevel(percentage, thresholds)
  switch (level) {
    case 'green': return 'text-green-600'
    case 'yellow': return 'text-yellow-600'
    case 'red': return 'text-red-600'
  }
}

/** Tailwind bg color classes for badges */
export function getDBBadgeClasses(percentage: number, thresholds?: DBThresholds): string {
  const level = getDBLevel(percentage, thresholds)
  switch (level) {
    case 'green': return 'bg-green-100 text-green-700'
    case 'yellow': return 'bg-yellow-100 text-yellow-700'
    case 'red': return 'bg-red-100 text-red-700'
  }
}

/** Tailwind bg color for progress bars */
export function getDBBarColor(percentage: number, thresholds?: DBThresholds): string {
  const level = getDBLevel(percentage, thresholds)
  switch (level) {
    case 'green': return 'bg-green-500'
    case 'yellow': return 'bg-yellow-500'
    case 'red': return 'bg-red-500'
  }
}

/** Label for traffic light level */
export function getDBLabel(percentage: number, thresholds?: DBThresholds): string {
  const level = getDBLevel(percentage, thresholds)
  switch (level) {
    case 'green': return 'Godt'
    case 'yellow': return 'OK'
    case 'red': return 'Lavt'
  }
}

/** Font-weight bold color for the DB amount summary */
export function getDBAmountColor(percentage: number, thresholds?: DBThresholds): string {
  const level = getDBLevel(percentage, thresholds)
  switch (level) {
    case 'green': return 'text-green-700'
    case 'yellow': return 'text-yellow-700'
    case 'red': return 'text-red-700'
  }
}

/** Whether this DB% blocks sending the offer */
export function isDBBelowSendThreshold(percentage: number, thresholds: DBThresholds = DEFAULT_DB_THRESHOLDS): boolean {
  return percentage < thresholds.red
}
