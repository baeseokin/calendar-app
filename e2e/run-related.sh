#!/usr/bin/env bash
# 스테이징된 변경과 관련된 화면 E2E 를 PC · 태블릿 · iPhone · Android 에서 실행하고, 통과하면 기록을 남깁니다.
#
#   e2e/run-related.sh            관련 테스트 실행 → 통과 시 기록
#   e2e/run-related.sh --all      전체 실행 → 통과 시 기록
#   e2e/run-related.sh --check    실행하지 않고 커밋 가능 여부만 확인 (0: 가능, 1: 불가)
#
# 커밋 가능 조건 (--check): 관련 테스트가 없거나, 지금 스테이징된 내용으로 통과했음
# 기록은 .git/e2e-pass 에 '스테이징된 내용의 트리 해시'로 저장합니다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE_ARG="${1:-}"

STAMP="$(git rev-parse --absolute-git-dir)/e2e-pass"
TREE="$(git write-tree)"

json() { node -e "const j=JSON.parse(process.argv[1]);console.log($2)" "$1"; }

if [[ "$MODE_ARG" == "--all" ]]; then
  SEL="$(node e2e/select-specs.mjs project-calendar-app.html)"  # 앱 파일을 넘겨 전체 선택
else
  SEL="$(node e2e/select-specs.mjs)"
fi
MODE="$(json "$SEL" 'j.mode')"
SPECS="$(json "$SEL" 'j.specs.join(" ")')"

if [[ "$MODE_ARG" == "--check" ]]; then
  if [[ "$MODE" != "none" ]] && ! [[ -f "$STAMP" && "$(cat "$STAMP")" == "$TREE" ]]; then
    echo "E2E 미검증: 스테이징된 변경에 화면 E2E 실행이 필요합니다 — ${MODE}${SPECS:+: $SPECS}"
    exit 1
  fi
  exit 0
fi

if [[ "$MODE" == "none" ]]; then
  echo "✅ 실행할 관련 테스트가 없습니다."
  echo "$TREE" > "$STAMP"
  exit 0
fi

# 테스트는 작업 폴더 기준으로 돌기 때문에, 앱 동작에 영향을 주는 파일이 스테이징 안 된 채 바뀌어 있으면
# '커밋될 코드'를 검증한 것이 아님 (문서 등 선택 규칙이 무시하는 파일은 제외)
UNSTAGED="$(git diff --name-only)"
if [[ -n "$UNSTAGED" ]]; then
  # shellcheck disable=SC2086
  DSEL="$(node e2e/select-specs.mjs $UNSTAGED)"
  if [[ "$(json "$DSEL" 'j.mode')" != "none" ]]; then
    echo "❌ 스테이징되지 않은 변경이 있어, 커밋될 코드와 테스트 대상이 다릅니다. git add 후 다시 실행하세요:"
    echo "$UNSTAGED" | sed 's/^/   - /'
    exit 3
  fi
fi

if [[ "$MODE" == "all" ]]; then
  echo "▶ 화면 E2E 전체 실행 (PC · 태블릿 · iPhone · Android)"
  npx playwright test
else
  echo "▶ 관련 화면 E2E 실행 (PC · 태블릿 · iPhone · Android): $SPECS"
  # shellcheck disable=SC2086
  npx playwright test $SPECS
fi
RC=$?
[[ $RC -ne 0 ]] && echo "❌ 화면 E2E 실패 — e2e-results/ 의 error-context.md 와 스크린샷을 확인하세요."
# 화면 E2E 가 끝나면 (통과·실패 모두) 결과 보고서를 브라우저로 연다 (끄려면 E2E_NO_REPORT=1)
"$ROOT/e2e/open-report.sh"

if [[ $RC -ne 0 ]]; then
  rm -f "$STAMP"
  exit $RC
fi
echo "$TREE" > "$STAMP"
echo "✅ 테스트 통과"
exit 0
