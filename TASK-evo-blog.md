# 진화형 블로그 (Evolutionary Blog) — withintrend.org

## 개요
유전 알고리즘 원리로 운영하는 자율 블로그. 다양한 주제를 뿌리고, 트래픽 분석으로 적합도 판단, 잘 되는 주제를 확장하고 안 되는 주제를 도태시킨다.

## 인프라
- **사이트**: https://withintrend.org
- **스택**: Hugo + PaperMod + Cloudflare Pages
- **배포**: `git push origin main` → 자동 빌드/배포
- **분석**: Cloudflare GraphQL Analytics API
- **저장소**: /home/vivius/claude-code/workspace/withintrend/

## Cloudflare API
- Token: `CF_API_TOKEN` (config/.env)
- Zone ID: `4a1801ca2da39344c72bda4c7cf6f6ae`
- Free 플랜 제한: 하루 단위 조회만 가능 (datetime_geq/leq)
- 봇 필터링: clientRequestPath에서 robots.txt, sitemap.xml, *.xml, *.css, *.js 제외

## 진화 메커니즘

### 1단계: 시드 (Seeding)
다양한 카테고리에서 대량 포스트 생성:

**카테고리 풀 (초기 20개):**
1. Tech & AI
2. Health & Fitness
3. Recipes & Cooking
4. Travel & Places
5. Personal Finance
6. Gaming
7. Movies & TV
8. DIY & Life Hacks
9. Pets & Animals
10. Cars & Auto
11. Real Estate
12. Celebrity & Entertainment News
13. Sports
14. Fashion & Style
15. Parenting & Family
16. Home & Garden
17. Music
18. Education & Study Tips
19. Relationships & Dating
20. Weird & Interesting Facts

**시드 목표**: 카테고리당 10편 = 200편 추가 (기존 212편 + 200편 = ~412편)

### 2단계: 적합도 평가 (Fitness Evaluation)
**분석 크론**: 매일 1회 (UTC 00:00 = KST 09:00)

```
1. Cloudflare API로 어제 하루 페이지별 요청 수집
2. 봇/크롤러 필터링:
   - robots.txt, sitemap.xml, *.css, *.js, *.xml, favicon.ico 제외
   - / (홈) 제외
   - /tags/*, /categories/* 제외
3. 카테고리별 합산
4. fitness.json에 기록:
   {
     "date": "2026-03-28",
     "categories": {
       "tech-ai": { "posts": 10, "visits": 45, "avg": 4.5 },
       "gaming": { "posts": 10, "visits": 2, "avg": 0.2 },
       ...
     }
   }
```

### 3단계: 진화 (Evolution)
**주기**: 2주마다 1회 평가

**선택 (Selection):**
- 카테고리별 평균 방문수 기준 상위 30% → **확장** (추가 10편 생성)
- 하위 30% → **도태** (더 이상 생성 안 함, 기존 글은 유지)
- 중간 40% → **유지** (현상 유지)

**돌연변이 (Mutation):**
- 매 진화 주기마다 10% 확률로 완전 새로운 카테고리 1~2개 추가
- 기존 카테고리 풀에 없는 것에서 랜덤 선택
- 돌연변이 카테고리당 5편 생성

**교차 (Crossover):**
- 상위 카테고리 2개를 조합한 하이브리드 주제 생성
- 예: Tech + Gaming = "Best Budget Gaming Laptops 2026"
- 진화 주기당 하이브리드 5편 생성

### 4단계: 수렴 (Convergence)
- 3~5세대(6~10주) 후 상위 카테고리가 안정화되면
- 해당 카테고리에 집중 투자 (주 20편+)
- 여전히 돌연변이 5%는 유지 (새 기회 탐색)

## 글 생성 규칙
- Hugo frontmatter: title, date, description, tags, categories
- date: 현재 시간 기준 과거로 설정 (buildFuture=false)
- 영어, SEO 최적화 (메타 디스크립션, H2 구조)
- 최소 800단어, 자연스러운 톤
- 카테고리별 tags 자동 배정
- 이미지: 일단 없이 텍스트만 (추후 추가 가능)

## 파일 구조
```
withintrend/
├── content/posts/         # Hugo 포스트
├── data/
│   ├── fitness.json       # 적합도 기록
│   ├── evolution-log.json # 진화 이력
│   └── categories.json    # 카테고리 상태 (active/dormant/mutant)
├── scripts/
│   ├── generate-posts.js  # 포스트 대량 생성
│   ├── analyze-traffic.js # Cloudflare 트래픽 분석
│   └── evolve.js          # 진화 판단 + 실행
├── TASK-evo-blog.md       # 이 파일
└── hugo.toml
```

## 스크립트 상세

### generate-posts.js
```
node scripts/generate-posts.js --category "tech-ai" --count 10
```
- LLM으로 주제 선정 + 글 생성
- Hugo 포맷으로 content/posts/에 저장
- 파일명: {slug}.md

### analyze-traffic.js
```
node scripts/analyze-traffic.js --date 2026-03-27
```
- Cloudflare API 호출
- 봇 필터링
- data/fitness.json에 결과 추가

### evolve.js
```
node scripts/evolve.js
```
- fitness.json 2주치 데이터 분석
- 카테고리 확장/도태/돌연변이 결정
- generate-posts.js 호출
- git add + commit + push
- evolution-log.json에 기록

## 크론 스케줄
- **분석**: 매일 09:00 KST → `node scripts/analyze-traffic.js`
- **진화**: 2주마다 일요일 10:00 KST → `node scripts/evolve.js`
- **일일 시드** (초기 단계): 매일 10:00 KST → 새 글 5~10편 생성 + push

## 주의사항
- 기존 212개 파트타임 글은 삭제하지 않음 (하나의 카테고리로 취급)
- hugo.toml의 title/description 업데이트 필요 (파트타임 전용 → 범용)
- git push 후 Cloudflare Pages 빌드 2~3분 소요
- Free 플랜 API 제한: 하루 단위 쿼리만 가능
