# Threads 수집기 (SSR 방식)

2026-08-08 재작성. 기존 DOM 스크래핑(`shared/extract_chain.js`, `shared/harvest_runner.js`)을 대체한다.

## 핵심 발견

**Threads 는 퍼머링크 HTML 의 `<script type="application/json">` 안에 게시물 데이터를 통째로 실어 보낸다. 로그인이 필요 없다.**

DOM 을 긁을 이유가 없어졌고, DOM 으로는 불가능했던 것들이 가능해졌다.

| | DOM 방식 | SSR 방식 |
|---|---|---|
| 좋아요 | `1800` (화면 표기 = 2 유효숫자 반올림) | `8018` (정수) |
| 반응 지표 | 좋아요·답글·리포스트·공유 | `like` · `direct_reply` · `repost` · `quote` · `reshare` |
| **조회수** | **수집 불가** | `"view_counts":222340` |
| 본문 | span 조인으로 개행 복원 필요 | `caption.text` 원문 |
| 체인 구조 | `2/11` 배지 파싱 (없으면 시간 근접 추론) | `is_reply` + `root_post_author` 로 확정 |
| 언어 의존 | `aria-label="좋아요"` 하드코딩 | 없음 |
| 로그인 | 필요 | **불필요** |
| 45초 CDP 타임아웃 | 있음 (detached 루프로 우회) | 없음 |

로그인이 필요 없다는 게 운영상 가장 크다. 사용자 계정에 rate 이력을 남기지 않으므로
2026-08-01 같은 소프트 차단이 계정에 걸리지 않는다.

### 알아둘 것

- **조회수는 페이지당 하나**이고, 그 퍼머링크 글의 값이다. 체인 2번 글 조회수를 얻으려면
  2번 글 퍼머링크를 따로 열어야 한다.
- **퍼머링크 페이지에는 주제가 비슷한 본인의 다른 독립 글이 관련 글로 같이 실려 온다.**
  5개월 전 글이 붙은 사례를 확인했다. 그래서 체인 경계를 '다음 독립 글이 나오면 끊는다' 로 잡는다.
- **로그아웃 상태에서는 프로필 피드 페이지네이션이 안 된다** (초기 13건만 오고 스크롤해도 XHR 이 없다).
  신규 게시물 발견에는 여전히 로그인 세션이 필요하다. 이미 코드를 아는 글의 재수집에는 불필요하다.
- 목록형 훅은 **훅 본문 안에 1~4번 항목이 들어있고 답글이 5번부터 시작**한다. 누락이 아니다.

## 사용법

```bash
cd shared/crawler
npm install                      # playwright

# 1) 수집 — 퍼머링크 코드 목록 → raw JSONL
node fetch.mjs --codes seeds_all_hooks.txt --out ../../data_export/raw/hooks_2026-08-08.jsonl

# 2) 정규화 — raw → posts / metrics / chains
node normalize.mjs --raw ../../data_export/raw/*.jsonl --out ../../data_export/normalized

# 3) 초반 유지율 — 2번 글 조회수가 있어야 계산된다
node retention.mjs --chains ../../data_export/normalized/chains.json \
                   --views ../../data_export/raw/second_beyond_2026-08-08.jsonl
```

`--codes` 파일은 한 줄에 `handle,code` (또는 `code` 만 쓰고 `--handle` 지정).

옵션: `--limit n` · `--min/--max <초>` (기본 5~9) · `--max-fails n` (기본 3)

### 2번 글 조회수 수집 (유지율용)

체인 구조가 확정된 뒤에야 2번 글 코드를 알 수 있으므로 2패스다.

```bash
# chains.json 에서 member_codes[1] 을 뽑아 시드로 만들고 다시 fetch
node fetch.mjs --codes seeds_p2_beyond.txt --out ../../data_export/raw/second_beyond_2026-08-08.jsonl
```

## 차단 방지 (NOTION_SYNC.md §6)

`fetch.mjs` 에 규칙을 코드로 박아뒀다.

- 요청 사이 5~9초 지터
- 차단·에러 응답 감지 → 연속 3회면 지수 백오프 → 4분 초과 시 **자체 종료**
- append-only. 중단돼도 수집분은 남고, 재실행하면 받은 코드는 건너뛴다
- **한 번에 한 계정.** 두 계정 병렬이 8/1 차단의 결정타였다
- 차단 우회(신원 변경 등)는 하지 않는다

2026-08-08 실적: 866 + 143 = 1,009 요청, 실패 0건.

## 산출물

```
data_export/raw/*.jsonl          수집 원본 (append-only, 재파싱 가능)
data_export/normalized/
  posts.json                     글의 불변 사실 + 체인 소속·순번
  metrics.jsonl                  관측 스냅샷 (code + observed_at + 카운트). 재수집할수록 시계열이 쌓인다
  chains.json                    체인 구조 (root_post_author 기반)
  retention.json                 초반 유지율
```

**metrics 를 posts 에서 분리한 이유:** 같은 글이 7주 만에 좋아요 2.5배가 된 것이 관측됐는데
기존 구조는 덮어쓰기라 그 곡선이 안 쌓였다. 이제 재수집이 곧 시계열이다.

## 기존 chains.json 과의 차이 (2026-08-08)

815 체인 재구축 결과, 기존 데이터의 체인 구성은 대부분 틀렸다.

```
과소 묶음 (기존이 체인을 잘라먹음)  71.5%
일치                              19.6%
과대 묶음 (무관한 글을 합침)         7.0%
길이 같지만 멤버 다름                1.6%
```

기존 DOM 크롤러가 프로필 피드에서 훅과 앞쪽 몇 개만 잡고 나머지를 놓친 결과다.
재구축 후 체인 길이는 중앙값 5개 · 평균 9.5개 · 최대 76개.

`norm_multiple` 과 템플릿↔체인 매핑은 이 위에서 다시 계산해야 한다.
