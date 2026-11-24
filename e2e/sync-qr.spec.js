// 화면 E2E: QR 사진으로 동기화 — 진행 상태, 사진별 결과, 못 읽은 QR 번호 안내, '사진 더 추가'로 이어서 완성
//   보내는 기기 화면의 QR 이미지(GIF)를 실제 파일로 저장해, 받는 기기에서 그 '사진'을 고르는 방식으로 흉내 낸다.
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
  const cells = modalBox(page).locator(".qrcell"); // '전체 보기' 목록 (한 장씩 보기 상태에서는 숨겨져 있어도 DOM 에 있음)
  await expect(cells.first()).toBeAttached();
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
  await step("[외부] 동기화 탭 가져오기 버튼은 'QR 사진으로 가져오기'·'패치 파일 열기' 두 개 (카메라 실시간 읽기 없음)", async () => {
    const btns = other.locator("#tab-sync .panel").nth(1).locator("button");
    await expect(btns).toHaveText(["🖼 QR 사진으로 가져오기", "📄 패치 파일 열기"]);
  }, other);
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

test("4-5 QR 내보내기는 한 장씩 크게 보여 주고 이전·다음 버튼과 ← → 키로 넘긴다", async ({ page }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "4-5_QR_한장씩_보기", { db: makeDb({ events: manyEvents(24) }) });
  const one = () => modalBox(page).locator("#qrOneImg img");
  const srcOf = (i) => modalBox(page).locator(`.qrcell[data-qr="${i}"] img`).getAttribute("src");
  let n;

  await step("'QR로 내보내기' → 기본은 한 장씩: 1번 QR 크게, '1 / N', 이전 버튼 비활성", async () => {
    await openTab(page, "동기화");
    await page.locator("#expQR").click();
    n = await modalBox(page).locator(".qrcell").count();
    expect(n).toBeGreaterThan(1);
    await expect(modalBox(page).locator("#qrAll")).toBeHidden();
    await expect(page.locator("#qrOneNum")).toHaveText(`1 / ${n}`);
    await expect(one()).toHaveAttribute("src", await srcOf(1));
    await expect(page.locator("#qrPrev")).toBeDisabled();
    await expect(one()).toHaveCSS("cursor", "none"); // 마우스 커서가 QR 을 가리지 않게
  });
  await step("'다음 ▶' → 2번", async () => {
    await page.locator("#qrNext").click();
    await expect(page.locator("#qrOneNum")).toHaveText(`2 / ${n}`);
    await expect(one()).toHaveAttribute("src", await srcOf(2));
  });
  await step("→ 키 → 3번, ← 키 → 2번", async () => {
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#qrOneNum")).toHaveText(`3 / ${n}`);
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#qrOneNum")).toHaveText(`2 / ${n}`);
  });
  await step("'전체 보기' → 모든 QR 목록, '한 장씩 크게' → 다시 2번", async () => {
    await page.locator("#qrModeAll").click();
    await expect(modalBox(page).locator("#qrAll")).toBeVisible();
    await expect(page.locator("#qrOne")).toBeHidden();
    await page.locator("#qrModeOne").click();
    await expect(page.locator("#qrOneNum")).toHaveText(`2 / ${n}`);
  });
});

test("4-6 화면 사진에 위·아래 이웃 QR 이 걸쳐 찍혀도 가운데 QR 을 읽는다", async ({ page, browser }, testInfo) => {
  const { step } = await startScenario(page, testInfo, "4-6_이웃_QR_걸친_사진", { db: makeDb({ events: manyEvents(24) }) });
  let qr, photo, other;

  await step("[내부] QR 내보내기 → 2번 QR 위아래에 1번 아랫부분·3번 윗부분이 걸친 '화면 사진' 만들기", async () => {
    qr = await exportQrImages(page, testInfo);
    const srcs = await Promise.all([1, 2, 3].map((i) => modalBox(page).locator(`.qrcell[data-qr="${i}"] img`).getAttribute("src")));
    const r = await page.evaluate(async (srcs) => {
      const imgs = await Promise.all(srcs.map((s) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = s; })));
      const h = imgs[0].naturalHeight, w = imgs[0].naturalWidth, part = Math.round(h * 0.3), gap = 40;
      const c = document.createElement("canvas"); c.width = w; c.height = part + gap + h + gap + part;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(imgs[0], 0, part - h);              // 1번: 아래쪽 30% (왼쪽 아래 모서리 표식 포함)
      x.drawImage(imgs[1], 0, part + gap);            // 2번: 전체
      x.drawImage(imgs[2], 0, part + gap + h + gap);  // 3번: 위쪽 30% (위쪽 모서리 표식 2개 포함)
      x.fillStyle = "#333"; x.font = "bold 20px sans-serif"; x.textAlign = "center";
      x.fillText("1 / n", w / 2, part + gap / 2 + 7); x.fillText("2 / n", w / 2, part + gap + h + gap / 2 + 7);
      const d = x.getImageData(0, 0, c.width, c.height);
      const whole = jsQR(d.data, c.width, c.height, { inversionAttempts: "attemptBoth" }); // 사진 전체를 한 번에 읽으면?
      return { url: c.toDataURL("image/png"), whole: whole ? whole.data.slice(0, 12) : null };
    }, srcs);
    expect(r.whole).toBeNull(); // 전제: 사진 전체로는 이웃 QR 때문에 인식되지 않는 상황
    photo = testInfo.outputPath("screen-photo.png");
    fs.writeFileSync(photo, Buffer.from(r.url.split(",")[1], "base64"));
  });
  other = await openReceiver(browser, testInfo);
  await step("[외부] 그 사진으로 가져오기 → 사진별 결과에 'QR 2번', 번호 칸 2번 초록", async () => {
    await other.locator("#impImg").setInputFiles([photo]);
    await expect(other.locator("#impStep")).toHaveText("분석 완료 — 사진 1장");
    await expect(other.locator("#photoLog [data-photo]").first()).toContainText("QR 2번");
    await expect(ck(other, 2)).toHaveClass(/\bok\b/);
  }, other);
  await other.context().close();
});
