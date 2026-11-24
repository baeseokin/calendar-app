// 화면 E2E: 달력 · 일정 추가/수정/삭제 · 화면 채우기 · +N 표시
import { test, expect, startScenario, makeDb, ev, dayCell, clickDay, chip, modalBox, readDb, expectDialog, TODAY } from "./support/scenario.js";

test("1-1 처음 열면 기기 지정 창이 뜨고, 선택하면 상단에 기기 이름이 표시된다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "1-1_최초_기기_지정", { db: null });

  await step("처음 열기 → '이 기기는 어디인가요?' 창", async () => {
    await expect(modalBox(page).getByText("이 기기는 어디인가요?")).toBeVisible();
    await expect(page.locator("#devBadge")).toHaveText("이 기기: 기기 미설정");
  });
  await step("'외부' 선택 → 창 닫힘, 상단에 '이 기기: 외부'", async () => {
    await modalBox(page).getByRole("button", { name: "외부" }).click();
    await expect(modalBox(page)).toHaveCount(0);
    await expect(page.locator("#devBadge")).toHaveText("이 기기: 외부");
  });
  await step("새로고침해도 다시 묻지 않음", async () => {
    await page.reload();
    await expect(page.locator("#devBadge")).toHaveText("이 기기: 외부");
    await page.clock.runFor(1000); // 기기 지정 창은 열고 0.3초 뒤에 뜬다
    await expect(modalBox(page)).toHaveCount(0);
  });
});

test("1-2 날짜 칸을 눌러 일정을 추가하면 달력에 표시되고 새로고침 후에도 유지된다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "1-2_일정_추가");

  await step("달력 열기 → 2026년 11월, 오늘(24일) 강조", async () => {
    await expect(page.locator("#calTitle")).toHaveText("2026년 11월");
    await expect(dayCell(page, TODAY)).toHaveClass(/today/);
  });
  await step("26일 칸 클릭 → '일정 추가' 창 (날짜 26일)", async () => {
    await clickDay(page, "2026-11-26");
    await expect(modalBox(page).getByRole("heading", { name: "일정 추가" })).toBeVisible();
    await expect(page.locator("#m_date")).toHaveValue("2026-11-26");
  });
  await step("제목·시간·메모 입력", async () => {
    await page.locator("#m_title").fill("요구사항 리뷰");
    await page.locator("#m_start").selectOption("14:00");
    await page.locator("#m_end").selectOption("15:30");
    await page.locator("#m_memo").fill("3층 회의실");
  });
  await step("저장 → 26일 칸에 '14:00 요구사항 리뷰'", async () => {
    await page.locator("#m_save").click();
    await expect(modalBox(page)).toHaveCount(0);
    await expect(chip(page, "2026-11-26", "요구사항 리뷰")).toHaveText("14:00 요구사항 리뷰");
    await expect(page.locator("#footStat")).toHaveText("일정 1 · 회의록 0");
  });
  await step("새로고침 → 일정 유지", async () => {
    await page.reload();
    await expect(chip(page, "2026-11-26", "요구사항 리뷰")).toBeVisible();
    const db = await readDb(page);
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ date: "2026-11-26", start: "14:00", end: "15:30", title: "요구사항 리뷰", memo: "3층 회의실" });
    expect(db.events[0].done).toBeFalsy();
  });
});

test("1-3 제목이 없거나 종료 시간이 시작보다 빠르면 저장되지 않는다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "1-3_일정_입력_검증");

  await step("25일 칸 클릭 → 제목 없이 저장 → '제목을 입력하세요'", async () => {
    await clickDay(page, "2026-11-25");
    await page.locator("#m_save").click();
    await expectDialog(dialogs, "제목을 입력하세요");
    await expect(modalBox(page)).toBeVisible();
  });
  await step("시작 15:00 · 종료 14:00 으로 저장 → 시간 오류 안내, 저장 안 됨", async () => {
    await page.locator("#m_title").fill("시간 오류 일정");
    await page.locator("#m_start").selectOption("15:00");
    await page.locator("#m_end").selectOption("14:00");
    await page.locator("#m_save").click();
    await expectDialog(dialogs, "종료 시간이 시작 시간보다 빠릅니다");
    await expect(modalBox(page)).toBeVisible();
    expect((await readDb(page)).events).toHaveLength(0);
  });
  await step("취소 → 달력에 아무 일정도 없음", async () => {
    await page.locator("#m_cancel").click();
    await expect(page.locator("#calBody .ev")).toHaveCount(0);
  });
});

test("1-4 일정을 수정하고 삭제할 수 있다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "1-4_일정_수정_삭제", {
    db: makeDb({ events: [ev("2026-11-25", "디자인 리뷰", { start: "10:00", end: "11:00" })] }),
  });

  await step("25일 '디자인 리뷰' 클릭 → '일정 수정' 창", async () => {
    await chip(page, "2026-11-25", "디자인 리뷰").click();
    await expect(modalBox(page).getByRole("heading", { name: "일정 수정" })).toBeVisible();
    await expect(page.locator("#m_title")).toHaveValue("디자인 리뷰");
  });
  await step("제목 변경·날짜 27일로 이동 후 저장", async () => {
    await page.locator("#m_title").fill("디자인 최종 리뷰");
    await page.locator("#m_date").fill("2026-11-27");
    await page.locator("#m_save").click();
    await expect(chip(page, "2026-11-25", "디자인")).toHaveCount(0);
    await expect(chip(page, "2026-11-27", "디자인 최종 리뷰")).toBeVisible();
  });
  await step("다시 열어 삭제 → 확인 → 달력에서 사라짐", async () => {
    await chip(page, "2026-11-27", "디자인 최종 리뷰").click();
    await page.locator("#m_del").click();
    await expectDialog(dialogs, "이 일정을 삭제할까요?");
    await expect(page.locator("#calBody .ev")).toHaveCount(0);
    await expect(page.locator("#footStat")).toHaveText("일정 0 · 회의록 0");
  });
  await step("저장소에는 '삭제됨'으로 남음 (동기화로 삭제를 전달하기 위해)", async () => {
    const db = await readDb(page);
    expect(db.events).toHaveLength(1);
    expect(db.events[0].deleted).toBe(true);
  });
});

test("1-5 이전 달·다음 달·오늘 버튼으로 달을 이동한다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "1-5_달_이동", {
    db: makeDb({ events: [ev("2026-12-15", "연말 결산"), ev("2026-10-20", "중간 점검")] }),
  });

  await step("▶ → 2026년 12월, 15일 '연말 결산'", async () => {
    await page.locator("#nextM").click();
    await expect(page.locator("#calTitle")).toHaveText("2026년 12월");
    await expect(chip(page, "2026-12-15", "연말 결산")).toBeVisible();
  });
  await step("◀ ◀ → 2026년 10월, 20일 '중간 점검'", async () => {
    await page.locator("#prevM").click();
    await page.locator("#prevM").click();
    await expect(page.locator("#calTitle")).toHaveText("2026년 10월");
    await expect(chip(page, "2026-10-20", "중간 점검")).toBeVisible();
  });
  await step("오늘 → 2026년 11월", async () => {
    await page.locator("#todayBtn").click();
    await expect(page.locator("#calTitle")).toHaveText("2026년 11월");
    await expect(dayCell(page, TODAY)).toHaveClass(/today/);
  });
});

test("1-6 달력이 브라우저 화면을 가로·세로로 채운다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "1-6_화면_채우기");

  await step("달력 표 폭 = 화면 폭 − 좌우 여백, 아래쪽은 하단 안내줄 바로 위까지", async () => {
    const vp = page.viewportSize();
    const table = await page.locator("table.cal").boundingBox();
    const panel = await page.locator("#tab-cal .panel").boundingBox();
    const foot = await page.locator(".foot").boundingBox();
    expect(table.width).toBeGreaterThan(vp.width - 80);           // 좌우 빈 공간 없음 (여백·테두리만)
    expect(panel.y + panel.height).toBeGreaterThan(foot.y - 30);  // 아래쪽 빈 공간 없음
  });
});

test("1-7 칸에 들어가는 만큼 일정을 보이고, 넘치는 개수만 +N 으로 표시한다 (화면 크기에 따라 다시 계산)", async ({ page }, testInfo) => {
  const titles = ["스탠드업", "고객 미팅", "디자인 리뷰", "코드 리뷰", "QA 점검", "배포", "회고", "교육"];
  const { step } = await startScenario(page, testInfo, "1-7_넘침_+N_표시", {
    db: makeDb({ events: titles.map((t, i) => ev(TODAY, t, { start: `${String(9 + i).padStart(2, "0")}:00` })) }),
  });
  const cell = dayCell(page, TODAY);

  // 칸 상태 측정: 보이는 칩 수, +N 의 N, 칸 밖으로 넘친 항목이 있는지, 일정 영역 높이
  const measure = () => cell.locator(".evs").evaluate((box) => {
    const vis = [...box.children].filter((c) => !c.classList.contains("hidden"));
    const more = box.querySelector(".more:not(.hidden)");
    const r = box.getBoundingClientRect();
    return {
      shown: vis.filter((c) => c.classList.contains("ev")).length,
      more: more ? Number(more.textContent.replace("+", "")) : 0,
      overflow: vis.some((c) => c.getBoundingClientRect().bottom > r.bottom + 0.5),
      height: Math.round(r.height),
    };
  });
  // 올바르게 맞춰진 상태: 보이는 칩 수 + N = 전체, 넘침 없음, 최소 1개는 보임
  const fitted = (r) => r.shown + r.more === titles.length && !r.overflow && r.shown > 0;
  // 화면 크기를 바꾼 직후에는 다시 계산되기 전일 수 있으므로, 맞춰진 상태가 될 때까지 기다린 뒤 값을 쓴다
  async function settled() {
    await expect.poll(async () => fitted(await measure()), { message: "칸 크기에 맞춰 +N 이 다시 계산되어야 함" }).toBe(true);
    return measure();
  }

  let tall;
  await step("현재 화면 크기: 들어가는 만큼 표시, 나머지는 +N", async () => {
    tall = await settled();
    expect(tall.more).toBeGreaterThan(0);
  });
  await step("화면 높이를 줄이면 칸이 작아진 만큼 보이는 일정이 줄고 +N 이 커짐", async () => {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: 560 });
    const small = await settled();
    if (small.height < tall.height - 18) expect(small.shown).toBeLessThan(tall.shown); // 칩 하나 높이(약 18px) 이상 줄었을 때
    else expect(small.shown).toBe(tall.shown); // 모바일처럼 칸 최소 높이에 이미 닿아 있으면 그대로
  });
  await step("화면 높이를 크게 늘리면 8개가 모두 보이고 +N 이 사라짐", async () => {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: 2400 });
    await expect(cell.locator(".more")).toBeHidden();
    await expect(cell.locator(".ev").filter({ visible: true })).toHaveCount(titles.length);
  });
});
