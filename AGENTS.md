# Thread Booster — 에이전트 작업 규약

Threads 레퍼런스 계정을 수집·분석해 **독자가 어디서 이탈하는지 찾고, 터진 구조를 템플릿으로 재사용**하는 로컬 도구.
이 저장소는 **수집기 · 데이터 · 훅 템플릿 자산**을 담는다. 대시보드(v1.0)는 아직 코드가 없다.

## 먼저 알아야 할 것

- **기획 SSOT는 `.omd/dbs` (로컬 HTML 카탈로그)다.**
  — PRD · User Story · Features · Release · ADR · policy · IA · Pages · Layouts · Page States · 아카이브.
  제품 관련 결정을 코드에서 추측하지 말고 **여기서 읽어라.**
  Notion 핸드북([제품 기획 · 기능 명세](https://app.notion.com/p/3b6346dac4568080a6b1c8b24aa7b65e))은 **이관 원본·보관용**이며 더 이상 쓰기 대상이 아니다.
- **공개 GitHub 저장소다** — `tyohnn/thread-booster` (PUBLIC). 커밋하는 것은 전부 외부에 공개된다.
  **수집 원문(`data_export/`)은 제3자 게시물이라 `.gitignore` 로 제외돼 있다** (POL-002). 절대 강제 추가하지 마라.
  새 산출물을 커밋할 때도 남의 글 전문이 섞였는지 먼저 확인한다. 분석용 짧은 인용은 허용된다.
- 데이터·백업은 git 밖에 있다. `data_export/` 를 지우면 재수집 외에는 복구 수단이 없다.
- 로컬 단독 사용 도구다. 로그인·배포·멀티테넌시는 범위 밖이다 (ADR-003).

## 아키텍처 (모노레포 · 포트/어댑터)

이 저장소는 **모노레포**로 키운다. 앱·패키지·공유 코드를 한 워크스페이스에서 관리한다.

구현은 **헥사고날(포트와 어댑터)** 을 선호한다.

- **도메인/유스케이스(코어)** — 수집·정규화·적재·지표 규칙의 “무엇을 하는지”. 파일·HTTP·DuckDB·CLI에 직접 의존하지 않는다.
- **포트** — 코어가 필요로 하는 인터페이스(저장소, 수집기, 시계, 로거 등).
- **어댑터** — 포트의 실제 구현. 예: Threads SSR 수집, JSONL/파일 시스템, DuckDB 스토어, `pnpm` CLI 엔트리.
- 의존 방향은 **바깥 → 안쪽만**. 어댑터가 코어를 알고, 코어는 어댑터를 모른다.
- 새 기능은 “코어에 유스케이스를 두고, 필요한 포트만 만든 뒤, 어댑터를 붙인다” 순으로 간다.
- 기존 `shared/crawler` 스크립트는 검증된 동작이다. REL-001에서 한 줄로 묶을 때도 **어댑터로 감싸 코어에 주입**하는 쪽을 우선하고, 스크립트에 도메인 규칙을 더 쌓지 않는다.

## 테스트 (TDD · Vitest)

**기본은 TDD다.** 도메인·유스케이스 규칙을 바꿀 때는 실패하는 테스트를 먼저 쓰고, 구현·어댑터는 그다음이다.

- 러너: **Vitest** (`pnpm test` / 패키지에서 `pnpm test:watch`)
- **도메인·유스케이스** — 순수 함수, 외부 I/O 없이 단위 테스트 필수
- **어댑터** — 임시 디렉터리·픽스처로 스모크 (실 Threads 네트워크·실 raw 전문은 CI에 넣지 않는다)
- 새 패키지/기능 PR은 관련 테스트 없이 머지하지 않는다
- 수치·POL-003(상대 성과 ±2주 중앙값)·exit criteria 같은 규칙은 테스트에 고정해 문서와 어긋나지 않게 한다

## 구조

```
.omd/dbs/               ★ 기획 SSOT (로컬 HTML 카탈로그)
packages/pipeline/      ★ REL-001 오케스트레이션 (헥사고날: domain · ports · adapters · cli)
shared/crawler/         ★ 현행 수집기 어댑터 (SSR JSON 파싱) — 코어가 직접 의존하지 않음
  ssr.mjs               파서 (의존성 없음)
  fetch.mjs             퍼머링크 수집 · 로그인 불필요
  discover.mjs          신규 글 발견 · 로그인 불필요 · 커버리지 ~2일
  harvest.mjs           프로필 피드 전체 수확 · 로그인 필요 (login.mjs 선행)
  normalize.mjs         raw → posts · chains · metrics · retention
  retention.mjs         초반 유지율 (레거시 CLI; 파이프라인은 domain/retention 사용)
  accounts.json         계정 레지스트리 (F-001)
shared/load_*.py        Notion 대량 적재 (한글 안전 경로 — 아래 함정 참조)
data_export/raw/        수집 원본 JSONL · append-only
data_export/normalized/ posts · chains · metrics(시계열) · retention
data_export/store/      DuckDB 파생물 (ADR-002)
templates/              훅 템플릿 카드 8종 + 안티패턴 + 체크리스트
.claude/skills/thread-hook-analysis/   훅 분해·태깅 스킬 + 분석 스크립트
```

## 자주 쓰는 명령

```bash
# 테스트 (TDD — Vitest)
pnpm test

# REL-001 파이프라인 — 기본은 기존 raw 정규화·DuckDB 적재 (네트워크 수집 없음)
pnpm data:refresh
pnpm data:verify
pnpm accounts list
pnpm accounts add some_handle --label "별칭"
# 시드가 있을 때만 계정 순차 fetch 포함
pnpm data:refresh -- --fetch

# 훅 성과 조회 — 조회수 절대값 대신 rel_views(인접 시기 대비 배수)를 기본으로 써라
python3 .claude/skills/thread-hook-analysis/scripts/relperf.py --account beyond.cho --top rel_views -n 15
python3 .claude/skills/thread-hook-analysis/scripts/hooks.py --top retention --min-views 20000 -n 15
python3 .claude/skills/thread-hook-analysis/scripts/hooks.py --sample 30 --min-views 5000

# 수집 (한 번에 한 계정씩만) — 레거시 직접 호출
cd shared/crawler
node fetch.mjs --codes seeds_<account>.txt --out ../../data_export/raw/hooks_<account>_<date>.jsonl
node normalize.mjs --raw ../../data_export/raw/*.jsonl --out ../../data_export/normalized
```

## 반드시 지킬 규칙

**수집** (Notion POL-001)
- **한 번에 한 계정만.** 2026-08-01 두 계정 병렬이 소프트 차단을 불렀다.
- 배치마다 3~8초 + 지터. 에러 응답 감지 시 지수 백오프 후 자체 종료.
- **차단 우회를 하지 않는다.** 신원 변경·프록시 금지. 차단되면 멈춘다.
- 수집은 SSR JSON 파싱으로만 한다. DOM 스크래핑은 2026-08-08 폐기 (ADR-004).

**저작권** (POL-002)
- 수집 원문은 **분석 목적으로만** 보관한다.
- 템플릿에 저장하는 것은 **구조와 심리 기법**이지 문장이 아니다. 원문을 템플릿 본문에 복사하지 않는다.
- 예시가 필요하면 퍼머링크를 건다.

**지표** (POL-003)
- 평균이 아니라 **중앙값**을 기본으로 쓴다. 조회수 분포가 극단적으로 치우쳐 있다.
- **좋고 나쁨**은 절대값이 아니라, 같은 계정·게시 ±2주(총 4주) 이웃 지표 **중앙값** 대비 배수(rel)로 판정한다. 창 이웃 n이 너무 적으면 판정하지 않는다.
- 모든 수치에 **표본 수(n)** 를 붙인다.
- **결측을 보간하지 않는다.** 조회수 없는 글은 0이 아니라 빈칸이다. 단일 글 체인은 유지율 대상이 아니다.
- 전부 **상관이며 인과가 아니다.** 표본은 계정 3개뿐이다. 해석 문구에 이를 명시한다.
- 시간대: 수집 원본은 UTC, 표기는 KST(+9).

## 함정 — 실제로 당한 것들

**1. 한국어가 MCP 툴콜에서 깨진다.**
Notion MCP로 한글을 쓰면 낮은 확률로 글자가 바뀐다 (`걸러낸다`→`걱러낸다`, `읽는다`→`잎는다`, `수동`→`수사`).
모델이 텍스트를 재생성하는 것이 원인이라 배치 크기나 이스케이프 방식을 바꿔도 안 없어진다.
- 소량이면 **쓴 뒤 fetch해서 눈으로 확인하고** `update_content`로 고쳐라.
- 대량이면 모델을 데이터 경로에서 빼라 — 스크립트가 `ntn api`에 stdin으로 넘긴다 (`shared/load_posts_to_notion.py`).
- `ntn`(Notion 공식 CLI)은 이미 설치·인증돼 있다. `ntn doctor`로 확인.

**2. Notion relation의 "제한 1"은 MCP로 못 푼다.**
`ALTER COLUMN`도 `DROP`+`ADD`도 무시된다 (`propertyUrl`이 그대로 남는다).
사용자가 Notion UI에서 속성 편집 → 제한 해제해야 한다. 그 전에는 여러 건을 붙여도 **마지막 하나만 남는다.**

**3. Notion에 HTML을 넣으려면 코드 블록이 아니라 embed다.**
`create-attachment`로 `.html`을 올려 `file-upload://` 소스를 받고, 본문에 `<embed src="file-upload://...">`를 쓴다.
"HTML block", "HTML artifact", "HTML embed"는 전부 이것을 뜻한다.

**4. 데이터 수치를 문서에서 베끼지 마라.**
계정이 추가되면 전부 바뀐다. 실제로 하루 만에 체인 1,016 → 1,722, 중앙 유지율 14.7% → 12.6%로 변했다.
수치가 필요하면 `normalized/`를 직접 읽어 계산하라.

**5. `rm -rf` + 와일드카드는 권한 분류기에 막힌다.**
파일을 명시적으로 나열해 `rm`하고, 디렉토리는 `rm -r`로 따로 지운다. 그 전에 백업 tar부터.

## 기획 문서 작성 규약 (`.omd/dbs`)

**Page States — 상태 하나당 한 HTML 파일이다** (`.omd/dbs/screen-states/STA-*.html`).
- 화면마다 **기본 상태** 파일을 두고, 변주(로딩 · 빈 상태 · 부분 데이터 · 오류 · 권한 없음 · 스코프 밖)를
  **각각 별도 파일**로 만든다. 한 파일에 여러 변주를 묶지 않는다.
- 각 파일은 `트리거`(이 상태로 들어가는 조건)와 `빠져나가는 법`(정상으로 복귀하는 경로)을 반드시 채운다.
- 상태명은 `화면 · 상태` 형식으로 쓴다. 예: `체인 목록 · 필터 결과 0건`

**Layouts · Page States — 와이어프레임을 문서 상단에 둔다.**
- 와이어프레임 `<section class="omd-wireframe">` 는 헤더 바로 아래(본문 서술보다 위)에 둔다.
- **껍데기(chrome)** 레이아웃은 셸 뷰만 둔다. 본문 단독 섹션은 넣지 않는다.
- **본문 골격** 레이아웃과 **Page States** 는 **① 앱 셸에 끼운 뷰**와 **② 본문 골격 단독 뷰**를 둘 다 둔다.
- 셸에 끼운 뷰에는 사이드바 활성 항목과 브레드크럼을 해당 화면 기준으로 맞춘다.

**공통**
- 화면·상태 목업은 Notion embed가 아니라 같은 HTML 안의 `omd-wireframe` 섹션이다.
- 목업 속 수치는 `data_export/normalized/` 실측(중앙값·n)을 쓴다. 가짜 숫자를 넣으면 설계 판단이 왜곡된다.
- 접은 항목은 삭제하지 말고 **`archive/`** 로 옮기고 원래 ID · 폐기 사유 · 대체 항목을 채운다.

## 현재 상태 (2026-08-09)

- 수집 완료 계정 3개 (`beyond.cho` · `badakstock` · `ho_ho_ju_ju`), `gten_btc_`는 raw만 있고 **정규화 안 됨**
- 관측 시점이 **08-08 하나뿐**이다. 성장 추이를 보려면 백업 tar의 2026-06-12 CSV를 `metrics.jsonl`로 흡수시켜야 한다
- **완주율 미수집** — 1·2번 글 조회수만 있다. 마지막 글 수집(약 640요청, 1.5h)이 이탈 퍼널 3단계의 전제다
- 템플릿↔체인 매핑 284건은 구 chain_id 기준이라 **전부 무효**. 재매핑 필요
- 백업: `~/projects/thread-rocket_cleanup-backup_2026-08-09.tar.gz` (구 accounts·content_plans·raw_content·archive),
  `~/projects/thread-rocket_cleanup-backup_2026-08-09_round2.tar.gz` (구 data_export 산출물·DOM 수확기)

## 다음 작업

우선순위는 `.omd/dbs/release` 가 정본이다. 요약하면:
1. **v0.1 데이터 파이프라인** — 수집·정규화·적재를 명령 한 줄로. 화면 없음
2. **v1.0** — 레퍼런스 탐색 → **템플릿 매니저** → 이탈 그래프 순 (템플릿이 이탈 분석보다 우선)
3. 미결정: 스토어 엔진(DuckDB vs SQLite, ADR-002) · 훅 유형 분류 방식 · 구 Notion 5-DB 처리

<!-- oh-my-docs:start -->
# Oh My Docs

This repository uses a docs-first workflow. Canonical product intent lives in
**one** handbook SSOT — either local HTML catalogs (`.omd/dbs/<catalog>/*.html`)
or Notion — never more than one as authoritative.

## Content source (SSOT)

1. Read `.omd/project.json` and use `contentSource.ssot`
   (`local` | `notion`).
2. Missing `contentSource` means `local`.
3. If `.omd/project.json` is missing, run `inspect` / ask the user to choose
   SSOT and `adopt` before inventing handbook files.
4. For `local`, edit HTML files under `.omd/dbs` (see
   `references/html-document-contract.md`). For `notion`, edit the single
   Home page: only `# 도메인` / `# 기획` / `# 개발` section headers, with
   catalog DBs stacked inline under them (no per-catalog headings, no child
   pages, no sidebar) via the host Notion MCP. Do not treat an unselected
   provider as truth.

## Documentation is always first

Any decision, agreement, requirement, design choice, open question, or new
discussion that should outlive this chat must be written into the selected SSOT
— not left only in conversation.

1. Before and during the talk, check whether the topic already exists in the SSOT.
2. Create or update the matching handbook artifacts as the discussion progresses.
3. Catalog entries (PRD, story, plan, ADR, …) go in the **catalog store** — a
   Notion inline database row on Home, or a local `.omd/dbs/<catalog>/*.html`
   file — never as ad-hoc child pages. **Planning ≠ Plans**:
   implementation plans belong in Plans (`dbs.plans` / `.omd/dbs/plans`).
4. Prefer `node <skill>/scripts/omd.mjs new <kind> --title "…" --yes` (local)
   or the Notion catalog workflow (notion) over ad-hoc files or chat-only notes.
5. Run `node <skill>/scripts/omd.mjs check` after meaningful documentation edits.
<!-- oh-my-docs:end -->
