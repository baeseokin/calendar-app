#!/usr/bin/env node
// 변경된 파일 목록 → 실행할 E2E spec 선택
//
// 사용: node e2e/select-specs.mjs [파일 ...]      (인자가 없으면 git 에 스테이징된 파일)
// 출력(JSON): { mode: "none" | "some" | "all", specs: [...], reasons: {...} }
//   - none: 앱 동작과 무관한 변경 (문서·테스트 데이터 생성기 등) → E2E 불필요
//   - some: spec 파일만 바뀜 → 바뀐 spec 만 실행
//   - all : 앱(project-calendar-app.html)·설정·테스트 공통 코드 변경 → 전체 실행
//
// 이 앱은 HTML 파일 하나에 모든 화면이 들어 있어서, 앱이 바뀌면 화면별로 나눌 수 없으므로 항상 전체를 실행합니다.
// (전체 실행: PC · 태블릿 · iPhone · Android 124개 ≈ 30초)
import { execSync } from "child_process";
import fs from "fs";

const ALL_SPECS = fs.readdirSync(new URL(".", import.meta.url))
  .filter((f) => f.endsWith(".spec.js"))
  .sort()
  .map((f) => `e2e/${f}`);

// 앱 동작과 무관 → 무시
const IGNORE_PATTERNS = [
  /\.md$/i,
  /^(docs|\.claude|\.githooks)\//,
  /^e2e\/(select-specs\.mjs|run-related\.sh|open-report\.sh)$/,
  /^(\.gitignore|gen_test_data\.py|test-data\.json)$/,
  /^pds-diary\.html$/, // 별도 앱(PDS 다이어리) — E2E 대상 아님
  /(^|\/)\.DS_Store$/,
];

function stagedFiles() {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMRD", { encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function selectSpecs(files) {
  const specs = new Set();
  const reasons = {};
  let all = false;

  for (const f of files) {
    if (IGNORE_PATTERNS.some((re) => re.test(f))) continue;
    if (/^e2e\/[\w-]+\.spec\.js$/.test(f)) {
      if (ALL_SPECS.includes(f)) { specs.add(f); (reasons[f] ||= []).push(f); } // 삭제된 spec 은 실행할 것이 없음
      continue;
    }
    // 앱 HTML, playwright.config.js, package*.json, e2e/support·serve·global-* 등 → 전체 실행
    all = true;
    (reasons["*"] ||= []).push(f);
  }

  if (all || (specs.size && specs.size === ALL_SPECS.length)) return { mode: "all", specs: ALL_SPECS, reasons };
  if (specs.size === 0) return { mode: "none", specs: [], reasons };
  return { mode: "some", specs: ALL_SPECS.filter((s) => specs.has(s)), reasons };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  console.log(JSON.stringify(selectSpecs(args.length ? args : stagedFiles()), null, 2));
}
