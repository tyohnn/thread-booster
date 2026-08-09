/**
 * Threads SSR 페이로드 파서.
 *
 * 왜 DOM 이 아니라 이것인가 (2026-08-08 검증):
 *  Threads 는 퍼머링크 HTML 의 <script type="application/json"> 안에 게시물 데이터를
 *  통째로 실어 보낸다. 로그인도 필요 없다. DOM 스크래핑 대비 이점:
 *   - 카운트가 정수다. 화면 표기는 2 유효숫자 반올림이지만(8018 → "8천")
 *     페이로드는 8018 그대로다.
 *   - repost / quote / reshare 가 분리돼 있다. DOM 에는 이 구분이 없었다.
 *   - 조회수(`view_counts`)가 들어있다. DOM 으로는 수집 자체가 불가능했다.
 *   - 본문이 caption.text 원문이라 개행 복원·배지 제거 같은 정제가 통째로 사라진다.
 *   - aria-label 한국어 하드코딩 의존이 없어진다.
 *
 * 체인 판정: `text_post_app_info.root_post_author.username` 이 체인 루트를 알려준다.
 * 훅 퍼머링크를 한 번 열면 그 체인의 본인 글이 전부 같이 실려 온다 — 순번 배지 추론이 불필요하다.
 */

/** HTML 안의 JSON script 블록을 전부 파싱해 게시물 노드를 수집한다. */
export function parsePosts(html) {
  const blocks = [...html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)];
  const found = new Map();

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    // 게시물 노드는 code + (like_count | text_post_app_info) 조합으로 식별된다
    if (node.code && (node.like_count != null || node.text_post_app_info)) found.set(node.code, node);
    for (const v of Object.values(node)) walk(v);
  };

  for (const [, raw] of blocks) {
    try {
      // \uXXXX 이스케이프를 먼저 푼다 — 한글이 전부 이스케이프돼 들어온다
      walk(JSON.parse(raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))));
    } catch {
      /* JSON 이 아니거나 잘린 블록은 건너뛴다 */
    }
  }
  return [...found.values()].map(normalize);
}

/**
 * 조회수. 페이지당 하나만 있으며 **그 퍼머링크 글의 값**이다.
 * feature flag 번들 안에 섞여 있어서(`enable_view_counts` 옆) 정규식으로 집는다.
 * 체인 2번 글 조회수를 얻으려면 2번 글 퍼머링크를 따로 열어야 한다.
 */
export function parseViewCounts(html) {
  const m = html.match(/"view_counts":(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 차단·에러 문서 감지. 2026-08-01 사고는 이 감지가 없어서 벽에 대고 계속 긁은 것이다. */
export function isBlocked(status, html) {
  if (status !== 200) return true;
  if (/페이지를 찾을 수 없습니다/.test(html)) return true;
  if (/<title>[^<]*Instagram<\/title>/.test(html) && !/threads/i.test(html.slice(0, 4000))) return true;
  return false;
}

function normalize(p) {
  const t = p.text_post_app_info || {};
  return {
    code: p.code,
    pk: p.pk ?? null,
    author: p.user?.username ?? null,
    author_pk: p.user?.pk ?? null,
    taken_at: p.taken_at ?? null,
    text: p.caption?.text ?? '',
    like: p.like_count ?? null,
    reply: t.direct_reply_count ?? null,
    repost: t.repost_count ?? null,
    quote: t.quote_count ?? null,
    reshare: t.reshare_count ?? null,
    is_reply: !!t.is_reply,
    root_author: t.root_post_author?.username ?? null,
    self_thread_count: t.self_thread_count ?? null,
    counts_disabled: p.like_and_view_counts_disabled ?? null,
    media_type: p.media_type ?? null,
    has_image: !!(p.image_versions2?.candidates?.length || p.carousel_media?.length),
    has_video: !!p.video_versions?.length,
  };
}
