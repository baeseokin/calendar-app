// 사용자 매뉴얼용 화면 캡처
//   예시 데이터를 넣은 앱을 실제 브라우저(PC 1280×800, iPhone 14)로 열어 기능별 화면을 찍고,
//   눌러야 할 곳에 빨간 테두리와 번호(①②…)를 그려 docs/manual/shots/<이름>.jpg 로 저장한다.
//   매뉴얼 본문(docs/manual/manual.src.html)의 <figure data-shot="이름"> 과 이름이 짝을 이룬다.
//
//   단독 실행: node scripts/manual/shots.mjs   (보통은 scripts/manual/build.mjs 가 부름)
import { chromium, webkit, devices } from "@playwright/test";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SHOT_DIR = path.join(ROOT, "docs/manual/shots");
const PORT = 5181;
const BASE = `http://localhost:${PORT}/`;
const NOW = new Date("2026-11-24T10:00:00+09:00"); // 매뉴얼 속 '오늘' (화요일)
const THEME = "light";                             // 인쇄해도 잘 보이도록 '화이트' 디자인으로 캡처
const TS = NOW.getTime() - 86_400_000;

/* ---------------- 예시 데이터 (가상의 프로젝트) ---------------- */
const E = (id, date, title, x = {}) => ({ id, date, start: "", end: "", title, memo: "", color: "", done: false, deleted: false, updatedAt: TS, origin: "내부", ...x });
const M = (id, date, topic, x = {}) => ({ id, date, time: "", topic, check: "", note: "", eventId: "", actions: [], cancelled: false, deleted: false, updatedAt: TS, origin: "내부", ...x });
const SU = { seriesId: "s_standup", repeat: "weekly:1:2026-12-28" }; // 매주 월요일 스탠드업 (반복 묶음)
export function demoDb(label = "내부") {
  const events = [
    E("e01", "2026-11-02", "주간 스탠드업", { start: "09:30", end: "10:00", color: "#3e63dd", done: true, ...SU }),
    E("e02", "2026-11-03", "킥오프 준비", { start: "14:00", end: "15:00", done: true }),
    E("e03", "2026-11-05", "협력사 미팅", { start: "10:00", end: "11:00", color: "#d6409f", cancelled: true, cancelReason: "협력사 내부 사정" }),
    E("e04", "2026-11-09", "주간 스탠드업", { start: "09:30", end: "10:00", color: "#3e63dd", done: true, ...SU }),
    E("e05", "2026-11-10", "킥오프 회의", { start: "09:30", end: "11:00", color: "#8e4ec6", done: true }),
    E("e06", "2026-11-12", "보안 점검", { start: "13:00", end: "14:00", color: "#f76b15", done: true }),
    E("e07", "2026-11-16", "주간 스탠드업", { start: "09:30", end: "10:00", color: "#3e63dd", done: true, ...SU }),
    E("e08", "2026-11-17", "QA 결과 공유", { start: "14:00", end: "15:00", color: "#f76b15", done: true }),
    E("e09", "2026-11-19", "보안 교육(온라인)", { color: "#12a594" }),
    ...["09:00 데이터 점검", "10:00 디자인 검토", "11:00 코드 리뷰", "13:00 인프라 회의", "15:00 배포 준비", "16:30 주간 정리"].map((t, i) =>
      E("e2" + i, "2026-11-20", t.slice(6), { start: t.slice(0, 5), color: ["#3e63dd", "#8e4ec6", "#12a594", "#e2b007", "#e5484d", "#8b8d98"][i] })),
    E("e30", "2026-11-23", "주간 스탠드업", { start: "09:30", end: "10:00", color: "#3e63dd", done: true, ...SU }),
    E("e31", "2026-11-24", "요구사항 리뷰", { start: "10:00", end: "11:30", color: "#8e4ec6" }),
    E("e32", "2026-11-24", "고객사 미팅", { start: "14:00", end: "15:00", color: "#d6409f", memo: "본사 3층 회의실" }),
    E("e33", "2026-11-25", "협력사 통화", { start: "11:00", end: "11:30", cancelled: true, cancelReason: "상대측 일정 변경" }),
    E("e34", "2026-11-27", "디자인 리뷰", { start: "15:00", end: "16:00", color: "#12a594", movedFrom: "2026-11-26 15:00" }),
    E("e35", "2026-11-27", "QA 점검", { start: "10:00", end: "11:00", color: "#f76b15" }),
    E("e36", "2026-11-30", "주간 스탠드업", { start: "09:30", end: "10:00", color: "#3e63dd", ...SU }),
    ...["07", "14", "21", "28"].map((d) => E("e5" + d, "2026-12-" + d, "주간 스탠드업", { start: "09:30", end: "10:00", color: "#3e63dd", ...SU })),
    E("e40", "2026-11-16", "신입 교육 과정", { start: "13:00", end: "17:00", endDate: "2026-11-18", color: "#30a46c", memo: "본사 교육장" }),
    E("e37", "2026-12-02", "중간 보고", { start: "14:00", color: "#e5484d" }),
  ];
  const meetings = [
    M("m1", "2026-11-24", "요구사항 리뷰", { time: "10:00~11:30", eventId: "e31", check: "- 로그인은 사내 SSO 사용\n- 대시보드 위젯은 4종으로 축소", note: "참석: 기획 2, 개발 3",
      actions: [
        { id: "a1", text: "화면 설계서 수정", owner: "김", due: "2026-11-27", done: false },
        { id: "a2", text: "API 목록 공유", owner: "이", due: "2026-11-21", done: false },
        { id: "a3", text: "회의실 예약", owner: "박", due: "", done: true },
      ] }),
    M("m2", "2026-11-17", "QA 결과 공유", { time: "14:00~15:00", eventId: "e08", check: "- 결함 12건 (주요 3건)\n- 재테스트는 다음 주", actions: [{ id: "a4", text: "주요 결함 3건 조치", owner: "이", due: "2026-11-28", done: false }] }),
    M("m3", "2026-11-10", "킥오프 회의", { time: "09:30~11:00", eventId: "e05", check: "- 일정·범위 합의\n- 주간 보고는 금요일", note: "전원 참석" }),
    M("m4", "2026-11-05", "협력사 미팅", { time: "10:00", cancelled: true, check: "- (열리지 않음)" }),
  ];
  return { schema: 1, deviceId: "dev_" + label, deviceLabel: label, lastSyncAt: 0, lastExportAt: 0, events, meetings };
}

/* ---------------- 브라우저 ---------------- */
async function startServer() {
  const srv = spawn(process.execPath, [path.join(ROOT, "e2e/serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) return srv; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  srv.kill(); throw new Error("매뉴얼 캡처용 서버를 띄우지 못했습니다");
}
async function open(browsers, { mobile = false, db = demoDb(), theme = THEME } = {}) {
  const b = mobile ? browsers.webkit : browsers.chromium;
  const ctx = await b.newContext({
    ...(mobile ? { ...devices["iPhone 14"], deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 }),
    locale: "ko-KR", timezoneId: "Asia/Seoul", acceptDownloads: true,
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  await page.addInitScript(({ db, theme }) => {
    if (sessionStorage.getItem("__manual")) return;
    sessionStorage.setItem("__manual", "1");
    localStorage.clear();
    if (db) localStorage.setItem("psync_db_v1", JSON.stringify(db));
    localStorage.setItem("psync_ui_v1", JSON.stringify({ theme }));
  }, { db, theme });
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE);
  await page.locator("#calBody td").first().waitFor();
  await page.waitForTimeout(150);
  return page;
}
const tab = async (page, key) => { await page.locator(`.tabs button[data-tab="${key}"]`).click(); await page.waitForTimeout(120); };
const cell = (page, date) => page.locator(`#calBody td[data-date="${date}"]`);
const chipOf = (page, date, text) => cell(page, date).locator(".ev", { hasText: text }).first();

/** 표시: [{ loc: Locator, n: 번호 }] → 빨간 테두리 + 번호 배지 */
async function mark(page, items) {
  const boxes = [];
  for (const it of items) {
    const b = await it.loc.boundingBox();
    if (!b) throw new Error("표시할 요소를 찾지 못했습니다: " + it.loc);
    boxes.push({ ...b, n: it.n, pad: it.pad ?? 4, side: it.side || "left" });
  }
  await page.evaluate((boxes) => {
    for (const b of boxes) {
      const r = document.createElement("div");
      r.className = "__mk";
      r.style.cssText = `position:fixed;left:${b.x - b.pad}px;top:${b.y - b.pad}px;width:${b.width + b.pad * 2}px;height:${b.height + b.pad * 2}px;` +
        "border:3px solid #ff2d55;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.9);z-index:2147483646;pointer-events:none";
      const n = document.createElement("div");
      n.className = "__mk";
      n.textContent = b.n;
      // 배지 위치: 왼쪽 위(기본) / 오른쪽 위. 화면 가장자리에 붙은 요소는 잘리지 않게 안쪽으로
      let lx = b.side === "right" ? b.x + b.width + b.pad - 13 : b.x - b.pad - 13;
      let ty = b.y - b.pad - 13;
      lx = Math.min(Math.max(lx, 2), window.innerWidth - 28);
      ty = Math.max(ty, 2);
      n.style.cssText = `position:fixed;left:${lx}px;top:${ty}px;width:26px;height:26px;border-radius:50%;background:#ff2d55;color:#fff;` +
        "font:800 15px/26px sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none";
      document.body.append(r, n);
    }
  }, boxes);
}
const unmark = (page) => page.evaluate(() => document.querySelectorAll(".__mk").forEach((e) => e.remove()));
/** 넓은 패널을 캡처할 때만 폭을 줄여(앱 동작은 그대로) 종이에서 글씨가 너무 작아지지 않게 함 */
const narrow = (page, css, on = true) => page.evaluate(({ css, on }) => {
  document.getElementById("__narrow")?.remove();
  if (on) { const s = document.createElement("style"); s.id = "__narrow"; s.textContent = css + "{max-width:820px}"; document.head.appendChild(s); }
}, { css, on });

/** 캡처: area 가 있으면 그 영역(+여백)만, 없으면 화면 전체 */
async function shot(page, name, area = null, pad = 22) {
  let clip;
  if (area) {
    const bs = await Promise.all((Array.isArray(area) ? area : [area]).map((a) => a.boundingBox()));
    const x0 = Math.min(...bs.map((r) => r.x)), y0 = Math.min(...bs.map((r) => r.y));
    const b = { x: x0, y: y0, width: Math.max(...bs.map((r) => r.x + r.width)) - x0, height: Math.max(...bs.map((r) => r.y + r.height)) - y0 };
    const vp = page.viewportSize();
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
    clip = { x, y, width: Math.min(vp.width - x, b.width + pad * 2), height: Math.min(vp.height - y, b.height + pad * 2) };
  }
  await page.screenshot({ path: path.join(SHOT_DIR, name + ".jpg"), type: "jpeg", quality: name.startsWith("m-") ? 72 : 80, clip });
  await unmark(page);
  console.log("  📸 " + name);
}
const modal = (page) => page.locator("#modalRoot .modal");
const centerOn = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: "center" })); // 긴 창 안에서 그 부분이 보이게

/* ---------------- 캡처 목록 ---------------- */
export async function captureAll() {
  fs.rmSync(SHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await startServer();
  const browsers = { chromium: await chromium.launch({ args: ["--lang=ko-KR"] }), webkit: await webkit.launch() };
  try {
    let qrFiles = [], patchFile = ""; // PC 에서 만든 QR 사진·패치 파일 (휴대폰 '받기' 화면에도 씀)
    /* 1. 시작하기 */
    {
      const p = await open(browsers, { db: null });
      await p.clock.runFor(600);
      await modal(p).waitFor();
      await mark(p, [{ loc: modal(p).getByRole("button", { name: "내부 (폐쇄망)" }), n: 1 }, { loc: modal(p).getByRole("button", { name: "외부" }), n: 2 }]);
      await shot(p, "start-device", modal(p), 60);
      await p.context().close();
    }
    /* 2. 화면 구성 (PC) */
    {
      const p = await open(browsers);
      await shot(p, "cover"); // 표지용 (번호 표시 없음)
      await mark(p, [
        { loc: p.locator("#devBadge"), n: 1 }, { loc: p.locator("#syncInfo"), n: 2 }, { loc: p.locator(".tabs"), n: 3 },
        { loc: p.locator(".cal-head"), n: 4 }, { loc: p.locator("table.cal"), n: 5, pad: 2 }, { loc: p.locator(".foot"), n: 6, pad: 0 },
      ]);
      await shot(p, "overview");
      /* 일정 막대 모양 (이번 주) */
      const week = cell(p, "2026-11-24").locator("xpath=..");
      await mark(p, [
        { loc: chipOf(p, "2026-11-24", "고객사"), n: 1, side: "right" }, { loc: chipOf(p, "2026-11-23", "스탠드업"), n: 2, side: "right" }, { loc: chipOf(p, "2026-11-25", "협력사"), n: 3, side: "right" },
        { loc: chipOf(p, "2026-11-26", "디자인"), n: 4, side: "right" }, { loc: chipOf(p, "2026-11-27", "디자인"), n: 5, side: "right" }, { loc: chipOf(p, "2026-11-24", "요구사항"), n: 6, side: "right" },
      ]);
      await shot(p, "legend", week, 16);
      /* +N */
      await mark(p, [{ loc: cell(p, "2026-11-20").locator(".more"), n: 1 }]);
      await shot(p, "more", cell(p, "2026-11-20"), 16);
      /* 일정 추가 */
      await cell(p, "2026-11-26").locator(".dnum").click();
      await p.locator("#m_title").fill("주간 보고서 준비");
      await p.locator("#m_start").selectOption("14:00");
      await p.locator("#m_end").selectOption("15:00");
      await p.locator("#m_memo").fill("지난주 실적 정리");
      await p.locator('#m_colors .sw[title="초록"]').click();
      await mark(p, [
        { loc: p.locator("#m_title"), n: 1 }, { loc: p.locator("#m_date").locator("xpath=../.."), n: 2 }, { loc: p.locator("#m_start").locator("xpath=../.."), n: 3 },
        { loc: p.locator("#m_memo"), n: 4 }, { loc: p.locator("#m_colors"), n: 5 }, { loc: p.locator("#m_save"), n: 6 },
      ]);
      await shot(p, "event-add", modal(p));
      /* 반복 일정 등록 */
      await p.locator("#m_title").fill("주간 보고");
      await p.locator('#m_repType [data-rep="weekly"]').click();
      await p.locator('#m_repDays [data-d="2"]').click(); // 목(시작일 요일)에 화 추가
      await p.locator("#m_until").fill("2027-01-28");
      await p.locator("#m_until").dispatchEvent("change");
      await centerOn(p.locator("#m_repPanel"));
      await mark(p, [{ loc: p.locator("#m_repType"), n: 1 }, { loc: p.locator("#m_repDays"), n: 2 }, { loc: p.locator("#m_repWeekdays").locator(".."), n: 3 },
        { loc: p.locator("#m_until"), n: 4 }, { loc: p.locator("#m_repPreview"), n: 5 }]);
      await shot(p, "event-repeat", modal(p));
      /* 매월 반복: 일자 / n째 주 요일 */
      await p.locator('#m_repType [data-rep="monthly"]').click();
      await p.locator('input[name=m_repMon][value="nth"]').check();
      await p.locator("#m_repNthDay").dispatchEvent("change");
      await centerOn(p.locator("#m_repPanel"));
      await mark(p, [{ loc: p.locator("#m_repMonDate").locator(".."), n: 1 }, { loc: p.locator("#m_repNthWeek").locator(".."), n: 2 }, { loc: p.locator("#m_repPreview"), n: 3 }]);
      await shot(p, "event-repeat-monthly", p.locator("#m_repPanel"), 16);
      await p.locator("#m_cancel").click();
      /* 여러 날 일정 (달력) */
      await mark(p, [
        { loc: chipOf(p, "2026-11-16", "교육 과정"), n: 1, side: "right" }, { loc: chipOf(p, "2026-11-17", "교육 과정"), n: 2, side: "right" },
        { loc: chipOf(p, "2026-11-18", "교육 과정"), n: 3, side: "right" }, { loc: chipOf(p, "2026-11-16", "스탠드업"), n: 4 },
      ]);
      await shot(p, "event-multi", cell(p, "2026-11-17").locator("xpath=.."), 16);
      /* 반복 일정의 한 회차 열기 */
      await chipOf(p, "2026-11-30", "스탠드업").click();
      await mark(p, [{ loc: modal(p).locator(".info-line").filter({ hasText: "🔁" }), n: 1 }, { loc: p.locator("#m_scopeRow"), n: 2 }, { loc: p.locator("#m_del"), n: 3 }]);
      await shot(p, "event-series", modal(p));
      await p.locator("#m_cancel").click();
      /* 일정 수정 창 버튼 */
      await chipOf(p, "2026-11-24", "고객사").click();
      await mark(p, [
        { loc: p.locator("#m_asMove").locator(".."), n: 1 }, { loc: p.locator("#m_mt"), n: 2 }, { loc: p.locator("#m_del"), n: 3 },
        { loc: p.locator("#m_done"), n: 4 }, { loc: p.locator("#m_cx"), n: 5 }, { loc: p.locator("#m_save"), n: 6 },
      ]);
      await shot(p, "event-edit", modal(p));
      /* 회의록 작성 (일정에서) */
      await p.locator("#m_mt").click();
      await mark(p, [
        { loc: p.locator("#m_date"), n: 1 }, { loc: p.locator("#m_time"), n: 2 }, { loc: p.locator("#m_ev"), n: 3 }, { loc: p.locator("#m_topic"), n: 4 },
      ]);
      await shot(p, "mt-prefill", modal(p));
      await p.locator("#m_cancel").click();
      /* 취소된 일정 */
      await chipOf(p, "2026-11-25", "협력사").click();
      await mark(p, [{ loc: modal(p).locator("h3"), n: 1 }, { loc: modal(p).locator(".info-line").first(), n: 2 }, { loc: p.locator("#m_cx"), n: 3 }]);
      await shot(p, "cancelled-modal", modal(p));
      await p.locator("#m_cancel").click();
      /* 연기된 일정 */
      await chipOf(p, "2026-11-27", "디자인").click();
      await mark(p, [{ loc: modal(p).locator(".info-line").first(), n: 1 }, { loc: p.locator("#m_clearMove"), n: 2 }, { loc: p.locator("#m_asMove").locator(".."), n: 3 }]);
      await shot(p, "moved-modal", modal(p));
      await p.locator("#m_cancel").click();
      /* 회의록 목록 */
      await tab(p, "mt");
      await narrow(p, "#tab-mt .panel");
      const row = p.locator("#mtBody tr[data-mt]").filter({ hasText: "요구사항 리뷰" });
      await mark(p, [
        { loc: p.locator("#mtSearch"), n: 1 }, { loc: p.locator("#addMt"), n: 2 }, { loc: row.locator("td").nth(2), n: 3 },
        { loc: row.locator(".act-sum"), n: 4 }, { loc: row.getByRole("button", { name: "✎" }), n: 5 },
      ]);
      await shot(p, "mt-list", p.locator("#tab-mt .panel"), 14);
      await narrow(p, "", false);
      /* 회의록 창: 액션아이템 */
      await row.getByRole("button", { name: "✎" }).click();
      await mark(p, [{ loc: p.locator("#m_acts"), n: 1 }, { loc: p.locator("#m_addAct"), n: 2 }, { loc: p.locator("#m_cx").locator(".."), n: 3 }]);
      await shot(p, "mt-actions", modal(p));
      await p.locator("#m_cancel").click();
      /* 할 일 탭 */
      await tab(p, "act");
      await mark(p, [
        { loc: p.locator('.tabs button[data-tab="act"]'), n: 1 }, { loc: p.locator("#actOwner"), n: 2 }, { loc: p.locator("#actFilter"), n: 3 },
        { loc: p.locator("#actList .act-it.overdue").first(), n: 4, side: "right" }, { loc: p.locator("#actList .act-it input[type=checkbox]").first(), n: 5 },
        { loc: p.locator("#actList .act-mt").first(), n: 6 },
      ]);
      await shot(p, "act-tab", [p.locator(".tabs"), p.locator("#tab-act .panel")], 14);
      /* 동기화: 내보내기 */
      await tab(p, "sync");
      await narrow(p, "#tab-sync .panel");
      const exp = p.locator("#tab-sync .panel").first();
      await mark(p, [
        { loc: p.locator("#expFrom").locator("xpath=../.."), n: 1 }, { loc: p.locator("#expChangedOnly").locator("xpath=../.."), n: 2 },
        { loc: p.locator("#expSummary"), n: 3 }, { loc: p.locator("#expFile"), n: 4 }, { loc: p.locator("#expQR"), n: 5 },
      ]);
      await shot(p, "sync-export", exp, 14);
      const imp = p.locator("#tab-sync .panel").nth(1);
      await mark(p, [{ loc: p.locator("#impImgBtn"), n: 1 }, { loc: p.locator("#impFileBtn"), n: 2 }]);
      await shot(p, "sync-import", imp, 14);
      await narrow(p, "", false);
      /* QR 한 장씩 */
      await p.locator("#expChangedOnly").uncheck();
      await p.locator("#expAll").click();
      await p.locator("#expQR").click();
      await modal(p).locator("#qrOneImg img").waitFor();
      await mark(p, [{ loc: p.locator("#qrModeOne"), n: 1 }, { loc: p.locator("#qrOneNum"), n: 2 }, { loc: p.locator("#qrNext"), n: 3 }]);
      await shot(p, "qr-one", modal(p));
      // QR 이미지 파일 (가져오기 진행 화면용)
      const cells = modal(p).locator(".qrcell img");
      qrFiles = [];
      fs.mkdirSync(path.join(SHOT_DIR, "_tmp"), { recursive: true });
      for (let i = 0, n = await cells.count(); i < n; i++) {
        const f = path.join(SHOT_DIR, `_tmp`, `QR사진_${i + 1}.gif`);
        fs.writeFileSync(f, Buffer.from((await cells.nth(i).getAttribute("src")).split(",")[1], "base64"));
        qrFiles.push(f);
      }
      await p.locator("#m_cancel").click(); // '전송 완료' 확인 창은 자동 확인
      // 패치 파일 (미리보기 화면용)
      await p.locator("#expChangedOnly").uncheck();
      const [dl] = await Promise.all([p.waitForEvent("download"), p.locator("#expFile").click()]);
      patchFile = path.join(SHOT_DIR, "_tmp", "psync-내부-패치.json");
      await dl.saveAs(patchFile);
      /* 설정 */
      await tab(p, "set");
      await narrow(p, "#tab-set .panel");
      await mark(p, [{ loc: p.locator("#themeList .theme-card.sel"), n: 1 }]);
      await shot(p, "design", p.locator("#themeList").locator(".."), 14);
      await mark(p, [{ loc: p.locator("#setLabel"), n: 1 }]);
      await shot(p, "device-label", p.locator("#setLabel").locator("xpath=ancestor::div[contains(@class,'panel')]"), 14);
      const bk = p.locator("#backupBtn").locator("xpath=ancestor::div[contains(@class,'panel')]");
      await mark(p, [{ loc: p.locator("#csvBtn"), n: 1 }, { loc: p.locator("#backupBtn"), n: 2 }, { loc: p.locator("#restoreBtn"), n: 3 }, { loc: p.locator("#wipeBtn"), n: 4 }]);
      await shot(p, "backup", bk, 14);
      await narrow(p, "", false);
      await p.context().close();

      /* 받는 PC: QR 사진 일부 누락 → 진행 창 */
      const q = await open(browsers, { db: { ...demoDb("외부"), events: [], meetings: [] } });
      await tab(q, "sync");
      const pick = qrFiles.filter((_, i) => i !== 1 && i !== qrFiles.length - 1);
      await q.locator("#impImg").setInputFiles(pick);
      await q.locator("#impMore").waitFor({ timeout: 60_000 });
      await mark(q, [{ loc: q.locator("#impBar").locator(".."), n: 1 }, { loc: q.locator("#chunkGrid"), n: 2 }, { loc: q.locator("#impMsg"), n: 3 }, { loc: q.locator("#photoLog"), n: 4 }, { loc: q.locator("#impMore"), n: 5 }]);
      await shot(q, "import-progress", modal(q));
      await q.context().close();

      /* 받는 PC: 패치 파일 미리보기 (이미 받은 일정 일부를 이 PC에서도 고친 상태) */
      const other = demoDb("외부");
      // 마지막 동기화(2시간 전) 전에 받아 둔 일정 6건 → '수정', 그중 1건은 이 PC에서도 동기화 후에 고침 → '양쪽수정'
      other.events = other.events.slice(0, 6).map((e) => ({ ...e, updatedAt: TS - 86_400_000 }));
      other.events[1] = { ...other.events[1], title: "킥오프 준비 (외부에서 수정)", updatedAt: TS - 3600_000 };
      other.meetings = [];
      other.lastSyncAt = TS - 2 * 3600_000;
      const r = await open(browsers, { db: other });
      await tab(r, "sync");
      await r.locator("#impFile").setInputFiles(patchFile);
      await modal(r).locator(".rev").waitFor();
      await mark(r, [
        { loc: modal(r).locator(".rev .hd"), n: 1 }, { loc: modal(r).locator(".rev .tag.add").first(), n: 2 },
        { loc: modal(r).locator(".rev .tag.cf").first(), n: 3 }, { loc: r.locator("#m_apply"), n: 4 },
      ]);
      await shot(r, "import-review", modal(r));
      await r.context().close();
    }
    /* ================= 휴대폰 (모바일판 매뉴얼) — 이름은 m- 로 시작, 화면 전체를 찍음 ================= */
    {
      const sheetBottom = (m) => modal(m).evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const into = (loc) => loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const pickDay = async (m, date) => { await cell(m, date).locator(".dnum").click(); await m.waitForTimeout(80); };
      const agendaOpen = async (m, date, title) => { await pickDay(m, date); await m.locator("#agList .ag-it", { hasText: title }).first().click(); await modal(m).waitFor(); };

      const s0 = await open(browsers, { mobile: true, db: null });
      await s0.clock.runFor(600);
      await modal(s0).waitFor();
      await mark(s0, [{ loc: modal(s0).getByRole("button", { name: "내부 (폐쇄망)" }), n: 1 }, { loc: modal(s0).getByRole("button", { name: "외부" }), n: 2 }]);
      await shot(s0, "m-start-device");
      await s0.context().close();

      const m = await open(browsers, { mobile: true });
      await shot(m, "m-cover"); // 표지용 (번호 표시 없음)
      await mark(m, [{ loc: m.locator(".cal-head"), n: 1 }, { loc: m.locator("table.cal"), n: 2, pad: 2 }, { loc: m.locator(".ag-head"), n: 3 }, { loc: m.locator(".tabs"), n: 4, pad: 0 }]);
      await shot(m, "m-overview");
      /* 날짜 선택 → 아래 목록 (막대 모양) */
      await pickDay(m, "2026-11-27");
      await into(m.locator("#agenda"));
      await mark(m, [{ loc: cell(m, "2026-11-27"), n: 1, pad: 1 }, { loc: m.locator("#agList .ag-it").nth(1), n: 2, side: "right" }, { loc: m.locator("#agAdd"), n: 3 }]);
      await shot(m, "m-agenda");
      /* 일정 추가 */
      await m.locator("#agAdd").click();
      await m.locator("#m_title").fill("업체 미팅");
      await m.locator("#m_start").selectOption("14:00");
      await m.locator("#m_end").selectOption("15:00");
      await mark(m, [{ loc: m.locator("#m_title"), n: 1 }, { loc: m.locator("#m_date").locator("xpath=../.."), n: 2 }, { loc: m.locator("#m_start").locator("xpath=../.."), n: 3 }]);
      await shot(m, "m-add");
      await m.locator('#m_repType [data-rep="weekly"]').click();
      await m.locator('#m_repDays [data-d="3"]').click(); // 금(시작일 요일)에 수 추가
      await m.locator("#m_until").fill("2027-01-29");
      await m.locator("#m_until").dispatchEvent("change");
      await into(m.locator("#m_repDays"));
      await mark(m, [{ loc: m.locator("#m_repType"), n: 1 }, { loc: m.locator("#m_repDays"), n: 2 }, { loc: m.locator("#m_repWeekdays").locator(".."), n: 3 },
        { loc: m.locator("#m_until"), n: 4 }, { loc: m.locator("#m_repPreview"), n: 5 }]);
      await shot(m, "m-repeat");
      await m.locator('#m_repType [data-rep="monthly"]').click();
      await m.locator('input[name=m_repMon][value="nth"]').check();
      await m.locator("#m_repNthDay").dispatchEvent("change");
      await into(m.locator("#m_repMonthly"));
      await mark(m, [{ loc: m.locator("#m_repMonDate").locator(".."), n: 1 }, { loc: m.locator("#m_repNthWeek").locator(".."), n: 2 }, { loc: m.locator("#m_repPreview"), n: 3 }]);
      await shot(m, "m-repeat-monthly");
      await m.locator('#m_repType [data-rep=""]').click();
      await m.locator('#m_colors .sw[title="초록"]').click();
      await sheetBottom(m);
      await mark(m, [{ loc: m.locator("#m_memo"), n: 4 }, { loc: m.locator("#m_colors"), n: 5 }, { loc: m.locator("#m_save"), n: 6 }]);
      await shot(m, "m-add-bottom");
      await m.locator("#m_cancel").click();
      /* 여러 날 일정: 가운데 날 선택 */
      await pickDay(m, "2026-11-17");
      await into(m.locator("#agenda"));
      await mark(m, [{ loc: cell(m, "2026-11-17").locator("xpath=.."), n: 1, pad: 1 }, { loc: m.locator("#agList .ag-it", { hasText: "교육 과정" }), n: 2, side: "right" }]);
      await shot(m, "m-multi");
      /* 반복 일정의 한 회차 */
      await agendaOpen(m, "2026-11-30", "스탠드업");
      await into(m.locator("#m_scopeRow"));
      await mark(m, [{ loc: modal(m).locator(".info-line").filter({ hasText: "🔁" }), n: 1 }, { loc: m.locator("#m_scopeRow"), n: 2 }]);
      await shot(m, "m-series");
      await m.locator("#m_cancel").click();
      /* 일정 수정 */
      await agendaOpen(m, "2026-11-24", "고객사");
      await mark(m, [{ loc: m.locator("#m_asMove").locator(".."), n: 1 }]);
      await shot(m, "m-edit-top");
      await sheetBottom(m);
      await mark(m, [{ loc: m.locator("#m_mt"), n: 2 }, { loc: m.locator("#m_del"), n: 3 }, { loc: m.locator("#m_done"), n: 4 }, { loc: m.locator("#m_cx"), n: 5 }, { loc: m.locator("#m_save"), n: 6, side: "right" }]);
      await shot(m, "m-edit");
      /* 회의록 작성 (일정에서) */
      await m.locator("#m_mt").click();
      await mark(m, [{ loc: m.locator("#m_date"), n: 1 }, { loc: m.locator("#m_time"), n: 2 }, { loc: m.locator("#m_ev"), n: 3 }, { loc: m.locator("#m_topic"), n: 4 }]);
      await shot(m, "m-mt-prefill");
      await m.locator("#m_cancel").click();
      /* 취소된 일정 · 연기된 일정 */
      await agendaOpen(m, "2026-11-25", "협력사");
      await mark(m, [{ loc: modal(m).locator("h3"), n: 1 }, { loc: modal(m).locator(".info-line").first(), n: 2 }]);
      await shot(m, "m-cancelled");
      await sheetBottom(m);
      await mark(m, [{ loc: m.locator("#m_cx"), n: 3 }]);
      await shot(m, "m-cancelled-bottom");
      await m.locator("#m_cancel").click();
      await agendaOpen(m, "2026-11-27", "디자인");
      await mark(m, [{ loc: modal(m).locator(".info-line").first(), n: 1 }, { loc: m.locator("#m_clearMove"), n: 2, side: "right" }, { loc: m.locator("#m_asMove").locator(".."), n: 3 }]);
      await shot(m, "m-moved");
      await m.locator("#m_cancel").click();
      /* 회의록 */
      await tab(m, "mt");
      const card = m.locator("#mtBody tr[data-mt]").filter({ hasText: "요구사항 리뷰" });
      await mark(m, [{ loc: m.locator("#addMt"), n: 1 }, { loc: m.locator("#mtSearch"), n: 2 }, { loc: card.locator("td").nth(2), n: 3 }, { loc: card.locator(".act-sum"), n: 4 }, { loc: card.getByRole("button", { name: "✎" }), n: 5, side: "right" }]);
      await shot(m, "m-mt-list");
      await card.getByRole("button", { name: "✎" }).click();
      await into(m.locator("#m_addAct"));
      await mark(m, [{ loc: m.locator("#m_acts"), n: 1 }, { loc: m.locator("#m_addAct"), n: 2 }]);
      await shot(m, "m-mt-actions");
      await m.locator("#m_cancel").click();
      /* 할 일 */
      await tab(m, "act");
      await mark(m, [
        { loc: m.locator('.tabs button[data-tab="act"]'), n: 1, pad: 1 }, { loc: m.locator("#actOwner"), n: 2 }, { loc: m.locator("#actFilter"), n: 3 },
        { loc: m.locator("#actList .act-it.overdue").first(), n: 4, side: "right" }, { loc: m.locator("#actList .act-it input[type=checkbox]").first(), n: 5 },
        { loc: m.locator("#actList .act-mt").first(), n: 6 },
      ]);
      await shot(m, "m-act");
      /* 동기화 */
      await tab(m, "sync");
      await mark(m, [{ loc: m.locator("#expFrom").locator("xpath=../.."), n: 1 }, { loc: m.locator("#expChangedOnly").locator("xpath=../.."), n: 2 }, { loc: m.locator("#expFile"), n: 3 }]);
      await shot(m, "m-sync-export");
      await into(m.locator("#impImgBtn"));
      await mark(m, [{ loc: m.locator("#impImgBtn"), n: 1 }, { loc: m.locator("#impFileBtn"), n: 2 }]);
      await shot(m, "m-sync-import");
      /* 설정 */
      await tab(m, "set");
      await into(m.locator("#themeList"));
      await mark(m, [{ loc: m.locator("#themeList .theme-card.sel"), n: 1 }, { loc: m.locator("#setLabel"), n: 2 }]);
      await shot(m, "m-settings");
      await into(m.locator("#backupBtn"));
      await mark(m, [{ loc: m.locator("#csvBtn"), n: 1 }, { loc: m.locator("#backupBtn"), n: 2 }, { loc: m.locator("#restoreBtn"), n: 3 }, { loc: m.locator("#setVer"), n: 4 }]);
      await shot(m, "m-backup");
      await m.context().close();

      /* 휴대폰에서 받기: QR 사진 일부 누락 · 패치 미리보기 */
      const q = await open(browsers, { mobile: true, db: { ...demoDb("휴대폰"), events: [], meetings: [] } });
      await tab(q, "sync");
      await q.locator("#impImg").setInputFiles(qrFiles.filter((_, i) => i !== 1 && i !== qrFiles.length - 1));
      await q.locator("#impMore").waitFor({ timeout: 60_000 });
      await mark(q, [{ loc: q.locator("#chunkGrid"), n: 1 }, { loc: q.locator("#impMsg"), n: 2 }, { loc: q.locator("#impMore"), n: 3, side: "right" }]);
      await shot(q, "m-import-progress");
      await q.context().close();
      const other = demoDb("휴대폰");
      other.events = []; other.meetings = [];
      const r = await open(browsers, { mobile: true, db: other });
      await tab(r, "sync");
      await r.locator("#impFile").setInputFiles(patchFile);
      await modal(r).locator(".rev").waitFor();
      await mark(r, [{ loc: modal(r).locator(".rev .hd"), n: 1 }, { loc: modal(r).locator(".rev .tag.add").first(), n: 2 }]);
      await shot(r, "m-import-review");
      await sheetBottom(r);
      await mark(r, [{ loc: r.locator("#m_apply"), n: 3, side: "right" }]);
      await shot(r, "m-import-apply");
      await r.context().close();
    }
  } finally {
    await browsers.chromium.close();
    await browsers.webkit.close();
    srv.kill();
    fs.rmSync(path.join(SHOT_DIR, "_tmp"), { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("📸 매뉴얼 화면 캡처");
  await captureAll();
}
