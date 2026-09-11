export function errorMessage(e: unknown, fallback = '發生錯誤') {
  const err = e as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
  return err?.data?.statusMessage || err?.data?.message || err?.statusMessage || err?.message || fallback
}

export function useToastError() {
  const toast = useToast()
  return (e: unknown, fallback?: string) => {
    toast.add({ title: errorMessage(e, fallback), color: 'error', icon: 'i-lucide-alert-circle' })
  }
}

export function fmtPct(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return '–'
  return `${(n * 100).toFixed(digits)}%`
}

export function fmtMs(ms: number) {
  if (!ms) return '–'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} 秒`
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '–'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '–'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
