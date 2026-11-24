// 화면 E2E: QR 사진으로 동기화 — 진행 상태, 사진별 결과, 못 읽은 QR 번호 안내, '사진 더 추가'로 이어서 완성
//   보내는 기기 화면의 QR 이미지(GIF)를 실제 파일로 저장해, 받는 기기에서 그 '사진'을 고르는 방식으로 흉내 낸다.
//   (카메라 실시간 읽기는 실제 카메라가 필요해 다루지 않음)
import fs from "fs";
import { test, expect, startScenario, preparePage, openApp, makeDb, ev, openTab, chip, modalBox } from "./support/scenario.js";

/** QR 여러 장이 나오도록 압축이 잘 안 되는 내용의 일정 */
function manyEvents(count) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const word = () => Array.from({ length: 6 }, () => "가나다라마바사아자차카타파하"[Math.floor(rnd() * 14)]).join("");
  return Array.from({ length: count }, (_, i) =>
    ev(`2026-11-${String(1 + (i % 28)).padStart(2, "0")}`, `${word()} 회의 ${i + 1}`, { start: "10:00", memo: `${word()} ${word()} ${word()}` }));
}

/** [보내는 기기] 동기화 탭 → 'QR로 내보내기' → 화면의 QR 이미지를 번호 순서대로 파일로 저장 */
async function exportQrImages(page, testInfo) {
  await openTab(page, "동기화");
  await page.locator("#expQR").click();
  const cells = modalBox(page).locator(".qrcell");
  await expect(cells.first()).toBeVisible();
  const n = await cells.count();
  const files = [];
  for (let i = 0; i < n; i++) {
    await expect(cells.nth(i)).toContainText(`${i + 1} / ${n}`);
    const src = await cells.nth(i).locator("img").getAttribute("src");
    const file = testInfo.outputPath(`qr-${i + 1}.gif`);
    fs.writeFileSync(file, Buffer.from(src.split(",")[1], "base64"));
    files.push(file);
  }
  return files;
}

/** [받는 기기] 같은 기기 설정으로 새 브라우저 컨텍스트 */
async function openReceiver(browser, testInfo) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, baseURL } = testInfo.project.use;
  const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, baseURL });
  const page = await context.newPage();
  await preparePage(page, { db: makeDb({ deviceLabel: "외부", deviceId: "dev_other" }) });
  await openApp(page);
  await openTab(page, "동기화");
  return page;
}
const progress = (page) => modalBox(page);
const ck = (page, i) => modalBox(page).locator(`#chunkGrid .ck[data-ck="${i}"]`);

test("4-3 QR 사진 일부를 못 읽으면 못 읽은 QR 번호를 알려 주고, '사진 더 추가'로 나머지를 채워 완성한다", async ({ page, browser }, testInfo) => {
  const events = manyEvents(24);
  const { step } = await startScenario(page, testInfo, "4-3_QR사진_누락_번호_안내", { db: makeDb({ events }) });
  let qr, other;

  await step("[내부] 'QR로 내보내기' → 번호가 붙은 QR 여러 장", async () => {
    qr = await exportQrImages(page, testInfo);
    expect(qr.length).toBeGreaterThanOrEqual(4);
  });
  const n = qr.length;
  const missing = [2, n]; // 2번과 마지막 번호를 빼고 고름
  const picked = qr.filter((_, i) => !missing.includes(i + 1));

  other = await openReceiver(browser, testInfo);
  await step(`[외부] QR 사진 ${picked.length}장 선택 (2번·${n}번 빠짐) → 분석 후 '못 읽은 QR: 2번, ${n}번'`, async () => {
    await other.locator("#impImg").setInputFiles(picked);
    await expect(progress(other).getByRole("heading", { name: "QR 사진으로 가져오기" })).toBeVisible();
    await expect(other.locator("#impStep")).toHaveText(`분석 완료 — 사진 ${picked.length}장`);
    await expect(other.locator("#impBar")).toHaveAttribute("style", /width:\s*100%/);
    await expect(other.locator("#impCount")).toHaveText(`QR ${n - 2} / ${n}장 읽음`);
    await expect(other.locator("#impMissing")).toHaveText(`2번, ${n}번`);
  }, other);
  await step("[외부] 번호 칸: 읽은 번호는 초록, 못 읽은 2번·마지막 번호는 빨강", async () => {
    await expect(ck(other, 1)).toHaveClass(/\bok\b/);
    await expect(ck(other, 2)).toHaveClass(/\bmiss\b/);
    await expect(ck(other, n)).toHaveClass(/\bmiss\b/);
    await expect(modalBox(other).locator("#chunkGrid .ck.ok")).toHaveCount(n - 2);
  }, other);
  await step("[외부] 사진별 결과: 각 사진에서 읽은 QR 번호", async () => {
    const rows = other.locator("#photoLog [data-photo]");
    await expect(rows).toHaveCount(picked.length);
    await expect(rows.nth(0)).toContainText("qr-1.gif");
    await expect(rows.nth(0)).toContainText("QR 1번");
    await expect(rows.nth(1)).toContainText("QR 3번");
  }, other);
  await step(`[외부] '사진 더 추가' → 2번·${n}번 사진만 선택 → 이어서 완성, 미리보기에 일정 ${events.length}건 '추가'`, async () => {
    const [chooser] = await Promise.all([other.waitForEvent("filechooser"), other.locator("#impMore").click()]);
    await chooser.setFiles(missing.map((i) => qr[i - 1]));
    await expect(modalBox(other).getByRole("heading", { name: "가져오기 미리보기" })).toBeVisible();
    await expect(modalBox(other).locator(".rev .tag.add")).toHaveCount(events.length);
  }, other);
  await step("[외부] 적용 → 달력에 반영", async () => {
    await modalBox(other).locator("#m_apply").click();
    await openTab(other, "달력");
    await expect(chip(other, events[0].date, events[0].title)).toHaveCount(1);
    await expect(other.locator("#footStat")).toHaveText(`일정 ${events.length} · 회의록 0`);
  }, other);
  await other.context().close();
});

test("4-4 QR이 없는 사진·이 앱이 아닌 QR·다른 내보내기의 QR은 사진별로 구분해 알려 준다", async ({ page, browser }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "4-4_QR사진_잘못된_사진_구분", { db: makeDb({ events: manyEvents(24) }) });
  let qrA, qrB, other;

  await step("[내부] QR 내보내기 A (일정 24건) 와 B (일정 1건, 1장) 준비", async () => {
    qrA = await exportQrImages(page, testInfo);
    await modalBox(page).locator("#m_cancel").click(); // 전송 완료 표시 confirm 은 자동 '확인'
    // B: 내보내기 기준 이후 새 일정 1건 → 1장짜리 QR
    await openTab(page, "달력");
    await page.evaluate(() => { db.events.push({ id: "e_new", date: "2026-11-30", start: "", end: "", title: "새 일정", memo: "", updatedAt: Date.now() + 1000, deleted: false }); save(); });
    const dirB = testInfo.outputPath("b");
    fs.mkdirSync(dirB, { recursive: true });
    const b = await exportQrImages(page, { outputPath: (f) => `${dirB}/${f}` });
    qrB = b[0];
    expect(b).toHaveLength(1);
  });
  const blank = testInfo.outputPath("blank.png");
  const foreign = testInfo.outputPath("foreign.gif");
  await step("QR 없는 사진, 다른 앱의 QR 사진 준비", async () => {
    // 1×1 흰 PNG
    fs.writeFileSync(blank, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64"));
    const src = await page.evaluate(() => { const q = qrcode(4, "L"); q.addData("https://example.com/hello"); q.make(); return q.createImgTag(8, 4).match(/src="([^"]+)"/)[1]; });
    fs.writeFileSync(foreign, Buffer.from(src.split(",")[1], "base64"));
  });

  other = await openReceiver(browser, testInfo);
  await step("[외부] A의 1번 + QR 없는 사진 + 다른 앱 QR + B(다른 내보내기) 선택 → 사진별로 구분", async () => {
    await other.locator("#impImg").setInputFiles([qrA[0], blank, foreign, qrB]);
    await expect(other.locator("#impStep")).toHaveText("분석 완료 — 사진 4장");
    const rows = other.locator("#photoLog [data-photo]");
    await expect(rows.nth(0)).toContainText("QR 1번");
    await expect(rows.nth(1)).toContainText("QR 못 찾음");
    await expect(rows.nth(2)).toContainText("이 앱의 QR 아님 1개");
    await expect(rows.nth(3)).toContainText("다른 내보내기 QR(1번)");
    await expect(other.locator("#impCount")).toHaveText(`QR 1 / ${qrA.length}장 읽음`);
    await expect(other.locator("#impMissing")).toContainText("2번");
  }, other);
  await step("[외부] 닫고 처음부터 다시 고르면(이전 조각 초기화) QR 없는 사진만 → '이 앱의 QR을 찾지 못했습니다'", async () => {
    await modalBox(other).locator("#m_cancel").click();
    const [chooser] = await Promise.all([other.waitForEvent("filechooser"), other.locator("#impImgBtn").click()]);
    await chooser.setFiles([blank]);
    await expect(other.locator("#impMsg")).toContainText("이 앱의 QR을 찾지 못했습니다");
    await expect(other.locator("#chunkGrid")).toHaveCount(0);
  }, other);
  await other.context().close();
});
