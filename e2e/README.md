# 화면(E2E) 테스트

실제 브라우저(PC: Chromium, 모바일: iPhone·Android 에뮬레이션)로 `project-calendar-app.html` 을 열어 일정·회의록·동기화·백업을 조작하고, **단계마다 스크린샷**을 남깁니다.

## 실행

```bash
npm install                                  # 처음 한 번
npx playwright install chromium webkit       # 브라우저가 없으면 한 번

npm run test:e2e          # 전체 실행: 24개 케이스 × PC · iPhone · Android = 72개 (약 11초)
npm run test:e2e:shots    # 단계별 스크린샷 갤러리 열기 (e2e-screenshots/index.html)
npm run test:e2e:report   # Playwright 보고서 열기 (단계별 스크린샷 첨부, 실패 시 trace 포함)

npx playwright test -g "1-2"                 # 특정 케이스만
npx playwright test --project=iphone         # 특정 환경만
npx playwright test --headed                 # 브라우저 화면을 보면서 실행
```

서버·DB 는 필요 없습니다. Playwright 가 정적 파일 서버(`e2e/serve.mjs`, http://localhost:5180)를 띄우고 끝나면 종료합니다.
데이터는 브라우저 localStorage 에만 있으므로 테스트마다 저장소가 분리되어 병렬로 실행됩니다.

## 테스트 환경

| 프로젝트 | 기기 | 브라우저 엔진 |
|---|---|---|
| `desktop` | 1440×900 | Chromium |
| `iphone` | iPhone 14 (390×664, 터치) | WebKit (Safari 엔진) |
| `android` | Pixel 7 (412×839, 터치) | Chromium |

- 앱은 폭 640px 이하에서 모바일 레이아웃(`@media`)으로 바뀝니다.
- **시계 고정**: 모든 케이스는 **2026-11-24(화) 10:00 (Asia/Seoul)** 에서 시작합니다. '오늘'·'지난 일정' 판단이 실행 날짜에 따라 달라지지 않습니다.
- 브라우저 alert/confirm 은 자동으로 '확인'이 눌리고, 문구는 스크린샷 상단에 💬 로 표시됩니다.

## 커밋할 때 자동 실행

```bash
node e2e/select-specs.mjs     # 스테이징된 변경 → 실행할 spec 과 이유 확인
e2e/run-related.sh            # 관련 spec 실행, 통과하면 .git/e2e-pass 에 기록
e2e/run-related.sh --check    # 지금 스테이징된 내용이 이미 통과했는지만 확인
```

- **사람이 커밋할 때**: git pre-commit 훅(`.githooks/pre-commit`)이 관련 케이스를 실행하고, 실패하면 커밋을 막습니다.
  저장소마다 한 번 설치: `git config core.hooksPath .githooks` · 급할 때 우회: `git commit --no-verify`
- **Claude Code 가 커밋할 때**: 훅(`.claude/hooks/e2e-before-commit.sh`)이 미검증 커밋을 막고, Claude 가 e2e 스킬
  (`.claude/skills/e2e/SKILL.md`)에 따라 실행 → 실패 원인 분석·수정 → 재실행(최대 3회) 후 커밋합니다.
  새 기능에 맞는 케이스가 없으면 커밋 전에 케이스 초안을 제안합니다.
- 이미 같은 내용으로 통과했으면 다시 실행하지 않습니다 (스테이징 트리 해시로 비교).
- 선택 규칙: 앱 HTML·`playwright.config.js`·`package*.json`·`e2e/support` 등 변경 → 전체, spec 만 바뀜 → 그 spec, 문서·`gen_test_data.py`·`test-data.json` → 생략.
  (앱이 HTML 한 파일이라 화면별로 나눠 고를 수 없어 앱이 바뀌면 항상 전체를 실행합니다)
- 화면 E2E 가 끝나면 결과 보고서가 자동으로 브라우저에 열립니다 (http://localhost:9323). 열지 않으려면 `E2E_NO_REPORT=1`.
- 테스트는 작업 폴더 기준으로 돌기 때문에, 스테이징되지 않은 앱·테스트 변경이 있으면 실행을 거부합니다 (`git add` 후 다시).

## 공통 도구 (`e2e/support/scenario.js`)

| 헬퍼 | 설명 |
|---|---|
| `startScenario(page, testInfo, "번호_이름", { db, now })` | 시계 고정 + 초기 데이터 + 앱 열기. `{ step, dialogs, answerConfirm }` 반환 |
| `step(제목, fn, [다른 page])` | 단계 실행 후 스크린샷 (`e2e-screenshots/<케이스>[~환경]/NN_제목.png`) |
| `makeDb({ events, meetings, deviceLabel, lastSyncAt, lastExportAt })`, `ev(날짜, 제목, {...})`, `mt(날짜, 주제, {...})` | 초기 데이터 만들기. `db: null` 이면 처음 연 상태 |
| `preparePage(page, opts)`, `openApp(page)` | 두 번째 기기(다른 브라우저 컨텍스트) 준비 |
| `openTab(page, "회의록")`, `dayCell`, `clickDay`, `chip(page, 날짜, 제목)`, `modalBox` | 화면 요소 |
| `readDb(page)` | 앱이 localStorage 에 저장한 데이터 |
| `expectBarColor(칩, [색])` | 일정 막대가 그 색(생략하면 디자인 대표색)의 반투명 채움인지 확인 |
| `expectDialog(dialogs, 문구)`, `answerConfirm(false)` | 알림창 문구 확인, confirm 에 '취소' 누르기 |
| `download(page, 버튼)` | 다운로드 파일 경로·이름·내용 |

## 케이스 목록

| 번호 | spec | 내용 |
|---|---|---|
| 1-1 | calendar | 처음 열면 기기 지정 창 → 선택하면 상단 표시, 새로고침해도 다시 묻지 않음 |
| 1-2 | calendar | 날짜 칸 클릭 → 일정 추가 → 달력 표시, 새로고침 후 유지 |
| 1-3 | calendar | 제목 없음 · 종료 시간 < 시작 시간이면 저장 안 됨 |
| 1-4 | calendar | 일정 수정(제목·날짜 이동)·삭제 (저장소에는 삭제 표시로 남음) |
| 1-5 | calendar | 이전 달·다음 달·오늘 이동 |
| 1-6 | calendar | 달력이 브라우저 화면을 가로·세로로 채움 |
| 1-7 | calendar | 칸에 들어가는 만큼 표시 + 넘치는 개수만 +N, 화면 크기 변경 시 다시 계산 |
| 2-1 | event-done | 일정 종료 처리 → 흐리게·취소선, 종료 취소 |
| 2-2 | event-done | '지난 일정 종료': 지난 날짜·오늘 끝난 일정만 종료 (종일·진행 중·미래·삭제 제외), 취소하면 변화 없음 |
| 2-3 | event-done | 종료할 지난 일정이 없으면 안내 |
| 3-1 | meetings | 회의 추가 → 목록 표시 (여러 줄 확인 사항 유지) |
| 3-2 | meetings | 주제·확인 사항·비고 검색 |
| 3-3 | meetings | 회의록 수정·삭제 |
| 3-4 | meetings | 주제 없으면 저장 안 됨 |
| 4-1 | sync | 내부 → 파일로 내보내기 → 외부에서 가져오기 (미리보기 '추가', 종료 상태·막대 색상 포함) |
| 4-2 | sync | 변경분만 내보내기: 종료 처리·삭제가 상대 기기에 '수정'·'삭제'로 반영 (충돌 아님) |
| 5-1 | settings | 전체 백업 → 전체 삭제 → 백업 복원 |
| 5-2 | settings | 잘못된 파일로는 복원 안 됨 |
| 5-3 | settings | CSV 내보내기 (BOM, 상태 열, 쉼표·따옴표·줄바꿈 처리) |
| 5-4 | settings | 기기 이름 직접 입력, 새로고침 후 유지 |
| 6-1 | design | 설정 탭에서 디자인 선택 → 바로 적용·선택 표시, 새로고침 후 유지, 일정 데이터에는 저장 안 됨 |
| 6-2 | design | 달력 위 '🎨 디자인' 버튼 → 선택 창에서 변경, 설정 탭과 선택 상태 일치 |
| 6-3 | design | 일정 막대 색상 선택·저장 (막대 전체 반투명 채움, 왼쪽 띠 없음), 디자인을 바꿔도 유지, '기본'은 디자인 색을 따름 |
| 6-4 | design | 팔레트에 없는 색상 값은 무시하고 기본색 표시 (가져온 데이터 보호) |

## 다루지 않는 것
- QR 내보내기/가져오기(카메라·QR 사진 인식): 화면 촬영·인식은 에뮬레이션으로 검증하기 어려워 제외했습니다. 같은 패치 형식은 4-1·4-2 의 파일 경로로 검증합니다.
- 실제 기기가 아닌 **에뮬레이션**입니다. iOS 날짜 선택기 같은 OS 고유 UI는 확인하지 못합니다.
