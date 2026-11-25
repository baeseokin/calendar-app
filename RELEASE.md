# 배포(릴리스)와 버전 관리

## 버전 번호: 주.부.수정

| 올리는 자리 | 언제 | 사용자에게 |
|---|---|---|
| **주** (2.0.0 → 3.0.0) | 동기화 패치·백업 형식이 바뀌어 구버전과 주고받을 수 없을 때 | **내부·외부 PC를 함께 바꾸세요** |
| **부** (2.0.0 → 2.1.0) | 기능 추가 (형식 호환 유지) | 한쪽씩 바꿔도 됨 |
| **수정** (2.1.0 → 2.1.1) | 버그 수정만 | 한쪽씩 바꿔도 됨 |

- 앱 버전은 `project-calendar-app.html` 의 `const APP_VER="x.y.z";` **한 곳**에만 적습니다. 제목·화면 아래·설정 탭 표시는 이 값으로 만들어집니다.
  `package.json` 의 version 과 항상 같아야 하며, E2E 5-5 가 이를 확인합니다. 손으로 고치지 말고 `npm run release` 를 쓰세요.
- 앱 버전과 별개로 **데이터 형식 버전**이 있습니다: 동기화 패치 `v`(지금 2), 저장 데이터 `schema`(지금 1).
  형식을 바꿀 때는 기존 칸을 지우거나 순서를 바꾸지 말고 **끝에 붙이기만** 하고, 새 앱이 옛 형식을 계속 읽도록 합니다 (E2E 4-7).
  패치 `v` 가 올라가면 앱의 **주** 버전도 올립니다.

## 배포 절차

`main` 브랜치에서 진행합니다 (태그가 `main` 기록에 남아야 나중에 "어떤 코드가 배포됐는지" 찾을 수 있음).

```bash
npm run release -- minor          # 1) 준비: APP_VER·package.json 올림 + CHANGELOG.md 초안 + 매뉴얼 PDF 다시 만듦
#    → CHANGELOG.md 의 새 항목을 사용자가 읽을 문장으로 다듬고 '(초안: …)' 표시를 지움
npm run release -- minor          # 2) 마무리: E2E 전체 → 커밋 "release: vX.Y.Z" → 태그 → dist/vX.Y.Z/
git push origin main --follow-tags
gh release create vX.Y.Z dist/vX.Y.Z/project-calendar-app.html dist/vX.Y.Z/사용자매뉴얼_PC.pdf dist/vX.Y.Z/사용자매뉴얼_모바일.pdf \
  dist/vX.Y.Z/SHA256SUMS.txt --title vX.Y.Z --notes-file dist/vX.Y.Z/RELEASE_NOTES.md
```

- `major` / `minor` / `patch` 대신 `2.1.0` 처럼 버전을 직접 줄 수도 있습니다.
- `npm run release -- patch --dry-run` : 아무것도 바꾸지 않고 지금 상태로 배포 파일만 `dist/dry-run/` 에 만들어 봅니다.
- 스크립트는 푸시·GitHub 업로드를 하지 않습니다. 마지막에 실행할 명령을 알려 줍니다.

### 배포 파일 (`dist/vX.Y.Z/`)

| 파일 | 용도 |
|---|---|
| `project-calendar-app.html` | 앱. 사용자 PC 에는 **항상 이 이름**으로 덮어씁니다 |
| `사용자매뉴얼_PC.pdf` · `사용자매뉴얼_모바일.pdf` | 사용자 매뉴얼 (화면 캡처 포함, 준비 단계에서 새 버전으로 다시 만듦) |
| `RELEASE_NOTES.md` | CHANGELOG 의 이번 버전 항목 |
| `SHA256SUMS.txt` | 파일 해시. 사내 보안 반입 때 검토받은 파일과 같은지 확인하는 데 씁니다 |

## 체크리스트

1. E2E 전체 통과 (스크립트가 확인)
2. `CHANGELOG.md` — 바뀐 점, **두 PC 모두 교체 필요 여부**
3. 사용자 매뉴얼 — 새 기능·바뀐 화면을 `docs/manual/manual.src.html` 과 캡처 스크립트에 반영 (`user-manual` 스킬, `npm run manual`)
4. 릴리스 태그·GitHub Release (앱·매뉴얼·해시)
5. 사내 반입: 보안 검토 요청에 `SHA256SUMS.txt` 의 해시값 첨부
6. 사용자 PC 교체: **설정 → 전체 백업** 먼저, 같은 폴더·같은 이름으로 덮어쓰기, 화면 아래 버전 확인
7. 어느 PC 에 어느 버전을 깔았는지 기록 (주 버전이 다르면 동기화 정보 일부가 전달되지 않음)

## 왜 파일 이름을 바꾸지 않나요?

데이터는 파일이 아니라 **브라우저 저장소**에 있습니다. 브라우저·설정에 따라 파일 이름이나 위치가 바뀌면 저장소를 다른 곳으로 보고
기존 데이터가 안 보일 수 있습니다. 그래서 버전은 파일 이름이 아니라 **앱 화면과 태그·릴리스**로 구분합니다.
