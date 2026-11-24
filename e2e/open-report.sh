#!/usr/bin/env bash
# E2E 실행 결과 보고서(Playwright HTML report, e2e-report/)를 브라우저로 엽니다.
#   - 보고서 서버(playwright show-report)는 띄운 뒤 끝나지 않으므로 백그라운드로 실행합니다.
#   - 포트는 9324 (report-form-ui 의 보고서가 9323 을 쓰므로 겹치지 않게 함). 바꾸려면 E2E_REPORT_PORT.
#   - 이 프로젝트의 보고서 서버가 이미 떠 있으면 브라우저만 엽니다 (보고서 파일은 실행마다 갱신되므로 최신 결과가 보임).
#   - 다른 프로그램이 포트를 쓰고 있으면 그 화면을 열지 않고 알려 줍니다.
#   - 열지 않으려면: E2E_NO_REPORT=1
[[ "${E2E_NO_REPORT:-}" == "1" ]] && exit 0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0
[[ -f e2e-report/index.html ]] || exit 0

PORT="${E2E_REPORT_PORT:-9324}"
URL="http://localhost:${PORT}"
open_url() { if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi; }

PID="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
if [[ -n "$PID" ]]; then
  OWNER="$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
  if [[ "$OWNER" == "$ROOT" ]]; then
    open_url  # 이미 떠 있는 이 프로젝트의 보고서 서버 → 브라우저만 다시 열기
  else
    echo "⚠️  포트 ${PORT} 를 다른 프로그램(${OWNER:-PID $PID})이 쓰고 있어 보고서를 열지 않았습니다. E2E_REPORT_PORT 로 다른 포트를 지정하세요."
    exit 0
  fi
else
  # 보고서 서버를 백그라운드로 띄움 (서버가 브라우저를 자동으로 엶)
  nohup npx playwright show-report e2e-report --port "$PORT" >/dev/null 2>&1 &
  disown 2>/dev/null || true
fi
echo "📊 E2E 결과 보고서: ${URL}  (단계별 스크린샷 · 실패 시 trace 포함)"
