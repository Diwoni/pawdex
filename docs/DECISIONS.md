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
| ADR-011 | 승인 | 시각 디자인은 기능 계약이 안정될 때까지 보류한다. | 이번 단계의 산출물은 기획·기능·기술 계약이며 현재 UI 스파이크는 디자인 기준이 아니다. |
| ADR-012 | 승인 | 음성·TTS·알림 quick action은 어떤 Approval도 수락하지 않으며, 특히 파괴적·권한 상승 수락은 잠금 해제된 인증 UI에서만 완료한다. | 음성은 화면 이동·거절·취소만 할 수 있고 단일 또는 반복 발화로 승인 권한을 부여하지 않는다. |
| ADR-013 | 승인 | P0는 Planner의 자동 Task DAG **제안**을 포함하되 모든 Plan은 사용자가 confirm한 뒤에만 실행한다. | “병렬로 나눠 줘”라는 핵심 JTBD를 제공하면서도 자동 분해 결과의 쓰기 범위·비용·의존성을 사람이 통제한다. 정책 기반 무확인 자동 실행은 P1 검토 대상이다. |

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

## ADR-013: 자동 작업 분해의 P0 경계

- 사용자가 자동 분할을 요청하면 Planner가 versioned `Plan`과 Task DAG 초안을 만든다.
- daemon은 cycle, dependency, write scope, worktree, 동시성·예산 정책을 검증하지만 `Plan.confirmed` 전에는 worktree나 실행 Session을 만들지 않는다.
- P0의 자동화 범위는 **분해·제안·검증**까지다. 실행은 Plan revision과 Task 목록을 본 사용자의 명시적 confirm 뒤에만 시작한다.
- P1에서 정책 기반 조건부 자동 실행을 검토할 수 있지만 destructive/elevated 승인과 외부 side effect 확인은 자동화하지 않는다.

## 아직 열려 있는 결정

1. P0 relay 운영 범위: hosted relay와 self-host 패키지를 모두 제공할지, self-host만 먼저 제공할지
2. 음성 STT/TTS의 기본 provider와 완전 로컬 모드 범위
3. P1 정책 기반 조건부 자동 실행을 허용할 안전 범위와 항상 재확인할 조건
4. P1에서 typed P0 통합 결과를 바탕으로 자동 PR 생성을 제공할지와 GitHub/GitLab 등 코드 호스팅 adapter의 지원 범위
5. 공개 프로젝트의 이름, GitHub 조직, 도메인
6. telemetry는 기본 비활성으로 확정하되 어떤 content-free 진단 단위까지 opt-in으로 허용할지
7. P1에서 직접 LAN mode가 실제로 필요한지, 계속 relay-only로 유지할지

열린 결정은 `FEATURE_SPEC.md`의 MVP 범위를 바꾸는 경우 구현 착수 전에 닫아야 한다.
