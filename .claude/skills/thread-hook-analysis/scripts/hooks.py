#!/usr/bin/env python3
"""훅 + 성과 지표를 뽑아온다.

chains.json 과 retention.json 을 매번 손으로 조인하면 실수하기 쉽고 느리다.
특히 성과 비교는 **조회수 하한을 걸어야** 의미가 있다 — 조회 300짜리 훅의
유지율 50%와 조회 20만짜리의 30%는 같은 값이 아니다.

사용:
  python3 hooks.py --top retention --min-views 20000 -n 15
  python3 hooks.py --bottom retention --min-views 20000 -n 15
  python3 hooks.py --account badakstock --top views -n 10
  python3 hooks.py --code DZxC_l2D2yE          # 특정 체인 하나
  python3 hooks.py --sample 30 --min-views 5000 --json out.json
"""
import argparse
import json
import os
import random

DEFAULT_BASE = os.path.expanduser('~/projects/thread-rocket/data_export/normalized')


def load(base):
    chains = json.load(open(os.path.join(base, 'chains.json')))
    rpath = os.path.join(base, 'retention.json')
    ret = {}
    if os.path.exists(rpath):
        ret = {r['chain_id']: r['retention'] for r in json.load(open(rpath))}
    for c in chains:
        c['retention'] = ret.get(c['chain_id'])
    return chains


def fmt(c, full_hook=False):
    rt = f"{c['retention']*100:.1f}%" if c['retention'] is not None else '—'
    eng = f"{c['engagement']*100:.2f}%" if c.get('engagement') else '—'
    head = (f"[{c['chain_id']}] {c['account']} · {c['date'][:10] if c['date'] else '—'}\n"
            f"  조회 {c['hook_views']:,} · 유지율 {rt} · 참여율 {eng} · "
            f"좋아요 {c['total_like']:,} · 체인 {c['chain_len']}글")
    text = c['hook_text'] if full_hook else '\n'.join(c['hook_text'].split('\n')[:8])
    body = '\n'.join('  | ' + l for l in text.split('\n'))
    return head + '\n' + body


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--base', default=DEFAULT_BASE)
    p.add_argument('--account')
    p.add_argument('--code', help='특정 chain_id 하나만')
    p.add_argument('--top', choices=['retention', 'views', 'likes', 'engagement'])
    p.add_argument('--bottom', choices=['retention', 'views', 'likes', 'engagement'])
    p.add_argument('--sample', type=int, help='무작위 N개 (편향 없는 표본이 필요할 때)')
    p.add_argument('--min-views', type=int, default=0)
    p.add_argument('--min-chain-len', type=int, default=0)
    p.add_argument('-n', type=int, default=10)
    p.add_argument('--json', help='결과를 JSON 으로도 저장')
    p.add_argument('--seed', type=int, default=42)
    a = p.parse_args()

    chains = load(a.base)

    if a.code:
        rows = [c for c in chains if c['chain_id'] == a.code]
        if not rows:
            print(f'체인을 찾을 수 없다: {a.code}')
            return
        print(fmt(rows[0], full_hook=True))
        return

    rows = [c for c in chains
            if (not a.account or c['account'] == a.account)
            and (c['hook_views'] or 0) >= a.min_views
            and c['chain_len'] >= a.min_chain_len]

    key = a.top or a.bottom
    if key:
        field = {'retention': 'retention', 'views': 'hook_views',
                 'likes': 'total_like', 'engagement': 'engagement'}[key]
        rows = [c for c in rows if c.get(field) is not None]
        rows.sort(key=lambda c: c[field], reverse=bool(a.top))
    elif a.sample:
        random.seed(a.seed)
        rows = random.sample(rows, min(a.sample, len(rows)))
        a.n = a.sample

    out = rows[:a.n]
    label = f"{'상위' if a.top else '하위' if a.bottom else '표본'}"
    print(f"# {label} {len(out)}건"
          + (f" · 계정 {a.account}" if a.account else '')
          + (f" · 조회 {a.min_views:,} 이상" if a.min_views else '') + '\n')
    for c in out:
        print(fmt(c))
        print()

    if a.json:
        json.dump(out, open(a.json, 'w'), ensure_ascii=False, indent=2)
        print(f'→ {a.json} ({len(out)}건)')


if __name__ == '__main__':
    main()
