// 화면 E2E: 기기별 레이아웃 (PC · 태블릿 · 모바일)
//   각 케이스는 제목의 기기 태그(@pc / @tablet / @mobile)에 해당하는 프로젝트에서만 실행된다 (playwright.config.js).
import { test, expect, startScenario, makeDb, ev, mt, openTab, dayCell, chip, selectDay, clickDay, agendaItem, modalBox, readDb, swipe, TODAY } from "./support/scenario.js";

const box = (loc) => loc.boundingBox();
/** 가로 스크롤 없이 화면 폭 안에 들어오는지 */
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sample = () =>
  makeDb({
    events: [
      ev(TODAY, "스탠드업", { start: "09:00", end: "09:30", memo: "진행 현황 공유", color: "#3e63dd" }),
      ev(TODAY, "고객 미팅", { start: "14:00", end: "15:00", color: "#d6409f" }),
      ev(TODAY, "종일 교육"),
      ev("2026-11-26", "배포", { start: "21:00", color: "#e5484d" }),
    ],
    meetings: [mt("2026-11-20", "인프라 회의", { time: "10:00", check: "- 서버 증설\n- 백업 2회", note: "예산 승인 필요" })],
  });

test("7-1 PC: 상단 탭, 하단 안내줄, 넓은 달력에 일정 제목 표시, 가운데 모달 @pc", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "7-1_PC_레이아웃", { db: sample() });

  await step("탭은 머리글 아래(위쪽), 하단 안내줄·'날짜 칸을 클릭하면' 안내 표시, 모바일 일정 목록은 숨김", async () => {
    const tabs = await box(page.locator(".tabs"));
    expect(tabs.y).toBeLessThan(120);
    await expect(page.locator(".foot")).toBeVisible();
    await expect(page.locator(".cal-head .hint")).toBeVisible();
    await expect(page.locator("#agenda")).toBeHidden();
  });
  await step("달력 칸에 시간·제목이 보이는 일정 막대 (글자 11px)", async () => {
    const c = chip(page, TODAY, "스탠드업");
    await expect(c).toHaveText("09:00 스탠드업");
    await expect(c).toHaveCSS("font-size", "11px");
    expect((await box(c)).height).toBeGreaterThan(12);
  });
  await step("날짜 칸 클릭 → 화면 가운데 '일정 추가' 창", async () => {
    await clickDay(page, "2026-11-27");
    const m = await box(modalBox(page));
    const vp = page.viewportSize();
    expect(Math.abs(m.x + m.width / 2 - vp.width / 2)).toBeLessThan(4);
    expect(m.y + m.height).toBeLessThan(vp.height - 40);
    expect(m.width).toBeLessThanOrEqual(520);
  });
  await step("회의록: 표(머리글 있음)로 표시", async () => {
    await page.locator("#m_cancel").click();
    await openTab(page, "회의록");
    await expect(page.locator("table.mt thead")).toBeVisible();
    await expect(page.locator("#mtBody tr[data-mt]").first()).toHaveCSS("display", "table-row");
  });
});

test("7-2 태블릿: 터치하기 좋은 버튼 크기, 달력에 일정 제목 표시, 회의록은 표 @tablet", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "7-2_태블릿_레이아웃", { db: sample() });

  await step("탭은 위쪽, 가로 스크롤 없음, 좁은 화면용으로 달력 안내 문구 숨김", async () => {
    expect((await box(page.locator(".tabs"))).y).toBeLessThan(120);
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect(page.locator(".cal-head .hint")).toBeHidden();
    await expect(page.locator("#agenda")).toBeHidden();
  });
  await step("버튼 높이 34px 이상 (손가락으로 누르기 좋게)", async () => {
    for (const id of ["#prevM", "#nextM", "#todayBtn", "#closePastBtn", "#themeBtn"]) {
      expect((await box(page.locator(id))).height, id).toBeGreaterThanOrEqual(34);
    }
    expect((await box(page.locator(".tabs button").first())).height).toBeGreaterThanOrEqual(40);
  });
  await step("달력 칸의 일정 막대에 시간·제목 표시 (글자 10.5px)", async () => {
    const c = chip(page, TODAY, "고객 미팅");
    await expect(c).toBeVisible();
    await expect(c).toHaveCSS("font-size", "10.5px");
    expect((await box(c)).height).toBeGreaterThan(12);
  });
  await step("날짜 칸을 누르면 바로 '일정 추가' 창 (모바일처럼 목록을 거치지 않음)", async () => {
    await dayCell(page, "2026-11-27").locator(".dnum").click();
    await expect(modalBox(page).getByRole("heading", { name: "일정 추가" })).toBeVisible();
    await page.locator("#m_cancel").click();
  });
  await step("회의록: 표(머리글 있음), 가로 스크롤 없음", async () => {
    await openTab(page, "회의록");
    await expect(page.locator("table.mt thead")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  });
});

test("7-3 모바일: 하단 탭바, 달력은 색 막대만, 날짜를 누르면 아래에 그 날 일정 목록 @mobile", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "7-3_모바일_달력_일정목록", { db: sample() });

  await step("탭은 화면 맨 아래 고정, 하단 안내줄 숨김, 가로 스크롤 없음", async () => {
    const tabs = await box(page.locator(".tabs"));
    expect(Math.abs(tabs.y + tabs.height - page.viewportSize().height)).toBeLessThan(2);
    await expect(page.locator(".foot")).toBeHidden();
    expect(await noHorizontalScroll(page)).toBe(true);
  });
  await step("달력 칸에는 글자 없이 색 막대만 (높이 5px)", async () => {
    const c = chip(page, TODAY, "스탠드업");
    await expect(c).toBeVisible();
    await expect(c).toHaveCSS("font-size", "0px");
    expect(Math.round((await box(c)).height)).toBe(5);
  });
  await step("처음에는 오늘이 선택되어 아래에 '11월 24일 (화)' 일정 3건 (시간순, 종일 표시, 메모)", async () => {
    await expect(dayCell(page, TODAY)).toHaveClass(/\bsel\b/);
    await expect(page.locator("#agTitle")).toHaveText("11월 24일 (화)");
    const items = page.locator("#agList .ag-it");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("종일");
    await expect(items.nth(1)).toContainText("09:00~09:30");
    await expect(items.nth(1)).toContainText("진행 현황 공유");
    await expect(items.nth(2)).toContainText("14:00~15:00");
  });
  await step("26일 칸 누르기 → 선택 이동, 목록은 '배포' 1건 (창은 열리지 않음)", async () => {
    await selectDay(page, "2026-11-26");
    await expect(dayCell(page, TODAY)).not.toHaveClass(/\bsel\b/);
    await expect(page.locator("#agTitle")).toHaveText("11월 26일 (목)");
    await expect(page.locator("#agList .ag-it")).toHaveCount(1);
    await expect(agendaItem(page, "배포")).toContainText("21:00");
    await expect(modalBox(page)).toHaveCount(0);
  });
  await step("일정이 없는 날 → '일정이 없습니다.'", async () => {
    await selectDay(page, "2026-11-27");
    await expect(page.locator("#agList")).toHaveText("일정이 없습니다.");
  });
  await step("'+ 일정 추가' → 아래에서 올라오는 창, 날짜는 선택한 27일", async () => {
    await page.locator("#agAdd").click();
    await expect(page.locator("#m_date")).toHaveValue("2026-11-27");
    const m = await box(modalBox(page));
    const vp = page.viewportSize();
    expect(Math.abs(m.y + m.height - vp.height)).toBeLessThan(2); // 화면 아래에 붙음
    expect(Math.round(m.width)).toBe(vp.width);                  // 화면 폭 전체
  });
  await step("제목 입력 후 저장 → 아래 목록과 달력 막대에 바로 반영", async () => {
    await page.locator("#m_title").fill("회고");
    await page.locator("#m_save").click();
    await expect(agendaItem(page, "회고")).toContainText("종일");
    await expect(chip(page, "2026-11-27", "회고")).toBeVisible();
    expect((await readDb(page)).events.some((e) => e.title === "회고" && e.date === "2026-11-27")).toBe(true);
  });
  await step("다음 달로 이동 → 그 달 1일이 선택됨", async () => {
    await page.locator("#nextM").click();
    await expect(dayCell(page, "2026-12-01")).toHaveClass(/\bsel\b/);
    await expect(page.locator("#agTitle")).toHaveText("12월 1일 (화)");
  });
});

test("7-4 모바일: 일정이 많으면 막대 몇 개 + '+N', 아래 목록에는 전부 표시 @mobile", async ({ page }, testInfo) => {
  const titles = ["스탠드업", "고객 미팅", "디자인 리뷰", "코드 리뷰", "QA 점검", "배포", "회고", "교육"];
  const { step } = await startScenario(page, testInfo, "7-4_모바일_+N과_목록", {
    db: makeDb({ events: titles.map((t, i) => ev(TODAY, t, { start: `${String(9 + i).padStart(2, "0")}:00` })) }),
  });

  await step("오늘 칸: 막대 + '+N' 이 칸 안에 들어가고 합계 8", async () => {
    const r = await expect.poll(() => dayCell(page, TODAY).locator(".evs").evaluate((b) => {
      const vis = [...b.children].filter((c) => !c.classList.contains("hidden"));
      const shown = vis.filter((c) => c.classList.contains("ev")).length;
      const more = b.querySelector(".more:not(.hidden)");
      const n = more ? Number(more.textContent.replace("+", "")) : 0;
      const over = vis.some((c) => c.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom + 0.5);
      return shown + n === 8 && n > 0 && !over;
    })).toBe(true);
  });
  await step("아래 목록에는 8건 모두 시간순으로", async () => {
    await expect(page.locator("#agList .ag-it")).toHaveCount(8);
    await expect(page.locator("#agList .ag-it").first()).toContainText("09:00");
    await expect(page.locator("#agList .ag-it").last()).toContainText("16:00");
  });
});

test("7-5 모바일: 회의록은 카드 목록으로 표시된다 @mobile", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "7-5_모바일_회의록_카드", { db: sample() });

  await step("회의록 탭 → 표 머리글 없이 카드, 수정 버튼은 카드 오른쪽 위, 가로 스크롤 없음", async () => {
    await openTab(page, "회의록");
    await expect(page.locator("table.mt thead")).toBeHidden();
    const card = page.locator("#mtBody tr[data-mt]").first();
    await expect(card).toHaveCSS("display", "block");
    await expect(card).toContainText("인프라 회의");
    await expect(card.locator("td.check")).toHaveText("- 서버 증설\n- 백업 2회");
    const c = await box(card), b = await box(card.getByRole("button", { name: "✎" }));
    expect(b.x + b.width).toBeGreaterThan(c.x + c.width - 50);
    expect(b.y).toBeLessThan(c.y + 40);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
  await step("검색칸은 다음 줄에 패널 폭 전체로", async () => {
    const s = await box(page.locator("#mtSearch")), add = await box(page.locator("#addMt"));
    const panel = await box(page.locator("#tab-mt .panel"));
    expect(s.width).toBeGreaterThan(panel.width - 40);
    expect(s.y).toBeGreaterThan(add.y + add.height - 1);
  });
});

test("7-6 터치 기기: 달력을 좌우로 밀면 다음 달·이전 달로 넘어간다 @mobile @tablet", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "7-6_좌우로_밀어_달_이동", {
    db: makeDb({ events: [ev("2026-12-15", "연말 결산"), ev("2026-10-20", "중간 점검")] }),
  });
  const title = page.locator("#calTitle");
  const w = (await page.locator("table.cal").boundingBox()).width;

  await step("왼쪽으로 밀기 → 2026년 12월, 그 달 일정 표시", async () => {
    await swipe(page, -w * 0.5);
    await expect(title).toHaveText("2026년 12월");
    await expect(chip(page, "2026-12-15", "연말 결산")).toBeVisible();
  });
  await step("오른쪽으로 두 번 밀기 → 2026년 10월", async () => {
    await swipe(page, w * 0.5);
    await expect(title).toHaveText("2026년 11월");
    await swipe(page, w * 0.5);
    await expect(title).toHaveText("2026년 10월");
    await expect(chip(page, "2026-10-20", "중간 점검")).toBeVisible();
  });
  await step("빠르게 짧게 튕기기(35px, 0.2초) → 다음 달 11월", async () => {
    await swipe(page, -35, 0, { duration: 200 });
    await expect(title).toHaveText("2026년 11월");
  });
  await step("천천히 짧게 끌기(35px) · 세로로 더 많이 끌기 → 넘어가지 않고 제자리", async () => {
    await swipe(page, -35, 0, { duration: 600 });
    await swipe(page, -60, 160);
    await expect(title).toHaveText("2026년 11월");
    await expect(page.locator("table.cal")).toHaveCSS("opacity", "1");
  });
  await step("날짜 칸 위에서 밀고 손을 떼도 그 칸을 누른 것으로 처리하지 않음 (태블릿: 일정 추가 창이 안 열림)", async () => {
    await swipe(page, -w * 0.5, 0, { at: "2026-11-18", click: true }); // 손을 뗄 때 브라우저가 보내는 click 까지 흉내
    await expect(title).toHaveText("2026년 12월");
    await expect(modalBox(page)).toHaveCount(0);
    await expect(page.locator("#calBody td.sel")).toHaveAttribute("data-date", "2026-12-01"); // 달이 바뀌면 그 달 1일 선택
  });
  await step("밀지 않고 날짜 칸을 그냥 누르면 평소대로 동작", async () => {
    await clickDay(page, "2026-12-10");
    await expect(page.locator("#m_date")).toHaveValue("2026-12-10");
  });
});

test("7-7 PC: 마우스로 끄는 것은 달 이동으로 처리하지 않는다 @pc", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "7-7_PC_마우스_끌기_무시");

  await step("마우스로 왼쪽으로 크게 끌기 → 2026년 11월 그대로", async () => {
    const w = (await page.locator("table.cal").boundingBox()).width;
    await swipe(page, -w * 0.5, 0, { pointerType: "mouse" });
    await expect(page.locator("#calTitle")).toHaveText("2026년 11월");
  });
});
