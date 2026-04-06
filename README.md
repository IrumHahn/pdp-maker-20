# Hanirum PDP Maker 20

한이룸의 상세페이지 마법사와 이미지 편집 실험을 모아둔 전용 프로젝트입니다.
소싱 워크스페이스와 트렌드 수집 콘솔은 이 저장소가 아니라 `../sourcing-maker-10`에서 운영합니다.

## What Lives Here
- `apps/web`: 상세페이지 마법사 UI와 관련 실험 화면
- `apps/api`: 상세페이지 생성에 필요한 API
- `packages/shared`: PDP 관련 공용 타입

## Start
```bash
pnpm install
pnpm --filter @runacademy/web dev
pnpm --filter @runacademy/api dev
```

## Main Routes
- Home: `http://localhost:3000/`
- PDP maker: `http://localhost:3000/pdp-maker`
- API health: `http://127.0.0.1:4000/v1/health`

## Notes
- 루트 `/`는 상세페이지 마법사 전용 홈 화면입니다.
- 소싱 관련 작업은 `sourcing-maker-10`에서 진행하세요.
- 예전 실험 라우트가 일부 남아 있어도 현재 주 진입점은 `/pdp-maker`입니다.
