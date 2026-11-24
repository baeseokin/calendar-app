// 화면 E2E: 화면 디자인(테마) 선택 · 일정 막대 색상
import { test, expect, startScenario, makeDb, ev, openTab, chip, clickDay, modalBox, readDb, expectBarColor, openEvent } from "./support/scenario.js";

const html = (page) => page.locator("html");
const card = (scope, name) => scope.locator(".theme-card", { hasText: name });
const bgOf = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const swatch = (page, name) => page.locator(`#m_colors .sw[title="${name}"]`);

test("6-1 설정 탭에서 디자인을 고르면 바로 적용되고, 새로고침 후에도 유지된다 (일정 데이터와는 별도)", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "6-1_디자인_선택_설정", {
    db: makeDb({ events: [ev("2026-11-25", "디자인 리뷰", { start: "10:00" })] }),
  });

  await step("설정 탭 → 디자인 6종, 기본 '미드나잇' 선택됨", async () => {
    await openTab(page, "설정");
    await expect(page.locator("#themeList .theme-card")).toHaveCount(6);
    await expect(card(page.locator("#themeList"), "미드나잇")).toHaveClass(/sel/);
    await expect(html(page)).toHaveAttribute("data-theme", "midnight");
  });
  await step("'화이트' 선택 → 밝은 배경으로 바뀌고 선택 표시 이동", async () => {
    await card(page.locator("#themeList"), "화이트").click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect.poll(() => bgOf(page)).toBe("rgb(243, 245, 249)");
    await expect(card(page.locator("#themeList"), "화이트")).toHaveClass(/sel/);
    await expect(card(page.locator("#themeList"), "미드나잇")).not.toHaveClass(/sel/);
  });
  await step("'파스텔' 선택 → 카드형 칸(칸 사이 간격)", async () => {
    await card(page.locator("#themeList"), "파스텔").click();
    await expect(html(page)).toHaveAttribute("data-cells", "card");
    await openTab(page, "달력");
    await expect(page.locator("table.cal")).toHaveCSS("border-collapse", "separate");
    await expect(chip(page, "2026-11-25", "디자인 리뷰")).toBeVisible();
  });
  await step("새로고침 → 파스텔 유지, 일정 데이터(백업·동기화 대상)에는 디자인이 저장되지 않음", async () => {
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "pastel");
    const db = await readDb(page);
    expect(JSON.stringify(db)).not.toContain("pastel");
  });
});

test("6-2 디자인은 설정 탭에서만 바꾸고, 달력 탭에는 디자인 버튼이 없다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "6-2_디자인은_설정_탭에서만", {
    db: makeDb({ events: [ev("2026-11-25", "디자인 리뷰", { start: "10:00" })] }),
  });

  await step("달력 탭: 디자인 버튼 없음 (이전 달·다음 달·오늘·지난 일정 종료만)", async () => {
    await expect(page.locator(".cal-head").getByRole("button", { name: /디자인/ })).toHaveCount(0);
    await expect(page.locator(".cal-head button")).toHaveCount(4);
  });
  await step("설정 탭에서 '클래식 종이' 선택 → 달력 탭으로 돌아오면 그 디자인으로 표시", async () => {
    await openTab(page, "설정");
    await card(page.locator("#themeList"), "클래식 종이").click();
    await expect(card(page.locator("#themeList"), "클래식 종이")).toHaveClass(/sel/);
    await openTab(page, "달력");
    await expect(html(page)).toHaveAttribute("data-theme", "paper");
    await expect.poll(() => bgOf(page)).toBe("rgb(236, 229, 214)");
    await expect(chip(page, "2026-11-25", "디자인 리뷰")).toBeVisible();
  });
});

test("6-3 일정 막대 색상을 고르면 막대 전체가 그 색(반투명)으로 표시되고, '기본'은 디자인 색을 따른다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "6-3_일정_막대_색상");
  const c = () => chip(page, "2026-11-26", "고객 미팅");

  await step("26일 칸 클릭 → 막대 색상 10개, '기본' 선택됨", async () => {
    await clickDay(page, "2026-11-26");
    await expect(page.locator("#m_colors .sw")).toHaveCount(10);
    await expect(swatch(page, "기본(디자인 색)")).toHaveClass(/sel/);
  });
  await step("제목 입력, '초록' 선택 후 저장 → 막대 전체가 반투명 초록", async () => {
    await page.locator("#m_title").fill("고객 미팅");
    await swatch(page, "초록").click();
    await expect(swatch(page, "초록")).toHaveClass(/sel/);
    await expect(swatch(page, "기본(디자인 색)")).not.toHaveClass(/sel/);
    await page.locator("#m_save").click();
    await expectBarColor(c(), "#30a46c");
    expect((await readDb(page)).events[0].color).toBe("#30a46c");
  });
  await step("디자인을 '고대비'로 바꿔도 직접 고른 초록은 유지", async () => {
    await openTab(page, "설정");
    await card(page.locator("#themeList"), "고대비").click();
    await openTab(page, "달력");
    await expectBarColor(c(), "#30a46c");
  });
  await step("다시 열어 '기본'으로 저장 → 디자인 색(고대비 노랑)을 따름", async () => {
    await openEvent(page, "2026-11-26", "고객 미팅");
    await expect(swatch(page, "초록")).toHaveClass(/sel/);
    await swatch(page, "기본(디자인 색)").click();
    await page.locator("#m_save").click();
    await expectBarColor(c()); // 고대비 대표색(노랑)
    await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
    expect((await readDb(page)).events[0].color).toBe("");
  });
});

test("6-4 팔레트에 없는 색상 값(가져온 데이터 등)은 무시하고 기본색으로 표시한다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "6-4_잘못된_색상_무시", {
    db: makeDb({
      events: [
        ev("2026-11-25", "정상 색", { color: "#8e4ec6" }),
        ev("2026-11-26", "이상한 값", { color: "red;background:url(x)" }),
      ],
    }),
  });

  await step("보라는 그대로, 이상한 값은 기본 디자인 색(파랑)으로", async () => {
    await expectBarColor(chip(page, "2026-11-25", "정상 색"), "#8e4ec6");
    await expectBarColor(chip(page, "2026-11-26", "이상한 값")); // 기본 디자인 대표색
    await expect(chip(page, "2026-11-26", "이상한 값")).not.toHaveAttribute("style", /url/);
  });
  await step("이상한 값의 일정을 열면 '기본'이 선택돼 있음", async () => {
    await openEvent(page, "2026-11-26", "이상한 값");
    await expect(swatch(page, "기본(디자인 색)")).toHaveClass(/sel/);
  });
});
