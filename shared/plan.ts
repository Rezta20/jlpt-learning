import type { Level, Skill } from './types'

export interface PlanWeek {
  index: number
  startDate: string // inclusive, YYYY-MM-DD
  endDate: string // inclusive
  title: string
  focus: string[]
  /** Levels used for "new" questions this week */
  newLevels: Level[]
  /** Grammar knowledge points to learn per weekday */
  grammarPerDay: number
  /** New vocab per day */
  vocabPerDay: number
  /** Grammar pool: which levels the daily grammar picks from (in order of priority) */
  grammarLevels: Level[]
  vocabLevels: Level[]
  readingLevel: Level
  listeningMinutes: number
  skillsWeight: Partial<Record<Skill, number>>
  book?: { name: string, lessons: [number, number] }
}

export interface Checkpoint {
  date: string
  label: string
  /** metric key evaluated by server */
  metric: 'n4_grammar_acc' | 'n3_lang_mock' | 'full_mock'
  target: number
  detail: string
}

export const EXAM_DATE = '2026-12-06'
export const PLAN_START = '2026-09-10'

export const PLAN_WEEKS: PlanWeek[] = [
  {
    index: 0,
    startDate: '2026-09-10',
    endDate: '2026-09-13',
    title: '第 0 週：準備與基準',
    focus: ['基準測驗 40 題', '熟悉系統', 'N5 文法快速盤點'],
    newLevels: ['N5', 'N4'],
    grammarPerDay: 2,
    vocabPerDay: 20,
    grammarLevels: ['N5'],
    vocabLevels: ['N5', 'N4'],
    readingLevel: 'N5',
    listeningMinutes: 0,
    skillsWeight: { vocab: 0.5, grammar: 0.5 }
  },
  {
    index: 1,
    startDate: '2026-09-14',
    endDate: '2026-09-20',
    title: '第 1 週：中級本 13–16 課',
    focus: ['て形・ない形・た形', 'N4 單字每天 30 個', '每日 20–30 題'],
    newLevels: ['N5', 'N4'],
    grammarPerDay: 2,
    vocabPerDay: 30,
    grammarLevels: ['N4', 'N5'],
    vocabLevels: ['N4', 'N5'],
    readingLevel: 'N5',
    listeningMinutes: 0,
    skillsWeight: { vocab: 0.45, grammar: 0.55 },
    book: { name: '中級本', lessons: [13, 16] }
  },
  {
    index: 2,
    startDate: '2026-09-21',
    endDate: '2026-09-27',
    title: '第 2 週：中級本 17–20 課',
    focus: ['可能形・意向形', '條件表現', '每日閱讀開始'],
    newLevels: ['N5', 'N4'],
    grammarPerDay: 2,
    vocabPerDay: 30,
    grammarLevels: ['N4', 'N5'],
    vocabLevels: ['N4', 'N5'],
    readingLevel: 'N4',
    listeningMinutes: 0,
    skillsWeight: { vocab: 0.45, grammar: 0.55 },
    book: { name: '中級本', lessons: [17, 20] }
  },
  {
    index: 3,
    startDate: '2026-09-28',
    endDate: '2026-10-04',
    title: '第 3 週：中級本 21–24 課',
    focus: ['受身・使役', '敬語入門', '檢查點 10/4'],
    newLevels: ['N4'],
    grammarPerDay: 2,
    vocabPerDay: 30,
    grammarLevels: ['N4'],
    vocabLevels: ['N4'],
    readingLevel: 'N4',
    listeningMinutes: 0,
    skillsWeight: { vocab: 0.45, grammar: 0.55 },
    book: { name: '中級本', lessons: [21, 24] }
  },
  {
    index: 4,
    startDate: '2026-10-05',
    endDate: '2026-10-11',
    title: '第 4 週：高級本 25–28 課 + N3 文法',
    focus: ['高級本開始', 'N3 高頻文法每週 12–15 個', 'N3 單字開始'],
    newLevels: ['N4', 'N3'],
    grammarPerDay: 2,
    vocabPerDay: 30,
    grammarLevels: ['N3', 'N4'],
    vocabLevels: ['N3', 'N4'],
    readingLevel: 'N4',
    listeningMinutes: 0,
    skillsWeight: { vocab: 0.45, grammar: 0.55 },
    book: { name: '高級本', lessons: [25, 28] }
  },
  {
    index: 5,
    startDate: '2026-10-12',
    endDate: '2026-10-18',
    title: '第 5 週：高級本 29–32 課 + N3 文法',
    focus: ['聽力每天 10 分鐘開始', 'N3 單字動詞・副詞優先'],
    newLevels: ['N4', 'N3'],
    grammarPerDay: 2,
    vocabPerDay: 30,
    grammarLevels: ['N3', 'N4'],
    vocabLevels: ['N3', 'N4'],
    readingLevel: 'N4',
    listeningMinutes: 10,
    skillsWeight: { vocab: 0.4, grammar: 0.5, listening: 0.1 },
    book: { name: '高級本', lessons: [29, 32] }
  },
  {
    index: 6,
    startDate: '2026-10-19',
    endDate: '2026-10-25',
    title: '第 6 週：高級本 33–36 課 + N3 文法',
    focus: ['教材收尾', '檢查點 10/25：N3 言語知識 ≥ 32/60'],
    newLevels: ['N4', 'N3'],
    grammarPerDay: 2,
    vocabPerDay: 30,
    grammarLevels: ['N3', 'N4'],
    vocabLevels: ['N3', 'N4'],
    readingLevel: 'N3',
    listeningMinutes: 10,
    skillsWeight: { vocab: 0.4, grammar: 0.5, listening: 0.1 },
    book: { name: '高級本', lessons: [33, 36] }
  },
  {
    index: 7,
    startDate: '2026-10-26',
    endDate: '2026-11-01',
    title: '第 7 週：N3 文法後半 + 讀解',
    focus: ['每天 2 個 N3 文法', '易混淆對照特訓', '讀解每天 1 篇', '聽力 15 分鐘'],
    newLevels: ['N3'],
    grammarPerDay: 2,
    vocabPerDay: 20,
    grammarLevels: ['N3'],
    vocabLevels: ['N3'],
    readingLevel: 'N3',
    listeningMinutes: 15,
    skillsWeight: { vocab: 0.3, grammar: 0.4, reading: 0.15, listening: 0.15 }
  },
  {
    index: 8,
    startDate: '2026-11-02',
    endDate: '2026-11-08',
    title: '第 8 週：N3 文法後半 + 讀解',
    focus: ['N3 文法完成度 80%', '讀解速度', '聽力 15 分鐘'],
    newLevels: ['N3'],
    grammarPerDay: 2,
    vocabPerDay: 20,
    grammarLevels: ['N3'],
    vocabLevels: ['N3'],
    readingLevel: 'N3',
    listeningMinutes: 15,
    skillsWeight: { vocab: 0.3, grammar: 0.4, reading: 0.15, listening: 0.15 }
  },
  {
    index: 9,
    startDate: '2026-11-09',
    endDate: '2026-11-15',
    title: '第 9 週：N3 文法收尾 + 模考準備',
    focus: ['剩餘 N3 文法', '檢查點 11/15：完整模考 ≥ 100/180'],
    newLevels: ['N3'],
    grammarPerDay: 2,
    vocabPerDay: 20,
    grammarLevels: ['N3'],
    vocabLevels: ['N3'],
    readingLevel: 'N3',
    listeningMinutes: 15,
    skillsWeight: { vocab: 0.3, grammar: 0.35, reading: 0.2, listening: 0.15 }
  },
  {
    index: 10,
    startDate: '2026-11-16',
    endDate: '2026-11-22',
    title: '第 10 週：模考與回補',
    focus: ['每週兩次完整模考', '模考錯題 → 知識點回補', '停止新學內容'],
    newLevels: ['N3'],
    grammarPerDay: 0,
    vocabPerDay: 10,
    grammarLevels: ['N3'],
    vocabLevels: ['N3'],
    readingLevel: 'N3',
    listeningMinutes: 15,
    skillsWeight: { vocab: 0.3, grammar: 0.3, reading: 0.2, listening: 0.2 }
  },
  {
    index: 11,
    startDate: '2026-11-23',
    endDate: '2026-11-29',
    title: '第 11 週：模考與回補',
    focus: ['每週兩次完整模考', '弱點知識點特訓'],
    newLevels: ['N3'],
    grammarPerDay: 0,
    vocabPerDay: 10,
    grammarLevels: ['N3'],
    vocabLevels: ['N3'],
    readingLevel: 'N3',
    listeningMinutes: 15,
    skillsWeight: { vocab: 0.3, grammar: 0.3, reading: 0.2, listening: 0.2 }
  },
  {
    index: 12,
    startDate: '2026-11-30',
    endDate: '2026-12-06',
    title: '第 12 週：收尾',
    focus: ['只做 SRS 到期與錯題', '每天不超過 1 小時', '12/5 休息', '12/6 下午應試'],
    newLevels: ['N3'],
    grammarPerDay: 0,
    vocabPerDay: 0,
    grammarLevels: ['N3'],
    vocabLevels: ['N3'],
    readingLevel: 'N3',
    listeningMinutes: 10,
    skillsWeight: { vocab: 0.35, grammar: 0.35, reading: 0.15, listening: 0.15 }
  }
]

export const CHECKPOINTS: Checkpoint[] = [
  { date: '2026-10-04', label: '檢查點 1', metric: 'n4_grammar_acc', target: 0.75, detail: 'N4 文法題近期正確率 ≥ 75%、N4 單字題 ≥ 80%' },
  { date: '2026-10-25', label: '檢查點 2', metric: 'n3_lang_mock', target: 32, detail: 'N3 言語知識模擬 ≥ 32 / 60' },
  { date: '2026-11-15', label: '檢查點 3', metric: 'full_mock', target: 100, detail: '完整模考 ≥ 100 / 180' }
]

export function getPlanWeek(dateStr: string): PlanWeek | null {
  return PLAN_WEEKS.find(w => dateStr >= w.startDate && dateStr <= w.endDate) ?? null
}

export function daysBetween(a: string, b: string) {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86400000)
}

export const XP_RULES = {
  correct: 10,
  reviewCorrect: 15,
  wrong: 2,
  dailyMorning: 30,
  dailyEvening: 30,
  readingDone: 20,
  grammarLearned: 15,
  sessionFinished: 10
}

export const TITLES: { xp: number, title: string }[] = [
  { xp: 0, title: '見習い' },
  { xp: 500, title: '初級生' },
  { xp: 1500, title: '中級生' },
  { xp: 3500, title: '文法職人' },
  { xp: 6000, title: '語彙の達人' },
  { xp: 10000, title: 'N3 挑戦者' },
  { xp: 15000, title: '合格請負人' }
]

export function titleForXp(xp: number) {
  let cur = TITLES[0]!
  let next: { xp: number, title: string } | null = null
  for (const t of TITLES) {
    if (xp >= t.xp) cur = t
    else {
      next = t
      break
    }
  }
  return { title: cur.title, nextAt: next?.xp ?? cur.xp }
}
