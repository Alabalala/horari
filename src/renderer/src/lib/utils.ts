export function cn(...values: Array<string | number | null | undefined | false>): string {
  return values.filter(Boolean).join(' ')
}
