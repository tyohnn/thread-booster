# Thread Booster — Claude Code

프로젝트 규약은 한 벌만 유지한다. 아래를 그대로 따른다.

@AGENTS.md

---

## Claude Code에서만 해당하는 것

**스킬**
- 훅·템플릿·심리기법·바이럴·"왜 터졌나" 류의 요청은 `thread-hook-analysis` 스킬을 먼저 검토한다.
  수집 데이터를 다루는 작업이면 사용자가 훅을 명시하지 않아도 해당된다.
- 대시보드 구현에 들어가면 프로젝트에 설치된 팩(Next.js · shadcn · Tailwind · webapp-testing 등)을 쓴다.
  `supabase`·`stripe-best-practices`는 이 제품 범위 밖이다 (로컬 단독, 결제 없음).

**Notion MCP**
- 기획 문서를 고칠 때는 `update_content`로 최소 편집한다. `replace_content`로 페이지를 통째 갈아엎지 않는다.
- 한글을 쓴 뒤에는 **fetch해서 본문을 확인한다.** (AGENTS.md 함정 1)
- 페이지를 지울 수단이 없다. 접은 항목은 삭제 대신 **`폐기 보관함` DB로 `move-pages`** 하고
  원래 ID·폐기 사유·대체 항목을 채운다.

**파일 작업**
- **공개 저장소다.** 커밋 전 `git status --short` 로 무엇이 올라가는지 반드시 훑고,
  수집 원문·로그인 세션(`shared/crawler/.profile/`)·심링크가 섞였는지 확인한다.
- git 이 추적하지 않는 것(`data_export/`)을 지울 때는 `tar -czf` 로 먼저 백업하고, 백업 파일 수와 원본 파일 수를 대조한다.
- 문서에서 경로를 지우면 그 경로를 참조하는 다른 문서도 같이 고친다
  (`README.md` · `NOTION_SYNC.md` · `templates/README.md` · 스킬의 `SKILL.md`·`references/`).

**보고**
- 데이터 수치를 말할 때는 계산 근거를 함께 댄다. 이전 대화나 문서의 숫자를 그대로 옮기지 않는다.
- 통계를 인과로 서술하지 않는다. 표본이 계정 3개뿐이라는 점을 필요할 때 밝힌다.
