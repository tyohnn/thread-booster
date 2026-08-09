#!/usr/bin/env python3
"""상대 성과 — 같은 계정의 인접 시기 대비 이 글이 얼마나 터졌나.

조회수 절대값으로 훅을 비교하면 **시점 편향**이 섞인다. 계정이 커질수록 나중 글은
훅이 좋아서가 아니라 팔로워가 늘어서 조회수가 높다. 특정 시점의 팔로워 수를 알 수
없으니, 그 대용으로 **글 전후 N일 윈도우 안의 같은 계정 성과 중앙값**을 기준선으로 쓴다.

  rel_views = 이 글 조회수 ÷ (전후 N일 같은 계정 조회수 중앙값)

1.0 이면 평소만큼, 2.0 이면 평소의 두 배 터진 것이다. 계정 규모와 성장 단계가 나눠지므로
계정 간 비교도 가능해진다.

윈도우는 적응형이다. ±N일 안에 이웃이 `--min-neighbors` 미만이면 충분해질 때까지 넓힌다.
발행 빈도가 계정마다 크게 달라서(하루 2건 ~ 월 2건) 고정 윈도우는 한쪽을 망가뜨린다.

같은 방식으로 좋아요·공유도 상대화한다. 공유는 reshare+repost+quote 합이다 —
북마크 수는 Threads 가 공개하지 않아서, '나중에 쓰려고 챙기는 행동' 의 대용으로 쓴다.

사용:
  python3 relperf.py --out /tmp/rel.json
  python3 relperf.py --account beyond.cho --top rel_views -n 15
  python3 relperf.py --window 7 --min-neighbors 8
"""
import argparse
import json
import os
import statistics
from datetime import datetime

DEFAULT_BASE = os.path.expanduser('~/projects/thread-rocket/data_export/normalized')


def med(xs):
    return statistics.median(xs) if xs else None


def build(base, window_days, min_neighbors, max_window):
    chains = json.load(open(os.path.join(base, 'chains.json')))
    rpath = os.path.join(base, 'retention.json')
    ret = {}
    if os.path.exists(rpath):
        ret = {r['chain_id']: r['retention'] for r in json.load(open(rpath))}

    rows = []
    for c in chains:
        if not c.get('date') or not c.get('hook_views'):
            continue
        rows.append({
            'chain_id': c['chain_id'],
            'account': c['account'],
            'date': c['date'],
            'ts': datetime.fromisoformat(c['date'].replace('Z', '')).timestamp(),
            'views': c['hook_views'],
            'likes': c['total_like'],
            'spread': (c.get('total_reshare') or 0),
            'chain_len': c['chain_len'],
            'hook_text': c['hook_text'],
            'retention': ret.get(c['chain_id']),
        })

    by_acct = {}
    for r in rows:
        by_acct.setdefault(r['account'], []).append(r)

    DAY = 86400
    for acct, items in by_acct.items():
        items.sort(key=lambda r: r['ts'])
        for r in items:
            w = window_days
            while True:
                lo, hi = r['ts'] - w * DAY, r['ts'] + w * DAY
                nb = [x for x in items if lo <= x['ts'] <= hi and x['chain_id'] != r['chain_id']]
                if len(nb) >= min_neighbors or w >= max_window:
                    break
                w *= 2
            r['window_used'] = w
            r['n_neighbors'] = len(nb)
            base_v = med([x['views'] for x in nb])
            base_l = med([x['likes'] for x in nb])
            base_s = med([x['spread'] for x in nb])
            r['rel_views'] = round(r['views'] / base_v, 3) if base_v else None
            r['rel_likes'] = round(r['likes'] / base_l, 3) if base_l else None
            r['rel_spread'] = round(r['spread'] / base_s, 3) if base_s else None

            # 비율 지표 — 본 사람 중 몇 %가 반응했나.
            # 북마크 수를 Threads 가 안 주므로 공유를 '챙겨두는 행동'의 대용으로 쓴다.
            r['spread_rate'] = round(r['spread'] / r['views'], 5) if r['views'] else None
            r['like_rate'] = round(r['likes'] / r['views'], 5) if r['views'] else None

            # 비율의 상대값. 확산률 0.2% 가 잘한 건지 못한 건지는 절대값으로 알 수 없다 —
            # 계정마다, 시기마다 기저가 다르기 때문이다. rel_views 와 같은 논리로 상대화한다.
            nb_sr = [x['spread'] / x['views'] for x in nb if x['views']]
            nb_lr = [x['likes'] / x['views'] for x in nb if x['views']]
            base_sr, base_lr = med(nb_sr), med(nb_lr)
            r['rel_spread_rate'] = (round(r['spread_rate'] / base_sr, 3)
                                    if base_sr and r['spread_rate'] is not None else None)
            r['rel_like_rate'] = (round(r['like_rate'] / base_lr, 3)
                                  if base_lr and r['like_rate'] is not None else None)
    return rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--base', default=DEFAULT_BASE)
    p.add_argument('--account')
    p.add_argument('--window', type=int, default=14, help='초기 반경(일). 이웃이 부족하면 자동 확장')
    p.add_argument('--min-neighbors', type=int, default=10)
    p.add_argument('--max-window', type=int, default=120)
    p.add_argument('--top', choices=['rel_views', 'rel_likes', 'rel_spread', 'spread_rate',
                                     'rel_spread_rate', 'rel_like_rate', 'retention'])
    p.add_argument('--corr', action='store_true',
                   help='조회수와 다른 지표의 상관을 본다. 도달이 커지면 비율 지표가 자연히 깎이는지 확인용')
    p.add_argument('-n', type=int, default=10)
    p.add_argument('--out', help='전체를 JSON 으로 저장')
    a = p.parse_args()

    rows = build(a.base, a.window, a.min_neighbors, a.max_window)
    if a.account:
        rows = [r for r in rows if r['account'] == a.account]

    if a.out:
        json.dump(rows, open(a.out, 'w'), ensure_ascii=False, indent=2)
        print(f'{len(rows)}건 → {a.out}')

    print(f"\n계정별 요약 (윈도우 ±{a.window}일 시작, 이웃 {a.min_neighbors}건 이상 확보까지 확장)")
    print(f"{'계정':18}{'n':>5}{'조회 중앙':>11}{'rel_views>2':>12}{'확산률 중앙':>12}")
    print('─' * 60)
    for acct in sorted({r['account'] for r in rows}):
        it = [r for r in rows if r['account'] == acct]
        rv = [r['rel_views'] for r in it if r['rel_views']]
        sr = [r['spread_rate'] for r in it if r['spread_rate'] is not None]
        hits = sum(1 for x in rv if x >= 2.0)
        print(f"{acct:18}{len(it):>5}{med([r['views'] for r in it]):>11,.0f}"
              f"{hits:>8} ({hits/len(rv)*100:.0f}%)" if rv else f"{acct:18}{len(it):>5}"
              , end='')
        print(f"{med(sr)*100:>11.2f}%" if sr else '          —')

    if a.corr:
        # 순위상관(스피어만). 도달이 커질수록 관심 낮은 사람이 섞여 비율 지표가 떨어진다면,
        # 비율을 그냥 비교하는 건 조회수를 간접 비교하는 셈이 된다 — 그걸 확인한다.
        def spearman(xs, ys):
            n = len(xs)
            if n < 10:
                return None
            rank = lambda v: {i: r for r, i in enumerate(sorted(range(n), key=lambda k: v[k]))}
            rx, ry = rank(xs), rank(ys)
            mx = my = (n - 1) / 2
            num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
            den = (sum((rx[i] - mx) ** 2 for i in range(n)) *
                   sum((ry[i] - my) ** 2 for i in range(n))) ** 0.5
            return num / den if den else None

        print('\n=== 조회수 ↔ 다른 지표 순위상관 ===')
        print('음수가 크면: 도달이 커질수록 그 지표가 떨어진다 = 비율 비교 시 조회수 보정 필요\n')
        print(f"{'계정':16}{'n':>5}" + ''.join(f'{k:>17}' for k in
              ['spread_rate', 'like_rate', 'retention', 'rel_spread_rate']))
        print('─' * 84)
        for acct in ['(전체)'] + sorted({r['account'] for r in rows}):
            it = rows if acct == '(전체)' else [r for r in rows if r['account'] == acct]
            line = f'{acct:16}{len(it):>5}'
            for k in ['spread_rate', 'like_rate', 'retention', 'rel_spread_rate']:
                pair = [(r['views'], r[k]) for r in it if r.get(k) is not None]
                c = spearman([p[0] for p in pair], [p[1] for p in pair]) if len(pair) >= 10 else None
                line += f'{c:>+17.3f}' if c is not None else f"{'—':>17}"
            print(line)

    if a.top:
        it = [r for r in rows if r.get(a.top) is not None]
        it.sort(key=lambda r: r[a.top], reverse=True)
        print(f"\n=== {a.top} 상위 {a.n} ===")
        for r in it[:a.n]:
            rt = f"{r['retention']*100:.1f}%" if r['retention'] else '—'
            print(f"\n[{r['chain_id']}] {r['account']} {r['date'][:10]} "
                  f"(윈도우 ±{r['window_used']}일 · 이웃 {r['n_neighbors']}건)")
            print(f"  조회 {r['views']:,} (평소 대비 {r['rel_views']}배) · "
                  f"확산률 {r['spread_rate']*100:.2f}% · 유지율 {rt}")
            print('  | ' + '\n  | '.join(r['hook_text'].split('\n')[:4]))


if __name__ == '__main__':
    main()
