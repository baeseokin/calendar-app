// 화면 E2E: v2 기능 — 일정 취소 · 일정 연기 · 일정↔회의록 연결 · 액션아이템(할 일)
//   기준 시각: 2026-11-24(화) 10:00
import { test, expect, startScenario, makeDb, ev, mt, openTab, chip, openEvent, modalBox, readDb, expectDialog, TODAY } from "./support/scenario.js";

const findEv = async (page, title) => (await readDb(page)).events.find((e) => e.title === title);

test("8-1 일정을 취소 처리하면 사유와 함께 취소선으로 남고, '지난 일정 종료'에서 빠지며, 취소를 해제할 수 있다", async ({ page }, testInfo) => {
  const { step, dialogs, answerPrompt } = await startScenario(page, testInfo, "8-1_일정_취소", {
    db: makeDb({ events: [ev("2026-11-23", "외부 미팅", { start: "14:00", end: "15:00" }), ev("2026-11-20", "주간 보고", { start: "09:00" })] }),
  });
  const c = () => chip(page, "2026-11-23", "외부 미팅");

  await step("23일 '외부 미팅' → '✕ 취소 처리' → 사유 입력 → 달력에 '✕' 취소선", async () => {
    await openEvent(page, "2026-11-23", "외부 미팅");
    answerPrompt("고객사 일정 변경");
    await page.locator("#m_cx").click();
    await expectDialog(dialogs, "취소 사유를 입력하세요");
    await expect(modalBox(page)).toHaveCount(0);
    await expect(c()).toHaveClass(/\bcancelled\b/);
    await expect(c()).toContainText("✕ 14:00 외부 미팅");
    await expect(c()).toHaveCSS("text-decoration-line", "line-through");
    expect(await findEv(page, "외부 미팅")).toMatchObject({ cancelled: true, cancelReason: "고객사 일정 변경", deleted: false });
  });
  await step("다시 열면 '✕ 취소됨'·취소 사유 표시, '종료 처리' 버튼 없음, '↺ 취소 해제' 버튼", async () => {
    await openEvent(page, "2026-11-23", "외부 미팅");
    await expect(modalBox(page).getByText("✕ 취소됨")).toBeVisible();
    await expect(modalBox(page)).toContainText("취소 사유: 고객사 일정 변경");
    await expect(page.locator("#m_done")).toHaveCount(0);
    await expect(page.locator("#m_cx")).toHaveText("↺ 취소 해제");
    await page.locator("#m_cancel").click();
  });
  await step("'지난 일정 종료' → 취소된 일정은 빼고 1건(주간 보고)만", async () => {
    await page.locator("#closePastBtn").click();
    await expectDialog(dialogs, "끝난 일정 1건을 종료 처리할까요?");
    await expect(chip(page, "2026-11-20", "주간 보고")).toHaveClass(/\bdone\b/);
    await expect(c()).not.toHaveClass(/\bdone\b/);
  });
  await step("'↺ 취소 해제' → 취소선 없어지고 사유도 지워짐", async () => {
    await openEvent(page, "2026-11-23", "외부 미팅");
    await page.locator("#m_cx").click();
    await expect(c()).not.toHaveClass(/\bcancelled\b/);
    await expect(c()).toHaveText("14:00 외부 미팅");
    expect(await findEv(page, "외부 미팅")).toMatchObject({ cancelled: false, cancelReason: "" });
  });
});

test("8-2 날짜·시간을 바꾸면 '연기'로 기록되어 원래 자리에 흔적이 남고, 끄거나 지우거나 되돌릴 수 있다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "8-2_일정_연기", {
    db: makeDb({ events: [ev("2026-11-25", "디자인 리뷰", { start: "10:00", end: "11:00" }), ev("2026-11-26", "QA 점검", { start: "15:00" })] }),
  });

  await step("'디자인 리뷰' 25일 10:00 → 27일 13:00 (연기 기록 기본 체크) → 27일 '↪', 25일 흔적 '→ 11/27'", async () => {
    await openEvent(page, "2026-11-25", "디자인 리뷰");
    await expect(page.locator("#m_asMove")).toBeChecked();
    await page.locator("#m_date").fill("2026-11-27");
    await page.locator("#m_start").selectOption("13:00");
    await page.locator("#m_end").selectOption("14:00");
    await page.locator("#m_save").click();
    const moved = chip(page, "2026-11-27", "디자인 리뷰");
    await expect(moved).toContainText("↪ 13:00 디자인 리뷰");
    await expect(moved).not.toHaveClass(/\bmoved\b/);
    const ghost = chip(page, "2026-11-25", "디자인 리뷰");
    await expect(ghost).toHaveClass(/\bmoved\b/);
    await expect(ghost).toContainText("10:00 디자인 리뷰 → 11/27");
    expect((await findEv(page, "디자인 리뷰")).movedFrom).toBe("2026-11-25 10:00");
  });
  await step("27일 일정 열기 → '원래 일정 11/25 10:00 → 지금 11/27 13:00' → '연기 표시 지우기' → 25일 흔적 사라짐", async () => {
    await openEvent(page, "2026-11-27", "디자인 리뷰");
    await expect(modalBox(page)).toContainText("원래 일정: 11/25 10:00 → 지금 11/27 13:00");
    await page.locator("#m_clearMove").click();
    await expect(page.locator("#m_clearMove")).toHaveCount(0); // 창이 다시 열리며 연기 표시가 없어짐
    await page.locator("#m_cancel").click();
    await expect(chip(page, "2026-11-25", "디자인 리뷰")).toHaveCount(0);
    expect((await findEv(page, "디자인 리뷰")).movedFrom).toBe("");
  });
  await step("'QA 점검'은 연기 기록 체크를 끄고 26일 → 28일 → 흔적 없이 옮겨짐 (단순 수정)", async () => {
    await openEvent(page, "2026-11-26", "QA 점검");
    await page.locator("#m_asMove").uncheck();
    await page.locator("#m_date").fill("2026-11-28");
    await page.locator("#m_save").click();
    await expect(chip(page, "2026-11-28", "QA 점검")).toBeVisible();
    await expect(chip(page, "2026-11-26", "QA 점검")).toHaveCount(0);
    expect((await findEv(page, "QA 점검")).movedFrom || "").toBe("");
  });
  await step("'QA 점검' 28일 → 30일 연기 후 다시 28일로 되돌리면 연기 표시가 풀림", async () => {
    await openEvent(page, "2026-11-28", "QA 점검");
    await page.locator("#m_date").fill("2026-11-30");
    await page.locator("#m_save").click();
    await expect(chip(page, "2026-11-28", "QA 점검")).toHaveClass(/\bmoved\b/);
    await openEvent(page, "2026-11-30", "QA 점검");
    await page.locator("#m_date").fill("2026-11-28");
    await page.locator("#m_save").click();
    await expect(chip(page, "2026-11-28", "QA 점검")).not.toHaveClass(/\bmoved\b/);
    await expect(chip(page, "2026-11-30", "QA 점검")).toHaveCount(0);
    expect((await findEv(page, "QA 점검")).movedFrom).toBe("");
  });
});

test("8-3 일정에서 '회의록 작성'으로 연결된 회의록을 만들면 달력에 📝, 회의록에 🔗 가 표시되고 서로 열 수 있다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "8-3_일정_회의록_연결", {
    db: makeDb({ events: [ev(TODAY, "요구사항 회의", { start: "14:00", end: "15:30" })] }),
  });
  let evId;

  await step("'요구사항 회의' 열기 → '회의록: 없음' · '📝 회의록 작성'", async () => {
    evId = (await findEv(page, "요구사항 회의")).id;
    await openEvent(page, TODAY, "요구사항 회의");
    await expect(modalBox(page)).toContainText("회의록: 없음");
    await expect(page.locator("#m_mt")).toHaveText("📝 회의록 작성");
  });
  await step("'📝 회의록 작성' → 일자·시간·주제·연결된 일정이 채워진 '회의 추가' 창", async () => {
    await page.locator("#m_mt").click();
    await expect(modalBox(page).getByRole("heading", { name: "회의 추가" })).toBeVisible();
    await expect(page.locator("#m_date")).toHaveValue(TODAY);
    await expect(page.locator("#m_time")).toHaveValue("14:00~15:30");
    await expect(page.locator("#m_topic")).toHaveValue("요구사항 회의");
    await expect(page.locator("#m_ev")).toHaveValue(evId);
  });
  await step("확인 사항 입력 후 저장 → 달력 일정에 📝", async () => {
    await page.locator("#m_check").fill("- 로그인은 SSO");
    await page.locator("#m_save").click();
    await expect(chip(page, TODAY, "요구사항 회의")).toContainText("📝");
    expect((await readDb(page)).meetings[0]).toMatchObject({ eventId: evId, topic: "요구사항 회의" });
  });
  await step("회의록 탭: 주제 옆 🔗 (연결된 일정)", async () => {
    await openTab(page, "회의록");
    await expect(page.locator("#mtBody tr[data-mt]").first()).toContainText("요구사항 회의 🔗");
  });
  await step("달력에서 일정 다시 열기 → '회의록: 요구사항 회의' · '📝 회의록 열기' → 회의 수정 창", async () => {
    await openTab(page, "달력");
    await openEvent(page, TODAY, "요구사항 회의");
    await expect(modalBox(page)).toContainText("회의록: 요구사항 회의");
    await page.locator("#m_mt").click();
    await expect(modalBox(page).getByRole("heading", { name: "회의 수정" })).toBeVisible();
    await expect(page.locator("#m_check")).toHaveValue("- 로그인은 SSO");
  });
  await step("회의 수정에서 '(연결 안 함)'으로 저장 → 달력 📝 사라짐", async () => {
    await page.locator("#m_ev").selectOption("");
    await page.locator("#m_save").click();
    await openTab(page, "달력");
    await expect(chip(page, TODAY, "요구사항 회의")).not.toContainText("📝");
  });
});

test("8-4 회의록의 액션아이템을 '할 일' 탭에서 모아 보고 완료 처리한다 (기한 지남 표시·담당자 필터·취소된 회의 제외)", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "8-4_액션아이템", {
    db: makeDb({
      meetings: [
        mt("2026-11-20", "인프라 회의", {
          time: "10:00",
          actions: [
            { id: "a1", text: "서버 견적 요청", owner: "김", due: "2026-11-21", done: false },
            { id: "a2", text: "백업 정책 문서", owner: "이", due: "2026-11-30", done: false },
            { id: "a3", text: "모니터링 구축", owner: "김", due: "", done: true },
          ],
        }),
        mt("2026-11-18", "열리지 않은 회의", { cancelled: true, actions: [{ id: "a4", text: "무시될 항목", owner: "박", due: "", done: false }] }),
      ],
    }),
  });
  const items = () => page.locator("#actList .act-it");
  const item = (text) => items().filter({ hasText: text });

  await step("탭 이름 '✅ 할 일 2' → 할 일 탭: 미완료 2건 · 기한 지남 1건, 취소된 회의 항목 없음", async () => {
    await expect(page.locator('.tabs button[data-tab="act"]')).toHaveText("✅ 할 일 2");
    await openTab(page, "할 일");
    await expect(page.locator("#actCount")).toHaveText("미완료 2건 · 기한 지남 1건");
    await expect(items()).toHaveCount(2);
    await expect(item("서버 견적 요청")).toHaveClass(/\boverdue\b/);
    await expect(item("서버 견적 요청")).toContainText("2026-11-21 (지남)");
    await expect(item("백업 정책 문서")).not.toHaveClass(/\boverdue\b/);
    await expect(item("무시될 항목")).toHaveCount(0);
  });
  await step("'전체' → 3건, 담당자 목록은 김·이 (취소된 회의의 '박' 제외) → '김' 선택 → 2건", async () => {
    await page.locator("#actFilter").selectOption("all");
    await expect(items()).toHaveCount(3);
    await expect(page.locator("#actOwner option")).toHaveText(["담당자 전체", "김", "이"]);
    await page.locator("#actOwner").selectOption("김");
    await expect(items()).toHaveCount(2);
    await expect(item("백업 정책 문서")).toHaveCount(0);
  });
  await step("미완료·담당자 전체로 돌아와 '서버 견적 요청' 완료 체크 → 미완료 1건, 탭 '✅ 할 일 1'", async () => {
    await page.locator("#actFilter").selectOption("open");
    await page.locator("#actOwner").selectOption("");
    await item("서버 견적 요청").locator("input[type=checkbox]").click(); // 체크하면 '미완료만' 목록에서 바로 빠지므로 check() 대신 click 후 결과 확인
    await expect(page.locator("#actCount")).toHaveText("미완료 1건");
    await expect(items()).toHaveCount(1);
    await expect(page.locator('.tabs button[data-tab="act"]')).toHaveText("✅ 할 일 1");
    const m = (await readDb(page)).meetings.find((x) => x.topic === "인프라 회의");
    expect(m.actions.find((a) => a.id === "a1").done).toBe(true);
  });
  await step("회의록 탭: 요약에 ☑ 서버 견적 요청(완료)·☐ 백업 정책 문서", async () => {
    await openTab(page, "회의록");
    const row = page.locator("#mtBody tr[data-mt]").filter({ hasText: "인프라 회의" });
    await expect(row.locator(".act-sum .dn")).toHaveCount(2); // 서버 견적 요청 + 원래 완료였던 모니터링 구축
    await expect(row.locator(".act-sum")).toContainText("☑ 서버 견적 요청");
    await expect(row.locator(".act-sum")).toContainText("☐ 백업 정책 문서 (이, ~11/30)");
  });
  await step("회의록 수정 → '+ 액션아이템 추가' (보고서 작성 · 최 · 12/1) → 할 일 탭에 추가", async () => {
    await page.locator("#mtBody tr[data-mt]").filter({ hasText: "인프라 회의" }).getByRole("button", { name: "✎" }).click();
    await expect(page.locator("#m_acts .act-row")).toHaveCount(3);
    await page.locator("#m_addAct").click();
    const row = page.locator("#m_acts .act-row").last();
    await row.locator(".a-text").fill("보고서 작성");
    await row.locator(".a-owner").fill("최");
    await row.locator(".a-due").fill("2026-12-01");
    await page.locator("#m_save").click();
    await openTab(page, "할 일");
    await expect(page.locator("#actCount")).toHaveText("미완료 2건");
    await expect(item("보고서 작성")).toContainText("👤 최");
    await expect(item("보고서 작성")).toContainText("📅 2026-12-01");
  });
});
