// 화면 E2E: 여러 날에 걸친 일정 · 반복 일정
//   기준 시각: 2026-11-24(화) 10:00
import { test, expect, startScenario, makeDb, ev, chip, clickDay, openEvent, modalBox, readDb, expectDialog, agendaItem, selectDay, isMobileView } from "./support/scenario.js";

const evs = async (page) => (await readDb(page)).events.filter((e) => !e.deleted);

test("9-1 시작일~종료일로 여러 날 일정을 등록하면 걸친 날마다 표시되고, 시작일을 옮기면 기간이 유지된다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "9-1_여러_날_일정");

  await step("25일 칸 → 제목 '워크숍', 종료일 27일, 13:00~17:00 → '3일 일정' 안내", async () => {
    await clickDay(page, "2026-11-25");
    await expect(page.locator("#m_endDate")).toHaveValue("2026-11-25"); // 기본은 하루
    await page.locator("#m_title").fill("워크숍");
    await page.locator("#m_endDate").fill("2026-11-27");
    await page.locator("#m_endDate").dispatchEvent("change");
    await page.locator("#m_start").selectOption("13:00");
    await page.locator("#m_end").selectOption("17:00");
    await expect(page.locator("#m_spanNote")).toHaveText("3일 일정 — 시작 시간은 첫날(11/25), 종료 시간은 마지막 날(11/27) 기준입니다.");
  });
  await step("저장 → 25일 '13:00 워크숍 ▸', 26일 '↳ 워크숍', 27일 '↳ 워크숍 ~17:00'", async () => {
    await page.locator("#m_save").click();
    await expect(chip(page, "2026-11-25", "워크숍")).toHaveText("13:00 워크숍 ▸");
    await expect(chip(page, "2026-11-26", "워크숍")).toHaveText("↳ 워크숍");
    await expect(chip(page, "2026-11-26", "워크숍")).toHaveClass(/\bcont\b/);
    await expect(chip(page, "2026-11-27", "워크숍")).toHaveText("↳ 워크숍 ~17:00");
    expect(await evs(page)).toEqual([expect.objectContaining({ date: "2026-11-25", endDate: "2026-11-27", start: "13:00", end: "17:00" })]);
    expect(await evs(page)).toHaveLength(1); // 하루마다 따로 만들지 않고 일정 하나
  });
  if (isMobileView(page)) {
    await step("[모바일] 26일 선택 → 목록에 '11/25 13:00 ~ 11/27 17:00' · '2/3일째'", async () => {
      await selectDay(page, "2026-11-26");
      await expect(agendaItem(page, "워크숍")).toContainText("11/25 13:00 ~ 11/27 17:00");
      await expect(agendaItem(page, "워크숍")).toContainText("2/3일째");
    });
  }
  await step("가운데 날(26일)에서 열어도 같은 일정 → 시작일을 30일로 옮기면 종료일이 12/2로 따라감", async () => {
    await openEvent(page, "2026-11-26", "워크숍");
    await expect(page.locator("#m_date")).toHaveValue("2026-11-25");
    await expect(page.locator("#m_endDate")).toHaveValue("2026-11-27");
    await page.locator("#m_date").fill("2026-11-30");
    await page.locator("#m_date").dispatchEvent("change");
    await expect(page.locator("#m_endDate")).toHaveValue("2026-12-02");
    await page.locator("#m_asMove").uncheck();
    await page.locator("#m_save").click();
    await expect(chip(page, "2026-11-30", "워크숍")).toHaveText("13:00 워크숍 ▸");
    await expect(chip(page, "2026-11-25", "워크숍")).toHaveCount(0);
    expect((await evs(page))[0]).toMatchObject({ date: "2026-11-30", endDate: "2026-12-02" });
  });
  await step("종료일을 시작일보다 앞으로 하면 '종료일이 시작일보다 빠릅니다.'", async () => {
    await openEvent(page, "2026-11-30", "워크숍");
    await page.locator("#m_endDate").fill("2026-11-28");
    await page.locator("#m_save").click();
    await expectDialog(dialogs, "종료일이 시작일보다 빠릅니다.");
    await expect(modalBox(page)).toBeVisible();
  });
});

const repType = (page, v) => page.locator(`#m_repType [data-rep="${v}"]`).click();
const day = (page, i) => page.locator(`#m_repDays [data-d="${i}"]`);
const setUntil = async (page, d) => { await page.locator("#m_until").fill(d); await page.locator("#m_until").dispatchEvent("change"); };
const setStart = async (page, d) => { await page.locator("#m_date").fill(d); await page.locator("#m_date").dispatchEvent("change"); };

test("9-2 매주 여러 요일(화·목)을 골라 반복 등록하면 반복 종료일까지 해당 요일마다 일정이 만들어진다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "9-2_매주_여러요일_반복");

  await step("24일(화) 칸 → '주간 회의' 10:00 → 반복 '매주' → 요일 칸에 '화'가 미리 선택됨", async () => {
    await clickDay(page, "2026-11-24");
    await page.locator("#m_title").fill("주간 회의");
    await page.locator("#m_start").selectOption("10:00");
    await expect(page.locator("#m_repPanel")).toBeHidden();
    await repType(page, "weekly");
    await expect(page.locator("#m_repWeekly")).toBeVisible();
    await expect(day(page, 2)).toHaveClass(/\bsel\b/);
    await expect(page.locator("#m_repDays .sel")).toHaveCount(1);
    await expect(page.locator("#m_until")).toHaveValue("2027-02-24"); // 기본 3개월 뒤
  });
  await step("'목' 추가, 반복 종료일 12/10 → '🔁 매주 화·목 · 총 6회 · 2026.11.24(화) ~ 2026.12.10(목)'", async () => {
    await day(page, 4).click();
    await setUntil(page, "2026-12-10");
    await expect(page.locator("#m_repPreview")).toHaveText("🔁 매주 화·목 · 총 6회 · 2026.11.24(화) ~ 2026.12.10(목)");
  });
  await step("저장 → 일정 6개(같은 반복 묶음), 24·26일에 '🔁'", async () => {
    await page.locator("#m_save").click();
    await expect(chip(page, "2026-11-24", "주간 회의")).toHaveText("10:00 주간 회의 🔁");
    await expect(chip(page, "2026-11-26", "주간 회의")).toHaveText("10:00 주간 회의 🔁");
    const list = await evs(page);
    expect(list.map((e) => e.date).sort()).toEqual(["2026-11-24", "2026-11-26", "2026-12-01", "2026-12-03", "2026-12-08", "2026-12-10"]);
    expect(new Set(list.map((e) => e.seriesId)).size).toBe(1);
    expect(list.every((e) => e.repeat === "weekly:24:2026-12-10")).toBe(true);
  });
  await step("한 회차를 열면 '매주 화·목 · ~2026.12.10 · 전체 6회 중 2번째'", async () => {
    await openEvent(page, "2026-11-26", "주간 회의");
    await expect(modalBox(page).locator(".info-line").filter({ hasText: "🔁" })).toContainText("매주 화·목 · ~2026.12.10 · 전체 6회 중 2번째");
  });
});

test("9-3 반복 규칙: 평일·2주마다·매월 일자(없는 달 건너뜀)·매월 n째 주 요일, 요일 미선택·366회 초과는 막는다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "9-3_반복_규칙");

  await step("27일(금) 칸 → 매주 → '평일(월~금)' 버튼 → 12/4까지 6회 (토·일 제외)", async () => {
    await clickDay(page, "2026-11-27");
    await page.locator("#m_title").fill("일일 점검");
    await repType(page, "weekly");
    await page.locator("#m_repWeekdays").click();
    await expect(page.locator("#m_repDays .sel")).toHaveCount(5);
    await setUntil(page, "2026-12-04");
    await expect(page.locator("#m_repPreview")).toHaveText("🔁 매주 평일(월~금) · 총 6회 · 2026.11.27(금) ~ 2026.12.04(금)");
  });
  await step("금요일만 남기고 '2주마다', 12/31까지 → 11/27·12/11·12/25 3회", async () => {
    for (const i of [1, 2, 3, 4]) await day(page, i).click();
    await page.locator("#m_repEvery").selectOption("2");
    await setUntil(page, "2026-12-31");
    await expect(page.locator("#m_repPreview")).toHaveText("🔁 2주마다 금 · 총 3회 · 2026.11.27(금) ~ 2026.12.25(금)");
  });
  await step("요일을 모두 끄면 '반복할 요일을 하나 이상 선택하세요.'", async () => {
    await day(page, 5).click();
    await expect(page.locator("#m_repPreview")).toHaveText("반복할 요일을 하나 이상 선택하세요.");
  });
  await step("매월 31일: 2027.1.31~6.30 → 3회, '그 날짜가 없는 달은 건너뜀'", async () => {
    await repType(page, "monthly");
    await setStart(page, "2027-01-31");
    await page.locator("#m_repMonDate").selectOption("31");
    await page.locator("#m_repMonDate").dispatchEvent("change");
    await setUntil(page, "2027-06-30");
    await expect(page.locator("#m_repPreview")).toHaveText("🔁 매월 31일 · 총 3회 · 2027.01.31(일) ~ 2027.05.31(월) (그 날짜가 없는 달은 건너뜀)");
  });
  await step("매월 4째 주 화요일: 2026.11.24~2027.2.28 → 11/24·12/22·1/26·2/23", async () => {
    await setStart(page, "2026-11-24");
    await page.locator('input[name=m_repMon][value="nth"]').check();
    await page.locator("#m_repNthWeek").selectOption("4");
    await page.locator("#m_repNthDay").selectOption("2");
    await page.locator("#m_repNthDay").dispatchEvent("change");
    await setUntil(page, "2027-02-28");
    await expect(page.locator("#m_repPreview")).toHaveText("🔁 매월 4째 주 화요일 · 총 4회 · 2026.11.24(화) ~ 2027.02.23(화)");
  });
  await step("매일 2년 → '최대 366회' 경고, 저장해도 만들어지지 않음", async () => {
    await repType(page, "daily");
    await setUntil(page, "2028-11-24");
    await expect(page.locator("#m_repPreview")).toContainText("반복은 최대 366회까지입니다");
    await page.locator("#m_save").click();
    await expectDialog(dialogs, "반복은 최대 366회까지 등록할 수 있습니다");
    expect(await evs(page)).toHaveLength(0);
  });
  await step("매월 4째 주 화요일로 저장 → 일정 4개", async () => {
    await repType(page, "monthly");
    await setUntil(page, "2027-02-28");
    await page.locator("#m_save").click();
    expect((await evs(page)).map((e) => e.date).sort()).toEqual(["2026-11-24", "2026-12-22", "2027-01-26", "2027-02-23"]);
    expect((await evs(page))[0].repeat).toBe("monthly:N4-2:2027-02-28");
  });
});

test("9-4 반복 일정을 고치거나 지울 때 '이 일정만' / '이 일정과 이후 일정 모두'를 고를 수 있다", async ({ page }, testInfo) => {
  const S = { seriesId: "s_week", repeat: "weekly:2:2026-12-15", start: "10:00", end: "11:00" };
  const { step, dialogs } = await startScenario(page, testInfo, "9-4_반복_수정_범위", {
    db: makeDb({ events: ["2026-11-24", "2026-12-01", "2026-12-08", "2026-12-15"].map((d) => ev(d, "주간 회의", { ...S })) }),
  });
  const titleOn = async (d) => (await evs(page)).find((e) => e.date === d).title;

  await step("12/1 회차 열기 → '🔁 반복 · 매주 화 · ~2026.12.15 · 전체 4회 중 2번째', 기본 '이 일정만'", async () => {
    await page.locator("#nextM").click();
    await openEvent(page, "2026-12-01", "주간 회의");
    await expect(modalBox(page).locator(".info-line").filter({ hasText: "🔁" })).toContainText("매주 화 · ~2026.12.15 · 전체 4회 중 2번째");
    await expect(page.locator('input[name=m_scope][value="one"]')).toBeChecked();
    await expect(page.locator("#m_scopeRow")).toContainText("이 일정과 이후 일정 모두 (3건)");
  });
  await step("'이 일정만'으로 제목 변경 → 12/1 만 바뀜", async () => {
    await page.locator("#m_title").fill("주간 회의 (장소 변경)");
    await page.locator("#m_save").click();
    expect(await titleOn("2026-12-01")).toBe("주간 회의 (장소 변경)");
    expect(await titleOn("2026-12-08")).toBe("주간 회의");
  });
  await step("12/8 회차에서 '이후 모두'로 제목·시간 변경 → 12/8·12/15 만 바뀌고 11/24·12/1 은 그대로", async () => {
    await openEvent(page, "2026-12-08", "주간 회의");
    await page.locator('input[name=m_scope][value="after"]').check();
    await page.locator("#m_title").fill("주간 회의 v2");
    await page.locator("#m_start").selectOption("14:00");
    await page.locator("#m_end").selectOption("15:00");
    await page.locator("#m_save").click();
    const by = Object.fromEntries((await evs(page)).map((e) => [e.date, e]));
    expect(by["2026-12-08"]).toMatchObject({ title: "주간 회의 v2", start: "14:00" });
    expect(by["2026-12-15"]).toMatchObject({ title: "주간 회의 v2", start: "14:00" });
    expect(by["2026-12-01"]).toMatchObject({ title: "주간 회의 (장소 변경)", start: "10:00" });
    expect(by["2026-11-24"]).toMatchObject({ title: "주간 회의", start: "10:00" });
    await expect(chip(page, "2026-12-15", "주간 회의 v2")).toHaveText("14:00 주간 회의 v2 🔁");
  });
  await step("12/8 회차에서 '이후 모두' 삭제 → '2건을 삭제할까요?' → 11/24·12/1 만 남음", async () => {
    await openEvent(page, "2026-12-08", "주간 회의 v2");
    await page.locator('input[name=m_scope][value="after"]').check();
    await page.locator("#m_del").click();
    await expectDialog(dialogs, "이 일정과 이후 반복 일정 2건을 삭제할까요?");
    expect((await evs(page)).map((e) => e.date).sort()).toEqual(["2026-11-24", "2026-12-01"]);
    await expect(chip(page, "2026-12-08", "주간 회의")).toHaveCount(0);
  });
});
