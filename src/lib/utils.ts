import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"
import { da } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined, formatStr: string = "d. MMM yyyy"): string {
  if (!date) return ""
  const dateObj = typeof date === "string" ? parseISO(date) : date
  return format(dateObj, formatStr, { locale: da })
}
