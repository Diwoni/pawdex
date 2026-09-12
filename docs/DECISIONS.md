# Pawdex 핵심 의사결정 기록

상태 표기: `승인`, `제안`, `보류`. `제안`은 구현 착수 전 리뷰에서 변경할 수 있다.

## 결정 요약

| ID | 상태 | 결정 | 근거 |
| --- | --- | --- | --- |
| ADR-001 | 승인 | 제품명은 당분간 `Pawdex`를 사용한다. | 레포와 문서에서 사용할 작업명이 필요하다. 상표·도메인 검토 전 확정 이름은 아니다. |
| ADR-002 | 승인 | 라이선스는 MIT로 시작한다. | 개발자 도구 채택과 외부 기여 장벽을 낮춘다. 의존성 라이선스 검사는 별도 게이트다. |
| ADR-003 | 승인 | P0 daemon은 loopback/로컬 IPC에만 바인딩하며 원격은 outbound E2EE relay만 사용한다. | 로컬 코드·대화·승인 요청이 LAN이나 인터넷에 무심코 노출되는 것을 막는다. 직접 LAN mode는 P1 별도 결정이다. |
| ADR-004 | 승인 | Codex 연동의 주 인터페이스는 `app-server` JSON-RPC다. | thread/turn/stream/approval을 구조화된 계약으로 다룰 수 있다. `exec --json`은 제한적 fallback만 고려한다. |
| ADR-005 | 승인 | Codex wire schema를 도메인 모델에 직접 노출하지 않는다. | 외부 계약 변경을 adapter와 contract test 안에서 흡수한다. |
| ADR-006 | 승인 | 원격 클라이언트에는 raw shell endpoint를 제공하지 않는다. | 명령 주입과 권한 경계 붕괴를 구조적으로 방지한다. |
| ADR-007 | 승인 | 동시에 파일을 쓰는 작업은 기본적으로 별도 Git worktree를 사용한다. | 충돌 반경을 줄이고 작업 결과를 브랜치 단위로 검토·폐기할 수 있다. |
| ADR-008 | 제안 | 이벤트 원장은 SQLite WAL로 시작한다. | 단일 머신 MVP에서 운영 부담이 작고 sequence/cursor, 재시작 복구, 멱등 키를 트랜잭션으로 처리할 수 있다. |
| ADR-009 | 승인 | 공개 P0 원격 접속은 relay가 평문을 모르는 종단간 암호화 구조만 허용한다. | 세션 내용과 승인 정보는 서비스 운영자도 읽지 못해야 한다. 구체 암호 조합은 검증된 구현과 외부 리뷰를 거쳐 별도 ADR로 고정한다. |
| ADR-010 | 제안 | 모바일 MVP는 PWA/Web Push, 신뢰성·음향 제약이 확인되면 얇은 native client로 전환한다. | 설치 마찰을 낮추되 iOS background·커스텀 음향 한계를 실제 측정으로 판단한다. |
| ADR-011 | 승인 | `Pawdex — Product UX` Figma 초안을 화면 동작·정보 구조의 구현 기준으로 사용하고 시각 브랜드는 검증에 따라 발전시킨다. | 단순한 기본 흐름을 고정해 구현 불일치를 줄이면서도 색·타이포그래피·캐릭터 표현을 조기에 영구 고정하지 않는다. |
| ADR-012 | 승인 | 음성·TTS·알림 quick action은 어떤 Approval도 수락하지 않으며, 특히 파괴적·권한 상승 수락은 잠금 해제된 인증 UI에서만 완료한다. | 음성은 화면 이동·거절·취소만 할 수 있고 단일 또는 반복 발화로 승인 권한을 부여하지 않는다. |
| ADR-013 | 승인 | P0는 Planner의 자동 Task DAG **제안**을 포함하되 모든 Plan은 사용자가 confirm한 뒤에만 실행한다. | “병렬로 나눠 줘”라는 핵심 JTBD를 제공하면서도 자동 분해 결과의 쓰기 범위·비용·의존성을 사람이 통제한다. 정책 기반 무확인 자동 실행은 P1 검토 대상이다. |
| ADR-014 | 승인 | 공개 canonical 저장소는 `github.com/Diwoni/pawdex`로 시작하고 GitHub private vulnerability reporting을 사용한다. | 초기 기여·이슈·보안 신고 경로를 하나로 고정한다. 향후 조직 이전 시 redirect와 보안 신고 연속성을 유지한다. |
| ADR-015 | 승인 | Orca의 orchestration·worktree·review 운영 패턴은 선별 채택하되 Pawdex를 범용 ADE·PTY·SSH 클라이언트로 확장하지 않는다. | Codex-native 안전 제어면이라는 제품 초점을 지키고 raw terminal, credential hot-swap, browser/port-forwarding이 넓히는 공격 표면을 피한다. |
| ADR-016 | 승인 | P1 comparative run은 동일 frozen Task와 base에서 제한된 후보를 실행하고 사람이 winner를 선택한다. | 여러 구현의 차이를 유용한 신호로 쓰되 다수결을 정답으로 취급하거나 패배 후보를 자동 삭제하지 않는다. |
| ADR-017 | 승인 | P1 `UsageWindowRun`은 reset 전 사용량을 정확히 소진하는 기능이 아니라, 사전 선택한 유용한 큐를 목표 사용률 범위와 안전 여유 안에서 best-effort 실행하는 기능으로 만든다. | provider snapshot과 작업별 사용량은 지연·오차가 있으므로 100% 소진 약속은 거짓 정밀도와 runaway 실행을 만든다. |

## ADR-004: Codex 런타임 통합

Pawdex daemon은 머신당 Codex `app-server` 프로세스를 관리하고 여러 thread를 multiplex한다. `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, `turn/steer`, `turn/interrupt`와 server request를 adapter에서 정규화한다.

다음은 구현 게이트다.

- 지원 Codex 버전 범위를 명시한다.
- 공식 schema 생성 결과를 CI fixture로 고정한다.
- 새/변경된 event mapping에는 상태 머신 회귀 테스트를 추가한다.
- 알 수 없는 이벤트는 실패시키지 않고 관측 가능하게 기록하되 민감 값은 redact한다.
- 지원 범위를 벗어난 버전은 조용히 오동작하지 않고 capability 오류로 차단한다.

## ADR-007: 병렬성 모델

병렬성은 “동시에 많은 프로세스를 띄운다”가 아니라 격리·의존성·리소스 예산을 포함한다.

- 읽기 전용 조사 작업은 같은 checkout을 공유할 수 있다.
- daemon이 관리하는 파일 쓰기 TaskAttempt는 `codex/pawdex/<plan-short-id>/<task-attempt-short-id>` 내부 namespace의 브랜치와 worktree에서 실행한다.
- 이 runtime managed branch는 기여자가 PR 작업에 쓰는 `codex/<type>-<feature-id>-<short-name>` 브랜치와 목적·수명주기가 다르며 서로 대신 사용하지 않는다.
- 선행 작업의 산출물이 필요한 작업은 DAG dependency가 완료될 때까지 시작하지 않는다.
- 동일 파일/서비스/포트를 점유할 가능성이 있으면 scheduler resource lock을 사용한다.
- merge, branch 삭제, worktree 제거는 별도 검토 단계로 둔다.

## ADR-010: 알림 클라이언트 선택 기준

PWA와 native를 취향으로 결정하지 않고 아래 실험 결과로 결정한다.

| 검증 항목 | 목표 |
| --- | --- |
| iOS 잠금 상태 전달 성공률 | 내부 dogfood 7일 기준 99% 이상 |
| 중복 알림률 | attention event의 0.1% 미만 |
| 알림 지연 p95 | 온라인 relay 기준 10초 미만 |
| 사용자 지정 냐옹 소리 | 플랫폼 정책 범위 내에서 예측 가능하게 재생 |
| 음성 후속 지시 복귀 | 알림 탭에서 대상 세션이 정확히 선택됨 |

PWA가 목표를 충족하지 못하면 iOS/macOS 얇은 native shell을 P1로 올린다.

## ADR-011: 제품 UX 구현 기준 (2026-09-12)

- [Figma의 `Pawdex — Product UX` 페이지](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)를 승인된 제품 UX 초안이자 사용자 화면 구현의 기준으로 사용한다.
- 핵심 사용자 흐름, 화면 간 이동, 정보 우선순위, 안전 확인, 상태 표현은 기능 명세와 이 초안을 함께 만족해야 한다. 충돌하면 기능·보안 계약을 우선하고 Figma를 같은 변경에서 갱신한다.
- 초보 사용자에게는 일상 언어와 다음 행동을 먼저 보여 주고, DAG·revision·OID·usage freshness 같은 기술 세부정보는 필요할 때 펼치는 progressive disclosure를 적용한다.
- 상태는 색만으로 구분하지 않고 아이콘·텍스트를 함께 사용한다. 키보드 포커스, 스크린 리더 이름, 충분한 대비, 터치 목표, 음향의 시각적 대체 신호를 구현 승인 기준에 포함한다.
- 색상, 타이포그래피, 일러스트, 고양이 캐릭터의 세부 표현 같은 시각 브랜드는 사용성·접근성 검증과 향후 디자인 입력에 따라 변경할 수 있다.

## ADR-013: 자동 작업 분해의 P0 경계

- 사용자가 자동 분할을 요청하면 Planner가 versioned `Plan`과 Task DAG 초안을 만든다.
- daemon은 cycle, dependency, write scope, worktree, 동시성·예산 정책을 검증하지만 `Plan.confirmed` 전에는 worktree나 실행 Session을 만들지 않는다.
- P0의 자동화 범위는 **분해·제안·검증**까지다. 실행은 Plan revision과 Task 목록을 본 사용자의 명시적 confirm 뒤에만 시작한다.
- P1에서 정책 기반 조건부 자동 실행을 검토할 수 있지만 destructive/elevated 승인과 외부 side effect 확인은 자동화하지 않는다.

## ADR-015: Orca에서 가져올 것과 가져오지 않을 것

- P0 설계를 보강하는 참고점은 durable Run/Task/Dispatch, stale-attempt fencing, 비동기 worktree lifecycle, daemon 생존 시 warm reattach와 daemon/host 종료 시 worktree·layout·마지막 scrollback만 복원되고 agent process는 종료되는 경계, `needs you` 중심 attention이다.
- P1 제품 후보는 comparative run, line-anchored batch review, 안전한 hibernation, provider가 지원하는 usage/rate-limit 가시성이다. 사용자용 redacted progress checkpoint는 아직 기능 ID·마일스톤을 부여하지 않은 후속 검토 항목이다.
- worktree는 Git 변경 격리 수단이지 OS process, network, credential, secret의 sandbox가 아니다. Codex sandbox와 typed approval을 유지한다.
- 모바일·relay에는 raw terminal, 임의 keystroke, 범용 shell command, account hot-swap을 제공하지 않는다.
- terminal split, editor, 내장 browser/Design Mode, SSH/port forwarding, 범용 computer use는 P0/P1 core 밖이다. 필요성이 검증되면 별도 제품·보안 ADR로만 추가한다.
- public push는 Orca의 content-bearing payload를 따르지 않고 Pawdex의 opaque single-use wake token 뒤 E2EE fetch 원칙을 유지한다.

## ADR-016: Comparative run의 안전 경계

- 후보는 동일한 frozen Task revision, base tree OID, input artifact set, completion/verification contract에서 시작한다.
- 각 후보는 별도 TaskAttempt와 managed worktree를 사용하며 전체 후보 수·시간·attempt·disk·지원 시 token/cost hard cap을 공유한다.
- 비교 결과에는 diff summary, changed files, verification, artifact, elapsed time과 사용량 출처를 표시한다. 자동 점수는 근거일 뿐 winner 결정 권한이 아니다.
- winner 통합은 기존 typed integration과 인증 UI 규칙을 그대로 사용한다.
- 패배·중단 후보의 branch/worktree는 자동 삭제하지 않고 보존 또는 정리를 사용자가 선택한다.

## ADR-017: Usage Window Runner의 실행·비용 경계

- 로컬 관리자가 `UsageWindowPreset`에 대상 queue, eligible Task 기준, 목표 사용률 범위, reserve, reset 전 새 attempt launch를 멈출 buffer, 동시성, RunBudget·비용 상한을 미리 저장한다.
- 잠금 해제된 인증 UI의 단일 action은 fresh rate-limit snapshot, preset/queue/Project revision, forecast summary에 결박된 idempotent `UsageWindowRun` 하나를 시작한다. 원격 시작은 별도 `usage_window.start` capability가 있는 폐기되지 않은 paired device와 fresh user-presence receipt에서만 허용하며, 음성·알림 quick action은 시작하지 못한다.
- scheduler는 이미 confirmed/frozen이며 `ready`인 Task만 실행한다. 큐가 부족하다고 새 filler나 중복 Task를 만들거나 write scope를 넓히지 않는다.
- provider bucket의 `usedPercent`, `windowDurationMins`, `resetsAt`와 로컬 이력으로 `min/likely/max`를 예측하고 매 attempt 또는 rate-limit 갱신 뒤 다시 계산한다. 정확한 잔여 token 수와 100% 소진은 보장하지 않는다.
- 목표 범위, queue empty, reset/bucket 변화, stale/unknown snapshot, launch buffer, Approval/Checkpoint, failure threshold, user cancel, cost/credit 위험 중 하나에서 새 launch를 멈추고 Attention summary를 남긴다. 실행 중인 작업을 사용량에 맞추려고 강제 종료하지 않는다.
- 결제·overage, earned reset/credit 소비, credential 복제, account hot-swap은 자동화하지 않는다.

## 아직 열려 있는 결정

1. P0 relay 운영 범위: hosted relay와 self-host 패키지를 모두 제공할지, self-host만 먼저 제공할지
2. 음성 STT/TTS의 기본 provider와 완전 로컬 모드 범위
3. P1 정책 기반 조건부 자동 실행을 허용할 안전 범위와 항상 재확인할 조건
4. P1에서 typed P0 통합 결과를 바탕으로 자동 PR 생성을 제공할지와 GitHub/GitLab 등 코드 호스팅 adapter의 지원 범위
5. `Pawdex` 상표·도메인 검토와 향후 별도 GitHub 조직으로 이전할 기준
6. telemetry는 기본 비활성으로 확정하되 어떤 content-free 진단 단위까지 opt-in으로 허용할지
7. P1에서 직접 LAN mode가 실제로 필요한지, 계속 relay-only로 유지할지
8. P1 comparative run의 기본 후보 수와 비교 rubric, provider/model 조합을 어디까지 허용할지
9. P1 hibernation의 기본 idle window와 Codex resume 실패 시 보존·fallback 정책
10. provider usage/rate-limit의 신뢰 가능한 데이터 원천과 stale 표시 기준
11. `UsageWindowPreset`의 기본 목표 범위·reserve·launch buffer·최소 예측 표본 수·remote 재인증 유효 시간을 얼마로 둘지

열린 결정은 `FEATURE_SPEC.md`의 MVP 범위를 바꾸는 경우 구현 착수 전에 닫아야 한다.
