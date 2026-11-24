#!/usr/bin/env python3
"""테스트용 일정·회의록 데이터 생성기.

실행하면 오늘 날짜 기준(지난달~다음달)으로 일정과 회의록을 채운
백업 파일 test-data.json 을 만든다.
앱의 [⚙ 설정] → [⬆ 백업 복원] 으로 불러오면 된다. (기존 데이터는 교체됨)

    python3 gen_test_data.py            # test-data.json 생성
    python3 gen_test_data.py out.json   # 파일 이름 지정
"""
import json
import random
import sys
import time
from datetime import date, timedelta

random.seed(42)  # 매번 같은 결과

TODAY = date.today()
NOW_MS = int(time.time() * 1000)


def uid(prefix):
    return f"{prefix}_{random.getrandbits(40):010x}"


def month_start(offset):
    y, m = TODAY.year, TODAY.month + offset
    while m < 1:
        y, m = y - 1, m + 12
    while m > 12:
        y, m = y + 1, m - 12
    return date(y, m, 1)


def days_of(offset):
    d = month_start(offset)
    end = month_start(offset + 1)
    while d < end:
        yield d
        d += timedelta(days=1)


def ts_before(d):
    """해당 날짜 즈음의 updatedAt(ms). 미래 날짜는 지금 시각으로."""
    base = min(d, TODAY)
    t = int(time.mktime(base.timetuple()) * 1000) - random.randint(1, 72) * 3600_000
    return min(t, NOW_MS)


def hhmm(minutes):
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


# ---------- 일정 ----------
EVENT_TITLES = [
    ("주간 스탠드업", "진행 현황 공유"),
    ("고객사 미팅", "요구사항 2차 검토"),
    ("디자인 리뷰", "메인 화면 시안 B안"),
    ("코드 리뷰", "결제 모듈 PR"),
    ("QA 점검", "회귀 테스트 결과 확인"),
    ("배포", "v1.4 운영 반영"),
    ("스프린트 플래닝", ""),
    ("스프린트 회고", "KPT 방식"),
    ("외부 업체 통화", "API 연동 일정 협의"),
    ("보안 점검", "취약점 조치 결과 보고"),
    ("교육", "신규 입사자 온보딩"),
    ("점심 약속", ""),
    ("데이터 마이그레이션", "야간 작업, 롤백 계획 준비"),
    ("임원 보고", "분기 진척률"),
    ("인프라 점검", "서버 패치"),
]
ALL_DAY = [
    ("연차", "개인 일정"),
    ("워크숍", "1박 2일, 양평"),
    ("마감일", "중간 산출물 제출"),
    ("출장", "부산 고객사"),
]

events = []


def add_event(d, title, memo, start="", end=""):
    events.append({
        "id": uid("e"), "date": d.isoformat(), "start": start, "end": end,
        "title": title, "memo": memo, "updatedAt": ts_before(d),
        "deleted": False, "origin": "테스트",
    })


for off in (-1, 0, 1):
    for d in days_of(off):
        wd = d.weekday()  # 0=월 ... 6=일
        if wd == 0:  # 매주 월요일 스탠드업
            add_event(d, "주간 스탠드업", "진행 현황 공유", "09:30", "10:00")
        if wd >= 5:
            if random.random() < 0.1:
                add_event(d, "주말 당직", "장애 대응 대기")
            continue
        for _ in range(random.choices([0, 1, 2, 3], [3, 4, 2, 1])[0]):
            title, memo = random.choice(EVENT_TITLES[1:])
            s = random.randrange(9 * 60, 17 * 60, 30)
            add_event(d, title, memo, hhmm(s), hhmm(s + random.choice([30, 60, 90, 120])))
        if random.random() < 0.08:
            add_event(d, *random.choice(ALL_DAY))

# 오늘: "+N" 표시 확인용으로 일정 6개
for i, (title, memo) in enumerate(EVENT_TITLES[:6]):
    s = 9 * 60 + i * 90
    add_event(TODAY, title, memo, hhmm(s), hhmm(s + 60))
# 긴 제목(말줄임 확인용)
add_event(TODAY + timedelta(days=2),
          "아주 긴 제목의 일정 — 차세대 통합 플랫폼 구축 프로젝트 2단계 착수 보고회",
          "장소: 본사 대회의실", "14:00", "16:00")
# 삭제된 일정(화면에 보이면 안 됨)
add_event(TODAY + timedelta(days=1), "삭제된 일정 (보이면 버그)", "", "11:00", "12:00")
events[-1]["deleted"] = True

# 지난 일정 중 절반 정도는 종료 처리(나머지는 '지난 일정 종료' 버튼 테스트용)
for e in events:
    e["done"] = e["date"] < TODAY.isoformat() and random.random() < 0.5

# 일정 종류별 막대 색상 (앱의 팔레트 값과 같아야 함, "" = 디자인 기본색)
COLORS = {"배포": "#e5484d", "고객사 미팅": "#d6409f", "QA 점검": "#f76b15", "보안 점검": "#f76b15",
          "코드 리뷰": "#3e63dd", "디자인 리뷰": "#8e4ec6", "교육": "#30a46c", "점심 약속": "#8b8d98",
          "연차": "#12a594", "워크숍": "#12a594", "마감일": "#e5484d", "출장": "#e2b007"}
for e in events:
    e["color"] = COLORS.get(e["title"], "")

# ---------- 회의록 ----------
MEETINGS = [
    ("킥오프 회의", "- 프로젝트 범위 및 일정 합의\n- 역할 분담 확정\n- 주간 보고는 매주 금요일", "참석: PM, 개발 4, 디자인 1"),
    ("요구사항 검토", "- 로그인: SSO 지원 필요\n- 대시보드 위젯 6종 → 4종으로 축소\n- 엑셀 내보내기 필수", "고객사 확인 필요"),
    ("디자인 리뷰", "- 메인 컬러 확정(#4f8cff)\n- 모바일 하단 탭 구조로 변경\n- 아이콘 세트 교체", ""),
    ("API 설계 회의", "- REST 유지, 페이징은 cursor 방식\n- 인증 토큰 만료 30분\n- 에러 코드 표준표 작성(담당: 김)", "다음 회의 전까지 초안"),
    ("주간 진척 점검", "- 진척률 62% (계획 65%)\n- 결제 모듈 3일 지연\n- 리스크: 외부 API 응답 지연", "지연 만회 계획 수립"),
    ("QA 결과 공유", "- 결함 23건 (치명 1, 주요 6, 경미 16)\n- 치명 결함: 세션 만료 시 데이터 유실\n- 재테스트 일정 확정", "치명 결함 금주 내 조치"),
    ("배포 준비 회의", "- 배포 체크리스트 검토\n- 롤백 절차 리허설\n- 공지 문구 확정", "배포 당일 21시 시작"),
    ("스프린트 회고", "Keep: 데일리 짧게 유지\nProblem: 리뷰 대기 시간 길다\nTry: 리뷰어 2인 지정제", ""),
    ("보안 점검 결과", "- XSS 취약점 2건 조치 완료\n- 비밀번호 정책 강화\n- 로그 마스킹 누락 1건", "재점검 요청"),
    ("고객사 중간 보고", "- 데모 시연 완료, 반응 긍정적\n- 추가 요청: 알림 기능\n- 변경 요청은 CR로 관리", "CR-007 등록"),
    ("인프라 회의", "- 운영 서버 2대 → 3대 증설\n- 백업 주기 일 1회 → 2회\n- 모니터링 대시보드 구축", "예산 승인 필요"),
    ("데이터 이관 계획", "- 대상 테이블 48개\n- 사전 검증 스크립트 작성\n- 이관 리허설 2회", ""),
    ("1:1 면담", "- 업무 부하 조정\n- 교육 희망: 클라우드 자격증", "비공개"),
    ("주간 진척 점검", "- 진척률 71% (계획 72%)\n- 결제 모듈 지연 해소\n- 다음 주 통합 테스트 착수", ""),
    ("통합 테스트 계획", "- 시나리오 120개\n- 테스트 환경 금요일까지 구성\n- 결함 관리는 Jira 사용", "담당: 이, 박"),
]

meetings = []
work_days = [d for off in (-1, 0, 1) for d in days_of(off) if d.weekday() < 5]
picked = sorted(random.sample(work_days, len(MEETINGS)))
for d, (topic, check, note) in zip(picked, MEETINGS):
    meetings.append({
        "id": uid("m"), "date": d.isoformat(),
        "time": hhmm(random.randrange(9 * 60, 17 * 60, 30)),
        "topic": topic, "check": check, "note": note,
        "updatedAt": ts_before(d), "deleted": False, "origin": "테스트",
    })

db = {
    "schema": 1, "deviceId": uid("dev"), "deviceLabel": "",
    "lastSyncAt": 0, "lastExportAt": 0,
    "events": events, "meetings": meetings,
}

out = sys.argv[1] if len(sys.argv) > 1 else "test-data.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=1)
print(f"{out}: 일정 {len(events)}개(삭제 1 포함), 회의록 {len(meetings)}개")
