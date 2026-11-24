// 화면(E2E) 테스트 설정
//   - 앱은 HTML 파일 하나(project-calendar-app.html)이므로, 정적 파일 서버(e2e/serve.mjs, 포트 5180)를
//     Playwright 가 직접 띄우고 테스트가 끝나면 종료합니다. (서버·DB 없음, 데이터는 브라우저 localStorage)
//   - 실행: npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5180;

/** 이 기기 태그가 붙었거나, 기기 태그가 하나도 없는(공통) 케이스만 실행 */
const onlyFor = (tag) => new RegExp(`@${tag}\\b|^(?!.*@(?:pc|tablet|mobile)\\b)`);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.js",
  globalTeardown: "./e2e/global-teardown.js",
  fullyParallel: true,     // 테스트마다 브라우저 저장소가 분리되므로 병렬 실행 가능
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  // 기기 구분: PC(1025px~) · 태블릿(641~1024px) · 모바일(~640px). 앱은 이 기준으로 레이아웃(@media)이 바뀝니다.
  //   - 공통 케이스(제목에 기기 태그 없음): 모든 프로젝트에서 실행
  //   - 기기 전용 케이스: 제목에 @pc / @tablet / @mobile 태그 → 그 기기 프로젝트에서만 실행 (여러 개 붙일 수 있음)
  //   - 모바일·태블릿은 기기 에뮬레이션(화면 크기·터치·모바일 UA)입니다.
  projects: [
    { name: "desktop", grep: onlyFor("pc"), use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", grep: onlyFor("tablet"), use: { ...devices["iPad (gen 7)"] } },
    { name: "iphone", grep: onlyFor("mobile"), use: { ...devices["iPhone 14"] } },
    { name: "android", grep: onlyFor("mobile"), use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node e2e/serve.mjs ${WEB_PORT}`,
    port: WEB_PORT,
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
