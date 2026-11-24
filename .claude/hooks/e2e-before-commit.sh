#!/usr/bin/env bash
# Claude Code PreToolUse(Bash) 훅: Claude 가 git commit 하기 전에 관련 화면 E2E(PC · 태블릿 · iPhone · Android) 통과 여부를 확인합니다.
#   통과 기록이 지금 스테이징된 내용과 같거나 테스트와 무관한 변경이면 그대로 커밋, 아니면 차단(exit 2)하고 e2e 스킬로 안내.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HOOK_DIR/../.." && pwd)"

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input?.command||"")}catch{console.log("")}})')"
CWD="$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).cwd||"")}catch{console.log("")}})')"

# git commit 이 아니면 관여하지 않음
if ! printf '%s' "$CMD" | grep -Eq '(^|[;&|(]|\s)git(\s+-C\s+\S+)?\s+commit(\s|$)'; then
  exit 0
fi

# 어느 저장소의 커밋인지: git -C <dir> > 명령 안의 마지막 cd <dir> > 현재 폴더
TARGET="$(printf '%s' "$CMD" | grep -Eo 'git\s+-C\s+("[^"]+"|\S+)\s+commit' | head -1 | sed -E 's/git[[:space:]]+-C[[:space:]]+//; s/[[:space:]]+commit$//; s/^"//; s/"$//')"
if [[ -z "$TARGET" ]]; then
  TARGET="$(printf '%s' "$CMD" | sed -E 's/git[[:space:]].*commit.*//' | grep -Eo '(^|[;&|(]|\s)cd\s+("[^"]+"|[^;&| ]+)' | tail -1 | sed -E 's/.*cd[[:space:]]+//; s/^"//; s/"$//')"
fi
BASE="${CWD:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"
[[ -n "$TARGET" && "$TARGET" != /* ]] && TARGET="$BASE/$TARGET"
TARGET="${TARGET:-$BASE}"
TARGET="${TARGET/#\~/$HOME}"
TOP="$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)"
[[ "$TOP" == "$ROOT" ]] || exit 0  # 이 저장소의 커밋이 아님

if printf '%s' "$CMD" | grep -Eq '\-\-no-verify|(\s)-n(\s|$)'; then
  echo "커밋 차단: --no-verify 로 테스트 검증을 건너뛸 수 없습니다. 사용자가 명시적으로 원하면 사용자에게 직접 실행하도록 안내하세요." >&2
  exit 2
fi
if printf '%s' "$CMD" | grep -Eq '\s(-[A-Za-z]*a[A-Za-z]*|--all)(\s|$)'; then
  echo "커밋 차단: git commit -a 는 쓰지 말고, 커밋할 파일을 git add 로 스테이징한 뒤 커밋하세요 (테스트는 스테이징된 내용을 기준으로 검증합니다)." >&2
  exit 2
fi

MSG="$("$ROOT/e2e/run-related.sh" --check 2>&1)"
if [[ $? -eq 0 ]]; then
  exit 0
fi

cat >&2 <<MSG_EOF
커밋 차단 (calendar-app):
${MSG}
e2e 스킬(${ROOT}/.claude/skills/e2e/SKILL.md)의 절차를 따르세요:
 - ${ROOT}/e2e/run-related.sh 로 실행, 실패하면 원인을 고치고 git add 후 재실행
MSG_EOF
exit 2
