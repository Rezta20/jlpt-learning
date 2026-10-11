#!/bin/bash
# Check for specific problematic examples mentioned by user

echo "Checking for problematic N5 question examples..."
echo ""

# The user mentioned: きょうは さむい＿＿ ＿＿ ★ ＿＿。with ですね／ですか／です／でしょう
echo "1. Searching for 'きょうは さむい' sentence_order:"
grep -n "きょうは" scripts/data/grammar-questions.ts | head -3

echo ""
echo "2. Searching for 'わたし＿＿ ＿＿ ★ ＿＿' sentence_order:"
grep -n "わたし.*★" scripts/data/grammar-questions.ts | head -3

echo ""
echo "Total sentence_order questions:"
grep -c "qtype: 'sentence_order'" scripts/data/grammar-questions.ts

echo ""
echo "3. Checking N3 grammar points WITHOUT questions:"
awk '/^  \/\/ ---------------- N3 ----------------/,0' scripts/data/grammar.ts | grep -E "^\s+\['" | awk -F"'" '{print $2}' > /tmp/all_n3.txt
awk '/^  \/\/ ---- N3 ----/,0' scripts/data/grammar-questions.ts | grep "term:" | awk -F"'" '{print $2}' | sort -u > /tmp/has_q_n3.txt
comm -23 <(sort /tmp/all_n3.txt) /tmp/has_q_n3.txt | head -20

echo ""
echo "4. Grammar points with 0 or 1 questions:"
echo "N3 points with exactly 1 question:"
awk '/^  \/\/ ---- N3 ----/,0' scripts/data/grammar-questions.ts | grep "term:" | awk -F"'" '{print $2}' | sort | uniq -c | awk '$1==1 {print "  - " $2}' | head -10
