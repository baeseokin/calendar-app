// 화면 E2E: 일정 종료 처리 (하나씩 · 지난 일정 한 번에)
//   기준 시각: 2026-11-24(화) 10:00
import { test, expect, startScenario, makeDb, ev, chip, modalBox, readDb, expectDialog, openEvent, TODAY } from "./support/scenario.js";

test("2-1 일정을 종료 처리하면 흐리게·취소선으로 표시되고, 종료 취소로 되돌릴 수 있다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "2-1_일정_종료_처리", {
    db: makeDb({ events: [ev("2026-11-23", "QA 점검", { start: "15:00", end: "16:00" })] }),
  });
  const c = chip(page, "2026-11-23", "QA 점검");

  await step("23일 'QA 점검' 클릭 → 수정 창에 '✔ 종료 처리' 버튼", async () => {
    await expect(c).not.toHaveClass(/done/);
    await openEvent(page, "2026-11-23", "QA 점검");
    await expect(page.locator("#m_done")).toHaveText("✔ 종료 처리");
  });
  await step("'✔ 종료 처리' → 창 닫힘, 달력에 '✔ 15:00 QA 점검' (흐리게·취소선)", async () => {
    await page.locator("#m_done").click();
    await expect(modalBox(page)).toHaveCount(0);
    await expect(c).toHaveClass(/done/);
    await expect(c).toHaveText("✔ 15:00 QA 점검");
    await expect(c).toHaveCSS("text-decoration-line", "line-through");
    expect((await readDb(page)).events[0].done).toBe(true);
  });
  await step("다시 열면 '✔ 종료됨' 표시와 '↺ 종료 취소' 버튼", async () => {
    await openEvent(page, "2026-11-23", "QA 점검");
    await expect(modalBox(page).getByText("✔ 종료됨")).toBeVisible();
    await expect(page.locator("#m_done")).toHaveText("↺ 종료 취소");
  });
  await step("'↺ 종료 취소' → 원래 표시로 돌아옴", async () => {
    await page.locator("#m_done").click();
    await expect(c).not.toHaveClass(/done/);
    await expect(c).toHaveText("15:00 QA 점검");
    expect((await readDb(page)).events[0].done).toBe(false);
  });
});

test("2-2 '지난 일정 종료'는 끝난 일정만 한 번에 종료 처리한다", async ({ page }, testInfo) => {
  const past = [
    ev("2026-11-23", "어제 회의", { start: "14:00", end: "15:00" }),
    ev("2026-11-20", "지난주 워크숍"),                                  // 종일 · 지난 날짜
    ev(TODAY, "오늘 스탠드업", { start: "09:00", end: "09:30" }),        // 오늘 · 이미 끝남
    ev(TODAY, "오늘 아침 통화", { start: "09:30" }),                     // 오늘 · 종료 시간 없음 → 시작 시간 기준
  ];
  const notPast = [
    ev(TODAY, "오늘 오후 리뷰", { start: "11:00", end: "12:00" }),       // 오늘 · 아직 안 끝남
    ev(TODAY, "오늘 종일 교육"),                                         // 오늘 · 종일 → 다음 날부터
    ev("2026-11-25", "내일 배포", { start: "09:00" }),
  ];
  const already = ev("2026-11-22", "이미 종료된 일정", { done: true });
  const removed = ev("2026-11-21", "삭제된 일정", { deleted: true });
  const { step, dialogs, answerConfirm } = await startScenario(page, testInfo, "2-2_지난_일정_일괄_종료", {
    db: makeDb({ events: [...past, ...notPast, already, removed] }),
  });

  await step("'✔ 지난 일정 종료' → 확인 창 '끝난 일정 4건' → 취소하면 아무것도 바뀌지 않음", async () => {
    answerConfirm(false);
    await page.locator("#closePastBtn").click();
    await expectDialog(dialogs, "끝난 일정 4건을 종료 처리할까요?");
    await expect(page.locator("#calBody .ev.done")).toHaveCount(1); // 원래 종료돼 있던 1건만
  });
  await step("다시 눌러 확인 → 지난 일정 4건 종료 표시", async () => {
    answerConfirm(true);
    await page.locator("#closePastBtn").click();
    await expectDialog(dialogs, "끝난 일정 4건을 종료 처리할까요?");
    await expect(page.locator("#calBody .ev.done")).toHaveCount(5);
    for (const e of past) await expect(chip(page, e.date, e.title)).toHaveClass(/done/);
    for (const e of notPast) await expect(chip(page, e.date, e.title)).not.toHaveClass(/done/);
  });
  await step("저장소: 지난 일정만 done, 나머지·삭제된 일정은 그대로", async () => {
    const byTitle = Object.fromEntries((await readDb(page)).events.map((e) => [e.title, e]));
    for (const e of past) expect(byTitle[e.title].done).toBe(true);
    for (const e of notPast) expect(byTitle[e.title].done).toBeFalsy();
    expect(byTitle["삭제된 일정"].done).toBeFalsy();
    expect(byTitle["어제 회의"].updatedAt).toBeGreaterThan(already.updatedAt); // 동기화로 전달되도록 수정 시각 갱신
  });
});

test("2-3 종료할 지난 일정이 없으면 안내만 한다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "2-3_종료할_일정_없음", {
    db: makeDb({ events: [ev("2026-11-23", "이미 끝냄", { done: true }), ev("2026-11-26", "다음 일정")] }),
  });

  await step("'✔ 지난 일정 종료' → '종료 처리할 지난 일정이 없습니다.'", async () => {
    await page.locator("#closePastBtn").click();
    await expectDialog(dialogs, "종료 처리할 지난 일정이 없습니다.");
    await expect(chip(page, "2026-11-26", "다음 일정")).not.toHaveClass(/done/);
  });
});
