// 화면 E2E: 설정 — 기기 이름 · 전체 백업/복원 · CSV 내보내기 · 전체 삭제
import fs from "fs";
import { test, expect, startScenario, makeDb, ev, mt, openTab, chip, readDb, expectDialog, download } from "./support/scenario.js";

const sample = () =>
  makeDb({
    events: [ev("2026-11-23", "보안 점검", { start: "13:00", end: "14:00", done: true }), ev("2026-11-26", "고객, \"보고\"", { start: "10:00", memo: "쉼표·따옴표 포함" })],
    meetings: [mt("2026-11-20", "인프라 회의", { time: "10:00", check: "- 서버 증설\n- 백업 2회" })],
  });

test("5-1 전체 백업 후 데이터를 모두 지워도 백업 복원으로 되돌릴 수 있다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "5-1_백업_삭제_복원", { db: sample() });
  let backup;

  await step("설정 탭 → '전체 백업(JSON)' → 백업 파일 저장", async () => {
    await openTab(page, "설정");
    backup = await download(page, page.locator("#backupBtn"));
    expect(backup.name).toMatch(/^psync-backup-.*\.json$/);
    const json = JSON.parse(backup.text);
    expect(json.events).toHaveLength(2);
    expect(json.meetings).toHaveLength(1);
  });
  await step("'전체 데이터 삭제' → 확인 → 일정 0 · 회의록 0 (기기 이름은 유지)", async () => {
    await page.locator("#wipeBtn").click();
    await expectDialog(dialogs, "모든 일정·회의록을 삭제합니다");
    await expect(page.locator("#footStat")).toHaveText("일정 0 · 회의록 0");
    await expect(page.locator("#devBadge")).toHaveText("이 기기: 내부");
  });
  await step("'백업 복원' → 백업 파일 선택 → 확인 → '복원 완료'", async () => {
    await page.locator("#restoreFile").setInputFiles(backup.file);
    await expectDialog(dialogs, "백업으로 교체");
    await expectDialog(dialogs, "복원 완료");
    await expect(page.locator("#footStat")).toHaveText("일정 2 · 회의록 1");
  });
  await step("달력에 일정·종료 상태가 그대로 돌아옴", async () => {
    await openTab(page, "달력");
    await expect(chip(page, "2026-11-23", "보안 점검")).toHaveClass(/done/);
    await expect(chip(page, "2026-11-26", "고객")).toBeVisible();
  });
});

test("5-2 잘못된 파일로는 복원되지 않는다", async ({ page }, testInfo) => {
  const { step, dialogs } = await startScenario(page, testInfo, "5-2_잘못된_백업_파일", { db: sample() });

  await step("백업 형식이 아닌 JSON 으로 복원 → '복원 실패', 데이터 그대로", async () => {
    await openTab(page, "설정");
    const bad = testInfo.outputPath("bad.json");
    fs.writeFileSync(bad, JSON.stringify({ hello: "world" }));
    await page.locator("#restoreFile").setInputFiles(bad);
    await expectDialog(dialogs, "복원 실패");
    await expect(page.locator("#footStat")).toHaveText("일정 2 · 회의록 1");
  });
});

test("5-3 엑셀(CSV)로 일정·회의록·액션아이템을 내보낸다 (일정에 진행/종료 상태 포함)", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "5-3_CSV_내보내기", { db: sample() });

  await step("설정 탭 → '엑셀(CSV) 내보내기' → 일정·회의록·액션아이템 파일 3개", async () => {
    await openTab(page, "설정");
    const files = [];
    page.on("download", (d) => files.push(d));
    await page.locator("#csvBtn").click();
    await expect.poll(() => files.length).toBe(3);
    const read = async (d) => ({ name: d.suggestedFilename().normalize("NFC"), text: fs.readFileSync(await d.path(), "utf8") });
    const [evCsv, mtCsv, acCsv] = await Promise.all(files.map(read));

    expect(evCsv.name).toMatch(/^일정_.*\.csv$/);
    expect(evCsv.text.charCodeAt(0)).toBe(0xfeff); // 엑셀 한글 깨짐 방지 BOM
    const evLines = evCsv.text.slice(1).trim().split("\n");
    expect(evLines[0]).toBe("날짜,시작,종료,종료일,제목,메모,상태,반복,취소사유,원래일정(연기),회의록,수정시각");
    expect(evLines[1]).toMatch(/^2026-11-23,13:00,14:00,,보안 점검,,종료,,/);
    expect(evLines[2]).toMatch(/^2026-11-26,10:00,,,"고객, ""보고""",쉼표·따옴표 포함,진행,,/);

    expect(mtCsv.name).toMatch(/^회의록_.*\.csv$/);
    expect(mtCsv.text).toContain("일자,시간,주제,확인사항,액션아이템,비고,상태,연결일정,수정시각");
    expect(mtCsv.text).toContain('2026-11-20,10:00,인프라 회의,"- 서버 증설\n- 백업 2회"');

    expect(acCsv.name).toMatch(/^액션아이템_.*\.csv$/);
    expect(acCsv.text.slice(1).trim()).toBe("회의일자,회의주제,할일,담당자,기한,상태"); // 액션아이템이 없으면 머리글만
  });
});

test("5-4 기기 이름을 직접 입력해 바꿀 수 있다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "5-4_기기_이름_변경");

  await step("설정 탭 → 기기 이름 '내부', 기기 ID 표시", async () => {
    await openTab(page, "설정");
    await expect(page.locator("#setLabel")).toHaveValue("내부");
    await expect(page.locator("#setId")).toHaveValue("dev_e2e");
  });
  await step("'직접 입력…' 선택 → 입력칸에 '본사 PC' → 상단 '이 기기: 본사 PC'", async () => {
    await page.locator("#setLabel").selectOption("__custom");
    await page.locator("#setLabelCustom").fill("본사 PC");
    await page.locator("#setLabelCustom").blur();
    await expect(page.locator("#devBadge")).toHaveText("이 기기: 본사 PC");
  });
  await step("새로고침 → 직접 입력 값 유지", async () => {
    await page.reload();
    await openTab(page, "설정");
    await expect(page.locator("#setLabel")).toHaveValue("__custom");
    await expect(page.locator("#setLabelCustom")).toHaveValue("본사 PC");
    expect((await readDb(page)).deviceLabel).toBe("본사 PC");
  });
});

test("5-5 앱 버전이 제목·화면 아래·설정 탭에 같은 값으로 표시되고 package.json 버전과 같다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "5-5_앱_버전_표시");
  const ver = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

  await step(`제목 'v${ver}', 화면 아래 'v${ver}' (모바일은 하단 안내줄이 숨겨짐)`, async () => {
    expect(ver).toMatch(/^\d+\.\d+\.\d+$/);
    await expect(page).toHaveTitle(`프로젝트 일정·회의 관리 v${ver} (오프라인 동기화)`);
    await expect(page.locator("#appVer")).toHaveText(`v${ver}`);
    expect(await page.evaluate(() => APP_VER)).toBe(ver);
  });
  await step(`설정 탭 '사용 안내' 옆 '앱 버전 v${ver}' (모바일에서도 보임)`, async () => {
    await openTab(page, "설정");
    await expect(page.locator("#setVer")).toBeVisible();
    await expect(page.locator("#setVer")).toHaveText(`v${ver}`);
  });
});

test("5-6 탭은 달력·회의록·할 일·동기화·설정 4개이고, 동기화·설정 탭에 동기화와 설정이 함께 있으며, 선택된 탭이 강조된다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "5-6_탭_구성과_강조", {
    db: makeDb({ meetings: [mt("2026-11-20", "인프라 회의", { actions: [{ id: "a1", text: "견적 요청", owner: "김", due: "", done: false }, { id: "a2", text: "문서 정리", owner: "이", due: "", done: false }] })] }),
  });
  const tabs = page.locator(".tabs button");

  await step("탭 4개: 달력 · 회의록 · 할 일(빨간 배지 2) · 동기화·설정, 달력 탭이 강조색", async () => {
    await expect(tabs).toHaveCount(4);
    await expect(tabs.locator(".tl")).toHaveText(["달력", "회의록", "할 일", "동기화·설정"]);
    await expect(page.locator("#actBadge")).toHaveText("2");
    await expect(page.locator("#actBadge")).toBeVisible();
    const accent = await page.evaluate(() => getComputedStyle(document.querySelector(".tabs button.active")).backgroundColor);
    const other = await page.evaluate(() => getComputedStyle(document.querySelector('.tabs button[data-tab="mt"]')).backgroundColor);
    expect(accent).not.toBe(other);
    await expect(tabs.first()).toHaveClass(/\bactive\b/);
  });
  await step("'동기화·설정' 탭 → 위에 '🔄 동기화'(내보내기·가져오기), 아래에 '⚙ 설정'(디자인·기기·백업)", async () => {
    await openTab(page, "설정");
    await expect(page.locator('.tabs button[data-tab="set"]')).toHaveClass(/\bactive\b/);
    await expect(page.locator("#tab-set .sec-h")).toHaveText([/🔄 동기화/, "⚙ 설정"]);
    for (const id of ["#expFile", "#expQR", "#impImgBtn", "#impFileBtn", "#themeList", "#setLabel", "#backupBtn"]) await expect(page.locator(id)).toBeAttached();
    const syncY = (await page.locator("#syncArea").boundingBox()).y, setY = (await page.locator("#themeList").boundingBox()).y;
    expect(syncY).toBeLessThan(setY);
    await expect(page.locator("#expSummary")).toContainText("내보낼 내용"); // 탭을 열 때 내보내기 기간·요약이 준비됨
  });
  await step("할 일을 모두 끝내면 배지가 사라짐", async () => {
    await openTab(page, "할 일");
    for (const t of ["견적 요청", "문서 정리"]) await page.locator("#actList .act-it", { hasText: t }).locator("input[type=checkbox]").click();
    await expect(page.locator("#actBadge")).toBeHidden();
  });
});
