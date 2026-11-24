// 화면(E2E) 테스트 설정
//   - 앱은 HTML 파일 하나(project-calendar-app.html)이므로, 정적 파일 서버(e2e/serve.mjs, 포트 5180)를
//     Playwright 가 직접 띄우고 테스트가 끝나면 종료합니다. (서버·DB 없음, 데이터는 브라우저 localStorage)
//   - 실행: npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5180;

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
  // 모든 케이스를 PC · iPhone · Android 세 환경에서 모두 실행합니다.
  //   - 모바일은 기기 에뮬레이션(화면 크기·터치·모바일 UA)입니다. 앱은 폭 640px 이하에서 모바일 레이아웃(@media)으로 바뀝니다.
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "iphone", use: { ...devices["iPhone 14"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node e2e/serve.mjs ${WEB_PORT}`,
    port: WEB_PORT,
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
