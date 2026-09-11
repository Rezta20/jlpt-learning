import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  numeric
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ---------- Shared JSON shapes (kept in sync with shared/types.ts) ----------
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
  whyWrong: string[] // aligned with options; entry for correct option may be ''
  coreConcept: string
  examples: ExampleSentence[]
  confusables?: Confusable[]
  memoryTip?: string
}
export interface PassageToken {
  s: string // surface
  r?: string // reading (kana)
  m?: string // meaning zh
  t?: boolean // target (new/recent word)
  kp?: string // knowledge point id
}

// ---------- Users ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().default('me'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

// ---------- Knowledge points (vocab / grammar) ----------
export const knowledgePoints = pgTable('knowledge_points', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type', { enum: ['vocab', 'grammar'] }).notNull(),
  level: text('level', { enum: ['N5', 'N4', 'N3', 'N2', 'N1'] }).notNull(),
  term: text('term').notNull(),
  reading: text('reading'),
  meaningZh: text('meaning_zh'),
  pos: text('pos'),
  content: jsonb('content').$type<KnowledgeContent>().notNull().default({}),
  bookRefs: jsonb('book_refs').$type<BookRef[]>().notNull().default([]),
  videoUrl: text('video_url'),
  source: text('source').notNull().default('seed'),
  isExtra: boolean('is_extra').notNull().default(false),
  contentReady: boolean('content_ready').notNull().default(false),
  priority: integer('priority').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('kp_type_term_reading_idx').on(t.type, t.term, sql`coalesce(${t.reading}, '')`),
  index('kp_level_type_idx').on(t.level, t.type)
])

// ---------- Passages (reading) ----------
export const passages = pgTable('passages', {
  id: uuid('id').primaryKey().defaultRandom(),
  level: text('level').notNull(),
  title: text('title'),
  body: text('body').notNull(),
  tokens: jsonb('tokens').$type<PassageToken[]>().notNull().default([]),
  summaryZh: text('summary_zh'),
  targetKpIds: jsonb('target_kp_ids').$type<string[]>().notNull().default([]),
  scheduledFor: date('scheduled_for'),
  source: text('source').notNull().default('ai'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('passages_scheduled_idx').on(t.scheduledFor)
])

// ---------- Questions ----------
export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  level: text('level').notNull(),
  skill: text('skill', { enum: ['vocab', 'grammar', 'reading', 'listening'] }).notNull(),
  qtype: text('qtype').notNull(),
  stem: text('stem').notNull(),
  passageId: uuid('passage_id').references(() => passages.id, { onDelete: 'cascade' }),
  options: jsonb('options').$type<string[]>().notNull(),
  answerIndex: integer('answer_index').notNull(),
  explanation: jsonb('explanation').$type<Explanation>().notNull(),
  source: text('source').notNull().default('ai'),
  sourceRef: text('source_ref'),
  audioUrl: text('audio_url'),
  stemHash: text('stem_hash').notNull(),
  quality: text('quality', { enum: ['ok', 'flagged', 'disabled'] }).notNull().default('ok'),
  flagsCount: integer('flags_count').notNull().default(0),
  timesAnswered: integer('times_answered').notNull().default(0),
  timesCorrect: integer('times_correct').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('questions_stem_hash_idx').on(t.stemHash),
  index('questions_level_skill_idx').on(t.level, t.skill, t.quality),
  index('questions_passage_idx').on(t.passageId)
])

export const questionKnowledgePoints = pgTable('question_knowledge_points', {
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  knowledgePointId: uuid('knowledge_point_id').notNull().references(() => knowledgePoints.id, { onDelete: 'cascade' })
}, t => [
  primaryKey({ columns: [t.questionId, t.knowledgePointId] }),
  index('qkp_kp_idx').on(t.knowledgePointId)
])

export const explanations = pgTable('explanations', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(2),
  content: jsonb('content').$type<Explanation>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

// ---------- Sessions & answers ----------
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  mode: text('mode', { enum: ['quick', 'daily', 'learn', 'mock', 'reading', 'mistakes', 'baseline', 'weak'] }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  questionIds: jsonb('question_ids').$type<string[]>().notNull(),
  total: integer('total').notNull(),
  correct: integer('correct').notNull().default(0),
  answered: integer('answered').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  timeLimitSec: integer('time_limit_sec'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true })
}, t => [
  index('sessions_user_started_idx').on(t.userId, t.startedAt)
])

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  chosenIndex: integer('chosen_index').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  responseMs: integer('response_ms').notNull().default(0),
  answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('answers_user_time_idx').on(t.userId, t.answeredAt),
  index('answers_question_idx').on(t.questionId)
])

// ---------- User × Question (light stats) ----------
export const userQuestionState = pgTable('user_question_state', {
  userId: uuid('user_id').notNull().references(() => users.id),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  seen: integer('seen').notNull().default(0),
  correct: integer('correct').notNull().default(0),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lastWrongAt: timestamp('last_wrong_at', { withTimezone: true }),
  wrongStreak: integer('wrong_streak').notNull().default(0),
  retryDue: timestamp('retry_due', { withTimezone: true })
}, t => [
  primaryKey({ columns: [t.userId, t.questionId] }),
  index('uqs_retry_idx').on(t.userId, t.retryDue),
  index('uqs_lastwrong_idx').on(t.userId, t.lastWrongAt)
])

// ---------- User × Knowledge point (FSRS) ----------
export const userKnowledgeState = pgTable('user_knowledge_state', {
  userId: uuid('user_id').notNull().references(() => users.id),
  knowledgePointId: uuid('knowledge_point_id').notNull().references(() => knowledgePoints.id, { onDelete: 'cascade' }),
  // FSRS card fields
  due: timestamp('due', { withTimezone: true }).notNull().defaultNow(),
  stability: real('stability').notNull().default(0),
  difficulty: real('difficulty').notNull().default(0),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  learningSteps: integer('learning_steps').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  state: integer('state').notNull().default(0), // 0 new, 1 learning, 2 review, 3 relearning
  lastReview: timestamp('last_review', { withTimezone: true }),
  // aggregate
  attempts: integer('attempts').notNull().default(0),
  correct: integer('correct').notNull().default(0),
  mastery: real('mastery').notNull().default(0),
  learnedAt: timestamp('learned_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
}, t => [
  primaryKey({ columns: [t.userId, t.knowledgePointId] }),
  index('uks_due_idx').on(t.userId, t.due),
  index('uks_mastery_idx').on(t.userId, t.mastery)
])

// ---------- Daily progress / stats / gamification ----------
export const dailyProgress = pgTable('daily_progress', {
  userId: uuid('user_id').notNull().references(() => users.id),
  date: date('date').notNull(),
  answered: integer('answered').notNull().default(0),
  correct: integer('correct').notNull().default(0),
  xp: integer('xp').notNull().default(0),
  minutes: integer('minutes').notNull().default(0),
  morningDone: boolean('morning_done').notNull().default(false),
  eveningDone: boolean('evening_done').notNull().default(false),
  readingDone: boolean('reading_done').notNull().default(false),
  newWordsLearned: integer('new_words_learned').notNull().default(0),
  grammarLearned: integer('grammar_learned').notNull().default(0)
}, t => [
  primaryKey({ columns: [t.userId, t.date] })
])

export const userStats = pgTable('user_stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  xp: integer('xp').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastActiveDate: date('last_active_date'),
  levelEstimate: text('level_estimate').notNull().default('N5'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const levelSnapshots = pgTable('level_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  date: date('date').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('level_snapshots_user_date_idx').on(t.userId, t.date)
])

// ---------- AI jobs / usage / imports ----------
export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status', { enum: ['pending', 'running', 'done', 'failed', 'cancelled'] }).notNull().default('pending'),
  target: integer('target').notNull().default(0),
  produced: integer('produced').notNull().default(0),
  cursor: integer('cursor').notNull().default(0),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 5 }).notNull().default('0'),
  refId: text('ref_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('ai_usage_created_idx').on(t.createdAt)
])

export const imports = pgTable('imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull().default('text'),
  title: text('title'),
  rawText: text('raw_text').notNull(),
  status: text('status', { enum: ['new', 'parsed', 'approved', 'failed'] }).notNull().default('new'),
  passageId: uuid('passage_id').references(() => passages.id, { onDelete: 'set null' }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

// ---------- Reading progress ----------
export const passageReads = pgTable('passage_reads', {
  userId: uuid('user_id').notNull().references(() => users.id),
  passageId: uuid('passage_id').notNull().references(() => passages.id, { onDelete: 'cascade' }),
  unknownTokens: jsonb('unknown_tokens').$type<string[]>().notNull().default([]),
  correct: integer('correct').notNull().default(0),
  total: integer('total').notNull().default(0),
  readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  primaryKey({ columns: [t.userId, t.passageId] })
])
