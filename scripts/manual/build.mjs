#!/usr/bin/env node
// 사용자 매뉴얼 PDF 만들기 — PC판(A4) · 모바일판(A5)
//
//   npm run manual                 화면 캡처(scripts/manual/shots.mjs) → 두 판 조립 → PDF 2개
//   npm run manual -- --no-shots   캡처는 건너뛰고 이미 찍어 둔 docs/manual/shots/ 로 조립만
//
// 원본: docs/manual/manual.src.html
//   - <figure data-shot="이름"> 자리에 shots/이름.jpg 를 넣음
//   - data-for="pc" / "mobile" 요소는 그 판에만 남김. 장 번호·목차는 판마다 자동
// 결과: 사용자매뉴얼_PC.pdf, 사용자매뉴얼_모바일.pdf  (+ 미리보기 docs/manual/out/manual-pc.html, manual-mobile.html)
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { captureAll, SHOT_DIR } from "./shots.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "docs/manual/manual.src.html");
const OUT_DIR = path.join(ROOT, "docs/manual/out");
export const EDITIONS = [
  { id: "pc", label: "PC판", file: "사용자매뉴얼_PC.pdf", page: "A4", margin: "16mm 15mm 18mm" },
  { id: "mobile", label: "모바일판", file: "사용자매뉴얼_모바일.pdf", page: "A5", margin: "12mm 11mm 15mm" },
];

export async function buildManual({ shots = true } = {}) {
  const ver = (fs.readFileSync(path.join(ROOT, "project-calendar-app.html"), "utf8").match(/const APP_VER="(\d+\.\d+\.\d+)";/) || [])[1];
  if (!ver) throw new Error("project-calendar-app.html 에서 APP_VER 를 찾지 못했습니다");
  if (shots) {
    console.log("📸 화면 캡처");
    await captureAll();
  }

  // 1) 공통 조립: 버전·날짜, 그림 넣기
  let html = fs.readFileSync(SRC, "utf8");
  const d = new Date();
  html = html.replaceAll("{{APP_VER}}", ver).replaceAll("{{DATE}}", `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`);
  const used = new Set(), missing = new Set();
  html = html.replace(/<figure([^>]*?)data-shot="([\w-]+)"([^>]*)>([\s\S]*?)<\/figure>/g, (all, a, name, b, inner) => {
    const f = path.join(SHOT_DIR, name + ".jpg");
    if (!fs.existsSync(f)) { missing.add(name); return all; }
    used.add(name);
    const alt = ((inner.match(/<figcaption>([\s\S]*?)<\/figcaption>/) || [])[1] || name).replace(/<[^>]+>/g, "").replace(/"/g, "&quot;");
    return `<figure${a}${b}><img src="data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}" alt="${alt}">${inner}</figure>`;
  });
  if (missing.size) throw new Error("캡처 이미지가 없습니다: " + [...missing].join(", ") + " (scripts/manual/shots.mjs 에 추가하세요)");
  const unused = fs.readdirSync(SHOT_DIR).map((f) => f.replace(/\.jpg$/, "")).filter((n) => !used.has(n));
  if (unused.length) console.log("ℹ️  매뉴얼에서 쓰지 않는 캡처: " + unused.join(", "));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, "_all.html");
  fs.writeFileSync(base, html);

  // 2) 판별로: 해당 판 요소만 남기고 → 목차 → PDF
  const browser = await chromium.launch();
  const outputs = [];
  try {
    for (const ed of EDITIONS) {
      const page = await browser.newPage();
      await page.goto("file://" + base);
      const info = await page.evaluate(({ ed }) => {
        document.querySelectorAll("[data-for]").forEach((el) => { if (el.dataset.for !== ed.id) el.remove(); });
        document.body.classList.add(ed.id);
        document.body.innerHTML = document.body.innerHTML.replaceAll("{{EDITION}}", ed.label);
        const st = document.createElement("style");
        st.textContent = `@page{size:${ed.page};margin:${ed.margin}}`;
        document.head.appendChild(st);
        document.title = "프로젝트 일정·회의 관리 사용자 매뉴얼 (" + ed.label + ")";
        const chapters = [...document.querySelectorAll("section > h2")].map((h) => h.textContent.trim());
        document.querySelector("#toc ol").innerHTML = chapters.map((t) => `<li>${t}</li>`).join("");
        return { chapters, figures: document.querySelectorAll("figure img").length };
      }, { ed });
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
      fs.writeFileSync(path.join(OUT_DIR, `manual-${ed.id}.html`), await page.content());
      await page.emulateMedia({ media: "print", colorScheme: "light" });
      const pdf = path.join(ROOT, ed.file);
      await page.pdf({
        path: pdf, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="width:100%;font-size:7.5px;color:#888;padding:0 12mm;display:flex;justify-content:space-between;font-family:sans-serif">
          <span>프로젝트 일정·회의 관리 v${ver} 사용자 매뉴얼 (${ed.label})</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      });
      await page.close();
      const kb = Math.round(fs.statSync(pdf).size / 1024);
      console.log(`📕 ${ed.file} (${ed.page}, ${kb} KB, 그림 ${info.figures}장, ${info.chapters.length}장: ${info.chapters.join(" · ")})`);
      outputs.push(pdf);
    }
  } finally {
    await browser.close();
    fs.rmSync(base, { force: true });
  }
  return outputs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildManual({ shots: !process.argv.includes("--no-shots") });
}
