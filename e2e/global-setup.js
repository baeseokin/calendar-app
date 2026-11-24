// E2E 시작 전: 이전 실행 스크린샷 정리 (항상 마지막 실행 결과만 남김)
import fs from "fs";

export default async function globalSetup() {
  fs.rmSync(new URL("../e2e-screenshots", import.meta.url), { recursive: true, force: true });
}
