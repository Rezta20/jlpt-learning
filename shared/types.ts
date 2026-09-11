export type Level = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'
export type Skill = 'vocab' | 'grammar' | 'reading' | 'listening'
export type KpType = 'vocab' | 'grammar'
export type SessionMode = 'quick' | 'daily' | 'learn' | 'mock' | 'reading' | 'mistakes' | 'baseline' | 'weak'

export const LEVELS: Level[] = ['N5', 'N4', 'N3', 'N2', 'N1']
export const LEVEL_ORDER: Record<Level, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 }

export const SKILL_LABEL: Record<Skill, string> = {
  vocab: '單字',
  grammar: '文法',
  reading: '讀解',
  listening: '聽解'
}

export type QType =
  | 'kanji_reading'
  | 'orthography'
  | 'context'
  | 'paraphrase'
  | 'usage'
  | 'word_meaning'
  | 'grammar_form'
  | 'sentence_order'
  | 'text_grammar'
  | 'contrast'
  | 'reading_short'
  | 'reading_mid'
  | 'reading_info'
  | 'listening_task'
  | 'listening_point'

export const QTYPE_LABEL: Record<QType, string> = {
  kanji_reading: '漢字読み',
  orthography: '表記',
  context: '文脈規定',
  paraphrase: '言い換え類義',
  usage: '用法',
  word_meaning: '句中意思',
  grammar_form: '文法形式',
  sentence_order: '文の組み立て',
  text_grammar: '文章文法',
  contrast: '易混淆對照',
  reading_short: '短文',
  reading_mid: '中文',
  reading_info: '情報檢索',
  listening_task: '課題理解',
  listening_point: 'ポイント理解'
}

export function qtypeLabel(t: string): string {
  return (QTYPE_LABEL as Record<string, string>)[t] ?? t
}

export const QTYPES_BY_SKILL: Record<Skill, QType[]> = {
  vocab: ['kanji_reading', 'orthography', 'context', 'paraphrase', 'usage', 'word_meaning'],
  grammar: ['grammar_form', 'sentence_order', 'text_grammar', 'contrast'],
  reading: ['reading_short', 'reading_mid', 'reading_info'],
  listening: ['listening_task', 'listening_point']
}

export interface ExampleSentence {
  ja: string
  zh: string
}
export interface Confusable {
  term: string
  diff: string
}
export interface KnowledgeContent {
  coreMeaning?: string
  connection?: string
  usageScene?: string
  nuance?: string
  examples?: ExampleSentence[]
  confusables?: Confusable[]
  memo?: string
}
export interface BookRef {
  book: string
  lesson?: number | string
  page?: string
  note?: string
}
export interface Explanation {
  whyCorrect: string
  whyWrong: string[]
  coreConcept: string
  examples: ExampleSentence[]
  confusables?: Confusable[]
  memoryTip?: string
}
export interface PassageToken {
  s: string
  r?: string
  m?: string
  t?: boolean
  kp?: string
}

export interface KnowledgePointDto {
  id: string
  type: KpType
  level: Level
  term: string
  reading: string | null
  meaningZh: string | null
  pos: string | null
  content: KnowledgeContent
  bookRefs: BookRef[]
  videoUrl: string | null
  isExtra: boolean
  contentReady: boolean
  state?: {
    mastery: number
    attempts: number
    correct: number
    due: string | null
    reps: number
    lapses: number
    learnedAt: string | null
    stateCode: number
  } | null
}

export interface QuestionDto {
  id: string
  level: Level
  skill: Skill
  qtype: QType
  stem: string
  options: string[]
  passage?: { id: string, title: string | null, body: string, tokens: PassageToken[] } | null
  audioUrl?: string | null
  knowledgePoints?: { id: string, term: string, type: KpType, level: Level }[]
  bucket?: 'review' | 'mistake' | 'new' | 'stretch' | 'learn' | 'todayNew'
}

export interface AnswerResult {
  isCorrect: boolean
  answerIndex: number
  explanation: Explanation
  extraExplanations: Explanation[]
  xpGained: number
  knowledgePoints: { id: string, term: string, type: KpType, level: Level, mastery: number }[]
}

export interface SessionDto {
  id: string
  mode: SessionMode
  config: Record<string, unknown>
  total: number
  answered: number
  correct: number
  timeLimitSec: number | null
  startedAt: string
  finishedAt: string | null
  questions: QuestionDto[]
  answeredMap: Record<string, { chosenIndex: number, isCorrect: boolean }>
}

export interface QuickConfig {
  levels: Level[]
  skills: Skill[]
  count: number
  autoLevel: boolean
  mix: boolean
}

export interface TodayDto {
  date: string
  week: { index: number, title: string, focus: string[], startDate: string, endDate: string } | null
  daysToExam: number
  progress: {
    answered: number
    correct: number
    xp: number
    morningDone: boolean
    eveningDone: boolean
    readingDone: boolean
    newWordsLearned: number
    grammarLearned: number
  }
  stats: { xp: number, streak: number, longestStreak: number, levelEstimate: string, title: string, nextTitleAt: number }
  due: { vocab: number, grammar: number, overdue: number, retry: number }
  todayGrammar: KnowledgePointDto[]
  todayVocabCount: number
  readingAvailable: boolean
  checkpoint: { date: string, label: string, ok: boolean | null, detail: string } | null
}
