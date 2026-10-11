#!/usr/bin/env python3
"""
Analyze JLPT question bank for data quality issues.
READ-ONLY audit script.
"""

import json
import re
from collections import defaultdict, Counter

# Parse grammar.ts to get N3 grammar points
with open('/workspace/scripts/data/grammar.ts', 'r', encoding='utf-8') as f:
    grammar_content = f.read()

# Extract N3 grammar points
n3_section = re.search(r'// ---------------- N3 ----------------\s*(.*)', grammar_content, re.DOTALL)
if n3_section:
    n3_lines = n3_section.group(1)
    n3_points = re.findall(r"\['([^']+)', 'N3'", n3_lines)
    print(f"Total N3 grammar points defined: {len(n3_points)}")

# Parse grammar-questions.ts to count N3 questions
with open('/workspace/scripts/data/grammar-questions.ts', 'r', encoding='utf-8') as f:
    questions_content = f.read()

# Find N3 section
n3_q_section = re.search(r'// ---- N3 ----\s*(.*)', questions_content, re.DOTALL)
if n3_q_section:
    n3_q_lines = n3_q_section.group(1)
    n3_terms = re.findall(r"term: '([^']+)'", n3_q_lines)
    n3_term_counts = Counter(n3_terms)
    
    print(f"\nN3 questions found: {len(n3_terms)}")
    print(f"N3 grammar points with questions: {len(n3_term_counts)}")
    print(f"N3 grammar points with 0 questions: {len(n3_points) - len(n3_term_counts)}")
    
    # Points with only 1 question
    one_q = [t for t, c in n3_term_counts.items() if c == 1]
    print(f"N3 grammar points with only 1 question: {len(one_q)}")
    
    # Points with 0 questions
    zero_q = [p for p in n3_points if p not in n3_term_counts]
    print(f"\nSample N3 grammar points with 0 questions (first 10):")
    for i, term in enumerate(zero_q[:10], 1):
        print(f"  {i}. {term}")

# Count sentence_order questions
sentence_order = re.findall(r"qtype: 'sentence_order'", questions_content)
print(f"\n文の組み立て (sentence_order) questions: {len(sentence_order)}")

# Find that specific question
if sentence_order:
    so_match = re.search(r"qtype: 'sentence_order',\s*stem: '([^']+)'", questions_content)
    if so_match:
        print(f"The only sentence_order question stem: {so_match.group(1)}")

# Count questions by level
for level in ['N5', 'N4', 'N3']:
    level_section = re.search(rf'// ---- {level} ----\s*(.*?)(?=// ---- |$)', questions_content, re.DOTALL)
    if level_section:
        level_qs = re.findall(r"qtype: '", level_section.group(1))
        print(f"\n{level} grammar questions: {len(level_qs)}")

# Count passages by level
with open('/workspace/scripts/data/passages.ts', 'r', encoding='utf-8') as f:
    passages_content = f.read()

for level in ['N5', 'N4', 'N3']:
    passages = re.findall(rf"level: '{level}'", passages_content)
    print(f"{level} passages: {len(passages)}")

print("\n" + "="*60)
print("VOCAB DISTRACTOR ANALYSIS")
print("="*60)

# Analyze vocab distractor generation
with open('/workspace/scripts/seed-bank.ts', 'r', encoding='utf-8') as f:
    seed_content = f.read()

# Find the distractor generation code
reading_distractor = re.search(r'const dRead = pickN\(([^)]+)\)', seed_content)
if reading_distractor:
    print("\nReading distractor selection:")
    print(f"  Code: pickN({reading_distractor.group(1)})")
    print("  Pool: ALL readings from entire vocab list")
    print("  Filter: Only length (within ±1 character)")
    print("  ❌ NO semantic similarity check")
    print("  ❌ NO phonetic similarity check")
    print("  ❌ NO JLPT-appropriate confusable logic")

kanji_distractor = re.search(r'const dKan = pickN\(([^)]+)\)', seed_content)
if kanji_distractor:
    print("\nKanji/Orthography distractor selection:")
    print(f"  Code: pickN({kanji_distractor.group(1)})")
    print("  Pool: ALL kanji terms from entire vocab list")
    print("  Filter: Only length (within ±1 character)")
    print("  ❌ NO visual similarity (look-alike kanji)")
    print("  ❌ NO semantic similarity")
    print("  ❌ NO on/kun reading pattern match")

print("\n" + "="*60)
print("MISSING OFFICIAL N3 QUESTION TYPES")
print("="*60)

official_types = {
    '文字・語彙': ['漢字読み', '表記', '文脈規定', '言い換え類義', '用法'],
    '文法': ['文法形式判断', '文の組み立て', '文章の文法'],
    '読解': ['内容理解(短文)', '内容理解(中文)', '内容理解(長文)', '統合理解', '主張理解', '情報検索'],
    '聴解': ['課題理解', 'ポイント理解', '概要理解', '即時応答', '統合理解']
}

current_qtypes = {
    'kanji_reading': '漢字読み',
    'orthography': '表記',
    'grammar_form': '文法形式判断',
    'sentence_order': '文の組み立て',
    'contrast': '対比(grammar sub-type)',
    'reading_short': '内容理解(短文)'
}

print("\nImplemented question types:")
for qtype, name in current_qtypes.items():
    print(f"  ✓ {qtype} → {name}")

print("\n❌ MISSING question types:")
missing = []
for category, types in official_types.items():
    for qtype in types:
        if qtype not in current_qtypes.values():
            missing.append(f"{category}: {qtype}")

for m in missing:
    print(f"  • {m}")

print(f"\nTotal missing: {len(missing)} question types")
print("\nNOTE: 聴解 (listening) requires audio, out of scope for text-based seed data")
