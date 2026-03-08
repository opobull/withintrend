# WithinTrend 포스트 작성 규칙

## 제목 형식
- ❌ "An Honest Review" 사용 금지
- ✅ "Working at [Company] as a [Role]: Pay, Pros, Cons & What to Expect"
- ✅ "What It's Like Working at [Company]: A Complete Guide"
- ✅ "[Company] [Role] Review: Everything You Need to Know"

## 도입부 필수 문구
첫 번째 또는 두 번째 문단에 반드시 포함:
> "This guide is based on a comprehensive review of dozens of real employee experiences shared across job review sites, forums, and social media — not a single person's opinion, but a balanced summary of what actual workers report."

## 글 구조
1. **Introduction**: 후킹 강하게 + 위 필수 문구 포함
2. **What You'll Actually Do**: 일상 업무
3. **Pay & Hours**: 시급, 주당 시간, 팁(있으면), 연봉 환산
4. **Pros**: 장점 5개 이내
5. **Cons**: 단점 5개 이내
6. **Tips for New Employees**: 신입 팁 3~5개
7. **FAQ**: 자주 묻는 질문 2~3개 (하단 배치 — 스크롤 유도)
8. **Conclusion**: 어떤 사람에게 추천하는지 (반드시 글 끝부분)

## 글 규칙
- **언어**: 영어
- **톤**: 3인칭 정보성 ("Many workers report that...", "According to reviews...")
- **길이**: 1500~2000 words
- **중복 금지**: 같은 내용 반복하지 마라
- **출처 링크 넣지 마라** — 종합 리뷰이므로 개별 출처 불필요
- **시점**: 2025-2026 기준

## Hugo frontmatter
```yaml
---
title: "Working at [Company] as a [Role]: Pay, Pros, Cons & What to Expect"
date: [현재 시간보다 과거]
description: "[간결한 설명 1줄]"
tags: ["company", "role", "category", "part-time jobs", "job reviews"]
categories: ["카테고리"]
draft: false
---
```

## 카테고리 목록
- Fast Food
- Restaurant
- Retail
- Grocery
- Delivery & Gig
- Coffee & Beverage
- Pharmacy & Beauty
- Fitness & Recreation
- Hotel & Hospitality
- Logistics & Shipping
- Entertainment
- Education & Childcare
- Freelance & Gig
- Other

## 파일명
- `[company]-[role]-review.md`
- 예: `mcdonalds-crew-member-review.md`

## 중복 확인
- 작성 전 `topics.json`의 `published` 목록 확인
- 이미 있으면 스킵
- 완료 후 `published`에 추가

## 소스 수집
- web_search로 "[company] [role] part time review experience pros cons pay" 검색
- 검색 스니펫에서 후기 내용 추출
- 연속 검색 간격: 3초 이상
- 429 에러 시: 10초 대기 후 재시도 (최대 3회)

## Git
- 5개마다 commit + push
- user.email: opobull@users.noreply.github.com
- user.name: opobull
