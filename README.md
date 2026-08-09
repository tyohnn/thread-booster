# 🚀 Thread Booster (thread-rocket)

Threads 계정들을 수집·분석해 **독자가 어디서 이탈하는지 찾고, 터진 구조를 템플릿으로 재사용**하는 프로젝트.

- **기획 SSOT는 `.omd/dbs`** — 로컬 HTML 카탈로그 (PRD · User Story · Features · Release · ADR · policy · IA · Pages · Layouts · Page States)
- Notion [제품 기획 · 기능 명세](https://app.notion.com/p/3b6346dac4568080a6b1c8b24aa7b65e)는 이관 원본·보관용
- 이 저장소는 **수집기와 데이터**, 그리고 **훅 템플릿 자산**을 담는다
- 대시보드(v1.0)는 아직 없다. 로컬 단독 실행으로 만들 예정 (ADR-003)

## 폴더 구조

```
thread-rocket/
├── README.md
├── NOTION_SYNC.md             ← 수집 데이터 Notion DB 연동 (제품 IA와 별개)
├── .omd/dbs/                  ← ★ 기획 SSOT (로컬 HTML 카탈로그)
├── shared/
│   ├── crawler/               ← ★ 현행 수집기 (SSR JSON 방식)
│   │   ├── README.md          ← 방법론·제약·사용법
│   │   ├── ssr.mjs            ← 파서 (의존성 없음)
│   │   ├── fetch.mjs          ← 퍼머링크 수집 (로그인 불필요)
│   │   ├── discover.mjs       ← 신규 글 발견 (로그인 불필요, ~2일 커버)
│   │   ├── login.mjs          ← 로그인 세션 준비
│   │   ├── harvest.mjs        ← 프로필 피드 전체 수확 (로그인 필요)
│   │   ├── normalize.mjs      ← raw → posts/metrics/chains
│   │   └── retention.mjs      ← 초반 유지율
│   └── *.py                   ← 구 Notion 적재 스크립트 (ADR-001 이후 미사용)
├── data_export/
│   ├── raw/                   ← 수집 원본 JSONL (append-only)
│   └── normalized/            ← posts · chains · metrics(시계열) · retention
├── templates/                 ← ★ 훅 템플릿 카드 세트 (유형별 8종 + 체크리스트)
└── .claude/skills/
    └── thread-hook-analysis/  ← 훅 분해·태깅 스킬 + 분석 스크립트
```

## 수집 워크플로우

전부 [shared/crawler](shared/crawler/README.md) 로 한다. **한 번에 한 계정씩만** 돌린다
(두 계정 병렬이 2026-08-01 소프트 차단의 원인이었다).

```bash
cd shared/crawler

# 1) 피드 하베스트 — 계정의 훅 코드를 전부 발견한다. 로그인 필요 (node login.mjs 선행)
node harvest.mjs --handle <account> --profile ./.profile \
                 --out ../../data_export/raw/feed_<account>_<date>.jsonl --max-batches 40

# 2) 퍼머링크 수집 — 체인 전체 + 조회수. 로그인 불필요
node fetch.mjs --codes seeds_<account>.txt --out ../../data_export/raw/hooks_<account>_<date>.jsonl

# 3) 2번 글 수집 — 초반 유지율용. chains.json 의 member_codes[1] 로 시드를 만든다
node fetch.mjs --codes seeds_p2_<account>.txt --out ../../data_export/raw/second_<account>_<date>.jsonl

# 4) 정규화 + 유지율
node normalize.mjs --raw ../../data_export/raw/*.jsonl --out ../../data_export/normalized
node retention.mjs --chains ../../data_export/normalized/chains.json --views <second raw>
```

**신규 글 추적**은 `discover.mjs` 로 한다 (로그인 불필요, 커버리지 약 2일이라 매일 돌려야 함).

## 훅 분석

```bash
cd .claude/skills/thread-hook-analysis

# 상대 성과 — 같은 계정 인접 시기 대비 몇 배나 터졌나
python3 scripts/relperf.py --account beyond.cho --top rel_views -n 15

# 원본 조회 — 훅 본문을 눈으로 볼 때
python3 scripts/hooks.py --top retention --min-views 20000 -n 15
python3 scripts/hooks.py --sample 30 --min-views 5000
```

태깅 체계와 슬롯 문법은 스킬의 `references/`, 완성된 템플릿 카드는 [templates/](templates/README.md).

## 데이터 현황 (2026-08-09)

| 계정 | 체인 | 중앙 훅 조회 | 중앙 유지율 |
|---|---|---|---|
| `badakstock` | 706 | 5,550 | 11.0% |
| `beyond.cho` | 683 | 22,208 | 14.7% |
| `ho_ho_ju_ju` | 333 | 7,703 | 14.8% |
| `gten_btc_` | 원본만 수집됨 (2026-08-09) | — | — |
| `dolphin_invest_` | 수집 예정 | — | — |

체인 **1,722** · 글 **30,523**(본인 글 8,023) · 관측 **33,701행** · 유지율 측정 **1,168체인**(전체 중앙 12.6%).

`gten_btc_` 는 `data_export/raw/` 에 feed·hooks 가 들어와 있으나 **정규화를 아직 안 돌렸다.**
2번 글 수집(`second_*`)도 없어서 유지율이 나오지 않는다.

## 데이터 메모

- 수집: **SSR JSON 파싱** (`shared/crawler`). DOM 스크래핑은 2026-08-08 폐기 (ADR-004).
- 지표 정밀도: **전부 정수.** 화면 표기는 2 유효숫자 반올림이지만 페이로드는 원값이다.
- **조회수 수집 가능.** 퍼머링크당 1개(그 글의 값)이며 반올림되지 않는다.
- 초반 유지율 = 2번 글 조회수 ÷ 훅 조회수. **완주율(마지막 글 ÷ 1번 글)은 아직 미수집** —
  체인당 1회 추가 로드가 필요하다 (약 640요청).
- 통계는 상관관계이며 인과가 아님. 표본은 계정 3개뿐이다.

## 정리 이력

**2026-08-09** — `accounts/` · `content_plans/` · `raw_content/` · `archive/` 와 `analyze.py`(구 CSV 전용)를 제거했다.
전량은 `~/projects/thread-rocket_cleanup-backup_2026-08-09.tar.gz` 에 있다.
`content_plans/templates/` 는 루트 `templates/` 로 승격했다.

⚠️ 2026-06-12 CSV 스냅샷이 그 백업 안에만 있다. `metrics.jsonl` 의 관측 시점은 08-08 하나뿐이라
**현재 스토어만으로는 성장 추이를 계산할 수 없다.** 필요해지면 백업에서 꺼내 흡수시킬 것.
