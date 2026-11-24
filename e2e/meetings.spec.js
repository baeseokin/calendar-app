// 화면 E2E: 회의록 추가 · 검색 · 수정 · 삭제
import { test, expect, startScenario, makeDb, mt, openTab, modalBox, readDb, expectDialog, TODAY } from "./support/scenario.js";

const rows = (page) => page.locator("#mtBody tr[data-mt]");
const row = (page, topic) => rows(page).filter({ hasText: topic });

test("3-1 회의를 추가하면 회의록 목록에 표시된다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "3-1_회의록_추가");

  await step("회의록 탭 → 빈 목록 안내, 총 0건", async () => {
    await openTab(page, "회의록");
    await expect(page.locator("#mtBody")).toContainText("회의록이 없습니다");
    await expect(page.locator("#mtCount")).toHaveText("총 0건");
  });
  await step("'+ 회의 추가' → 일자는 오늘", async () => {
    await page.locator("#addMt").click();
    await expect(modalBox(page).getByRole("heading", { name: "회의 추가" })).toBeVisible();
    await expect(page.locator("#m_date")).toHaveValue(TODAY);
  });
  await step("시간·주제·확인 사항(여러 줄)·비고 입력", async () => {
    await page.locator("#m_time").fill("14:00~15:00");
    await page.locator("#m_topic").fill("API 설계 회의");
    await page.locator("#m_check").fill("- 페이징은 cursor 방식\n- 토큰 만료 30분");
    await page.locator("#m_note").fill("담당: 김");
  });
  await step("저장 → 목록에 1건, 확인 사항 줄바꿈 유지", async () => {
    await page.locator("#m_save").click();
    await expect(modalBox(page)).toHaveCount(0);
    await expect(page.locator("#mtCount")).toHaveText("총 1건");
    const r = row(page, "API 설계 회의");
    await expect(r).toContainText("14:00~15:00");
    await expect(r).toContainText("담당: 김");
    await expect(r.locator("td.check")).toHaveText("- 페이징은 cursor 방식\n- 토큰 만료 30분");
    await expect(page.locator("#footStat")).toHaveText("일정 0 · 회의록 1");
  });
});

test("3-2 주제·확인 사항·비고로 회의록을 검색한다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "3-2_회의록_검색", {
    db: makeDb({
      meetings: [
        mt("2026-11-10", "킥오프 회의", { check: "- 범위 합의" }),
        mt("2026-11-17", "QA 결과 공유", { check: "- 결함 23건" }),
        mt("2026-11-20", "배포 준비", { note: "QA 재확인 필요" }),
      ],
    }),
  });

  await step("회의록 탭 → 3건, 최신 날짜가 맨 위", async () => {
    await openTab(page, "회의록");
    await expect(page.locator("#mtCount")).toHaveText("총 3건");
    await expect(rows(page).first()).toContainText("배포 준비");
    await expect(rows(page).last()).toContainText("킥오프 회의");
  });
  await step("'QA' 검색 → 주제·비고에 QA 가 있는 2건", async () => {
    await page.locator("#mtSearch").fill("QA");
    await expect(page.locator("#mtCount")).toHaveText("총 2건");
    await expect(row(page, "QA 결과 공유")).toBeVisible();
    await expect(row(page, "배포 준비")).toBeVisible();
  });
  await step("'범위 합의' 검색 → 확인 사항이 맞는 1건", async () => {
    await page.locator("#mtSearch").fill("범위 합의");
    await expect(page.locator("#mtCount")).toHaveText("총 1건");
    await expect(row(page, "킥오프 회의")).toBeVisible();
  });
  await step("없는 단어 검색 → 0건, 빈 목록 안내", async () => {
    await page.locator("#mtSearch").fill("없는단어");
    await expect(page.locator("#mtCount")).toHaveText("총 0건");
    await expect(page.locator("#mtBody")).toContainText("회의록이 없습니다");
  });
});

test("3-3 회의록을 수정하고 삭제할 수 있다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "3-3_회의록_수정_삭제", {
    db: makeDb({ meetings: [mt("2026-11-17", "주간 진척 점검", { time: "10:00", check: "- 진척률 62%" })] }),
  });

  await step("회의록 탭 → ✎ → '회의 수정' 창에 기존 내용", async () => {
    await openTab(page, "회의록");
    await row(page, "주간 진척 점검").getByRole("button", { name: "✎" }).click();
    await expect(modalBox(page).getByRole("heading", { name: "회의 수정" })).toBeVisible();
    await expect(page.locator("#m_check")).toHaveValue("- 진척률 62%");
  });
  await step("주제·확인 사항 변경 후 저장 → 목록에 반영", async () => {
    await page.locator("#m_topic").fill("주간 진척 점검 (2주차)");
    await page.locator("#m_check").fill("- 진척률 71%");
    await page.locator("#m_save").click();
    await expect(row(page, "주간 진척 점검 (2주차)")).toContainText("진척률 71%");
    await expect(page.locator("#mtCount")).toHaveText("총 1건");
  });
  await step("다시 ✎ → 삭제 → 확인 → 목록에서 사라짐", async () => {
    await row(page, "2주차").getByRole("button", { name: "✎" }).click();
    await page.locator("#m_del").click();
    await expectDialog(dialogs, "이 회의록을 삭제할까요?");
    await expect(page.locator("#mtCount")).toHaveText("총 0건");
    expect((await readDb(page)).meetings[0].deleted).toBe(true);
  });
});

test("3-4 주제가 없으면 회의록이 저장되지 않는다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "3-4_회의록_주제_필수");

  await step("'+ 회의 추가' → 확인 사항만 입력하고 저장 → '주제를 입력하세요'", async () => {
    await openTab(page, "회의록");
    await page.locator("#addMt").click();
    await page.locator("#m_check").fill("- 내용만 있음");
    await page.locator("#m_save").click();
    await expectDialog(dialogs, "주제를 입력하세요");
    await expect(modalBox(page)).toBeVisible();
    expect((await readDb(page)).meetings).toHaveLength(0);
  });
});

test("3-5 회의록은 최신이 맨 위(일자·시간 내림차순)로 정렬되고, 새로 추가한 최신 회의도 맨 위에 온다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "3-5_회의록_최신순_정렬", {
    db: makeDb({
      meetings: [
        mt("2026-11-10", "킥오프 회의", { time: "10:00" }),
        mt("2026-11-20", "오전 점검", { time: "09:00" }),
        mt("2026-11-20", "오후 리뷰", { time: "15:00" }),
        mt("2026-11-17", "QA 결과 공유", { time: "14:00" }),
        mt("2026-10-30", "지난달 회고"),
      ],
    }),
  });
  const topics = () => rows(page).locator("td:nth-child(3)").allTextContents();

  await step("회의록 탭 → 11/20 15:00, 11/20 09:00, 11/17, 11/10, 10/30 순", async () => {
    await openTab(page, "회의록");
    await expect.poll(topics).toEqual(["오후 리뷰", "오전 점검", "QA 결과 공유", "킥오프 회의", "지난달 회고"]);
  });
  await step("오늘(11/24) 회의 추가 → 맨 위", async () => {
    await page.locator("#addMt").click();
    await page.locator("#m_time").fill("11:00");
    await page.locator("#m_topic").fill("오늘 회의");
    await page.locator("#m_save").click();
    await expect.poll(topics).toEqual(["오늘 회의", "오후 리뷰", "오전 점검", "QA 결과 공유", "킥오프 회의", "지난달 회고"]);
  });
  await step("검색해도 같은 순서 유지 ('회' 검색)", async () => {
    await page.locator("#mtSearch").fill("회");
    await expect.poll(topics).toEqual(["오늘 회의", "킥오프 회의", "지난달 회고"]);
  });
});
