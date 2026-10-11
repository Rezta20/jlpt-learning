#!/usr/bin/env tsx
/**
 * Apply answer index fixes and remove duplicates from N3 questions.
 * This script modifies grammar-questions.ts in place.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map of question indices (0-based) to correct answer values
// Based on the review, these are the N3 questions starting from the "// ---- N3 追加文法題" comment
// The review counts questions 1-195 after that comment, so we need to find where that section starts

const filePath = path.join(__dirname, 'data', 'grammar-questions.ts');
const content = fs.readFileSync(filePath, 'utf-8');

// Find the start of the N3 section
const n3SectionMarker = '// ---- N3 追加文法題';
const n3SectionStart = content.indexOf(n3SectionMarker);

if (n3SectionStart === -1) {
  console.error('Could not find N3 section marker');
  process.exit(1);
}

// Count how many questions are before the N3 section
const beforeN3 = content.substring(0, n3SectionStart);
const questionsBefore = (beforeN3.match(/{\s*term:/g) || []).length;

console.log(`Found ${questionsBefore} questions before N3 section`);
console.log(`N3 section starts at character ${n3SectionStart}`);

// Answer fixes: question number (1-based from review) -> correct answer index (0-3)
const answerFixes: Record<number, number> = {
  1: 1, 2: 1, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 58: 1, 59: 1, 67: 1, 69: 1, 71: 0,
  88: 0, 89: 0, 90: 0, 91: 0, 92: 0, 93: 0, 94: 0, 95: 0, 96: 0, 97: 0, 98: 1, 99: 1,
  101: 0, 103: 0, 105: 0, 107: 0, 109: 0, 111: 0, 113: 0, 115: 0, 118: 0, 119: 0,
  121: 0, 123: 0, 125: 0, 129: 0, 131: 0, 133: 0
};

// Convert review question numbers to actual file indices
const fileIndicestoFix: Record<number, number> = {};
Object.entries(answerFixes).forEach(([reviewNum, correctAnswer]) => {
  const fileIndex = questionsBefore + parseInt(reviewNum) - 1; // -1 because review counts from 1
  fileIndicestoFix[fileIndex] = correctAnswer;
});

console.log(`\nNeed to fix answer indices for ${Object.keys(fileIndicestoFix).length} questions`);

// Split content into lines for easier processing
const lines = content.split('\n');

// Find and fix answer values
let fixedCount = 0;
let currentQuestionIndex = -1;
let inQuestion = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Detect start of question object
  if (line.trim().match(/^{\s*$/)) {
    currentQuestionIndex++;
    inQuestion = true;
  }
  
  // Detect end of question object
  if (line.trim().match(/^},?\s*$/)) {
    inQuestion = false;
  }
  
  // Fix answer line if this question needs fixing
  if (inQuestion && fileIndicestoFix[currentQuestionIndex] !== undefined) {
    const answerMatch = line.match(/^(\s*)answer:\s*\d+,?\s*$/);
    if (answerMatch) {
      const indent = answerMatch[1];
      const newAnswer = fileIndicestoFix[currentQuestionIndex];
      lines[i] = `${indent}answer: ${newAnswer},`;
      fixedCount++;
      console.log(`Fixed question #${currentQuestionIndex} (review #${currentQuestionIndex - questionsBefore + 1}): answer -> ${newAnswer}`);
    }
  }
}

console.log(`\nFixed ${fixedCount} answer values`);

// Write back
const newContent = lines.join('\n');
fs.writeFileSync(filePath, newContent, 'utf-8');

console.log(`\n✅ Successfully updated ${filePath}`);
console.log(`\nNote: This script only fixed answer indices. For complete corrections,`);
console.log(`additional fixes to stems/options may be needed as documented in the review.`);
