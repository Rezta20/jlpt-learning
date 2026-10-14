#!/usr/bin/env tsx
/**
 * Automated consistency check for grammar questions.
 * Validates:
 * 1. wrong[answer] === '' for every question
 * 2. Exactly one empty string in wrong[]
 * 3. options.length === 4 and wrong.length === 4
 * 4. No duplicate question stems
 * 5. Every N3 grammar point has >= 2 questions
 * 6. Answer positions (0-3) are roughly balanced
 */

import { GRAMMAR_QUESTIONS, type GrammarQ } from './data/grammar-questions';
import { GRAMMAR } from './data/grammar';

interface ValidationError {
  index: number;
  term: string;
  stem: string;
  error: string;
  severity: 'critical' | 'warning';
}

const errors: ValidationError[] = [];
let totalQuestions = 0;
let n3Questions = 0;

// Get N3 grammar points
const n3GrammarPoints = GRAMMAR.filter(([_, level]) => level === 'N3').map(([term]) => term);

console.log('=== Grammar Questions Consistency Check ===\n');

// Check each question
GRAMMAR_QUESTIONS.forEach((q, i) => {
  totalQuestions++;
  
  // Check 1: options and wrong arrays must have length 4
  if (q.options.length !== 4) {
    errors.push({
      index: i,
      term: q.term,
      stem: q.stem,
      error: `options.length is ${q.options.length}, expected 4`,
      severity: 'critical'
    });
  }
  
  if (q.wrong.length !== 4) {
    errors.push({
      index: i,
      term: q.term,
      stem: q.stem,
      error: `wrong.length is ${q.wrong.length}, expected 4`,
      severity: 'critical'
    });
  }
  
  // Check 2: answer must be valid index (0-3)
  if (q.answer < 0 || q.answer > 3) {
    errors.push({
      index: i,
      term: q.term,
      stem: q.stem,
      error: `answer is ${q.answer}, must be 0-3`,
      severity: 'critical'
    });
  }
  
  // Check 3: wrong[answer] must be empty string
  if (q.wrong.length === 4 && q.answer >= 0 && q.answer <= 3) {
    if (q.wrong[q.answer] !== '') {
      errors.push({
        index: i,
        term: q.term,
        stem: q.stem,
        error: `wrong[${q.answer}] is "${q.wrong[q.answer]}", but answer points to index ${q.answer}. Expected empty string at wrong[answer].`,
        severity: 'critical'
      });
    }
  }
  
  // Check 4: Exactly one empty string in wrong[]
  const emptyCount = q.wrong.filter(w => w === '').length;
  if (emptyCount !== 1) {
    errors.push({
      index: i,
      term: q.term,
      stem: q.stem,
      error: `wrong[] has ${emptyCount} empty strings, expected exactly 1`,
      severity: 'critical'
    });
  }
  
  // Count N3 questions
  if (n3GrammarPoints.includes(q.term)) {
    n3Questions++;
  }
});

// Check 5: options[answer] should appear in why or core (semantic alignment check)
const semanticWarnings: Array<{index: number, term: string, stem: string, correctOption: string, whyCore: string}> = [];

GRAMMAR_QUESTIONS.forEach((q, i) => {
  if (q.options.length === 4 && q.answer >= 0 && q.answer <= 3) {
    const correctOption = q.options[q.answer];
    const whyCore = `${q.why} ${q.core}`.toLowerCase();
    
    // Extract the main part of the option (remove trailing notes like "、口語")
    const optionMain = correctOption.split('、')[0].split('／')[0];
    
    // Check if option appears in why or core (allowing for stem forms)
    // Remove common particles/suffixes to check stem forms
    const optionStem = optionMain
      .replace(/ます$/, '')
      .replace(/ません$/, '')
      .replace(/だ$/, '')
      .replace(/です$/, '')
      .replace(/ない$/, '');
    
    const found = whyCore.includes(optionMain.toLowerCase()) || 
                  whyCore.includes(optionStem.toLowerCase()) ||
                  // Check without first character (e.g., おかげで vs かげで)
                  (optionMain.length > 2 && whyCore.includes(optionMain.substring(1).toLowerCase()));
    
    if (!found) {
      semanticWarnings.push({
        index: i,
        term: q.term,
        stem: q.stem,
        correctOption: correctOption,
        whyCore: `${q.why} / ${q.core}`
      });
    }
  }
});

// Check 6: No duplicate stems
const stemCounts = new Map<string, number[]>();
GRAMMAR_QUESTIONS.forEach((q, i) => {
  const stem = q.stem.trim();
  if (!stemCounts.has(stem)) {
    stemCounts.set(stem, []);
  }
  stemCounts.get(stem)!.push(i);
});

stemCounts.forEach((indices, stem) => {
  if (indices.length > 1) {
    indices.forEach(i => {
      errors.push({
        index: i,
        term: GRAMMAR_QUESTIONS[i].term,
        stem: stem,
        error: `Duplicate stem found at indices: ${indices.join(', ')}`,
        severity: 'warning'
      });
    });
  }
});

// Check 7: Every N3 grammar point has >= 2 questions
const n3TermCounts = new Map<string, number>();
GRAMMAR_QUESTIONS.forEach(q => {
  if (n3GrammarPoints.includes(q.term)) {
    n3TermCounts.set(q.term, (n3TermCounts.get(q.term) || 0) + 1);
  }
});

n3GrammarPoints.forEach(term => {
  const count = n3TermCounts.get(term) || 0;
  if (count < 2) {
    errors.push({
      index: -1,
      term: term,
      stem: '',
      error: `N3 grammar point "${term}" has ${count} questions, expected >= 2`,
      severity: 'warning'
    });
  }
});

// Check 8: Answer distribution should be roughly balanced
const answerCounts = [0, 0, 0, 0];
GRAMMAR_QUESTIONS.forEach(q => {
  if (n3GrammarPoints.includes(q.term)) {
    if (q.answer >= 0 && q.answer <= 3) {
      answerCounts[q.answer]++;
    }
  }
});

console.log(`Total questions: ${totalQuestions}`);
console.log(`N3 questions: ${n3Questions}`);
console.log(`\nN3 Answer distribution:`);
answerCounts.forEach((count, i) => {
  const percentage = ((count / n3Questions) * 100).toFixed(1);
  console.log(`  Position ${i}: ${count} (${percentage}%)`);
});

const expectedPerPosition = n3Questions / 4;
const tolerance = expectedPerPosition * 0.3; // Allow 30% deviation
answerCounts.forEach((count, i) => {
  if (Math.abs(count - expectedPerPosition) > tolerance) {
    errors.push({
      index: -1,
      term: 'N3 questions',
      stem: '',
      error: `Answer position ${i} has ${count} questions (${((count / n3Questions) * 100).toFixed(1)}%), expected roughly 25% (${expectedPerPosition.toFixed(0)} ±${tolerance.toFixed(0)})`,
      severity: 'warning'
    });
  }
});

// Report errors
console.log(`\n=== Validation Results ===\n`);

const criticalErrors = errors.filter(e => e.severity === 'critical');
const warnings = errors.filter(e => e.severity === 'warning');

if (criticalErrors.length === 0 && warnings.length === 0) {
  console.log('✅ All checks passed!');
  process.exit(0);
}

if (criticalErrors.length > 0) {
  console.log(`❌ ${criticalErrors.length} CRITICAL ERRORS:\n`);
  criticalErrors.forEach((e, i) => {
    console.log(`${i + 1}. Question #${e.index} (${e.term})`);
    console.log(`   Stem: ${e.stem.substring(0, 60)}${e.stem.length > 60 ? '...' : ''}`);
    console.log(`   Error: ${e.error}\n`);
  });
}

if (warnings.length > 0) {
  console.log(`⚠️  ${warnings.length} WARNINGS:\n`);
  warnings.forEach((e, i) => {
    if (e.index >= 0) {
      console.log(`${i + 1}. Question #${e.index} (${e.term})`);
      console.log(`   Stem: ${e.stem.substring(0, 60)}${e.stem.length > 60 ? '...' : ''}`);
      console.log(`   Error: ${e.error}\n`);
    } else {
      console.log(`${i + 1}. ${e.term}`);
      console.log(`   ${e.error}\n`);
    }
  });
}

// Report semantic alignment warnings
if (semanticWarnings.length > 0) {
  console.log(`\n📋 Semantic Alignment Check: ${semanticWarnings.length} questions where options[answer] not clearly found in why/core\n`);
  console.log('(This checks if the correct answer text appears in the explanation, catching potential misalignments)\n');
  semanticWarnings.forEach((w, i) => {
    console.log(`${i + 1}. Question #${w.index} (${w.term})`);
    console.log(`   Correct option: "${w.correctOption}"`);
    console.log(`   Why/Core: ${w.whyCore.substring(0, 80)}${w.whyCore.length > 80 ? '...' : ''}\n`);
  });
}

console.log(`\nSummary: ${criticalErrors.length} critical errors, ${warnings.length} warnings, ${semanticWarnings.length} semantic alignment notes`);
process.exit(criticalErrors.length > 0 ? 1 : 0);
