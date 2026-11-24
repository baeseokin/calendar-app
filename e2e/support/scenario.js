// E2E 공통 도구
//   - startScenario(): 시계 고정 + 초기 데이터(localStorage) 준비 + 앱 열기. 반환된 step() 으로 단계를 기록한다.
//   - step(): 단계를 실행하고 끝난 화면을 스크린샷으로 저장 (e2e-screenshots/<케이스>/<번호>_<단계>.png)
//   - 브라우저 alert/confirm 은 자동으로 '확인'을 누르고(필요하면 '취소'로 바꿀 수 있음), 그 문구를 스크린샷 상단에 표시
import { test as base, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SHOT_ROOT = path.resolve(__dirname, "../../e2e-screenshots");

/** 테스트 기준 시각 (Asia/Seoul). 모든 케이스는 이 시각의 '오늘'(2026-11-24 화요일)을 기준으로 데이터를 만든다. */
export const NOW = "2026-11-24T10:00:00+09:00";
export const TODAY = "2026-11-24";
export const LS_KEY = "psync_db_v1";

let seq = 0;
const baseTs = Date.parse(NOW) - 86_400_000; // 테스트 데이터의 updatedAt (기준 시각 하루 전)

/** 일정 레코드 */
export function ev(date, title, extra = {}) {
  return { id: `e_t${++seq}`, date, start: "", end: "", title, memo: "", updatedAt: baseTs, deleted: false, done: false, origin: "테스트", ...extra };
}
/** 회의록 레코드 */
export function mt(date, topic, extra = {}) {
  return { id: `m_t${++seq}`, date, time: "", topic, check: "", note: "", updatedAt: baseTs, deleted: false, origin: "테스트", ...extra };
}
/** 앱 저장소(db) 형식 */
export function makeDb({ events = [], meetings = [], deviceLabel = "내부", deviceId = "dev_e2e", lastSyncAt = 0, lastExportAt = 0 } = {}) {
  return { schema: 1, deviceId, deviceLabel, lastSyncAt, lastExportAt, events, meetings };
}

/**
 * 시나리오 시작
 *   opts.db   : 초기 데이터 (makeDb). null 이면 저장소가 빈 '처음 연 상태' (기기 지정 창이 뜸). 기본은 빈 데이터 + 기기 '내부'
 *   opts.now  : 브라우저 시각 (기본 NOW). 시계는 이 시각에서 시작해 실제 시간처럼 흐른다.
 *   opts.open : false 면 앱을 열지 않음 (기본 true)
 */
export async function startScenario(page, testInfo, caseId, opts = {}) {
  const project = testInfo.project.name;
  const dir = path.join(SHOT_ROOT, project === "desktop" ? caseId : `${caseId}~${project}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  await preparePage(page, opts);

  const dialogs = [];
  let answer = true;
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    if (answer || d.type() === "alert") await d.accept();
    else await d.dismiss();
  });

  let n = 0;
  /** shot: 스크린샷을 찍을 화면 (기본: 이 시나리오의 page. 두 번째 기기 단계는 그 기기의 page 를 넘김) */
  async function step(title, fn, shot = page) {
    await test.step(title, async () => {
      dialogs.length = 0;
      await fn();
      n += 1;
      const file = path.join(dir, `${String(n).padStart(2, "0")}_${slug(title)}.png`);
      await showBanner(shot, title, shot === page ? dialogs : []);
      await shot.screenshot({ path: file, fullPage: true });
      await hideBanner(shot);
      await testInfo.attach(`${n}. ${title}`, { path: file, contentType: "image/png" });
    });
  }
  /** 이후 confirm 창에 '확인'(true) / '취소'(false) 중 무엇을 누를지 */
  const answerConfirm = (v) => { answer = v; };

  if (opts.open !== false) await openApp(page);
  return { step, dialogs, answerConfirm };
}

/**
 * 페이지 준비: 시계 고정 + 초기 데이터. startScenario 가 호출하며,
 * 두 번째 기기(다른 브라우저 컨텍스트의 page)를 만들 때도 직접 쓴다. opts 는 startScenario 와 같음.
 */
export async function preparePage(page, opts = {}) {
  await page.clock.install({ time: new Date(opts.now || NOW) });
  const db = opts.db === undefined ? makeDb() : opts.db;
  // 처음 열 때 한 번만 저장소를 채움 (새로고침 후에는 앱이 저장한 값이 그대로 유지되어야 하므로)
  await page.addInitScript(({ key, db }) => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
    if (db) localStorage.setItem(key, JSON.stringify(db));
  }, { key: LS_KEY, db });
}

/** 앱 열기 (달력이 그려질 때까지 대기) */
export async function openApp(page) {
  await page.goto("/");
  await expect(page.locator("#calBody td").first()).toBeVisible();
}

/** 상단 탭 이동: "달력" | "회의록" | "동기화" | "설정" */
export async function openTab(page, name) {
  const key = { 달력: "cal", 회의록: "mt", 동기화: "sync", 설정: "set" }[name];
  await page.locator(`.tabs button[data-tab="${key}"]`).click();
  await expect(page.locator(`#tab-${key}`)).toBeVisible();
}

/** 달력의 날짜 칸 */
export const dayCell = (page, date) => page.locator(`#calBody td[data-date="${date}"]`);
/** 날짜 칸의 빈 곳(날짜 숫자)을 눌러 '일정 추가' 창 열기 — 일정 칩을 누르면 수정 창이 열리므로 숫자를 누른다 */
export async function clickDay(page, date) {
  await selectDay(page, date);
  if (isMobileView(page)) await page.locator("#agAdd").click(); // 모바일: 날짜 선택 → 아래 목록의 '+ 일정 추가'
  await expect(modalBox(page)).toBeVisible();
}
/** 날짜 칸 누르기 (PC·태블릿: 일정 추가 창이 열림 / 모바일: 그 날짜가 선택되고 아래 일정 목록이 바뀜) */
export async function selectDay(page, date) {
  await dayCell(page, date).locator(".dnum").click();
  if (isMobileView(page)) await expect(dayCell(page, date)).toHaveClass(/\bsel\b/);
}
/** 일정 수정 창 열기 (PC·태블릿: 달력의 일정 칩 클릭 / 모바일: 날짜 선택 → 아래 목록의 일정 클릭) */
export async function openEvent(page, date, title) {
  if (isMobileView(page)) {
    await selectDay(page, date);
    await agendaItem(page, title).click();
  } else {
    await chip(page, date, title).click();
  }
  await expect(modalBox(page)).toBeVisible();
}
/** 모바일: 선택한 날의 일정 목록 항목 */
export const agendaItem = (page, title) => page.locator("#agList .ag-it", { hasText: title });
/** 날짜 칸 안의 일정 칩 (보이는 것만 고르려면 .filter({ visible: true })) */
export const chip = (page, date, title) => dayCell(page, date).locator(".ev", { hasText: title });
/** 열려 있는 모달 창 */
export const modalBox = (page) => page.locator("#modalRoot .modal");

/**
 * 일정 막대가 color(예: "#30a46c", 생략하면 현재 디자인의 대표색)의 반투명 채움으로 칠해졌는지 확인.
 * 같은 칸에 같은 규칙(color-mix … 막대의 불투명도(--ev-a), transparent)으로 칠한 비교용 요소를 만들어 실제 계산된 배경색끼리 비교한다.
 * (불투명도는 디자인마다, 그리고 모바일에서 달라지므로 막대 자신의 --ev-a 값을 쓴다)
 * (브라우저마다 color-mix 결과 표기가 달라 숫자를 직접 적지 않음) 왼쪽 띠가 없는지도 함께 확인.
 */
export async function expectBarColor(locator, color) {
  await expect.poll(() => locator.evaluate((el, color) => {
    const c = color || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const probe = document.createElement("div");
    probe.style.background = `color-mix(in srgb, ${c} ${getComputedStyle(el).getPropertyValue("--ev-a").trim()}, transparent)`;
    el.parentElement.appendChild(probe);
    const want = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const cs = getComputedStyle(el);
    return cs.backgroundColor === want && cs.borderLeftWidth === "0px" ? "ok" : `배경 ${cs.backgroundColor} (기대 ${want}), 왼쪽 띠 ${cs.borderLeftWidth}`;
  }, color)).toBe("ok");
}

/** 앱이 localStorage 에 저장한 데이터 */
export async function readDb(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), LS_KEY);
}

/** 알림창(alert/confirm) 문구 확인 — 알림창은 자동으로 닫히고 문구만 dialogs 에 쌓인다 */
export async function expectDialog(dialogs, text) {
  await expect.poll(() => dialogs.join("\n")).toMatch(text);
}

/** 다운로드 버튼을 누르고 받은 파일의 경로·이름·내용을 돌려준다 */
export async function download(page, clickTarget) {
  const [dl] = await Promise.all([page.waitForEvent("download"), clickTarget.click()]);
  const file = await dl.path();
  return { file, name: dl.suggestedFilename().normalize("NFC"), text: fs.readFileSync(file, "utf8") };
}

// 스크린샷 상단에 '단계명 · 알림창 문구' 표시
async function showBanner(page, title, dialogs) {
  await page.evaluate(({ title, dialogs }) => {
    const el = document.createElement("div");
    el.id = "__e2e_banner";
    el.style.cssText = "position:fixed;top:8px;left:8px;width:240px;z-index:2147483647;background:rgba(250,250,250,.95);color:#111;font:600 13px/1.45 sans-serif;padding:8px 10px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.4);";
    el.textContent = "▶ " + title;
    for (const msg of dialogs) {
      const d = document.createElement("div");
      d.style.cssText = "margin-top:4px;color:#92400e;font-weight:500;white-space:pre-wrap;";
      d.textContent = "💬 알림창: " + msg;
      el.appendChild(d);
    }
    document.body.appendChild(el);
  }, { title, dialogs: [...dialogs] }).catch(() => {});
}
async function hideBanner(page) {
  await page.evaluate(() => document.getElementById("__e2e_banner")?.remove()).catch(() => {});
}

function slug(s) {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_").slice(0, 60);
}

/** 모바일 레이아웃(앱의 @media 기준: 폭 640px 이하)으로 실행 중인지 */
export function isMobileView(page) {
  return page.viewportSize().width <= 640;
}
/** 앱 레이아웃 기준의 기기 구분: "pc"(1025px~) | "tablet"(641~1024px) | "mobile"(~640px) */
export function deviceClass(page) {
  const w = page.viewportSize().width;
  return w <= 640 ? "mobile" : w <= 1024 ? "tablet" : "pc";
}

export const test = base;
export { expect };
