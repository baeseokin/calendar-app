#!/usr/bin/env node
// 배포(릴리스) 스크립트
//
//   npm run release -- <버전|major|minor|patch> [--dry-run] [--allow-branch]
//
// 두 단계로 진행합니다.
//   1) 준비: 앱의 APP_VER · package.json 버전을 올리고, CHANGELOG.md 에 이번 버전 초안(지난 태그 이후 커밋 제목)을 넣습니다.
//            → CHANGELOG.md 를 읽고 다듬은 뒤 '같은 명령'을 다시 실행하세요.
//   2) 마무리: E2E 전체 통과 확인 → 커밋 "release: vX.Y.Z" → 태그 vX.Y.Z → 배포 파일 생성 (dist/vX.Y.Z/)
//            푸시와 GitHub Release 업로드는 하지 않고, 실행할 명령만 알려 줍니다.
//
//   --dry-run       파일·git 을 바꾸지 않고, 지금 상태로 배포 파일만 dist/dry-run/ 에 만들어 봄
//   --allow-branch  main 이 아닌 브랜치에서도 진행 (기본은 main 에서만 — 태그가 main 기록에 남아야 하므로)
//
// 배포 파일 (dist/vX.Y.Z/)
//   project-calendar-app.html   사용자 PC 에는 항상 이 이름으로 덮어씀 (파일 이름이 바뀌면 브라우저 저장 데이터가 안 보일 수 있음)
//   사용자매뉴얼.html
//   RELEASE_NOTES.md            CHANGELOG.md 의 이번 버전 항목
//   SHA256SUMS.txt              파일 해시 — 사내 보안 반입 때 '검토받은 파일과 같은 파일인지' 확인용
import { execFileSync, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = "project-calendar-app.html";
const MANUAL = "사용자매뉴얼.html";
const CHANGELOG = "CHANGELOG.md";
const PREPARED_FILES = [APP, "package.json", "package-lock.json", CHANGELOG]; // 준비 단계가 바꾸는 파일
const VER_RE = /const APP_VER="(\d+\.\d+\.\d+)";/;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const target = args.find((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");

const p = (f) => path.join(ROOT, f);
const read = (f) => fs.readFileSync(p(f), "utf8");
const write = (f, s) => fs.writeFileSync(p(f), s);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const die = (msg) => { console.error("❌ " + msg); process.exit(1); };
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function appVersion() {
  const m = read(APP).match(VER_RE);
  if (!m) die(`${APP} 에서 const APP_VER="x.y.z"; 를 찾지 못했습니다.`);
  return m[1];
}
function nextVersion(cur, t) {
  const [a, b, c] = cur.split(".").map(Number);
  if (t === "major") return `${a + 1}.0.0`;
  if (t === "minor") return `${a}.${b + 1}.0`;
  if (t === "patch") return `${a}.${b}.${c + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(t)) return t;
  die(`버전은 x.y.z 형식이나 major / minor / patch 로 주세요 (받은 값: ${t})`);
}
const isMajorBump = (from, to) => Number(to.split(".")[0]) > Number(from.split(".")[0]);
function lastTag() {
  try { return git("describe", "--tags", "--abbrev=0", "--match", "v*"); } catch { return null; }
}
function changelogSection(ver) {
  if (!fs.existsSync(p(CHANGELOG))) return null;
  const s = read(CHANGELOG);
  const i = s.indexOf(`## [${ver}]`);
  if (i < 0) return null;
  const j = s.indexOf("\n## [", i + 1);
  return s.slice(i, j < 0 ? undefined : j).trim();
}

function build(ver, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(p(APP), path.join(outDir, APP));
  fs.copyFileSync(p(MANUAL), path.join(outDir, MANUAL));
  const notes = changelogSection(ver) || `## [${ver}]\n\n(CHANGELOG.md 에 이 버전 항목이 없습니다)`;
  fs.writeFileSync(path.join(outDir, "RELEASE_NOTES.md"), `# 프로젝트 일정·회의 관리 v${ver}\n\n${notes}\n`);
  const sums = [APP, MANUAL, "RELEASE_NOTES.md"].map((f) => `${sha256(path.join(outDir, f))}  ${f}`).join("\n") + "\n";
  fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), sums);
  return sums;
}

if (!target) die("사용법: npm run release -- <버전|major|minor|patch> [--dry-run] [--allow-branch]");

const cur = appVersion();

/* ---------- 미리 해 보기 ---------- */
if (dryRun) {
  const out = p("dist/dry-run");
  const sums = build(cur, out);
  console.log(`🧪 dry-run: 현재 버전 v${cur} 으로 배포 파일을 만들었습니다 (git·파일 변경 없음)\n   ${out}\n\n${sums}`);
  console.log(`   다음 버전이 된다면: v${nextVersion(cur, target)}`);
  process.exit(0);
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main" && !flags.has("--allow-branch")) die(`main 브랜치에서 배포하세요 (지금: ${branch}). 꼭 필요하면 --allow-branch`);

const dirty = git("-c", "core.quotepath=false", "status", "--porcelain").split("\n").filter(Boolean).map((l) => l.slice(3));
const released = (v) => !!git("tag", "--list", `v${v}`);
// '준비된 상태' = APP_VER 가 아직 태그 없는 버전이고 CHANGELOG 에 그 항목이 있음 → 같은 명령을 다시 실행하면 그 버전으로 마무리
const prepared = !released(cur) && changelogSection(cur) !== null;
const ver = prepared && ["major", "minor", "patch"].includes(target) ? cur : nextVersion(cur, target);
if (released(ver)) die(`태그 v${ver} 가 이미 있습니다. 이미 배포한 버전입니다.`);

/* ---------- 1단계: 준비 ---------- */
if (!(ver === cur && prepared)) {
  if (dirty.length) die(`커밋되지 않은 변경이 있습니다. 먼저 커밋하거나 정리하세요:\n   - ${dirty.join("\n   - ")}`);
  const prev = lastTag();
  const log = git("log", "--no-merges", "--pretty=format:- %s", ...(prev ? [`${prev}..HEAD`] : []));
  write(APP, read(APP).replace(VER_RE, `const APP_VER="${ver}";`));
  for (const f of ["package.json", "package-lock.json"]) {
    if (!fs.existsSync(p(f))) continue;
    const j = JSON.parse(read(f));
    j.version = ver;
    if (j.packages && j.packages[""]) j.packages[""].version = ver;
    write(f, JSON.stringify(j, null, 2) + "\n");
  }
  const today = new Date().toISOString().slice(0, 10);
  const head = `# 변경 내역\n\n버전 번호는 주.부.수정 입니다. **주 버전이 바뀌면 동기화 형식이 달라져 내부·외부 PC를 함께 바꿔야 합니다.**\n`;
  const old = fs.existsSync(p(CHANGELOG)) ? read(CHANGELOG).replace(/^# 변경 내역[\s\S]*?(?=\n## \[|$)/, "").trim() : "";
  const draft = `## [${ver}] - ${today}\n\n` +
    `**두 PC 모두 교체 필요: ${isMajorBump(cur, ver) ? "예 (주 버전 변경 — 동기화 형식이 바뀜)" : "아니오"}**\n\n` +
    `### 바뀐 점 (초안: ${prev || "처음"} 이후 커밋 제목 — 사용자가 읽을 문장으로 고쳐 주세요)\n${log || "- (커밋 없음)"}\n`;
  write(CHANGELOG, `${head}\n${draft}${old ? "\n" + old + "\n" : ""}`);
  console.log(`📝 v${cur} → v${ver} 준비를 마쳤습니다.
   - ${APP}: APP_VER = "${ver}"
   - package.json: version = ${ver}
   - ${CHANGELOG}: [${ver}] 초안 추가
다음: ${CHANGELOG} 의 [${ver}] 항목을 읽고 다듬은 뒤, 같은 명령을 다시 실행하세요.
   npm run release -- ${target}${flags.has("--allow-branch") ? " --allow-branch" : ""}`);
  process.exit(0);
}

/* ---------- 2단계: 마무리 ---------- */
const unexpected = dirty.filter((f) => !PREPARED_FILES.includes(f));
if (unexpected.length) die(`배포 준비 파일 외의 변경이 있습니다. 먼저 정리하세요:\n   - ${unexpected.join("\n   - ")}`);
const section = changelogSection(ver);
if (/초안:/.test(section)) die(`${CHANGELOG} 의 [${ver}] 항목이 아직 초안입니다. '(초안: …)' 표시를 지우고 내용을 다듬은 뒤 다시 실행하세요.`);

git("add", ...PREPARED_FILES.filter((f) => fs.existsSync(p(f))));
console.log("▶ E2E 전체 실행 (PC · 태블릿 · iPhone · Android)");
const t = spawnSync(path.join(ROOT, "e2e/run-related.sh"), ["--all"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, E2E_NO_REPORT: "1" } });
if (t.status !== 0) die("E2E 테스트가 실패했습니다. 고친 뒤 다시 실행하세요 (버전 변경은 스테이징된 채로 남아 있습니다).");

// 준비 단계 변경이 이미 커밋돼 있으면(예: 첫 배포를 현재 커밋으로) 커밋 없이 지금 커밋에 태그만 붙임
const staged = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT }).status !== 0;
if (staged) git("commit", "-m", `release: v${ver}`, "-m", section);
git("tag", "-a", `v${ver}`, "-m", `프로젝트 일정·회의 관리 v${ver}`);
const out = p(`dist/v${ver}`);
const sums = build(ver, out);
console.log(`
✅ v${ver} 배포 준비 완료
   커밋: ${git("rev-parse", "--short", "HEAD")}${staged ? ` "release: v${ver}"` : " (기존 커밋)"} · 태그: v${ver}
   배포 파일: ${out}

${sums}
다음 단계 (직접 실행):
   git push origin ${branch} --follow-tags
   gh release create v${ver} "${out}/${APP}" "${out}/${MANUAL}" "${out}/SHA256SUMS.txt" --title "v${ver}" --notes-file "${out}/RELEASE_NOTES.md"
사내 반입: SHA256SUMS.txt 의 해시값을 보안 검토 요청서에 함께 적으세요.
사용자 PC: 기존 파일을 먼저 백업(설정 → 전체 백업)한 뒤, 같은 이름(${APP})으로 덮어쓰세요.`);
