# 선행 제품 및 공식 기능 검토

검토 기준일: 2026-09-12. 이 문서는 시장 순위를 매기는 자료가 아니라 Pawdex가 중복 구현을 피하기 위한 범위 결정 근거다. 외부 제품 기능은 바뀔 수 있으므로 구현 착수 시 다시 확인한다.

## 결론

“휴대폰에서 Codex를 열고 진행 상황을 보며 승인한다”거나 “worktree 여러 개에 agent terminal을 띄운다”는 것만으로는 독립 제품의 이유가 부족하다. Codex, Happy, Orca가 이미 이 경험의 큰 부분을 제공한다. Pawdex의 첫 번째 가치는 아래 네 가지를 함께 제공하는 Codex-native 개발자 하네스여야 한다.

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

### Codex 사용량·reset 계약에서 확인한 경계

[공식 Codex App Server 문서](https://learn.chatgpt.com/docs/app-server)는 `account/rateLimits/read`와 `account/rateLimits/updated`에서 ChatGPT rate-limit bucket별 `usedPercent`, `windowDurationMins`, `resetsAt`을 제공하고, 가능하면 legacy 단일 bucket보다 `rateLimitsByLimitId`를 사용하도록 계약한다. 반면 `account/usage/read`는 lifetime token activity와 선택적 daily bucket을 제공하며 일부 값은 `null`일 수 있다. 작업 하나가 앞으로 소비할 token이나 reset 직전의 정확한 잔여 token 수를 보장하는 계약은 아니다.

따라서 Pawdex의 `UsageWindowRun`은 공식 bucket snapshot과 로컬 실행 이력으로 범위 예측만 한다. “정확히 다 쓰기”가 아니라 사용자가 정한 target band·reserve·launch buffer 안에서 사전 선택한 유용한 큐를 best-effort 실행하며, snapshot이 stale/unknown이면 새 실행을 시작하지 않는 것이 설계적 결론이다. 같은 공식 계약에 reset credit 소비 메서드가 존재하더라도 Pawdex는 이를 자동 호출하지 않는다.

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

## Orca에서 배울 점

[GeekNews에 소개된 Orca](https://news.hada.io/topic?id=32253)는 [공식 저장소](https://github.com/stablyai/orca)와 [공식 문서](https://www.onorca.dev/docs)를 공개한 worktree-native ADE다. Codex뿐 아니라 여러 CLI agent를 PTY에서 실행하고, worktree·terminal·editor·browser·mobile·remote host를 한 제품에 통합한다.

확인한 주요 기능:

- [Worktrees](https://www.onorca.dev/docs/model/worktrees): task마다 branch, 파일, agent terminal을 격리하고 create → work → review → ship → archive/delete lifecycle을 제공한다. 생성은 background에서 진행된다. 삭제는 확인 후 worktree 디렉터리와 branch 제거를 시도하며, bulk delete에서 Git이 unmerged commit 가능성 때문에 local branch 삭제를 거부한 경우에만 해당 branch가 남아 review 목록에 표시된다. 제거된 worktree 디렉터리까지 복원되는 것은 아니다.
- [Structured orchestration](https://www.onorca.dev/docs/cli/orchestration): durable Run, dependency가 있는 Task, 한 시도를 나타내는 Dispatch, FIFO+ack Message, Decision Gate를 구분한다. 완료 보고는 task ID와 dispatch ID를 함께 가져 stale retry를 막는다. 다만 공식 문서상 experimental이다.
- [Comparative run](https://www.onorca.dev/docs/recipes/parallel-agents): 동일 prompt와 base를 여러 worktree/agent에 실행한 뒤 diff를 비교하고 winner를 선택한다.
- [Session restore](https://www.onorca.dev/docs/model/session-restore)와 [hibernation](https://www.onorca.dev/docs/agents/hibernation): UI만 종료되고 daemon이 살아 있으면 agent process가 계속 실행되어 다음 launch에서 warm reattach한다. host reboot나 daemon crash 뒤에는 worktree·layout·마지막으로 저장된 scrollback은 복원되지만 agent process는 종료되어 다시 실행해야 한다. 이와 별개인 experimental hibernation은 완료되고 비활성이며 resumable이고 active mobile control·unsettled dispatch·live subagent가 없는 agent terminal을 멈춘 뒤 provider의 resume flag로 재실행하며, provider resume 실패 시 fresh prompt로 폴백한다.
- [Annotate AI Diff](https://www.onorca.dev/docs/review/annotate-ai-diff): diff line에 고정한 여러 review comment를 한 번에 agent에게 보내 수정 왕복을 줄인다.
- [Notifications](https://www.onorca.dev/docs/notifications)는 working → idle 전환, unread 상태, custom sound를 worktree와 연결하고, [Agents & Sessions](https://www.onorca.dev/docs/model/agents-sessions)는 `needs you` 상태를 설명한다.
- [Mobile companion](https://www.onorca.dev/docs/mobile): 여러 host의 상태·scrollback·파일·diff를 보고 reply·음성 입력·source control을 수행한다. desktop runtime이 source of truth다.
- [Usage tracking](https://www.onorca.dev/docs/agents/usage-tracking): provider별 사용량과 reset 시각, 데이터 freshness를 보여 준다.
- [SSH worktrees](https://www.onorca.dev/docs/ssh): 원격 host에서 worktree와 agent를 실행하고 reconnect, file sync, port forwarding을 제공한다.

Orca 검토로 도출한 Pawdex P0 보강 요구(공식 기능과 이를 바탕으로 한 설계적 추론을 함께 포함):

- Task와 실행 시도(Orca Dispatch, Pawdex TaskAttempt)를 분리하고 모든 완료·실패 신호를 attempt ID에 결박한다.
- canonical 상태와 outbox를 durable transaction에 먼저 기록한 뒤 UI·relay로 publish한다.
- worktree create/remove를 관찰 가능한 비동기 lifecycle로 만들고 취소·실패·재시도·보존 branch를 명시한다.
- app UI 종료, daemon crash, host reboot를 서로 다른 복구 시나리오로 테스트한다.
- orchestration blocker, decision gate, budget exhaustion을 일반 로그가 아니라 durable Attention으로 만든다.

Pawdex P1 후보:

- 동일 frozen Task/base/artifact set을 제한된 수의 후보로 실행하고 사람이 winner를 선택하는 comparative run
- path, base/head OID, diff side, line/range, content hash에 고정된 review comment의 batch feedback
- 사용자용 redacted progress checkpoint와 기계 lifecycle을 분리한 진행 요약(아직 기능 ID·마일스톤을 부여하지 않은 후속 검토 항목)
- 최근 turn이 완료되고 idle window가 지났으며 resumable이고 해당 Session에 active control lease·pending Approval·unsettled TaskAttempt/subagent가 없을 때의 hibernation/warm resume
- provider가 지원하는 usage/rate-limit snapshot과 freshness 표시; queue 정책 입력으로 쓸 때 fail-safe 적용
- fresh Codex rate-limit bucket과 로컬 task 이력으로 사전 선택 queue를 목표 사용률 범위까지 실행하는 `UsageWindowRun`; filler·정확한 소진 보장·자동 reset/credit 소비는 제외

## Orca에서 의도적으로 가져오지 않을 것

| Orca 동작 | Pawdex 결정 | 이유 |
| --- | --- | --- |
| [지원 agent를 full-autonomy flag로 실행하고 worktree를 sandbox로 간주](https://www.onorca.dev/docs/model/agents-sessions) | 금지. Codex sandbox와 typed approval 유지 | worktree는 Git 변경을 격리할 뿐 process, network, credential, secret 접근을 격리하지 않는다 |
| 모바일 raw terminal, live keystroke, Quick terminal command, stage/commit | 원격 typed read/reply/answer/decline/cancel만 제공 | 모바일 탈취·오입력·명령 주입이 곧 로컬 shell 권한이 되는 경로를 막는다 |
| `.worktreeinclude`로 `.env` 복제, shared directory symlink | secret은 기본 전달 금지; 명시된 비밀 주입 정책 없이는 복제하지 않음 | 병렬 후보와 원격 host로 credential이 확산되는 것을 막는다 |
| 범용 shell precheck·terminal automation | 로컬 관리자가 등록한 allowlisted verification template만 허용 | raw shell endpoint 금지와 동일한 경계를 자동화에도 적용한다 |
| Codex account directory 복제·hot-swap | 제공하지 않음 | credential 수명주기와 quota 우회 UX를 제품 책임으로 만들지 않는다 |
| content-bearing push(`title`, `body`, worktree/pane 식별자) | opaque single-use wake token만 provider에 전달 | 잠금 화면과 push provider에 작업 내용을 노출하지 않는다 |
| terminal split, editor, Design Mode, browser automation, SSH/port forwarding | core 범위에서 보류 | 전체 ADE와 원격 관리 도구를 만들면 Pawdex의 핵심 검증과 보안 경계가 흐려진다 |

Orca의 [cloud README](https://github.com/stablyai/orca/blob/main/cloud/README.md)에 따르면 공개 저장소의 `cloud/`는 루트 MIT 라이선스가 적용되는 독립 workspace이며 relay/director/cell, `relay-fence-broker`, push·ops, relay Terraform과 workflow를 포함한다. `relay-fence-broker`를 “private, IAM-only service”라고 부르는 표현은 네트워크·권한 경계를 뜻하며, 해당 소스가 비공개라는 뜻은 아니다. 별도 비공개 `stablyai/orca-cloud` 저장소에 있다고 명시된 것은 `terraform-foundation`, `terraform-apps`, API, auth 서비스다. 따라서 공개 relay workspace와 Terraform을 폐쇄형이라고 설명해서는 안 되지만, 공개 저장소만으로 hosted 서비스 전체를 재현할 수 있다고도 가정하지 않는다.

## Orca와의 기능 포지셔닝

| 영역 | Orca의 강점 | Pawdex의 목표 |
| --- | --- | --- |
| 제품 형태 | terminal/editor/browser/mobile/remote를 묶은 전체 ADE | 기존 Codex 경험 위에 놓이는 얇은 orchestration·attention control plane |
| agent 통합 | 범용 PTY launch + 일부 provider 심화 adapter | Codex App Server의 typed thread/turn/request 계약 우선 |
| 병렬 실행 | task별 worktree와 직접 비교 UX | frozen Plan/DAG, attempt fencing, dependency materialization, resource/budget gate |
| 리뷰 | diff, line annotation, stage/commit/PR | line-anchored structured feedback와 typed integration; shell/Git pass-through 금지 |
| 모바일 | 파일·terminal·source control까지 폭넓은 제어 | 상태·Attention·구조화된 후속 지시 중심의 최소 권한 companion |
| 원격 실행 | SSH/Remote Server/port forwarding | P0는 local runtime + outbound E2EE relay; remote compute는 별도 P2 검토 |
| 보안 기본값 | worktree 중심 full autonomy | worktree와 OS sandbox를 구분하고 Codex approval을 좁게 전달 |

## 제품 가설

다음 가설이 dogfood에서 확인되지 않으면 별도 제품보다 Codex·Happy·Orca 같은 기존 프로젝트에 기여하는 편이 더 합리적일 수 있다.

- 개발자가 매일 3개 이상의 병렬 작업을 실행하며 상태 전환 비용을 체감한다.
- 자동 분해 제안과 worktree 격리가 수동 세션 생성보다 의미 있게 시간을 줄인다.
- attention inbox가 일반 push보다 놓친 질문과 완료 후 유휴 시간을 줄인다.
- 공개 event/command API가 개인 스크립트, CI, editor integration을 실제로 유발한다.

검증 방법과 통과 기준은 `PRODUCT_BRIEF.md`와 `DELIVERY_PLAN.md`에 정의한다.
