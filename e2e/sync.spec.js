// 화면 E2E: 기기 간 동기화 (파일로 내보내기 → 다른 기기에서 패치 파일 열기 → 미리보기 → 적용)
//   두 기기는 서로 다른 브라우저 컨텍스트(저장소가 분리됨)로 흉내 낸다.
import fs from "fs";
import { test, expect, startScenario, preparePage, openApp, makeDb, ev, mt, openTab, chip, modalBox, readDb, expectDialog, download, expectBarColor, openEvent } from "./support/scenario.js";

/** 같은 기기 설정(화면 크기·UA·터치)으로 두 번째 기기를 연다 */
async function openOtherDevice(browser, testInfo, db) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, baseURL } = testInfo.project.use;
  const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, baseURL, acceptDownloads: true });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await preparePage(page, { db });
  await openApp(page);
  return page;
}

/** 동기화 탭에서 '파일로 내보내기' → 받은 패치 파일 */
async function exportPatchFile(page) {
  await openTab(page, "동기화");
  return download(page, page.locator("#expFile"));
}

/** 동기화 탭에서 패치 파일 열기 → 미리보기 창 */
async function importPatchFile(page, file) {
  await openTab(page, "동기화");
  await page.locator("#impFile").setInputFiles(file);
  await expect(modalBox(page).locator(".rev")).toBeVisible();
}
const reviewItem = (page, text) => modalBox(page).locator(".rev .it", { hasText: text });

test("4-1 내부 기기의 일정·회의록을 파일로 내보내 외부 기기에 가져온다 (종료 상태·막대 색상 포함)", async ({ page, browser }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "4-1_동기화_파일_내보내기_가져오기", {
    db: makeDb({
      deviceLabel: "내부",
      events: [ev("2026-11-23", "보안 점검", { start: "13:00", done: true }), ev("2026-11-26", "고객 보고", { start: "10:00", color: "#d6409f" })],
      meetings: [mt("2026-11-20", "인프라 회의", { check: "- 서버 증설" })],
    }),
  });
  let patch;
  let other;

  await step("[내부] 동기화 탭 → 내보낼 내용 '일정 2건, 회의록 1건'", async () => {
    await openTab(page, "동기화");
    await expect(page.locator("#expSummary")).toContainText("일정 2건, 회의록 1건");
  });
  await step("[내부] '파일로 내보내기' → 패치 파일 저장, '전송 완료로 표시' 확인", async () => {
    patch = await exportPatchFile(page);
    expect(patch.name).toMatch(/^psync-내부-.*\.json$/);
    expect(patch.text).toMatch(/^PSYNC1\|/);
    await expectDialog(dialogs, "전송 완료");
    await expect(page.locator("#expSummary")).toContainText("일정 0건, 회의록 0건"); // 전송 완료 이후 변경분 없음
  });
  other = await openOtherDevice(browser, testInfo, makeDb({ deviceLabel: "외부", deviceId: "dev_other" }));
  await step("[외부] 패치 파일 열기 → 미리보기에 3건 모두 '추가', 종료된 일정은 [종료] 표시", async () => {
    await importPatchFile(other, patch.file);
    await expect(modalBox(other).locator(".tag.add")).toHaveCount(3);
    await expect(reviewItem(other, "보안 점검")).toContainText("[종료]");
    await expect(reviewItem(other, "고객 보고")).not.toContainText("[종료]");
    await expect(reviewItem(other, "인프라 회의")).toBeVisible();
  }, other);
  await step("[외부] '선택 적용' → 달력·회의록에 반영, 종료 상태·막대 색상 유지", async () => {
    await modalBox(other).locator("#m_apply").click();
    await expect(modalBox(other)).toHaveCount(0);
    await openTab(other, "달력");
    await expect(chip(other, "2026-11-23", "보안 점검")).toHaveClass(/done/);
    await expect(chip(other, "2026-11-26", "고객 보고")).not.toHaveClass(/done/);
    await expectBarColor(chip(other, "2026-11-26", "고객 보고"), "#d6409f"); // 막대 색상도 전달
    await expect(other.locator("#footStat")).toHaveText("일정 2 · 회의록 1");
    await expect(other.locator("#syncInfo")).not.toHaveText("마지막 동기화: 없음");
  }, other);
  await other.context().close();
});

test("4-2 내보낸 뒤 수정·삭제한 일정은 다음 내보내기에 변경분으로 포함되어 상대 기기에 반영된다", async ({ page, browser }, testInfo) => {
  const shared = [ev("2026-11-25", "디자인 리뷰", { start: "10:00" }), ev("2026-11-27", "회고")];
  const { step, dialogs } = await startScenario(page, testInfo, "4-2_동기화_수정_삭제_전달", {
    db: makeDb({ deviceLabel: "내부", events: shared.map((e) => ({ ...e })), lastExportAt: shared[0].updatedAt + 1 }),
  });
  let patch;
  let other;

  await step("[내부] 처음에는 변경분 없음 → '파일로 내보내기' 누르면 '내보낼 변경 내용이 없습니다'", async () => {
    await openTab(page, "동기화");
    await expect(page.locator("#expSummary")).toContainText("일정 0건, 회의록 0건");
    await page.locator("#expFile").click();
    await expectDialog(dialogs, "내보낼 변경 내용이 없습니다");
  });
  await step("[내부] 디자인 리뷰 → 종료 처리, 회고 → 삭제", async () => {
    await openTab(page, "달력");
    await openEvent(page, "2026-11-25", "디자인 리뷰");
    await page.locator("#m_done").click();
    await openEvent(page, "2026-11-27", "회고");
    await page.locator("#m_del").click();
    await expect(chip(page, "2026-11-27", "회고")).toHaveCount(0);
  });
  await step("[내부] 내보내기 → 변경분 2건", async () => {
    await openTab(page, "동기화");
    await expect(page.locator("#expSummary")).toContainText("일정 2건, 회의록 0건");
    patch = await exportPatchFile(page);
  });
  other = await openOtherDevice(browser, testInfo, makeDb({ deviceLabel: "외부", deviceId: "dev_other", events: shared.map((e) => ({ ...e })), lastSyncAt: shared[0].updatedAt + 1 }));
  await step("[외부] 이전에 같은 일정을 받아 둔 기기에서 가져오기 → '수정' 1건, '삭제' 1건", async () => {
    await importPatchFile(other, patch.file);
    await expect(reviewItem(other, "디자인 리뷰").locator(".tag.upd")).toBeVisible();
    await expect(reviewItem(other, "디자인 리뷰")).toContainText("[종료]");
    await expect(reviewItem(other, "회고").locator(".tag.del")).toBeVisible();
    await expect(modalBox(other).locator(".rev .tag.cf")).toHaveCount(0); // 외부에서는 마지막 동기화 이후 고친 적 없음 → 충돌 아님
  }, other);
  await step("[외부] 적용 → 디자인 리뷰 종료 표시, 회고 사라짐", async () => {
    await modalBox(other).locator("#m_apply").click();
    await openTab(other, "달력");
    await expect(chip(other, "2026-11-25", "디자인 리뷰")).toHaveClass(/done/);
    await expect(chip(other, "2026-11-27", "회고")).toHaveCount(0);
    const db = await readDb(other);
    expect(db.events.find((e) => e.title === "회고").deleted).toBe(true);
  }, other);
  await other.context().close();
});

test("4-7 v2: 취소·연기·회의록 연결·액션아이템이 상대 기기로 전달되고, 구버전(v1) 패치는 경고와 함께 이 기기의 v2 정보를 지우지 않는다", async ({ page, browser }, testInfo) => {
  const cancelled = ev("2026-11-23", "외부 미팅", { start: "14:00", cancelled: true, cancelReason: "고객사 사정" });
  const moved = ev("2026-11-27", "디자인 리뷰", { start: "13:00", movedFrom: "2026-11-25 10:00" });
  const meeting = mt("2026-11-27", "디자인 리뷰", { time: "13:00", eventId: moved.id,
    actions: [{ id: "a1", text: "시안 수정", owner: "김", due: "2026-11-30", done: false }, { id: "a2", text: "아이콘 교체", owner: "이", due: "", done: true }] });
  const { step } = await startScenario(page, testInfo, "4-7_동기화_v2_정보_전달", {
    db: makeDb({ deviceLabel: "내부", events: [cancelled, moved], meetings: [meeting] }),
  });
  let patch, other;

  await step("[내부] 파일로 내보내기", async () => {
    patch = await exportPatchFile(page);
  });
  other = await openOtherDevice(browser, testInfo, makeDb({ deviceLabel: "외부", deviceId: "dev_other" }));
  await step("[외부] 가져오기 미리보기: [취소]·[연기: 2026-11-25 10:00→]·액션아이템 2건 표시, 구버전 경고 없음", async () => {
    await importPatchFile(other, patch.file);
    await expect(reviewItem(other, "외부 미팅")).toContainText("[취소]");
    const movedRow = modalBox(other).locator(".rev .it").filter({ hasText: "일정" }).filter({ hasText: "디자인 리뷰" }); // 같은 제목의 회의록 행과 구분
    await expect(movedRow).toHaveCount(1);
    await expect(movedRow).toContainText("[연기: 2026-11-25 10:00→] 2026-11-27 13:00 · 디자인 리뷰");
    await expect(modalBox(other).locator(".rev .it").filter({ hasText: "액션아이템 2건" })).toHaveCount(1);
    await expect(modalBox(other)).not.toContainText("구버전(v1)");
  }, other);
  await step("[외부] 적용 → 취소선·연기 흔적·📝 표시, 할 일 탭에 미완료 1건", async () => {
    await modalBox(other).locator("#m_apply").click();
    await openTab(other, "달력");
    await expect(chip(other, "2026-11-23", "외부 미팅")).toHaveClass(/\bcancelled\b/);
    await expect(chip(other, "2026-11-25", "디자인 리뷰")).toHaveClass(/\bmoved\b/);
    await expect(chip(other, "2026-11-27", "디자인 리뷰")).toContainText("📝");
    await openTab(other, "할 일");
    await expect(other.locator("#actCount")).toHaveText("미완료 1건");
    await expect(other.locator("#actList .act-it")).toContainText("시안 수정");
  }, other);
  await step("[외부] 구버전(v1) 앱이 보낸 패치(외부 미팅 메모만 수정)를 가져오기 → '구버전(v1)' 경고", async () => {
    // v1 앱의 압축 포맷: 일정 배열 끝에 취소·연기 칸이 없음
    const text = await other.evaluate((id) => "PSYNC1|" + LZString.compressToBase64(JSON.stringify({
      v: 1, t: "PSYNC1", f: ["dev_old", "구버전 PC"], g: Date.now(), sc: ["", "", 0],
      e: [[id, "2026-11-23", "14:00", "", "외부 미팅", "v1 에서 고친 메모", Date.now() + 1000, 0, 0, ""]], m: [] })), cancelled.id);
    const file = testInfo.outputPath("v1-patch.json");
    fs.writeFileSync(file, text);
    await openTab(other, "동기화");
    await other.locator("#impFile").setInputFiles(file);
    await expect(modalBox(other)).toContainText("구버전(v1) 앱에서 보낸 패치입니다");
    await expect(reviewItem(other, "외부 미팅").locator(".tag.upd")).toBeVisible();
  }, other);
  await step("[외부] 적용 → 메모는 바뀌고 '취소'·취소 사유는 그대로 유지", async () => {
    await modalBox(other).locator("#m_apply").click();
    const e = (await readDb(other)).events.find((x) => x.id === cancelled.id);
    expect(e).toMatchObject({ memo: "v1 에서 고친 메모", cancelled: true, cancelReason: "고객사 사정" });
    await openTab(other, "달력");
    await expect(chip(other, "2026-11-23", "외부 미팅")).toHaveClass(/\bcancelled\b/);
  }, other);
  await other.context().close();
});

test("4-8 v2.1: 여러 날·반복 정보가 상대 기기로 전달되고, v2.0 앱이 보낸 패치는 이 정보를 지우지 않는다", async ({ page, browser }, testInfo) => {
  const trip = ev("2026-11-25", "출장", { start: "09:00", end: "18:00", endDate: "2026-11-27" });
  const weekly = ["2026-11-24", "2026-12-01"].map((d) => ev(d, "주간 회의", { start: "10:00", seriesId: "s_w", repeat: "weekly:2:2026-12-01" }));
  const { step } = await startScenario(page, testInfo, "4-8_동기화_여러날_반복", { db: makeDb({ deviceLabel: "내부", events: [trip, ...weekly] }) });
  let patch, other;

  await step("[내부] 파일로 내보내기", async () => { patch = await exportPatchFile(page); });
  other = await openOtherDevice(browser, testInfo, makeDb({ deviceLabel: "외부", deviceId: "dev_other" }));
  await step("[외부] 미리보기: '11/25 09:00 ~ 11/27 18:00 · 출장', 반복 회차에 🔁", async () => {
    await importPatchFile(other, patch.file);
    await expect(reviewItem(other, "출장")).toContainText("11/25 09:00 ~ 11/27 18:00 · 출장");
    await expect(modalBox(other).locator(".rev .it").filter({ hasText: "주간 회의 🔁" })).toHaveCount(2);
  }, other);
  await step("[외부] 적용 → 출장이 25~27일에 걸쳐 표시, 주간 회의는 같은 반복 묶음", async () => {
    await modalBox(other).locator("#m_apply").click();
    await openTab(other, "달력");
    await expect(chip(other, "2026-11-26", "출장")).toHaveText("↳ 출장");
    await expect(chip(other, "2026-11-27", "출장")).toHaveText("↳ 출장 ~18:00");
    const es = (await readDb(other)).events;
    expect(es.find((e) => e.id === trip.id).endDate).toBe("2026-11-27");
    expect(es.filter((e) => e.seriesId === "s_w")).toHaveLength(2);
  }, other);
  await step("[외부] v2.0 앱이 보낸 패치(출장 메모만 수정, 여러 날·반복 칸 없음) 적용 → 종료일·반복 묶음 유지", async () => {
    const text = await other.evaluate(({ trip, w }) => "PSYNC1|" + LZString.compressToBase64(JSON.stringify({
      v: 2, t: "PSYNC1", f: ["dev_v20", "v2.0 PC"], g: Date.now(), sc: ["", "", 0],
      e: [[trip, "2026-11-25", "09:00", "18:00", "출장", "v2.0 에서 고친 메모", Date.now() + 1000, 0, 0, "", 0, "", ""],
          [w, "2026-11-24", "10:00", "", "주간 회의", "", Date.now() + 1000, 0, 0, "", 0, "", ""]], m: [] })), { trip: trip.id, w: weekly[0].id });
    const file = testInfo.outputPath("v20-patch.json");
    fs.writeFileSync(file, text);
    await importPatchFile(other, file);
    await modalBox(other).locator("#m_apply").click();
    const es = (await readDb(other)).events;
    expect(es.find((e) => e.id === trip.id)).toMatchObject({ memo: "v2.0 에서 고친 메모", endDate: "2026-11-27" });
    expect(es.find((e) => e.id === weekly[0].id)).toMatchObject({ seriesId: "s_w", repeat: "weekly:2:2026-12-01" });
  }, other);
  await other.context().close();
});
