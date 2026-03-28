# 진화형 블로그 — 일일 크론 태스크

## 개요
매일 1회 실행. 트래픽 분석 → 진화 판단 → 글 생성 → 배포를 한 턴에 처리.

## 실행 순서

### Step 1: 트래픽 분석
```bash
cd /home/vivius/.openclaw/workspace/withintrend
node scripts/analyze-traffic.js
```
- 어제 하루 Cloudflare 트래픽 수집
- data/fitness.json에 기록

### Step 2: 진화 판단
- data/fitness.json에서 최근 7일 누적 데이터 분석
- data/categories.json 읽어서 현재 카테고리 상태 확인
- 카테고리별 평균 방문수 계산
- **상위 30%**: 오늘 글 3편 추가 생성
- **중간 40%**: 오늘 글 1편 생성
- **하위 30%**: 오늘 글 생성 안 함
- **돌연변이**: 10% 확률로 새 카테고리 1개 추가 (2편 생성)
- data/categories.json, data/evolution-log.json 업데이트

### Step 3: 글 생성
- Step 2에서 결정된 카테고리/편수에 따라 글 작성
- Hugo frontmatter 포함 (title, date, description, tags, categories)
- date: 현재 시간 30분~1시간 이전
- content/posts/에 저장
- 최소 800단어, SEO 최적화, H2 구조

### Step 4: 배포
```bash
cd /home/vivius/.openclaw/workspace/withintrend
git add -A
git commit -m "evo: daily evolution - $(date +%Y-%m-%d)"
git push origin main
```

### Step 5: 보고
- sessions_send로 메인에게 결과 요약 보고:
  - 오늘 생성된 글 수, 카테고리 분포
  - 확장/도태/돌연변이 내역
  - 총 포스트 수

## 초기 시드 모드 (첫 2주)
- 아직 데이터가 부족하므로 판단 없이 20개 카테고리에서 균등하게 생성
- 카테고리당 1편씩 = 하루 20편 (빠르게 시드 뿌리기)
- fitness.json에 7일치 이상 데이터가 쌓이면 진화 모드로 전환

## 주의사항
- 기존 포스트 수정/삭제 금지
- hugo.toml, 기존 스크립트 수정 금지
- date 필드는 반드시 현재시간 이전으로

## 보고 규칙
- 모든 보고는 sessions_send로 메인에게:
  sessions_send({ sessionKey: "agent:main:main", message: "보고 내용" })
- 텔레그램 직접 사용 금지

## 🚫 파이프라인 우회 금지
- 에러 시 멈추고 보고
