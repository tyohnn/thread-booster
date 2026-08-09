#!/bin/bash
# 계정 하나를 처음부터 끝까지 — 피드 하베스트 → 퍼머링크 → 2번 글 → 정규화 → 유지율.
#
# 한 번에 한 계정만 돌린다. 두 계정 병렬이 2026-08-01 소프트 차단의 원인이었다.
# 1단계만 로그인 세션을 쓰고(login.mjs 선행 필요), 나머지는 로그아웃이라 계정 부담이 없다.
#
# 사용: ./run_account.sh gten_btc [max_batches]
set -e
cd "$(dirname "$0")"

H="$1"
BATCHES="${2:-40}"
D=$(date +%F)

if [ -z "$H" ]; then
  echo "사용: ./run_account.sh <handle> [max_batches]"
  exit 1
fi
if [ ! -d ./.profile ]; then
  echo "로그인 프로필이 없다. 먼저 'node login.mjs' 를 실행할 것."
  exit 1
fi

# printf 를 쓴다 — echo 는 개행을 붙이고 tr -c 가 그 개행까지 '_' 로 바꿔서
# 파일명 끝에 밑줄이 하나 더 생긴다. 그러면 backfill.mjs 가 만든 시드 이름과 어긋나
# 스크립트가 "새로 받을 훅이 없다" 며 조용히 종료해버린다.
SAFE=$(printf '%s' "$H" | tr -c 'a-zA-Z0-9_' '_')

echo "══ [$H] 1/5 피드 하베스트 (로그인) ══"
node harvest.mjs --handle "$H" --profile ./.profile \
  --out "../../data_export/raw/feed_${SAFE}_${D}.jsonl" --max-batches "$BATCHES"

echo "══ [$H] 2/5 훅 시드 ══"
node backfill.mjs --handle "$H"

SEED="seeds_backfill_${SAFE}.txt"
if [ ! -s "$SEED" ]; then
  echo "새로 받을 훅이 없다. 종료."
  exit 0
fi

echo "══ [$H] 3/5 퍼머링크 수집 (로그아웃) ══"
node fetch.mjs --codes "$SEED" --out "../../data_export/raw/hooks_${SAFE}_${D}.jsonl" --min 5 --max 9

echo "══ [$H] 4/5 정규화 ══"
node normalize.mjs --raw ../../data_export/raw/hooks_*.jsonl ../../data_export/raw/new_*.jsonl \
  --out ../../data_export/normalized

echo "══ [$H] 5/5 2번 글 → 유지율 ══"
python3 - "$H" <<'PY'
import json, sys, re
h = sys.argv[1]
safe = re.sub(r'[^a-zA-Z0-9_]', '_', h)
chains = json.load(open('../../data_export/normalized/chains.json'))
rows = [c for c in chains if c['account'] == h and c['chain_len'] >= 2]
with open(f'seeds_p2_{safe}.txt', 'w') as f:
    for c in rows:
        f.write(f"{h},{c['member_codes'][1]}\n")
print(f'2번 글 시드: {len(rows)}')
PY

node fetch.mjs --codes "seeds_p2_${SAFE}.txt" \
  --out "../../data_export/raw/second_${SAFE}_${D}.jsonl" --min 5 --max 9

cat ../../data_export/raw/second_*.jsonl > /tmp/second_all.jsonl
node retention.mjs --chains ../../data_export/normalized/chains.json \
  --views /tmp/second_all.jsonl --out ../../data_export/normalized/retention.json | head -8

echo "══ [$H] 완료 ══"
node status.mjs | head -14
