#!/usr/bin/env bash
# E2E 실행 결과 보고서(Playwright HTML report, e2e-report/)를 브라우저로 엽니다.
#   - `npm run test:e2e:report`(playwright show-report)는 보고서 서버를 띄운 뒤 끝나지 않으므로 백그라운드로 실행합니다.
#   - 보고서 서버가 이미 떠 있으면 새로 띄우지 않고 브라우저만 엽니다 (보고서 파일은 실행마다 갱신되므로 최신 결과가 보임).
#   - 열지 않으려면: E2E_NO_REPORT=1
[[ "${E2E_NO_REPORT:-}" == "1" ]] && exit 0
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 0
[[ -f e2e-report/index.html ]] || exit 0

PORT="${E2E_REPORT_PORT:-9323}"
URL="http://localhost:${PORT}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  # 이미 떠 있는 보고서 서버 → 브라우저만 다시 열기
  if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi
else
  # 보고서 서버를 백그라운드로 띄움 (서버가 브라우저를 자동으로 엶)
  nohup npm run --silent test:e2e:report -- --port "$PORT" >/dev/null 2>&1 &
  disown 2>/dev/null || true
fi
echo "📊 E2E 결과 보고서: ${URL}  (단계별 스크린샷 · 실패 시 trace 포함)"
