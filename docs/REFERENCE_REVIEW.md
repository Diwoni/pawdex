# 선행 제품 및 공식 기능 검토

검토 기준일: 2026-09-07. 이 문서는 시장 순위를 매기는 자료가 아니라 Pawdex가 중복 구현을 피하기 위한 범위 결정 근거다. 외부 제품 기능은 바뀔 수 있으므로 구현 착수 시 다시 확인한다.

## 결론

“휴대폰에서 Codex를 열고 진행 상황을 보며 승인한다”는 것만으로는 독립 제품의 이유가 부족하다. Codex 자체와 Happy가 이미 그 경험의 큰 부분을 제공한다. Pawdex의 첫 번째 가치는 아래 네 가지를 함께 제공하는 개발자 하네스여야 한다.

1. 하나의 목표를 실행 가능한 작업 DAG로 제안하고 사람이 승인할 수 있게 한다.
2. 병렬 write 작업을 Git worktree와 리소스 lock으로 격리한다.
3. 여러 세션의 `needs_input`, `completed`, `failed`를 신뢰성 있는 attention stream으로 만든다.
4. 음성·CLI·모바일 입력을 동일한 typed command와 안전 정책으로 라우팅한다.

고양이와 냐옹 소리는 중요한 제품 개성이지만 핵심 기술 해자는 아니다. 상태를 즉시 이해하게 하는 일관된 피드백 계층으로 다룬다.

## Codex 공식 기능과의 경계

| 공식 기능 | 현재 확인한 범위 | Pawdex가 추가할 범위 |
| --- | --- | --- |
| [Remote](https://learn.chatgpt.com/docs/remote) | 연결된 컴퓨터의 작업을 휴대폰에서 시작·관찰·지시·승인·리뷰 | 여러 프로젝트/세션을 하나의 DAG와 정책으로 묶는 오케스트레이션, 개발자 API, self-host 선택지 |
| [Notifications](https://learn.chatgpt.com/docs/notifications) | 완료, 권한, 질문 알림과 Activity view | 세션 전체의 attention inbox, dedupe/quiet hours/escalation 정책, webhook/automation 소비자 |
| [Pets](https://learn.chatgpt.com/docs/pets) | `Running`, `Needs input`, `Ready`, `Blocked` 같은 작업 상태 표현 | 멀티 세션 상태 요약, 이벤트 종류별 음향 정책, 브랜드 캐릭터는 추후 디자인 입력으로 결정 |
| [Voice](https://learn.chatgpt.com/docs/features/voice) | ChatGPT 음성 대화 | 대상 세션 결정, 실행 중 steer, approval의 별도 안전 규칙, task split 명령 문법 |
| [App Server](https://learn.chatgpt.com/docs/app-server) | thread/turn, streamed event, server request와 approval을 제공하는 rich-client 인터페이스 | 버전 adapter, 정규화된 상태 머신, 복구 가능한 event journal과 공개 Pawdex protocol |
| [Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees) | 격리된 저장소 checkout에서 병렬 작업 | 목표 수준에서 worktree를 할당·잠금·회수하는 scheduler와 충돌 사전 검사 |

따라서 Pawdex는 Codex UI를 복제하지 않는다. Codex를 실행 엔진으로 사용하되, 작업 포트폴리오와 자동화의 제어 평면을 만든다.

## Happy에서 배울 점

[Happy](https://github.com/slopus/happy)는 Codex/Claude Code 모바일·웹 클라이언트, push, 실시간 음성, E2EE와 daemon/relay 구조를 갖춘 가장 가까운 선행 사례다. 구현 문서는 [프로토콜·암호화·음성·daemon 구조](https://github.com/slopus/happy/tree/main/docs)를 공개한다.

채택할 패턴:

- 로컬 agent와 얇은 relay의 분리
- sequence가 있는 durable update와 ephemeral presence의 분리
- optimistic concurrency 및 reconnect reconciliation
- relay가 평문을 보지 못하는 암호화 경계
- background 모바일 앱은 WebSocket만 믿지 않고 push와 foreground catch-up을 함께 사용

그대로 복제하지 않을 부분:

- Pawdex의 원격 API는 범용 filesystem/raw shell RPC를 제공하지 않는다.
- provider wire message를 곧바로 모바일 계약으로 사용하지 않는다.
- 단일 대화 원격 제어보다 작업 DAG, worktree lifecycle, attention automation을 우선한다.
- 승인 결과는 임의 JSON이 아니라 요청 종류별 union type으로 제한한다.

## Happy와의 기능 포지셔닝

| 영역 | Happy의 강점 | Pawdex의 목표 |
| --- | --- | --- |
| 모바일 원격 제어 | 성숙한 모바일/웹 경험과 멀티 디바이스 sync | 핵심 차별점으로 삼지 않고 최소 소비자 client만 제공 |
| 암호화 relay | E2EE 기반 동기화 및 self-host | 검증된 primitive를 사용한 content-confidential E2EE relay; relay에는 routing ID, 접속 시간, IP, frame 크기 같은 메타데이터가 보일 수 있음을 명시하고 보안 리뷰 뒤 공개 |
| 음성 | 실시간 voice assistant와 세션 문맥 전달 | 다중 세션 target resolution과 typed orchestration command에 집중 |
| 병렬 작업 | 여러 session/process 관찰 | DAG dependency, concurrency budget, worktree/resource lock, 결과 합류 게이트 |
| 개발자 자동화 | agent/CLI 제어 surface | 안정적인 normalized event stream, idempotent command API, webhook/SDK |
| 권한 모델 | 원격 permission 흐름 | elevated/destructive approval은 voice 단독 승인 금지, 원 요청과 device에 결박 |

## 제품 가설

다음 가설이 dogfood에서 확인되지 않으면 별도 제품보다 Codex/Happy 기여가 더 합리적일 수 있다.

- 개발자가 매일 3개 이상의 병렬 작업을 실행하며 상태 전환 비용을 체감한다.
- 자동 분해 제안과 worktree 격리가 수동 세션 생성보다 의미 있게 시간을 줄인다.
- attention inbox가 일반 push보다 놓친 질문과 완료 후 유휴 시간을 줄인다.
- 공개 event/command API가 개인 스크립트, CI, editor integration을 실제로 유발한다.

검증 방법과 통과 기준은 `PRODUCT_BRIEF.md`와 `DELIVERY_PLAN.md`에 정의한다.
