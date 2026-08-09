#!/bin/bash
# badakstock 마무리 — 남은 훅 + 2번 글까지 순차로. 한 계정만 다루므로 병렬 부담이 없다.
set -e
cd "$(dirname "$0")"
D=2026-08-08

echo "── 1) 남은 훅 ──"
node fetch.mjs --codes seeds_backfill_badakstock.txt \
  --out ../../data_export/raw/hooks_badakstock_$D.jsonl --min 5 --max 9

echo "── 2) 정규화 ──"
node normalize.mjs --raw ../../data_export/raw/hooks_beyond_$D.jsonl \
  ../../data_export/raw/hooks_hohojuju_$D.jsonl \
  ../../data_export/raw/hooks_badakstock_$D.jsonl \
  ../../data_export/raw/new_$D.jsonl --out ../../data_export/normalized

echo "── 3) 2번 글 시드 ──"
python3 - <<'PY'
import json
chains = json.load(open('../../data_export/normalized/chains.json'))
rows = [c for c in chains if c['account'] == 'badakstock' and c['chain_len'] >= 2]
with open('seeds_p2_badakstock.txt', 'w') as f:
    for c in rows:
        f.write('badakstock,%s\n' % c['member_codes'][1])
print('2번 글 시드:', len(rows))
PY

echo "── 4) 2번 글 수집 ──"
node fetch.mjs --codes seeds_p2_badakstock.txt \
  --out ../../data_export/raw/second_badakstock_$D.jsonl --min 5 --max 9

echo "── 5) 유지율 ──"
cat ../../data_export/raw/second_*.jsonl > /tmp/second_all.jsonl
node retention.mjs --chains ../../data_export/normalized/chains.json \
  --views /tmp/second_all.jsonl --out ../../data_export/normalized/retention.json | head -8
echo "── 완료 ──"
