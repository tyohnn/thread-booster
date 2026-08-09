#!/bin/bash
# gten_btc 3단계부터 이어서. 하베스트(640건)와 시드(545건)는 이미 확보돼 있다.
set -e
cd "$(dirname "$0")"
D=2026-08-09

echo "══ 3/5 퍼머링크 수집 ══"
node fetch.mjs --codes seeds_backfill_gten_btc.txt \
  --out ../../data_export/raw/hooks_gten_btc_$D.jsonl --min 5 --max 9

echo "══ 4/5 정규화 ══"
node normalize.mjs --raw ../../data_export/raw/hooks_*.jsonl ../../data_export/raw/new_*.jsonl \
  --out ../../data_export/normalized

echo "══ 5/5 2번 글 → 유지율 ══"
python3 - <<'PY'
import json
chains = json.load(open('../../data_export/normalized/chains.json'))
rows = [c for c in chains if c['account'] == 'gten_btc' and c['chain_len'] >= 2]
with open('seeds_p2_gten_btc.txt', 'w') as f:
    for c in rows:
        f.write(f"gten_btc,{c['member_codes'][1]}\n")
print('2번 글 시드:', len(rows))
PY

node fetch.mjs --codes seeds_p2_gten_btc.txt \
  --out ../../data_export/raw/second_gten_btc_$D.jsonl --min 5 --max 9

cat ../../data_export/raw/second_*.jsonl > /tmp/second_all.jsonl
node retention.mjs --chains ../../data_export/normalized/chains.json \
  --views /tmp/second_all.jsonl --out ../../data_export/normalized/retention.json | head -6

echo "══ 완료 ══"
node status.mjs | head -14
