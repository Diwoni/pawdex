# Pawdex 기여 가이드

Pawdex는 현재 기획·기술 검증 단계입니다. 화면 동작과 정보 구조는 [Figma의 `Pawdex — Product UX` 페이지](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)를 승인된 구현 기준으로 사용합니다. 시각 브랜드는 계속 발전할 수 있지만, 핵심 흐름을 바꾸는 제안은 관련 기능 ID와 접근성·안전성 영향을 함께 설명해야 합니다. 상태 모델, Codex adapter, 병렬 실행 안전성, 알림 신뢰성, 음성 라우팅, 보안 및 테스트가 현재 구현의 우선순위입니다.

## 변경 전

1. 관련 기능 ID를 `docs/FEATURE_SPEC.md`에서 찾습니다.
2. 범위가 없다면 이슈에서 기능 계약과 승인 기준을 먼저 제안합니다.
3. Codex wire event를 추가하거나 바꾸면 상태 머신 테스트 계획을 포함합니다.
4. 보안 경계나 공개 프로토콜 변경은 threat model과 migration 계획을 함께 제시합니다.
5. 사용자 화면을 바꾸면 Figma 기준과의 차이, 초보 사용자에게 보이는 기본 흐름, 키보드·스크린 리더·대비·음향 대체 신호 영향을 확인합니다.

## 로컬 확인

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## 구현 규칙

- daemon은 기본적으로 `127.0.0.1`에만 바인딩합니다.
- 원격 raw shell API를 추가하지 않습니다.
- Codex 관련 구현은 `apps/daemon/src/codex` adapter 뒤에 둡니다.
- 승인·질문 payload는 method별 타입을 사용합니다. 임의 JSON 전달 endpoint를 공개 계약으로 만들지 않습니다.
- command/event에는 idempotency key와 sequence/cursor 의미를 보존합니다.
- 로그·fixture·오류 메시지에 prompt, access token, 파일 내용이 노출되지 않게 합니다.
- 권한 상승, 파괴적 변경, merge, worktree 정리는 명시적 확인을 요구합니다.

## 브랜치와 커밋

- 브랜치: `codex/<짧은-작업명>` 또는 `<type>/<짧은-작업명>`
- 커밋: 한 가지 검토 가능한 변경을 담고 관련 기능 ID를 본문에 적습니다.
- PR: 목적, 사용자 동작 변화, 실패/복구 동작, 보안 영향, 수행한 테스트를 포함합니다.

## Definition of Done

코드가 동작하는 것만으로 완료가 아닙니다. 기능 승인 기준, 오류 경로, 재시작/재연결, 보안 경계, 문서, 테스트와 migration까지 충족해야 합니다. 자세한 단계별 기준은 `docs/DELIVERY_PLAN.md`를 따릅니다.
