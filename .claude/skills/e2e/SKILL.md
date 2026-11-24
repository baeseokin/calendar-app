---
name: e2e
description: calendar-app(project-calendar-app.html) 변경을 커밋하기 전에 관련 화면 E2E(PC · iPhone · Android)를 실행하고, 실패하면 원인을 분석·수정해 다시 통과시키며, 테스트가 없는 새 기능에는 케이스를 제안·작성한다. git commit 이 'E2E 미검증'으로 차단됐을 때, 사용자가 테스트 실행·실패 분석·케이스 작성을 요청할 때 사용한다.
---

# E2E 테스트 실행 · 수정 · 케이스 작성

설명과 보고는 모두 한국어로 한다.

## 언제 쓰나
- `git commit` 이 "커밋 차단: E2E 미검증" 으로 막혔을 때 (훅 `.claude/hooks/e2e-before-commit.sh`)
- 사용자가 "/e2e", "테스트 돌려줘", "E2E 실패 고쳐줘", "테스트 케이스 추가해줘" 등을 요청할 때
- `e2e/*.spec.js` 케이스를 추가·수정할 때

## 구성 요소
| 파일 | 역할 |
|---|---|
| `playwright.config.js` | PC(1440×900) · iPhone 14(WebKit) · Android(Pixel 7) 3개 프로젝트, 정적 서버 `e2e/serve.mjs`(포트 5180) 자동 실행 |
| `e2e/support/scenario.js` | `startScenario` · `step` · 데이터 만들기(`makeDb`/`ev`/`mt`) · 화면 헬퍼 |
| `e2e/select-specs.mjs` | 스테이징된 파일 → 실행할 spec 선택. 앱 HTML·설정·`e2e/support` 변경은 전체, spec 만 바뀌면 그 spec, 문서 등은 생략 |
| `e2e/run-related.sh` | 관련 spec 을 3개 환경에서 실행, 통과 시 `.git/e2e-pass` 에 기록. `--check` 확인만, `--all` 전체 |
| `e2e/open-report.sh` | 결과 보고서(http://localhost:9323)를 백그라운드로 띄우고 브라우저로 열기 — `run-related.sh` 가 자동 호출 |
| `.claude/hooks/e2e-before-commit.sh` | Claude 의 `git commit` 전에 `--check`. 미검증이면 차단 |
| `.githooks/pre-commit` | 사람이 커밋할 때 관련 E2E 실행 (`git config core.hooksPath .githooks` 로 설치) |
| `e2e/README.md` | 실행 구조, 헬퍼 목록, 케이스 목록 (사람용 설명서) |

## 절차

### 1. 준비
- 커밋할 변경을 모두 `git add` 한다. **`git commit -a` 는 쓰지 않는다** (훅이 막음). 앱 동작에 영향을 주는 파일에 스테이징 안 된 변경이 있으면 `run-related.sh` 가 거부한다(exit 3).
- 필요 조건: `npm install` 완료, 브라우저 설치(`npx playwright install chromium webkit`). 서버·DB 는 필요 없다.

### 2. 대상 확인
```bash
node e2e/select-specs.mjs        # mode, 실행할 specs, 이유(reasons)
git diff --cached                # 무엇이 바뀌었는지
```

### 3. 테스트 공백 검토 → 케이스 제안 (반자동)
앱은 HTML 한 파일이라 파일 단위로는 "테스트가 없는 화면"을 자동으로 알 수 없다. 그래서 **diff 를 직접 읽고** 판단한다.
- diff 에 새 버튼·입력칸·분기·저장 형식(동기화 패치·백업·CSV) 변경 등 **사용자가 하는 새 동작**이 있는데, 기존 케이스(`e2e/README.md` 의 목록)가 그 동작을 실행하지 않으면 **실행 전에 사용자에게 케이스 추가를 제안**한다. (스타일·문구·리팩터링만 바뀐 경우는 제외)
- 제안 형식 (짧게):
  - 대상 기능과 관련 코드 위치 (`project-calendar-app.html:줄`)
  - 케이스 초안: 번호(아래 번호 체계) · 제목 · 초기 데이터 · 단계 · 기대 결과(화면 표시, localStorage 상태)
  - 질문: "이 케이스를 추가할까요? (추가 / 수정해서 추가 / 이번엔 생략)"
- **추가**: "케이스 작성 규칙"대로 3개 환경에서 통과하도록 작성 → `git add` → 4단계로 실행.
- **생략**: 그대로 4단계로 진행하고, 보고에 "케이스 없이 커밋한 기능"으로 남긴다.

### 4. 실행
```bash
e2e/run-related.sh               # 관련 spec × PC · iPhone · Android (전체 ≈ 11초)
```
- 화면 E2E 가 끝나면(통과·실패 모두) 결과 보고서가 자동으로 열린다 (`e2e/open-report.sh`, http://localhost:9323).
  - `npm run test:e2e:report` 를 **포그라운드로 직접 실행하지 않는다** (서버가 끝나지 않아 명령이 멈춤). 다시 열 때는 `e2e/open-report.sh`.
  - 사용자가 원하지 않으면 `E2E_NO_REPORT=1 e2e/run-related.sh`.

### 5. 실패 분석 (실패한 케이스마다)
1. 실패 위치와 메시지: `npx playwright test <spec> --project=<환경> -g "<케이스번호>" --reporter=line`
2. `e2e-results/<케이스>-<환경>/error-context.md` (실패 시점 화면 구조), `e2e-screenshots/<케이스>~<환경>/` 마지막 스크린샷을 Read 로 확인
3. 알림창 문구가 필요하면 `startScenario` 의 `dialogs` 확인 (브라우저 alert/confirm 은 자동으로 '확인' 처리되어 화면에 안 보임)
4. **PC 와 모바일 중 한쪽만 실패**하면 `@media(max-width:640px)` 규칙, 칸 크기(모바일 최소 70px), 터치 클릭 위치를 확인
5. 판정:
   - **테스트 문제**: 셀렉터가 다른 요소를 잡음, 화면 크기 변경 직후 다시 계산되기 전 값을 읽음(→ `expect.poll` 로 기다림), 이번 변경으로 의도적으로 바뀐 문구·구조 → 테스트를 고친다
   - **앱 버그**: 사용자에게 실제로 문제가 되는 동작 → 앱을 고친다
   - **판단 불가**: 이번 변경이 의도한 동작 변경인지 버그인지 모르겠으면 **멈추고 사용자에게 묻는다**

### 6. 수정 → 재실행 (최대 3회)
- 고친 파일을 `git add` 하고 `e2e/run-related.sh` 를 다시 실행한다.
- 3회 안에 통과하지 못하면 중단하고 남은 실패와 원인 추정을 보고한다.

### 7. 커밋 · 보고
- `e2e/run-related.sh --check` 가 0 이면 커밋한다.
- 보고 형식:
  - 실행 대상 spec 과 선택 이유, 환경별 통과/실패 수
  - 고친 내용을 **테스트 수정** / **앱 버그 수정** / **케이스 추가** 로 나눠서 (앱 수정은 파일:줄과 원인)
  - 케이스 없이 커밋한 기능 (사용자가 생략을 선택한 경우)
  - 결과 보고서 http://localhost:9323 · 스크린샷 갤러리 `npm run test:e2e:shots`

## 금지 사항
- 테스트를 약하게 만들어 통과시키지 않는다: assertion 삭제·완화, `test.skip`/`fixme`, 의미 없는 `waitForTimeout`, 타임아웃만 늘리기
- `--no-verify`, `.git/e2e-pass` 직접 작성, `git commit -a` 로 검증을 우회하지 않는다
- 특정 환경만 통과시키려고 `projects` 에 `grep`/`grepInvert` 를 넣지 않는다 (모든 케이스는 3개 환경 모두 통과해야 함)
- 의도된 동작 변경일 수 있는 앱 코드를 임의로 되돌리지 않는다 → 사용자에게 확인

## 케이스 작성 규칙
- 모든 테스트는 `./support/scenario.js` 에서 `test`, `expect` 를 import 한다.
- 케이스마다 `startScenario(page, testInfo, "<번호>_<이름>", { db })` 로 시작하고 `step()` 으로 단계별 스크린샷을 남긴다.
  - 시계는 **2026-11-24(화) 10:00 (Asia/Seoul)** 에서 시작한다 (`NOW`, `TODAY`). 날짜에 따라 결과가 달라지는 데이터는 이 기준으로 만든다.
  - 초기 데이터: `makeDb({ events: [ev(날짜, 제목, {...})], meetings: [mt(...)] })`. `db: null` 이면 처음 연 상태(기기 지정 창이 뜸).
  - 두 번째 기기(동기화)는 `sync.spec.js` 의 `openOtherDevice()` 처럼 새 컨텍스트 + `preparePage()`. 그 기기 화면을 찍으려면 `step(제목, fn, otherPage)`.
- 화면 헬퍼: `openTab`, `dayCell`, `clickDay`, `chip`, `modalBox`, `readDb`(localStorage), `expectDialog`, `download`, `isMobileView`
- confirm 에 '취소'를 눌러야 하면 `answerConfirm(false)`.
- 요소는 앱의 `id` 를 우선 사용한다. 화면에 같은 문구가 여러 곳에 있으면(예: 미리보기 안내 문구의 `.tag.cf`) 범위를 좁힌다.
- 번호 체계: 1 달력·일정, 2 일정 종료, 3 회의록, 4 동기화, 5 설정·백업, 6 디자인·막대 색상. 새 케이스를 추가하면 `e2e/README.md` 의 케이스 목록도 고친다.
