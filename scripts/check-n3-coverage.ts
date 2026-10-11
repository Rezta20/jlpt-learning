#!/usr/bin/env tsx
/**
 * Check N3 grammar question coverage:
 * Every N3 grammar point should have at least 2 questions.
 */

import { GRAMMAR } from './data/grammar'
import { GRAMMAR_QUESTIONS } from './data/grammar-questions'

const n3Grammar = GRAMMAR.filter(g => g[1] === 'N3')
const n3GrammarTerms = new Set(n3Grammar.map(g => g[0]))
const n3Questions = GRAMMAR_QUESTIONS.filter(q => n3GrammarTerms.has(q.term))

console.log('=== N3 Grammar Question Coverage ===\n')
console.log(`Total N3 grammar points: ${n3Grammar.length}`)
console.log(`Total N3 questions: ${n3Questions.length}\n`)

const countMap = new Map<string, number>()
n3Questions.forEach(q => {
  countMap.set(q.term, (countMap.get(q.term) || 0) + 1)
})

const pointsWithFewerThan2: Array<{ term: string; count: number }> = []

n3Grammar.forEach(g => {
  const term = g[0]
  const count = countMap.get(term) || 0
  if (count < 2) {
    pointsWithFewerThan2.push({ term, count })
  }
})

console.log('Points with <2 questions:')
if (pointsWithFewerThan2.length === 0) {
  console.log('  ✓ None! All N3 points have at least 2 questions.\n')
} else {
  pointsWithFewerThan2
    .sort((a, b) => a.count - b.count || a.term.localeCompare(b.term))
    .forEach(p => {
      console.log(`  ${p.term}: ${p.count} question${p.count === 1 ? '' : 's'}`)
    })
  console.log()
}

console.log('=== Summary ===')
console.log(`Points with 0 questions: ${pointsWithFewerThan2.filter(p => p.count === 0).length}`)
console.log(`Points with 1 question: ${pointsWithFewerThan2.filter(p => p.count === 1).length}`)
console.log(`Points with 2+ questions: ${n3Grammar.length - pointsWithFewerThan2.length}`)
console.log(`\nTotal points with <2 questions: ${pointsWithFewerThan2.length}`)
