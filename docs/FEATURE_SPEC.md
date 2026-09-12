# Pawdex 기능 명세서

> 문서 상태: Draft v0.1
>
> 기준 제품 범위: 공개 가능한 P0 MVP
>
> 선행 문서: [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md)
>
> 정규 계약: [PROTOCOL.md](./PROTOCOL.md)
>
> 제품 UX 기준: 화면 동작과 정보 구조는 [Figma의 `Pawdex — Product UX` 페이지](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)를 구현 기준으로 사용한다. 색·타이포그래피·고양이 표현 같은 시각 브랜드의 최종안은 사용성·접근성 검증에 따라 발전할 수 있다.

## 1. 문서 목적

이 문서는 Pawdex가 무엇을 해야 하는지, 어떤 실패를 안전하게 처리해야 하는지, 완료를 무엇으로 판정하는지를 정의한다. 구현 기술의 세부 선택은 기술 설계와 ADR에서 다루되, 여기 적힌 사용자 관찰 가능 동작과 안전 조건은 변경하지 않는다.

현재 저장소 코드는 Codex App Server 연결과 기본 이벤트 매핑의 가능성을 확인한 기술 스파이크다. 스파이크의 API 또는 데이터 구조는 호환성 대상이 아니며 이 명세 또는 [PROTOCOL.md](./PROTOCOL.md)와 충돌하면 재작성할 수 있다. 엔터티·enum·wire 동작이 다르면 프로토콜 명세가 우선한다.

## 2. 표기 규칙

### 2.1 우선순위

| 값 | 의미 |
| --- | --- |
| P0 | 첫 공개 MVP에서 반드시 제공하고 출시 게이트를 통과해야 함 |
| P1 | 베타 안정성 또는 사용성 확장. P0 구조가 막지 않아야 함 |
| P2 | 팀·생태계 또는 고급 자동화 기능 |

### 2.2 요구 수준

- **MUST**: 없으면 해당 기능을 완료로 보지 않는다.
- **SHOULD**: 특별한 이유가 없다면 구현한다. 제외 시 ADR에 근거를 남긴다.
- **MAY**: 호환성과 일정에 따라 선택한다.

### 2.3 안정 ID

요구사항 ID는 문구가 바뀌어도 재사용하지 않는다. 폐기된 ID는 `deprecated`로 남기고 새로운 의미에 재할당하지 않는다.

| 접두사 | 기능 영역 |
| --- | --- |
| `SYS` / `DEV` / `PROJ` | 로컬 런타임, 기기·연결, Project 경계 |
| `SES` | Session 수명주기·병렬 실행·상태·hibernation |
| `ATT` / `NTF` | Attention과 알림·감각 피드백 |
| `APR` | typed Approval과 사용자 질문 |
| `VOI` | 음성 입력·의도·TTS |
| `ORC` | Plan/Task DAG, resource·budget·worktree·통합·후보 비교·usage window 실행 |
| `REV` | 코드 리뷰 피드백과 수정 Turn 연결 |
| `REL` / `SEC` / `API` | 복구, 보안, 공개 계약 |
| `OBS` / `CFG` / `OSS` | 관측성·provider usage, 설정, 오픈소스 배포 |
| `NFR` | 성능·신뢰성·보안·개인정보·호환성·UX·접근성 등 횡단 품질 |

## 3. 공통 상태와 불변식

### 3.1 Session 상태

P0의 canonical 상태 값은 다음과 같다. 화면 또는 알림 문구에서는 친근한 이름을 쓸 수 있지만 API 값은 고정한다.

| 상태 | 의미 | 사용자 개입 | 종료 상태 |
| --- | --- | --- | --- |
| `starting` | thread 생성·재개 또는 초기 동기화 중 | 불필요 | 아니오 |
| `ready` | runtime thread가 연결되었고 아직 실행 중인 turn이 없음 | 선택 | 아니오 |
| `running` | 활성 turn이 실행 중 | 보통 불필요 | 아니오 |
| `needs_input` | 미해결 질문·승인·elicitation이 있음 | 필요 | 아니오 |
| `completed` | 마지막 turn이 정상 종료되어 다음 지시를 받을 수 있음 | 선택 | turn 기준 예 |
| `failed` | 마지막 turn이 실패함 | 필요할 수 있음 | turn 기준 예 |
| `interrupted` | 사용자가 마지막 turn을 중단함 | 선택 | turn 기준 예 |
| `offline` | runtime 연결이 끊겨 실제 상태를 재조정해야 함 | 필요할 수 있음 | 아니오 |

`completed`는 작업 산출물이 올바르거나 테스트를 통과했다는 뜻이 아니다. `ready`, `completed`, `failed`, `interrupted`에서는 새 turn을 시작할 수 있다. 스파이크의 `idle`과 `stopped`는 migration 입력에서만 각각 `ready`, `interrupted`로 읽고 목표 프로토콜에서는 내보내지 않는다.

Turn은 별도로 `queued`, `running`, `needs_input`, `succeeded`, `failed`, `interrupted` 상태를 쓴다. Turn의 `succeeded`/`failed`/`interrupted`는 Session의 `completed`/`failed`/`interrupted`로 projection되고, Session의 `ready`와 `offline`에는 같은 이름의 Turn 상태가 없다.

### 3.2 상태 우선순위와 전이 규칙

1. `thread/started` 또는 재개 reconciliation 완료는 `starting`을 `ready`로 전환한다. initial instruction이 있으면 `starting`에서 곧바로 `running`으로 갈 수 있다.
2. `turn/started`는 해당 turn ID를 active turn으로 기록하고 `running`으로 전환한다.
3. 승인·질문·권한·elicitation request는 내부 upstream request ID와 클라이언트용 Approval ID를 연결하고 `needs_input`으로 전환한다.
4. `serverRequest/resolved`는 adapter 내부의 동일 upstream request ID에 해당하는 Approval만 해제한다. 같은 turn이 아직 active이고 다른 pending Approval이 없으면 `running`으로 돌아간다. 이미 terminal turn이면 terminal Session 상태를 덮어쓰지 않는다.
5. `turn/completed`의 최종 status가 성공이면 `completed`, 실패면 `failed`, interrupted면 `interrupted`로 전환한다.
6. runtime 연결이 끊기면 결과를 추정하지 않고 활성 Session을 `offline`으로 전환한다. 재연결 후 authoritative runtime 상태에 따라 `running`, `needs_input` 또는 terminal 상태로 reconcile한다.
7. 늦게 도착한 이전 turn 이벤트는 현재 active turn을 덮어쓰지 않는다.
8. 알 수 없는 이벤트는 상태를 추측해 바꾸지 않고 호환성 로그와 metric만 남긴다.
9. 새 Codex 이벤트를 상태에 매핑할 때마다 상태 머신 fixture와 전이 테스트를 추가한다.

### 3.3 Attention과 Approval 상태

| 상태 | 의미 |
| --- | --- |
| `open` | 새로 생성되었으며 아직 어느 기기도 확인하지 않음 |
| `acknowledged` | 사용자가 내용을 확인했지만 응답하지 않음 |
| `resolved` | 연결된 Approval 또는 완료·실패 사건의 의미가 해소됨 |

Attention의 정규 상태는 `open`, `acknowledged`, `resolved` 세 가지다. Attention target은 Session뿐 아니라 Plan, Task, Queue, Worktree 중 정확히 하나일 수 있어야 한다. 질문·승인의 응답 수명 주기는 별도 Approval aggregate의 `pending`, `responding`, `accepted`, `declined`, `cancelled`, `expired`로 표현한다. Pawdex가 만든 사람 확인 gate는 별도 Checkpoint aggregate의 `pending`, `satisfied`, `declined`, `expired`, `cancelled`로 표현한다. `responding`은 전송 성공을 뜻하지 않으며 authoritative `serverRequest/resolved` 또는 그에 준하는 이벤트를 받은 뒤에만 Approval의 최종 상태와 Attention의 `resolved`를 확정한다.

### 3.4 시스템 불변식

- 한 Session에는 동시에 최대 하나의 active turn만 존재한다.
- 하나의 App Server request ID에는 최대 하나의 성공 응답만 적용한다.
- 모든 정규 이벤트에는 `eventId`, daemon database 범위의 `sequence`, `occurredAt`, aggregate type/ID/revision이 있다. 관련 `machineId`·`sessionId`는 payload 또는 projection으로 연결한다.
- `sequence`는 event ordering과 cursor에만 사용하며 mutation 충돌 검증에는 사용하지 않는다.
- Session, Plan, Approval, Dispatch 같은 mutable aggregate는 각각 1씩 증가하는 `revision`을 갖고 mutation은 대응하는 `expected...Revision`을 검증한다.
- 모든 mutation은 aggregate revision과 별개로 `Idempotency-Key`를 요구한다.
- 같은 notification dedup key로 같은 기기에 두 번 울리지 않는다.
- 원격 API는 사용자가 입력한 문자열을 임의 셸로 실행하는 기능을 제공하지 않는다.
- 쓰기 가능한 병렬 Task는 같은 working directory를 공유하지 않는다.
- confirmed Plan은 ProjectPolicy보다 넓지 않은 유한 RunBudget을 가지며 hard cap을 넘긴 새 dispatch는 없다.
- TaskAttempt는 세 scope 실행 lease와 선언한 shared/exclusive resource claim을 모두 획득한 뒤에만 시작한다.
- runtime completion·heartbeat·Artifact·VerificationResult·lease release는 현재 TaskAttempt/Dispatch pair가 일치할 때만 상태를 바꾼다.
- downstream Task는 frozen Plan에 선언된 artifact materialization만 받으며 다른 Session의 전체 대화를 자동 상속하지 않는다.
- actual changed files가 frozen write scope를 벗어나면 Task와 Plan을 block하고 범위를 자동 확장하지 않는다.
- required verification과 integration은 사용자가 본 정확한 source tree/commit OID와 target OID에 결박한다.
- 파괴적 또는 elevated 승인의 수락은 잠금 해제된 인증 UI의 명시적 action 없이는 실행되지 않는다. 음성·알림 quick action은 이를 대신할 수 없다.

## 4. 기능 요구사항

## 4.1 로컬 런타임과 호환성

### SYS-001 — 로컬 daemon 수명 주기

**우선순위:** P0

**목표:** 사용자의 개발 컴퓨터에서 Codex 세션과 Pawdex 정책을 관리한다.

요구사항:

1. daemon은 기본적으로 `127.0.0.1` 또는 동등한 loopback 주소에만 bind해야 한다.
2. daemon은 시작 시 저장소 journal, key material 접근 가능 여부, Codex binary, App Server handshake를 점검해야 한다.
3. Codex가 준비되지 않아도 진단 endpoint는 살아 있어야 하며 세션 시작 요청은 구조화된 `RUNTIME_UNAVAILABLE` 오류로 거부해야 한다.
4. 한 Machine에서 중복 daemon 실행을 감지하고 기존 인스턴스 주소 또는 안전한 오류를 반환해야 한다.
5. 정상 종료 시 새 작업 수락을 멈추고 journal flush 후 App Server 연결을 닫아야 한다.
6. SIGKILL 이후 재시작에서도 마지막 durable sequence부터 복구해야 한다.

예외·오류:

- Codex binary 없음, 로그인 필요, schema mismatch, journal 손상, 포트 충돌을 서로 다른 오류 코드로 구분한다.
- journal 일부가 손상되면 손상 전 마지막 검증 지점까지 읽고 read-only recovery mode로 기동한다. 자동 삭제하지 않는다.

인수 기준:

- [ ] 기본 설정에서 외부 인터페이스의 포트 스캔으로 daemon에 연결할 수 없다.
- [ ] Codex가 없는 환경에서도 health 응답에 원인과 복구 안내가 포함된다.
- [ ] 실행 중 강제 종료 후 재시작했을 때 미해결 Attention/Approval, machine sequence, aggregate revision이 보존된다.

### SYS-002 — Codex App Server 어댑터와 버전 계약

**우선순위:** P0

**목표:** 문자열 로그 추측 없이 공식 App Server 계약으로 thread와 turn을 제어한다.

요구사항:

1. 연결마다 `initialize`와 `initialized` handshake를 완료한 뒤에만 요청해야 한다.
2. 새 대화, 재개, 분기는 각각 App Server의 thread start/resume/fork 기능에 매핑해야 한다.
3. 새 입력, 실행 중 보충 지시, 중단은 각각 turn start/steer/interrupt 기능에 매핑해야 한다.
4. 지원 Codex 버전별 JSON Schema 또는 생성 타입을 저장하고 CI contract test를 실행해야 한다.
5. 실험적 capability는 기본 비활성으로 두며 필요한 기능과 지원 버전이 확인된 경우에만 협상해야 한다.
6. 어댑터는 raw App Server payload를 내부 canonical event로 변환하고 provider-specific 타입을 바깥 계층에 노출하지 않아야 한다.
7. 연결 종료 시 지수 backoff와 jitter로 재연결하고 thread 상태를 다시 읽어 reconcile해야 한다.

예외·오류:

- 지원 범위를 벗어난 major/schema 변경은 silent fallback하지 않고 `RUNTIME_UNAVAILABLE`과 `unsupported_version` detail로 mutation을 차단한다.
- 인식하지 못한 optional 필드는 보존 또는 무시할 수 있지만 승인 종류와 상태 필드를 추측해서는 안 된다.

인수 기준:

- [ ] 지원 버전 fixture에서 thread 생성, 실행, steer, interrupt, 승인, 질문, 실패 이벤트 테스트가 통과한다.
- [ ] 알 수 없는 notification을 주입해도 기존 Session 상태가 바뀌지 않는다.
- [ ] App Server를 재시작한 뒤 session/thread 연결이 authoritative 상태로 수렴한다.

근거: [공식 Codex App Server 문서](https://learn.chatgpt.com/ko-KR/docs/app-server)는 thread, turn, streamed item, approval 및 user-input request 수명 주기를 설명한다.

## 4.2 기기와 연결

### DEV-001 — 기기 등록과 페어링

**우선순위:** P0

**목표:** 사용자가 명시적으로 승인한 기기만 세션 메타데이터와 입력 권한을 갖는다.

요구사항:

1. 첫 페어링은 daemon이 로컬에서 생성한 일회용 QR 또는 짧은 코드를 사용해야 한다.
2. 페어링 코드는 짧은 TTL, 한 번 사용, 시도 횟수 제한을 가져야 한다.
3. 성공 시 기기별 공개키, 표시 이름, capability, 생성 시각, 마지막 접속 시각을 등록해야 한다.
4. 사용자는 Machine에서 기기를 즉시 revoke할 수 있어야 하며 revoke 이후 token과 push subscription을 무효화해야 한다.
5. `view`, `send_input`, `respond_safe`, `respond_elevated`와 같은 권한 범위를 기기별로 구분할 수 있어야 한다. P0 기본 모바일 기기에는 elevated 응답 권한을 자동 부여하지 않는다.
6. 세션과 알림 payload의 종단간 암호화가 준비되지 않으면 인터넷 relay 연결을 활성화하지 않아야 한다.

예외·오류:

- 만료·재사용 코드는 generic 오류를 반환해 유효 기기 정보를 누설하지 않는다.
- clock skew가 있어도 서버 기준 TTL로 판정한다.

인수 기준:

- [ ] 등록되지 않은 기기는 snapshot, 이벤트, 입력 API를 호출할 수 없다.
- [ ] revoke된 기기의 기존 연결과 refresh token이 수 분 내 모두 실패한다.
- [ ] relay 로그만으로 prompt, 코드, 승인 내용의 평문을 복구할 수 없다.

### DEV-002 — 연결 모드와 capability 협상

**우선순위:** P0

**목표:** local loopback과 outbound relay 및 플랫폼 기능 차이를 명시적으로 처리한다.

요구사항:

1. 기본 local mode는 계정이나 relay 없이 동작해야 한다.
2. P0 daemon은 설정과 무관하게 loopback에만 bind하고 LAN 또는 public interface에 직접 listen하지 않아야 한다.
3. remote mode는 daemon이 시작한 outbound 연결로 E2EE relay에 접속해야 한다. relay가 daemon으로 inbound socket을 열 수 없어야 한다.
4. 기기는 `push`, `background_push`, `custom_sound`, `audio_capture`, `speech_to_text`, `tts` capability를 보고해야 한다.
5. daemon은 capability가 없는 기능을 성공했다고 표시하지 않고 사용자 정책에 정의된 fallback을 선택해야 한다.
6. 직접 LAN 연결은 P1 이후 별도 위협 모델과 ADR 없이는 추가하지 않는다.

인수 기준:

- [ ] relay가 없어도 local session orchestration이 완전히 동작한다.
- [ ] `custom_sound=false` 기기에는 meow 성공 상태가 기록되지 않고 fallback 채널이 기록된다.
- [ ] P0 configuration과 실행 인자 어떤 조합에서도 non-loopback listener가 열리지 않는다.
- [ ] remote 사용 중 relay에서 Machine 방향의 임의 inbound 연결을 시작할 수 없다.

## 4.3 Project와 Session 관리

### PROJ-001 — Project 등록과 실행 경계

**우선순위:** P0

**목표:** 실행 가능한 로컬 workspace root와 정책을 사전에 등록해 원격 입력이 임의 경로를 선택하지 못하게 한다.

요구사항:

1. Project는 `projectId`, 이름, 하나의 canonical workspace root, Git 여부, 기본 ref, ProjectPolicy, aggregate revision을 가져야 한다.
2. 새 root 등록과 root 변경은 local Machine에서만 허용해야 하며 remote 클라이언트의 임의 절대 경로를 받지 않아야 한다.
3. daemon은 등록 시 경로를 canonicalize하고 symlink traversal, 존재 여부, 읽기/쓰기 가능 범위를 검사해야 한다.
4. remote projection에는 전체 절대 경로 대신 `rootPathDisplay`처럼 redaction된 표시 경로를 반환할 수 있어야 한다.
5. ProjectPolicy는 허용 execution mode, P0 managed-worktree 강제, global/Machine/Project 동시성 중 Project 한도와 needs-input slot 정책, 모델 allowlist, `approvalsReviewer=user`, mode별 read-only/workspace-write sandbox, session-scope·exec/network amendment·network/out-of-root allowlist 제한을 typed 필드로 포함해야 한다.
6. ProjectPolicy 변경은 `expectedProjectRevision`과 `Idempotency-Key`를 요구하고 기존 실행의 effective policy를 소급 변경하지 않아야 한다.
7. verification template의 생성·수정·삭제는 잠금 해제된 local-admin UI에서만 허용하고 version/digest에 결박된 confirmation receipt를 요구해야 한다. template은 shell/command interpreter가 아닌 고정 executable, command-text/eval slot 없이 literal/typed slot만 있는 argv template, cwd와 `inherit=false` env allowlist를 가져야 한다. Planner·Session·remote client는 기존 `verificationTemplateId`와 schema가 허용한 typed args만 선택할 수 있고 executable, raw argv fragment, cwd, 환경 변수 이름·값 또는 secret reference를 만들거나 바꿀 수 없어야 한다.

용어 규칙:

- **Project**는 API와 권한의 aggregate이며 항상 `projectId`로 참조한다.
- **workspace root**는 Project가 가리키는 로컬 filesystem directory다. 별도 `workspaceId` 리소스가 아니며 Session 생성 body의 `cwd`가 아니다.

인수 기준:

- [ ] remote 기기가 새 절대 경로 또는 `cwd`를 보내 Project/Session을 만들 수 없다.
- [ ] symlink를 이용한 workspace root 또는 허용된 하위 경계 탈출이 차단된다.
- [ ] stale `expectedProjectRevision` 정책 변경은 `STATE_CONFLICT`이고 같은 idempotency key 재시도는 최초 결과를 반환한다.
- [ ] Planner·원격 client가 verification executable, shell command, cwd 또는 env를 제출하면 upstream/process 실행 전에 거부된다.
- [ ] local-admin template 등록도 shell/command interpreter, command-text/eval slot 또는 raw argv fragment를 포함하면 거부된다.

### SES-001 — Session 생성, 재개, 분기, 중단

**우선순위:** P0

**목표:** 사용자가 여러 Codex 대화를 독립적으로 관리한다.

요구사항:

1. Session 생성 입력은 등록된 `projectId`, 이름(선택), 모델(선택), P0 유효 조합인 `execution`(`read_only + none` 또는 `write + managed`), initial instruction(선택)만 받아야 한다.
2. daemon은 ProjectPolicy와 runtime capability로 모델·execution 선택을 검증하고, 클라이언트가 임의 `cwd`, sandbox 문자열, approval policy를 넘기지 못하게 해야 한다.
3. P0의 쓰기 조합은 로컬·원격 모두 `write + managed`만 허용한다. `write + none`은 공개 P0 범위 밖의 향후 로컬 고급 기능으로 분리하며 ProjectPolicy와 명시적 위험 확인 없이는 추가할 수 없다.
4. daemon은 기존 Pawdex Session을 재개할 때 내부에 연결된 Codex thread를 resume/reconcile해야 한다. 클라이언트는 upstream thread ID가 아니라 Pawdex `sessionId`를 사용한다.
5. 특정 turn까지의 기록을 바탕으로 분기할 수 있어야 하며 새 Session은 원본 Session ID를 metadata로 보존해야 한다.
6. active turn을 중단할 수 있어야 하며 중단 요청은 idempotent해야 한다.
7. P0에서 interrupt나 연결 종료는 기록 삭제를 뜻하지 않는다. 영구 삭제는 제공하지 않으며 archive가 추가되면 별도 versioned mutation으로 정의한다.
8. 모든 mutation은 `Idempotency-Key`를 요구한다. Session 생성은 정책을 확인한 `expectedProjectRevision`을, 기존 Session을 대상으로 하는 start/steer/interrupt/fork는 `expectedSessionRevision`을, steer/interrupt는 `expectedTurnId`도 검증해야 한다.

예외·오류:

- 존재하지 않거나 사용할 수 없는 Project, 정책에 없는 execution 조합, 닫힌 내부 thread, active turn 중복 시작을 명시적 오류로 반환한다.
- 동일 idempotency key의 재시도는 최초 결과를 반환한다.

인수 기준:

- [ ] 5개 Session을 생성하고 각기 다른 prompt를 보내도 응답과 이벤트가 섞이지 않는다.
- [ ] 실행 중인 Session에 새 turn을 시작하면 충돌 오류가 나고 기존 turn은 유지된다.
- [ ] stale `expectedSessionRevision` 명령은 `STATE_CONFLICT`를 반환하며 machine sequence 값으로 이 검사를 우회할 수 없다.

### SES-002 — 병렬 실행과 자원 제한

**우선순위:** P0

**목표:** 여러 Session을 예측 가능한 자원 범위에서 동시에 실행한다.

요구사항:

1. global, Machine, Project scope 각각에 재시작 후 복구되는 durable 실행 queue와 최대 active turn 수를 가져야 한다.
2. 새 실행 operation은 관련된 global/Machine/Project queue 모두에 durable하게 등록되고 세 scope의 slot을 확보한 lease가 있을 때만 시작해야 한다. 한도를 넘은 작업은 우선순위와 enqueue 시각으로 공정하게 대기한다.
3. `needs_input`의 P0 기본 정책은 active-turn slot을 반납하고 global/Machine/Project별 resident runtime 수로 별도 계수하는 `release_active_slot`이어야 한다. `hold_active_slot`은 명시적 ProjectPolicy 선택이며 재시작 뒤 pending Approval과 runtime status로 slot/resident count를 복구해야 한다.
4. rate limit 또는 usage limit 오류 시 모든 세션을 무한 재시도하지 않고 관련 scope의 queue를 pause해야 한다.
5. 사용자는 queued, running, paused와 pause 원인을 조회할 수 있어야 한다.
6. 하나의 Session 실패가 독립 Session을 중단시키지 않아야 한다.
7. daemon은 자신이 생성한 process의 PID, start identity, owner Session/TaskAttempt, 공유 여부를 registry에 기록해야 하며 이름 검색이나 PID 재사용 추정으로 process를 종료하지 않아야 한다.
8. runtime/item/command/Approval lifecycle처럼 검증 가능한 activity 시각과 TaskAttempt health(`healthy`, `suspected_stall`, `stalled`)를 Session 상태와 분리해야 한다. stall threshold만으로 성공·실패를 추정하거나 process를 강제 종료하지 않아야 한다.
9. interrupt 또는 hard wall-time cap 도달 시 먼저 typed turn interrupt와 grace period를 적용해야 한다. 이후에도 종료되지 않으면 해당 Attempt가 독점 소유하며 PID/start identity가 일치하는 managed process tree만 종료할 수 있고, 공유 App Server나 소유 불명 process 종료는 별도 로컬 확인 없이는 금지해야 한다.

인수 기준:

- [ ] 한도 2에서 5개 작업을 넣으면 동시에 최대 2개만 active turn이 된다.
- [ ] 하나의 App Server 요청이 실패해도 무관한 Session은 계속 진행한다.
- [ ] daemon 재시작 뒤 global/Machine/Project queue의 순서, pause reason, lease, idempotency가 보존되고 같은 operation이 중복 실행되지 않는다.
- [ ] 한 Project queue의 pause 또는 한도 도달이 다른 Project의 여유 slot 실행을 막지 않으며 global/Machine 한도는 두 Project에 함께 적용된다.
- [ ] stall fixture는 TaskAttempt health와 Task target Attention만 바꾸고 Session/Task를 성공 또는 실패로 추정하지 않는다.
- [ ] PID 재사용·공유 App Server·다른 Session process fixture에서 강제 종료가 거부된다.

### SES-003 — 상태 reducer와 진행 정보

**우선순위:** P0

**목표:** 모든 클라이언트가 동일한 상태를 보게 한다.

요구사항:

1. 상태는 canonical event reducer의 순수 함수로 계산해야 한다.
2. agent message delta는 표시용 preview에 누적하되 최종 item을 authoritative 값으로 사용해야 한다.
3. 상태마다 원인이 된 latest event ID와 turn ID를 제공해야 한다.
4. progress는 근거 있는 item 종류와 시각만 제공하고 완료율을 임의 계산하지 않아야 한다.
5. Session 상태 변경은 snapshot 저장보다 먼저 journal에 durable하게 기록되어야 한다.

인수 기준:

- [ ] 같은 fixture event stream은 daemon 재시작 전후 동일 snapshot을 만든다.
- [ ] 순서가 뒤바뀐 이전 turn 완료 이벤트가 현재 turn을 `completed`로 바꾸지 않는다.
- [ ] pending Approval이 있는 동안 unrelated progress event가 `needs_input`을 덮지 않는다.

### SES-004 — 안전한 hibernation과 warm-resume

**우선순위:** P1

**목표:** 오래 쉬는 Session의 runtime attachment와 resident resource를 해제하되 대화·작업 상태를 잃거나 진행 중 작업을 잠든 것으로 오판하지 않는다.

요구사항:

1. canonical Session 상태와 별도로 attachment 상태(`attached`, `hibernating`, `hibernated`, `resuming`)와 resource residency를 표현해야 한다. `hibernated`는 `completed`, `failed`, `interrupted`, `ready`를 대신하는 Session 상태가 아니다.
2. hibernation은 active turn, pending blocking/nonblocking Approval, unresolved Checkpoint, unsettled TaskAttempt/Dispatch, active ResourceLease, 미전송 secret answer가 하나라도 있으면 거부해야 한다.
3. 모바일 클라이언트가 foreground에서 해당 Session을 drive하는 짧은 수명의 control lease가 있거나 음성/텍스트 mutation이 처리 중이면 hibernation을 시작하지 않아야 한다.
4. hibernation은 Codex thread ID, journal, worktree, artifact, Attention을 보존하고 runtime attachment와 안전하게 해제 가능한 resident resource만 반납해야 한다. worktree cleanup이나 branch 삭제를 암묵적으로 수행하지 않는다.
5. warm-resume은 새 thread/turn을 blind-create하지 않고 기존 thread를 resume/read한 뒤 authoritative status와 pending request를 reconcile해야 한다. reconcile 전에는 입력을 보내거나 lease를 중복 발급하지 않는다.
6. 자동 inactivity 정책은 사용자 설정과 최소 유휴 시간을 가져야 하며, 실패하면 Session을 `offline` 또는 명시적 진단 상태로 두고 기록을 삭제하지 않아야 한다.

인수 기준:

- [ ] `completed` Session을 hibernate/resume한 뒤 동일 thread와 마지막 turn이 유지되고 새 turn이 생성되지 않는다.
- [ ] pending Approval, unsettled Attempt, active mobile control lease 각각에서 hibernation이 거부된다.
- [ ] resume 도중 daemon을 kill해도 attachment/resource reconcile 후 하나의 authoritative 상태로 수렴한다.

## 4.4 Attention Inbox와 알림

### ATT-001 — 통합 Attention Inbox

**우선순위:** P0

**목표:** Session뿐 아니라 병렬 실행 Plan·Task·Queue·Worktree의 사람 개입 항목을 손실 없이 한곳에 모은다.

요구사항:

1. durable Attention은 기존 `needs_input`, `failed`, `completed`, `reconciliation_required`와 orchestration kind인 `task_blocked`, `plan_blocked`, `checkpoint_required`, `integration_required`, `budget_exhausted`, `queue_paused`, `resource_wait_timeout`, `stalled`를 지원해야 한다. P1 ORC-006 capability가 활성화되면 `usage_window_run_stopped`도 지원한다. 알림은 Session/Task 상태를 직접 구독하지 않고 이 aggregate를 원천으로 삼아야 한다.
2. Attention은 ID, `Session | Plan | Task | Queue | Worktree` 중 정확히 하나인 typed target, Approval/Turn/Checkpoint/RunBudget/ResourceLease/Verification/System 중 typed source, kind, `open`/`acknowledged`/`resolved` 상태, title, 안전한 preview, 생성 시각, aggregate revision을 포함해야 한다. P1 stop summary source에는 UsageWindowRun을 추가한다. machine/project/risk는 연결 projection으로 조회하고 upstream request ID를 노출하지 않는다.
3. 기본 정렬은 파생 risk와 연결된 Approval expiry를 우선한 뒤 생성 시각을 사용해야 한다.
4. 질문·승인 Attention은 Approval이 해결되기 전 dismiss 또는 resolved 처리할 수 없다. P0의 사용자 동작은 acknowledge이며 snooze는 notification policy의 후속 확장으로 둔다.
5. 완료 Attention은 사용자가 열면 `acknowledged`, 새 turn으로 의미가 사라지면 `resolved` 처리해야 한다. orchestration Attention은 Checkpoint terminal, Queue resume, replacement Plan confirm, resource/scope/integration blocker 해소 같은 authoritative 원인 이벤트 전에는 resolved 처리하지 않아야 한다. P1 `usage_window_run_stopped` summary는 사용자가 열어도 acknowledged일 뿐이며 같은 preset의 새 인증 Run이 시작될 때 resolved할 수 있다.
6. 여러 기기가 같은 Attention을 열어도 연결된 Approval의 `pending`/`responding`/최종 상태를 실시간 동기화해야 한다.
7. 원 요청이 사라지면 Approval을 `expired`, 연결된 Attention을 `resolved`로 바꾸고 늦은 응답을 보내지 않아야 한다.
8. Session이 아직 없는 pre-dispatch 실패도 Plan/Task target으로 생성해야 하며, target-kind 허용 조합 밖 입력은 schema에서 거부해야 한다.

인수 기준:

- [ ] 3개 Session에서 동시에 질문·실패·완료가 발생하면 서로 다른 Item 3개가 생긴다.
- [ ] 한 기기가 응답을 시작하면 다른 기기에 연결된 Approval의 `responding` 상태가 반영된다.
- [ ] App Server가 요청을 먼저 정리한 경우 모바일의 늦은 승인에 `APPROVAL_EXPIRED`가 반환된다.
- [ ] Plan validation 실패, budget exhaustion, fan-in 충돌, queue pause가 각각 Session 없이도 올바른 target/source의 Item을 한 번 생성한다.
- [ ] acknowledge만으로 Checkpoint, Task blocker, Queue pause 또는 integration gate가 해결되지 않는다.

### ATT-002 — 알림 정책, dedup, quiet hours, escalation

**우선순위:** P0

**목표:** 중요한 개입은 놓치지 않되 같은 사건으로 반복해서 울리지 않는다.

요구사항:

1. notification dedup key는 최소 `deviceId + attentionId + policyRevision + stage`로 계산해야 한다.
2. 기본 정책은 `needs_input`, `failed`, `task_blocked`, `plan_blocked`, `checkpoint_required`, `integration_required`, `budget_exhausted`, `stalled`를 즉시, `completed`를 즉시 또는 사용자가 선택한 digest로 전송해야 한다. `queue_paused`와 `resource_wait_timeout`은 동일 target/reason을 정책적으로 묶을 수 있다.
3. quiet hours에는 기본적으로 소리를 끄고 Item을 보존한다. 사용자가 허용한 risk level만 quiet hours를 우회할 수 있다.
4. 해결되지 않은 Item은 사용자 설정 지연 후 제한적으로 escalation할 수 있다.
5. escalation은 횟수 상한, 최소 간격, delivery TTL을 가져야 하며 모든 전송 기기에서 이미 확인되면 중단해야 한다.
6. rate limit은 Machine과 기기별로 적용하고 폭주 시 하나의 요약 알림으로 축약해야 한다.
7. 전송 상태를 `queued`, `provider_accepted`, `device_acknowledged`, `opened`, `acted`, `failed`, `expired`로 구분해야 한다.
8. payload에는 기본적으로 저장소 절대 경로, 명령 전문, secret 가능성이 있는 출력 전문을 넣지 않아야 한다.

예외·오류:

- push provider 거부 시 지수 backoff를 사용하되 notification delivery TTL 또는 연결 Approval 만료 뒤 재시도하지 않는다.
- invalid subscription은 비활성화하고 다른 채널로 fallback한다.

인수 기준:

- [ ] 동일 event를 10회 재생해도 기기별 최초 단계 알림은 한 번만 발송된다.
- [ ] quiet hours 중 완료 알림은 소리 없이 보존되고 설정된 digest 시각에 한 번 나타난다.
- [ ] 다른 기기에서 Item을 해결하면 예약된 escalation이 취소된다.

### NTF-001 — Mac·모바일 알림 채널

**우선순위:** P0

**목표:** 사용자가 책상 밖에서도 Attention Item을 확인한다.

요구사항:

1. Mac local notification과 표준 Web Push 기반 모바일/데스크톱 채널을 제공해야 한다.
2. public push application payload는 짧게 만료되는 단일 opaque wake token만 포함하고 Attention/Session ID, 상태, 별칭, preview, deep-link 대상, 인증 secret, raw Approval payload를 포함하지 않아야 한다.
3. 기기가 E2EE 채널로 최신 상태를 가져온 뒤 로컬에서 만드는 알림 action은 짧게 만료되는 opaque deep-link token으로 Attention 읽기 화면만 가리킬 수 있으며 승인 결정을 표현하지 않아야 한다.
4. deep link를 열면 인증 후 최신 Item 상태를 다시 조회해야 한다.
5. OS가 notification permission을 거부하면 설정 상태와 대체 경로를 명확히 진단해야 한다.
6. provider adapter는 core state machine에서 분리해야 한다.
7. foreground websocket 알림과 background push는 같은 Attention Item을 공유해 중복 표시를 제어해야 한다.

인수 기준:

- [ ] 앱이 foreground일 때 websocket과 push가 모두 도착해도 사용자 알림은 하나다.
- [ ] push provider fixture에는 opaque wake token 외의 Attention/Session/kind/preview/deep-link 필드가 없다.
- [ ] 로그아웃·revoke된 기기의 deep link는 내용을 노출하지 않는다.
- [ ] 알림 권한 거부 상태가 health/diagnostics에 반영된다.

### NTF-002 — 고양이 소리와 감각 피드백

**우선순위:** P0 기본, P1 네이티브 보장 범위 확대

**목표:** 상태 종류를 귀여운 고양이 신호로 구분하되 플랫폼 한계를 정직하게 처리한다.

요구사항:

1. 사용자는 `off`, `system_default`, `meow_soft`, `meow_attention`, `meow_failure` 정책을 선택할 수 있어야 한다.
2. 소리 asset은 오픈소스 배포·상업적 사용 가능한 라이선스 또는 프로젝트 자체 제작물이어야 한다.
3. background custom sound 지원 여부를 capability로 판단해야 한다.
4. custom sound 미지원 시 기본 OS sound, vibration, silent push, foreground playback 순서 중 사용자 정책에 맞는 fallback을 기록해야 한다.
5. audio test는 실제 세션 이벤트를 만들지 않고 실행할 수 있어야 한다.
6. quiet hours와 시스템 무음 모드를 우회하지 않아야 한다.

인수 기준:

- [ ] `custom_sound=false` fixture에서 제품이 야옹 재생 성공을 허위 보고하지 않는다.
- [ ] sound off 설정은 모든 채널과 escalation 단계에 적용된다.
- [ ] 사용된 sound asset의 출처와 라이선스가 저장소에 기록된다.

## 4.5 질문과 승인

### APR-001 — typed approval

**우선순위:** P0

**목표:** 명령·파일·권한 요청을 종류별 정보와 허용된 결정으로만 처리한다.

요구사항:

1. 다음 request method를 별도 타입으로 처리해야 한다.
   - `item/commandExecution/requestApproval`
   - `item/fileChange/requestApproval`
   - `item/permissions/requestApproval`
2. 명령 승인은 App Server가 제시한 available decision 안에서만 선택할 수 있어야 한다.
3. 파일 승인은 변경 요약, 대상 경로, reason, grant root를 가능한 범위에서 보여 줘야 한다.
4. 권한 승인은 요청된 filesystem/network 권한의 부분집합만 grant할 수 있고 scope를 turn 또는 session으로 명시해야 한다.
5. 서버는 클라이언트가 보낸 임의 `result` JSON을 upstream에 그대로 전달하지 않아야 한다.
6. command/cwd/host/permission 정보를 redaction 후 표시하되 승인 판단에 필요한 대상은 숨기지 않아야 한다.
7. `acceptForSession`, 권한 scope `session`, exec-policy 변경, 네트워크 접근, Project 또는 managed worktree root 밖 파일 접근은 elevated로 분류해야 한다. P0의 worktree 밖 쓰기는 confirmation receipt가 있어도 허용하지 않는다.
8. elevated 또는 destructive 결정의 수락은 action 시점에 영향 범위와 대안을 표시한 잠금 해제·인증된 UI에서 명시적으로 눌러야 한다.
9. 음성은 승인 UI를 열거나 `decline/cancel`을 제출할 수 있지만 위험도와 무관하게 어떤 Approval `accept`도 음성 발화, TTS 확인, notification quick action만으로 완료할 수 없어야 한다.
10. 클라이언트는 upstream request ID 대신 Pawdex Approval ID를 사용한다. 응답은 `expectedApprovalRevision`과 `Idempotency-Key`를 검증해 한 기기에서만 원자적으로 claim·제출해야 한다.

예외·오류:

- requested decision에 없는 값, 요청하지 않은 권한, 만료된 Approval, scope 상승은 validation 단계에서 차단한다.
- 응답 전 네트워크 단절 시 결과를 모른다면 같은 idempotency key로 조회·재시도하고 별도 결정을 만들지 않는다.

인수 기준:

- [ ] 임의 JSON과 요청하지 않은 filesystem root를 보내도 upstream 호출 전에 거부된다.
- [ ] 두 기기가 동시에 accept/decline하면 한 결정만 적용되고 다른 기기는 최종 상태를 받는다.
- [ ] elevated/destructive accept는 잠금 해제된 인증 UI action에서 발급한 confirmation receipt 없이 전송되지 않는다.
- [ ] 위험도와 무관하게 음성·TTS·알림 quick action은 어떤 Approval accept도 제출하지 않고 승인 UI로만 이동한다.
- [ ] raw shell command를 새로 작성해 실행하는 endpoint가 API 목록에 존재하지 않는다.

### APR-002 — 사용자 질문과 MCP elicitation

**우선순위:** P0

**목표:** Codex 또는 연결된 도구의 구조화된 질문에 원 요청으로 안전하게 답한다.

요구사항:

1. `item/tool/requestUserInput`의 question ID, header, prompt, 선택지, 복수 선택 여부, timeout을 보존해야 한다.
2. 응답은 Approval ID와 `expectedApprovalRevision`을 받고 question ID별 answer array를 validate한 뒤, adapter가 내부에 보존한 원 upstream request ID에 전달해야 한다.
3. `mcpServer/elicitation/request`는 form/openai-form/url 모드를 구분하고 지원하지 않는 schema keyword를 명시해야 한다.
4. URL elicitation은 허용 프로토콜과 표시 host를 검증하고 자동 방문 또는 자동 accept하지 않아야 한다.
5. timeout 또는 turn 종료로 upstream request가 사라지면 Approval을 `expired`, Attention을 `resolved` 처리해야 한다.
6. 자유 텍스트 답변은 음성 전사문을 사용할 수 있으나 전사문 확인 후 제출해야 한다.

인수 기준:

- [ ] 선택지에 없는 값과 누락된 필수 question은 로컬 validation에서 거부된다.
- [ ] expired 질문 답변이 새 turn의 질문으로 잘못 적용되지 않는다.
- [ ] URL mode는 scheme/host를 보여 주고 사용자 action 없이 열리지 않는다.

## 4.6 음성 입력과 라우팅

### VOI-001 — push-to-talk와 전사

**우선순위:** P0

**목표:** 상시 녹음 없이 짧은 후속 지시와 질문 답변을 음성으로 입력한다.

요구사항:

1. P0는 사용자가 누르고 있는 동안 또는 명시적으로 시작·종료한 구간만 녹음해야 한다.
2. 첫 사용 전 마이크 권한, 처리 위치(온디바이스/클라우드), 보존 정책을 알려야 한다.
3. 전사 결과는 text, locale, confidence(지원 시), provider, duration을 포함해야 한다.
4. 오디오 원본은 기본적으로 저장하지 않고 전사 완료 또는 실패 후 메모리에서 제거해야 한다.
5. cloud STT를 쓰는 경우 사용자가 opt-in하고 전송 실패·provider 제한을 구분해야 한다.
6. 전사문은 실행 전에 사용자가 수정하거나 취소할 수 있어야 한다.
7. 네트워크가 없는 경우 가능한 온디바이스 전사 또는 텍스트 입력 fallback을 제공해야 한다.

인수 기준:

- [ ] 마이크 권한 거부 뒤에도 텍스트 후속 입력이 가능하다.
- [ ] 기본 설정에서 daemon과 relay 디스크에 raw audio 파일이 남지 않는다.
- [ ] cloud STT opt-in 전에는 오디오가 외부 endpoint로 전송되지 않는다.

### VOI-002 — 음성 의도와 Session 라우팅

**우선순위:** P0

**목표:** 음성 지시를 올바른 Session, turn 또는 pending Approval에 한 번만 전달한다.

의도 타입:

| Intent | 예 | 허용 동작 |
| --- | --- | --- |
| `send_instruction` | “이제 문서도 정리해”, “지금은 API부터 확인해” | Session 상태에 따라 새 turn 또는 active turn steer |
| `answer_question` | “첫 번째 옵션으로 해” | pending user-input Approval 응답 |
| `status_query` | “백엔드 세션 어떻게 됐어?” | read-only 상태 요약 |
| `interrupt` | “그 세션 중단해” | 대상·영향 재확인 후 turn interrupt |
| `approval_response` | “거절해” | typed approval의 `decline/cancel`만 제출; 모든 accept는 UI로 이동 |

라우팅 규칙:

| 대상 상태 | 기본 라우팅 |
| --- | --- |
| `ready`, `completed`, `failed`, `interrupted` | `turn/start` |
| `running` | active turn과 `expectedTurnId`가 일치할 때 `turn/steer` |
| `needs_input` + 질문 | 원 Approval ID의 answer 제출 |
| `needs_input` + 승인 | typed approval 정책 적용 |
| `starting` | 자동 실행하지 않고 준비 완료까지 대기 또는 취소 |
| `offline` | mutation을 보내지 않고 runtime reconciliation을 요구 |

추가 요구사항:

1. 열린 세션 화면에서 시작한 음성은 그 Session을 기본 대상으로 삼되 최종 요청에 `sessionId`를 포함해야 한다.
2. 전역 음성은 session name/alias 또는 직전 컨텍스트로 대상을 찾고 후보가 둘 이상이면 실행하지 않아야 한다.
3. transcript parse와 intent를 구분하고 모든 음성 mutation은 confirm 단계를 거쳐야 한다. 전사 원문을 runtime 명령이나 셸로 직접 실행하지 않는다.
4. mutation 요청은 `expectedSessionRevision`과 `Idempotency-Key`, 필요 시 `expectedTurnId` 또는 `approvalId`/`expectedApprovalRevision`을 포함해야 한다. machine sequence는 cursor일 뿐 concurrency token으로 사용하지 않는다.
5. 전사 신뢰도가 임계값보다 낮거나 intent parser가 두 의미를 반환하면 read-back과 선택을 요구해야 한다.
6. server acknowledgement에서 영향받은 Pawdex Session/Turn/Approval projection을 받은 뒤에만 “전달됨” 상태가 된다. upstream thread/request ID는 클라이언트에 노출하지 않는다.
7. 지시가 현재 상태와 경쟁해 stale이 되면 자동으로 다른 의미로 재해석하지 않고 `STATE_CONFLICT`와 최신 상태를 보여 줘야 한다.

인수 기준:

- [ ] 같은 이름의 Session 두 개가 있을 때 전역 음성 지시는 어느 쪽에도 전송되지 않는다.
- [ ] active turn이 바뀐 직후 들어온 steer는 새 turn에 잘못 적용되지 않고 stale 오류가 난다.
- [ ] `needs_input` 질문에 대한 음성 답변이 새 turn prompt로 변환되지 않는다.
- [ ] 전송 retry가 발생해도 동일 지시는 한 번만 upstream에 적용된다.

### VOI-003 — 음성 상태 요약과 TTS

**우선순위:** P1

**목표:** 화면을 보지 않고도 안전한 범위의 상태를 듣는다.

요구사항:

1. TTS는 기본적으로 Session 이름, 상태, 기다리는 이유의 요약만 읽고 코드·secret·명령 전문은 읽지 않아야 한다.
2. 잠금 화면에서는 사용자 설정에 따라 민감 정보를 더 축약해야 한다.
3. 여러 Attention Item은 위험도와 시간 순으로 최대 개수를 제한해 요약해야 한다.
4. 사용자가 중지하면 즉시 재생을 멈추고 다음 action으로 간주하지 않아야 한다.

## 4.7 자동 분할과 Task Graph

### ORC-001 — 작업 분해 제안

**우선순위:** P0

**목표:** 큰 목표를 검토 가능한 실행 계획으로 변환한다.

요구사항:

1. 자동 분할은 사용자의 명시적 요청 또는 사전 설정된 ProjectPolicy가 있을 때만 시작해야 한다.
2. Planner 출력은 다음 필드를 가진 versioned schema여야 한다.
   - plan ID와 목표
   - Task ID, 이름, 상세 instruction, mode(`read_only`/`write`)
   - 의존 Task ID 목록
   - 예상 read/write scope와 Task별 execution profile
   - 등록된 `projectId`, exact base Git revision, 실행 정책과 RunBudget
   - typed shared/exclusive ResourceClaim descriptor; canonical key와 acquisition order는 daemon이 계산
   - 완료 조건과 사전 등록된 verification template ID·typed args의 선언형 목록
   - 예상 위험, durable typed Checkpoint spec, 결과 전달·materialization 계약
3. 실행 전 cycle, 최대 DAG depth/task 수, 존재하지 않는 dependency, write scope 중복, 동시성·RunBudget ceiling, resource acquisition order, checkpoint, artifact producer/consumer·commit OID를 검사해야 한다.
4. P0는 제안된 Plan을 사용자가 confirm한 뒤에만 쓰기 Task를 시작해야 한다.
5. 승인된 Plan aggregate revision은 실행 중 묵시적으로 바뀌지 않아야 한다. 변경은 새 revision과 diff를 만든다.
6. Planner는 잠금 해제된 local-admin UI가 미리 ProjectPolicy에 등록한 `verificationTemplateId`와 schema가 허용한 typed args만 선택할 수 있어야 한다. typed approval로 임의 검증 명령을 우회하거나 template의 executable/argv/cwd/env policy를 생성·수정할 수 없어야 한다.
7. Plan confirm은 `expectedPlanRevision`과 `Idempotency-Key`를 요구하고, 사용자가 본 revision과 다르면 어떤 Task도 시작하지 않아야 한다.
8. RunBudget은 `maxTasks`, `maxDepth`, `maxAttemptsPerTask`, `maxWallTimeMs`, `maxResidentRuntimes`, `maxOutputBytes`, `maxWorktreeBytes`의 양의 유한 hard cap을 가져야 한다. runtime이 신뢰 가능한 usage를 제공할 때만 `maxTokens`, `maxCostMicros`를 유한 hard cap으로 허용하며, 지원하지 않으면 `null`과 `unavailable`을 명시하고 보장한다고 표시하지 않아야 한다.
9. Task의 execution profile은 ProjectPolicy에 등록된 planner/worker/verifier/integrator profile 중 하나를 가리키고 model/tool/MCP/network 범위를 넓힐 수 없어야 한다.

인수 기준:

- [ ] cycle 또는 없는 dependency가 있는 Plan은 어떤 Task도 실행하지 않는다.
- [ ] 계획 승인 전에 파일 쓰기 turn 또는 worktree를 만들지 않는다.
- [ ] 실행 중 Plan은 묵시적으로 바뀌지 않으며, blocker 뒤 새 revision으로 재계획해도 기존 Attempt/worktree/result 기록을 보존한다.
- [ ] Project ceiling보다 넓은 budget, 무한값, runtime이 계측하지 못하는 token/cost cap은 validation에서 거부된다.
- [ ] ResourceClaim 순서, Checkpoint schema, execution profile 또는 artifact materialization이 유효하지 않으면 Plan을 freeze할 수 없다.
- [ ] draft verification input이 current ProjectPolicy의 exact template version/digest로 resolve되지 않았거나 resolve 뒤 policy revision이 바뀌면 Plan을 freeze/dispatch할 수 없다.

### ORC-002 — DAG scheduler

**우선순위:** P0

**목표:** 의존성과 자원 한도에 따라 준비된 Task를 병렬 실행한다.

Plan 상태는 `draft`, `proposed`, `editing`, `validated`, `frozen`, `confirmed`, `running`, `blocked`, `succeeded`, `failed`, `cancelled`를 사용한다. 확인 전 node는 Plan 문서의 정의일 뿐 실행 Task 상태 `planned`를 만들지 않는다. 수정은 기존 validation/freeze를 무효화하며, `confirmed` 전에는 실행 Task를 dispatch할 수 없다. 안전한 재계획은 `blocked → editing → validated → frozen → confirmed`를 사용하고 기존 Attempt와 결과를 삭제하지 않는다.

확인 후 생성·실행되는 Task 상태는 `queued`, `ready`, `dispatching`, `running`, `needs_input`, `blocked`, `succeeded`, `failed`, `cancelled`만 사용한다.

| Task 상태 | lifecycle 의미 |
| --- | --- |
| `queued` | Plan이 확인되었지만 성공해야 할 dependency가 아직 남음 |
| `ready` | dependency가 모두 성공했고 concurrency slot을 기다리거나 바로 시작 가능 |
| `dispatching` | 세 scope slot과 typed resource lease를 확보하고 operation/worktree/Session을 durable하게 예약하는 중 |
| `running` | 연결된 Session turn이 실행 중 |
| `needs_input` | 연결된 Session/Approval이 사용자 입력을 기다림 |
| `blocked` | 선행 실패, materialization/scope/resource/budget/checkpoint/정책/reconciliation 문제로 자동 진행 불가 |
| `succeeded` | Task 결과 계약과 검증을 통과함 |
| `failed` | 실행 또는 검증이 실패함 |
| `cancelled` | 사용자 또는 Plan 취소로 더 실행하지 않음 |

Worktree 통합은 `worktree.integrated`와 Worktree projection으로 추적한다. Task에 `integrated` 상태를 추가하지 않는다. 통합 자체에 실행·검증 의존성이 있으면 같은 TaskState를 쓰는 명시적 integration Task를 Plan에 넣는다.

요구사항:

1. 모든 dependency가 `succeeded`인 Task만 `ready`가 된다. 통합이 선행 조건이면 integration Task의 `succeeded`에 의존한다.
2. scheduler는 global/Machine/Project concurrency, RunBudget, Task priority, ResourceClaim을 동시에 적용해야 한다.
3. 선행 Task 실패 시 후속 Task는 기본적으로 `blocked`가 되며 사용자 선택 없이 계속 실행하지 않는다.
4. 재시도는 TaskAttempt와 실제 runtime 전달을 식별하는 Dispatch ID를 모두 새로 만들고 이전 Session, worktree, 결과를 보존해야 한다.
5. 취소는 실행 중 Task의 turn을 interrupt하고 아직 시작하지 않은 후속 Task를 cancel하되, worktree를 자동 삭제하지 않아야 한다.
6. 결과 계약에는 summary, actual changed files, exact source/result tree OID, verification result, artifacts, source session/turn ID, producer TaskAttempt/Dispatch pair, ContextPackage와 RunManifest reference가 포함되어야 한다.
7. planner와 executor를 같은 세션으로 강제하지 않고 목적에 따라 새 thread 또는 fork를 선택할 수 있어야 한다.
8. retry/unblock/cancel 같은 Task mutation은 `expectedTaskRevision`과 `Idempotency-Key`를 검증해야 한다.
9. shared/exclusive ResourceClaim은 daemon이 typed descriptor에서 canonical key를 계산해야 한다. `(resource kind, canonical key, claim id)` 전역 순서로 한 Attempt의 모든 resource와 세 scope queue lease를 원자적으로 획득하거나 모두 포기하며, shared/shared만 공존시켜야 한다.
10. ResourceLease는 heartbeat·TTL·revision을 가지며 daemon 재시작 뒤 실제 managed Attempt/resource와 reconcile하기 전 재발급하지 않아야 한다. 대기 상한을 넘으면 Task target `resource_wait_timeout` Attention을 만들되 다른 Task의 lease를 강제 해제하지 않아야 한다.
11. RunBudget usage는 source event/provider sample ID로 멱등 누적해야 한다. hard cap에 도달하면 새 dispatch를 중단하고 Plan을 `blocked`, budget을 `exhausted`로 만들며 Plan target `budget_exhausted` Attention을 생성해야 한다.
12. frozen Checkpoint trigger에 도달하면 durable Checkpoint를 `pending`으로 만들고 Task/Plan 진행을 막아야 한다. 응답은 `expectedCheckpointRevision`과 `Idempotency-Key`를 요구하며 high-risk continue는 잠금 해제된 인증 UI receipt 없이는 실행하지 않아야 한다.
13. worker/runtime 시작 전에 instruction source와 content hash, artifact ref, profile/policy/runtime version, TaskAttempt/Dispatch pair와 base/source tree OID를 각각 immutable ContextPackage와 RunManifest로 기록해야 한다. 다른 Session의 전체 대화와 secret answer는 자동 전달하지 않아야 한다.
14. scheduler는 operation, 새 TaskAttempt/Dispatch, queue/resource lease와 budget debit을 journal transaction에 먼저 commit한 뒤에만 worker/runtime를 시작해야 한다. 각 runtime observation, heartbeat, completion, Artifact, VerificationResult, lease release는 current Attempt/Dispatch pair를 요구하고 stale pair는 canonical 상태·자원·통합을 바꾸지 않아야 한다.
15. upstream ID를 응답에서 얻기 전에 event가 올 수 있는 호출은 frame/byte/time hard cap이 있는 operation별 acquisition window를 사용해야 한다. mapping 확정 뒤 수신 순서로 journal에 반영하고 overflow/timeout/ID 불일치면 drop·추정 귀속·blind retry 대신 `outcome_unknown`, scheduler 중지와 reconciliation Attention으로 fail-safe해야 한다.

인수 기준:

- [ ] 다이아몬드 의존 Plan에서 두 중간 Task는 병렬 실행되고 integration Task는 둘 다 성공한 후 시작한다.
- [ ] 선행 Task 실패 뒤 후속 Task가 실행되지 않는다.
- [ ] daemon 재시작 뒤 running/queued Task가 중복 실행되지 않고 reconcile된다.
- [ ] shared/shared claim은 병렬 실행되고 exclusive claim이 섞이면 직렬화되며, 역순 입력에서도 deadlock 없이 동일 canonical order를 사용한다.
- [ ] resource/queue lease의 부분 acquire 또는 만료 lease 자동 탈취가 transaction에 남지 않는다.
- [ ] budget 경계의 마지막 허용 작업까지만 실행되고 초과 Task는 Session/worktree를 만들지 않는다.
- [ ] pending Checkpoint를 acknowledge하거나 음성으로 “계속”이라 말해도 다음 단계가 실행되지 않는다.
- [ ] 이전 Dispatch의 늦은 완료·heartbeat·artifact·verification·lease release는 현재 Task를 성공시키거나 자원을 풀지 않는다.
- [ ] acquisition buffer limit을 넘기거나 mapping 응답이 유실되면 임의 Session/Attempt 귀속 없이 `outcome_unknown`으로 남고 reconcile 전 재실행되지 않는다.

### ORC-003 — Git worktree 격리

**우선순위:** P0

**목표:** 병렬 쓰기 작업이 서로의 working tree를 오염시키지 않는다.

요구사항:

1. Git Project의 쓰기 Task는 기본적으로 Task별 worktree와 `codex/` prefix의 브랜치를 사용해야 한다.
2. Plan 시작 시 base Git revision을 고정하고 각 Task 결과에 기록해야 한다.
3. 기존 dirty working tree를 base로 삼으려면 사용자가 명시적으로 선택해야 하며 포함된 변경 목록을 기록해야 한다.
4. worktree 경로는 Pawdex 전용 디렉터리 아래에 만들고 path traversal을 차단해야 한다.
5. write scope가 겹치는 독립 Task는 경고하거나 의존 관계를 제안해야 한다.
6. Git이 아니거나 Git worktree를 사용할 수 없는 Project는 P0에서 read-only만 허용해야 한다. managed-copy 기반 쓰기 격리는 P1로 두고 P0에서 단일 쓰기로 우회하지 않는다.
7. 사용자의 미커밋 변경, 추적되지 않은 파일, branch는 자동 삭제하거나 덮어쓰지 않아야 한다.
8. dependency artifact는 frozen 계약의 `reference_only` 또는 `apply_commit` 전략으로만 전달해야 한다. `apply_commit`은 producer의 exact commit OID를 새 dependent worktree에 선언된 순서로 적용해야 한다.
9. fan-in materialization 중 OID mismatch나 충돌이 발생하면 remaining commit 적용을 멈추고 부분 worktree를 보존한 채 Task와 Plan을 `blocked`, Worktree target Attention을 `integration_required`로 만들어야 한다. 자동 충돌 해결이나 다른 artifact fallback은 금지한다.
10. turn 종료 후 untracked 파일까지 포함한 actual changed-file manifest와 exact result tree OID를 계산해 frozen write scope와 비교해야 한다. 범위 밖 변경이 하나라도 있으면 Task와 Plan을 `blocked`로 만들고 사용자가 범위를 수정한 새 Plan revision을 validate→freeze→confirm하기 전 같은 Attempt를 진행하지 않아야 한다.

인수 기준:

- [ ] 두 쓰기 Task가 각자의 worktree 밖 파일을 변경할 수 없다.
- [ ] dirty base opt-in이 없으면 graph 실행이 멈추고 이유를 반환한다.
- [ ] 취소 또는 실패 뒤 미커밋 변경이 있는 worktree가 보존되고 정리 후보로만 표시된다.
- [ ] diamond fan-in의 두 commit은 frozen order로만 적용되고 두 번째 commit 충돌 시 첫 번째가 적용된 worktree가 보존되며 Session은 시작되지 않는다.
- [ ] 선언하지 않은 파일 변경은 검증·통합으로 진행하지 않고 `SCOPE_VIOLATION`과 Task target Attention을 만든다.

### ORC-004 — 검증, 통합, 정리

**우선순위:** P0

**목표:** 산출물을 검증한 뒤 사용자가 통제하는 방식으로 합친다.

요구사항:

1. Task별 검증은 local-admin이 사전 등록한 allowlisted `verificationTemplateId`와 schema 검증된 typed args만 사용하고, 결과(exit code, duration, redacted output, artifact, template version, exact source tree OID)를 기록해야 한다.
2. 통합 전 changed-file manifest와 base 대비 diff summary를 계산해야 한다.
3. 충돌이 예상되면 자동 merge 전에 integration Task를 만들거나 사용자에게 순서를 요청해야 한다.
4. P0는 기본 브랜치 자동 merge/push를 기본 비활성으로 해야 한다.
5. P0는 사용자가 diff·검증 결과·대상을 확인한 뒤 선택하는 typed `cherry-pick`, `merge`, `patch-export` 통합 mutation을 제공해야 한다. 각 mutation은 대상 `worktreeId`, Worktree/Project revision, expected TaskAttempt/Dispatch pair, expected source tree/commit OID, target ref와 expected target OID, verification result ID, inspection digest, `Idempotency-Key`를 명시하고 generic Git command를 받지 않아야 한다.
6. branch/worktree 삭제는 uncommitted 상태, 미통합 commit, 사용자 생성 파일을 검사하고 잠금 해제된 인증 UI의 명시적 확인을 받아야 한다. 음성은 정리 화면으로 이동하거나 취소할 수 있지만 삭제를 확정할 수 없다.
7. active writer를 정지한 뒤 exact tree OID에서 required verification을 실행해야 한다. daemon은 template의 고정 executable과 literal/typed argv slot을 shell 보간 없이 사용하고, 지정된 managed-worktree/read-only cwd 및 `inherit=false` clean env에 local-admin이 template에 고정한 allowlisted variable/secret reference만 주입해야 한다. caller는 환경 이름·값·secret reference를 선택할 수 없고, 검증 중·후 source tree 또는 current Attempt/Dispatch pair가 달라지면 그 결과를 무효화하고 다시 검사해야 한다.
8. integration 직전에 source tree/commit과 target ref OID를 다시 읽어 사용자가 확인한 값과 비교해야 한다. 어느 한 값이라도 바뀌면 Git mutation 없이 `SOURCE_CHANGED` 또는 `TARGET_CHANGED`로 거부하고 새 inspection과 확인을 요구해야 한다.

인수 기준:

- [ ] 검증 실패 Task는 `succeeded`가 되지 않고 후속 통합을 차단한다.
- [ ] default 설정에서 모든 node가 성공해도 main branch가 자동 변경되지 않는다.
- [ ] typed cherry-pick/merge/patch-export는 사용자가 본 Worktree revision과 대상 ref가 일치할 때만 한 번 실행되고 stale revision 또는 같은 key의 다른 payload는 거부된다.
- [ ] 미커밋 파일이 있는 worktree 정리 요청은 경고와 확인 없이 실행되지 않는다.
- [ ] 검증 뒤 source tree를 바꾸면 이전 verification result로 Task 성공이나 integration을 승인할 수 없다.
- [ ] 사용자가 확인한 뒤 target branch가 이동하면 stale confirmation receipt와 mutation은 Git을 바꾸지 않는다.
- [ ] Planner/remote payload에 executable path, shell string, 임의 cwd/env를 넣어도 verification process가 시작되지 않는다.

### ORC-005 — 비교 후보 실행과 사람 선택

**우선순위:** P1

**목표:** 같은 작업의 여러 구현 후보를 공정하고 격리된 조건에서 실행·검증하고 사용자가 최종 결과를 선택한다.

요구사항:

1. candidate group은 동일한 frozen Task spec, base Git OID, ContextPackage 입력, completion/verification spec을 사용해야 하며 다른 조건은 명시적 variant field로만 달라질 수 있어야 한다.
2. 각 candidate는 별도 TaskAttempt/Dispatch, Session, managed worktree, source/result OID와 RunManifest를 가져야 하며 서로의 변경·대화·검증 결과를 실행 중 자동 공유하지 않아야 한다.
3. candidate 수, 병렬도, attempt·wall-time·token·cost·output·disk는 Plan과 candidate-group budget의 더 좁은 hard cap을 적용해야 한다. 하나의 후보 budget 초과가 다른 후보의 기록을 삭제하지 않아야 한다.
4. 모든 후보에 동일한 required verifier를 exact candidate tree OID에서 실행하고 changed-file manifest, 검증 결과, risk, budget usage를 같은 비교 schema로 정규화해야 한다.
5. 시스템은 근거가 있는 비교 요약을 제안할 수 있지만 winner 확정은 durable 사람 Decision Gate와 typed 선택으로만 수행해야 한다. winner 선택만으로 merge/push를 실행하지 않고 ORC-004 통합 확인을 별도로 받아야 한다.
6. loser worktree·branch·artifact는 선택 직후 자동 삭제하지 않아야 한다. 보존 기간과 inspection digest를 보여 주고 기존 cleanup 확인 경계를 적용해야 한다.

인수 기준:

- [ ] 두 candidate가 같은 base/spec에서 서로 다른 worktree로 실행되고 동일 verifier 결과와 budget usage가 나란히 조회된다.
- [ ] 시스템 추천만으로 winner나 통합 대상이 확정되지 않는다.
- [ ] winner 선택, integration, loser cleanup이 서로 다른 revision/idempotency/confirmation 경계를 사용한다.

### ORC-006 — Usage Window Runner(사용량 윈도우 큐 실행)

**우선순위:** P1

**의존성:** OBS-002, ORC-002, ORC-004, CFG-001, ATT-001, APR-001, APR-002, SEC-001, DEV-001, DEV-002

**목표:** 현재 provider 사용량 윈도우와 로컬 실행 이력을 보수적으로 해석해, 사용자가 미리 선택한 큐의 이미 확인된 작업만 제한적으로 병렬 실행한다.

요구사항:

1. optional provider adapter capability는 공식 `account/rateLimits/read` snapshot과 `account/rateLimits/updated` observation에서 bucket별 `usedPercent`, `windowDurationMins`, `resetsAt`, source/freshness를 정규화할 수 있어야 한다. 이는 새 Session/Task 상태 event mapping이 아니며 provider observation 자체로 작업 성공이나 budget 충족을 판정하지 않아야 한다.
2. `account/usage/read`의 lifetime/daily token activity는 참고 관찰값일 뿐 정확한 남은 token, 이번 window의 잔여량, 특정 Task의 예상 소모량으로 표시하거나 rate-limit bucket을 대신하지 않아야 한다.
3. local admin은 선택 Queue ID와 그중 stop summary가 향할 단일 control Queue ID, exact frozen hash를 가진 confirmed Plan의 eligible Task ID, bucket별 목표 `usedPercent` 범위, 남겨 둘 reserve floor, snapshot 최대 나이, reset 전 `stopLaunchingAt` buffer, 최대 동시성, 연속 failure threshold, 기존 RunBudget/cost-risk 정책을 참조하는 versioned preset을 저장할 수 있어야 한다. Queue/eligible/각 eligible Task/bucket 목록은 비어 있거나 중복될 수 없고 control Queue는 선택 목록 안에 있어야 한다. 한 preset의 bucket은 하나의 provider adapter에만 속해야 한다. reserve는 `0 ≤ reserve < 100`, 목표는 `0 ≤ min ≤ max ≤ 100 - reserve`, snapshot age/buffer/concurrency/failure threshold는 양의 유한값이어야 한다. snapshot age는 provider adapter capability hard ceiling보다 클 수 없고 preset은 ProjectPolicy·Queue·Plan·Task·RunBudget 제한을 넓힐 수 없다.
4. run 시작은 (a) daemon 설치에 등록된 active `local_controller` Device의 잠금 해제된 인증 local UI 또는 (b) 명시적 `usage_window.start` capability가 있고 revoke되지 않은 `paired_remote` Device의 잠금 해제·인증 UI에서 누른 단일 action으로만 가능하다. 두 경로 모두 같은 confirmation challenge를 완료해 fresh one-time user-presence receipt를 제출해야 하며, daemon은 actor Device ID/kind와 인증 channel을 요청 body가 아니라 현재 연결에서 결정한다. receipt는 foreground explicit action, actor Device와 channel binding, `Idempotency-Key`, expected preset revision/digest와 Project/Queue/Plan/Task/QueueEntry revisions, sealed eligible-set digest, fresh rate-limit snapshot ID/digest, 현재 candidate·forecast·cost-risk preview digest에 결박해야 한다. local UI·CLI·loopback token도 이 receipt 검증을 우회할 수 없고, paired device는 저장된 preset을 그대로 시작할 수만 있으며 preset/queue/eligible Task/scope를 생성·수정할 수 없다. 음성, notification quick action, Planner는 challenge/receipt를 만들거나 run을 시작할 수 없다.
5. 각 eligible Task의 forecast는 로컬 과거 TaskAttempt와 provider bucket observation에서 계산한 `min`/`likely`/`max`, confidence, source, provider adapter/bucket identity, sample count, calculated/valid-until 시각과 freshness(`fresh`/`stale`/`unknown`)를 표시해야 한다. 실제 provider 사용량과 Task 비용을 정확히 안다고 주장하지 않고, bounded max나 fresh 상태를 확보하지 못하면 새 Task를 launch하지 않아야 한다.
6. scheduler는 현재 사용률과 forecast `max`가 목표 상단과 reserve floor를 넘지 않는 Task만 admission해야 한다. 매 admission pass는 Queue priority/order의 결정적 순서로 후보를 검사하고 첫 safe candidate를 고른다. 앞선 entry는 terminal/active/duplicate이거나 그 Task의 bounded fresh forecast가 현재 여유에 맞지 않는다는 구조화된 사유를 기록한 경우에만 그 pass에서 건너뛸 수 있으며 durable Queue 순서를 바꾸지 않는다. sealed membership·revision/definition mismatch, Approval/Checkpoint와 dependency/resource/scope/reconciliation blocker는 뒤 후보로 우회하지 않고 각각 `blocker_pending` 또는 `reconciliation_required`로 중단한다. preset 최대 동시성은 global/Machine/Project/Plan concurrency와 각 RunBudget 중 가장 좁은 제한으로 적용한다.
7. governed TaskAttempt/Dispatch의 reserve/start/complete/fail/cancel lifecycle과 새 fresh rate-limit observation마다 forecast와 launch 가능 집합을 다시 계산해 durable UsageWindowRun revision/event로 남겨야 한다. 각 lifecycle/observation source event ID로 멱등 처리해 replay가 forecast revision을 중복 증가시키지 않아야 하며 stale TaskAttempt/Dispatch 결과는 계산·admission·stop 판정에 사용할 수 없다. 재계산 뒤 launch slot과 sealed queue가 남았지만 safe candidate가 없고 향후 eligibility를 바꿀 active governed Attempt/Dispatch도 없다면 같은 transaction에서 `no_safe_candidate`로 중단해야 한다. active governed Attempt가 있어 기다리는 경우에도 기존 wall-time/stall cap과 reset buffer가 상한이며 무기한 polling하지 않아야 한다.
8. 목표 범위 진입은 **새 launch를 멈추는 기준**이며 정확한 100% 소진, 목표 하단 도달, 특정 token 절감량을 보장하지 않는다. 이미 실행 중인 Attempt는 기존 cancel/interrupt/RunBudget 정책을 따르고 사용률만을 이유로 임의 kill하지 않아야 한다.
9. 선택한 큐와 exact eligible set 밖의 새 작업, 의미 없는 filler, 이미 성공·실행 중인 Task의 duplicate, 목표 사용률을 채우기 위한 합성 prompt를 생성하거나 dispatch하지 않아야 한다.
10. 모든 launch는 기존 dependency, ResourceClaim/Lease, queue lease, RunBudget, write scope, VerificationTemplate, Checkpoint, Approval과 ORC-004 integration gate를 그대로 통과해야 한다. Runner는 pending blocker에 답하거나 Approval/Checkpoint를 자동 수락하지 않아야 한다.
11. target band 도달, eligible queue 고갈, safe candidate 부재, redacted account binding 변경, bucket set/window/reset identity 변경, snapshot stale/unknown 또는 preset max age 초과, reset buffer 진입, blocker/Approval/Checkpoint 발생, failure threshold 도달, 사용자 취소, cost/credit risk 또는 기존 hard cap 도달 중 하나면 새 launch를 즉시 중단하고 canonical stop reason(`target_band_reached`, `queue_empty`, `no_safe_candidate`, `account_binding_changed`, `window_changed`, `snapshot_stale_or_unknown`, `reset_buffer_entered`, `blocker_pending`, `failure_threshold`, `user_cancelled`, `cost_or_credit_risk`, `budget_exhausted`, `reconciliation_required`)·최종 snapshot·forecast 오차·launched/completed/active Task를 요약한 `controlQueueId` target `usage_window_run_stopped` Attention을 하나 만들어야 한다.
12. credit 구매·overage 동의·earned/usage reset 소비, account hot-swap·순환, quota 우회를 자동 수행하거나 Runner 시작 action에 묶지 않아야 한다. 필요한 경우 사용자가 provider의 정상 UI와 별도 인증/결제 흐름을 거친 뒤 새 snapshot과 preview로 새 run을 시작해야 한다.
13. UsageWindowRun은 preset과 별개인 durable mutable aggregate이며 exact preset revision/digest와 그 revision의 immutable effective policy snapshot, Project policy digest, Project/Queue/Plan/Task start revisions, exact QueueEntry binding, Plan frozen hash·Task definition digest, sealed eligible-set digest, start actor Device ID/kind와 channel binding·one-time presence receipt digest, start snapshot/account/window identity, revision, event, snapshot/replay, start/cancel idempotency, admitted TaskAttempt/Dispatch provenance를 가져야 한다. start binding은 감사용으로 바꾸지 않고, 같은 Run이 만든 정상 lifecycle mutation은 별도 current revision cursor를 같은 transaction에서 갱신해야 한다. 외부 revision 전진은 policy/definition/frozen/membership identity가 그대로이고 상태가 여전히 eligible임을 authoritative source event로 확인한 뒤에만 멱등인 bindings-advanced event와 current cursor를 함께 기록하며, 그 외 변경은 새 launch를 막아야 한다. start transaction에서 곧바로 `running`으로 만들고, 사용자 취소만 `cancelled`, reconciliation 불확실성만 `failed`, 나머지 stop reason은 `stopped`로 수렴시키며 terminal Run을 resume하지 않아야 한다. crash 뒤 provider snapshot, membership과 active pair를 reconcile하기 전에는 새 launch를 하지 않아야 한다.

인수 기준:

- [ ] 빈/중복 Queue·eligible·Task·bucket 목록, 선택 목록 밖 control Queue, 둘 이상의 provider adapter, invalid reserve/target, 비양수 snapshot age/buffer/concurrency/failure threshold preset은 저장되지 않는다.
- [ ] 같은 start action을 세 번 재시도해도 UsageWindowRun은 하나이고, stale snapshot/revision/preview digest이면 어떤 Dispatch도 생기지 않는다.
- [ ] fresh bucket update와 각 governed Attempt/Dispatch lifecycle 뒤 `min`/`likely`/`max` forecast가 source event당 한 번 다시 계산되고, 보수적 max가 target 상단 또는 reserve floor를 넘으면 새 launch가 없다.
- [ ] target band 전에 eligible queue가 비면 filler나 duplicate를 만들지 않고 `stopReason="queue_empty"`인 `usage_window_run_stopped` Attention을 남긴다.
- [ ] Queue priority/order대로 scan할 때 더 작은 safe candidate가 있으면 앞 entry의 skip reason을 기록하고 그 후보를 admission하되 Queue 자체는 재정렬하지 않는다. queue가 남고 launch slot이 있지만 safe candidate와 기다릴 active governed Attempt가 모두 없으면 polling하지 않고 `stopReason="no_safe_candidate"`로 정확히 한 번 중단한다.
- [ ] snapshot이 stale/unknown/max age 초과가 되거나 redacted account binding, bucket set, `resetsAt`/window duration이 달라지면 active Attempt를 성공으로 추정하지 않고 새 launch만 멈춘 채 reconcile 가능한 기록을 보존한다.
- [ ] 첫 admission이 Plan/Task/QueueEntry revision을 정상 변경해도 current cursor가 같은 transaction에서 전진해 둘째 admission은 start revision이 아니라 새 cursor를 CAS한다. frozen hash, Task definition, QueueEntry membership 또는 Project/Queue admission policy가 바뀌면 새 launch가 없다.
- [ ] pending Approval/Checkpoint, cost/credit risk, failure threshold, 사용자 cancel 각각이 독립 stop reason으로 재현되고 자동 accept·credit/reset 소비·account switch가 없다.
- [ ] 알림 action이나 음성으로 “남은 사용량 다 써”라고 말해도 Runner가 시작되지 않고 잠금 해제된 preview 화면만 안내한다. active `local_controller`와 revoke되지 않고 `usage_window.start` capability를 가진 `paired_remote` Device는 모두 동일한 fresh one-time receipt·actor/channel binding·exact preview 검증을 통과해야 run 하나를 시작하며, loopback API나 CLI도 이를 우회하지 못하고 어떤 preset/queue/task/scope도 바꾸지 않는다.

## 4.8 코드 리뷰 피드백

### REV-001 — line-anchored batched review feedback

**우선순위:** P1

**목표:** 사용자가 여러 코드 리뷰 의견을 정확한 diff 위치에 묶어 남기고 에이전트에게 한 번의 후속 Turn으로 전달한다.

요구사항:

1. 각 feedback item은 canonical relative path, `baseOid`, `headOid`, diff side(`base`/`head`), 1-based line, 해당 line 또는 hunk의 content hash, 사용자 text를 가져야 한다.
2. batch는 대상 Session/TaskAttempt, expected Session/Task revision, item 순서, 전체 payload digest와 `Idempotency-Key`에 결박해야 한다.
3. 제출 시 현재 blob/diff를 다시 확인하고 path·OID·side·line·content hash 중 하나라도 맞지 않으면 해당 item을 `stale_anchor`로 표시해야 한다. 가장 비슷한 줄로 자동 재배치하거나 다른 파일에 적용하지 않아야 한다.
4. 유효 item 전체는 기존 turn에 steer하지 않고 대상 Session이 새 Turn을 받을 수 있을 때 하나의 structured follow-up prompt로 정확히 한 번 전달해야 한다. 일부 stale이면 사용자가 stale item을 제거·재anchor한 새 batch를 확인하기 전 전송하지 않는다.
5. review batch는 Approval이나 파일 patch가 아니다. 제출 자체가 권한 승인, scope 확대, 변경 적용, verification 통과를 뜻하지 않으며 이후 실행은 기존 sandbox·Approval·write scope를 따라야 한다.
6. comment text는 prompt/코드와 같은 민감도로 저장·전송하고 notification, telemetry, 일반 로그에 넣지 않아야 한다.

인수 기준:

- [ ] 같은 batch를 네트워크 재시도로 세 번 제출해도 새 Turn은 하나만 생성된다.
- [ ] head OID나 anchored line content가 바뀌면 `stale_anchor`가 반환되고 다른 줄에 추정 적용되지 않는다.
- [ ] feedback 제출만으로 Approval이 accepted되거나 Worktree가 통합되지 않는다.

## 4.9 복구, API, 관찰 가능성

### REL-001 — durable journal과 재연결

**우선순위:** P0

**목표:** 이벤트 누락·중복·순서 뒤바뀜에도 모든 클라이언트가 동일 상태로 수렴한다.

요구사항:

1. upstream event 수신, canonical 변환, 상태 변경, Attention 생성, notification outbox를 transaction 또는 복구 가능한 순서로 journal에 기록해야 한다.
2. event는 unique event ID와 daemon database 범위의 sequence를 가져야 하며 reducer는 idempotent해야 한다.
3. 클라이언트는 마지막 acknowledged sequence로 resume할 수 있어야 한다.
4. journal 보존 범위 밖 sequence 요청에는 최신 snapshot과 `baseSequence`를 반환해야 한다.
5. notification은 transactional outbox에서 발송하고 provider retry가 상태 이벤트를 재생하지 않아야 한다.
6. App Server 재연결 시 저장된 상태와 thread/read/list 결과, adapter 내부 pending server request 및 공개 Approval projection을 reconcile해야 한다.
7. wall clock은 표시와 TTL에, sequence는 ordering/cursor에, aggregate revision은 optimistic concurrency에 사용해야 한다.
8. snapshot과 replay는 Dispatch, ResourceClaim/Lease, RunBudget, Checkpoint, ContextPackage, RunManifest와 Session이 없는 orchestration Attention을 포함해야 한다. mutable aggregate는 각 revision으로, immutable context/manifest는 revision 1 create record로 복구해야 한다.
9. daemon 재시작 뒤 ResourceLease를 자동 탈취하거나 budget debit을 중복 반영하지 않고 실제 managed Attempt/Dispatch/process/worktree와 reconcile한 뒤에만 dispatch를 재개해야 한다.
10. upstream ID acquisition window의 buffer는 bounded여야 한다. 매핑 확정 전 frame을 publish하지 않고, overflow/timeout은 `outcome_unknown` operation/Dispatch와 reconciliation Attention으로 journal에 남겨야 한다.
11. P1 Usage Window capability가 활성화되면 UsageWindowPreset/Run도 revision과 event로 snapshot/replay에 포함하고, crash 뒤 fresh provider snapshot과 current Attempt/Dispatch를 reconcile하기 전 새 launch를 금지해야 한다.

인수 기준:

- [ ] event를 중복·역순·재생해도 최종 snapshot이 fixture의 기대값과 일치한다.
- [ ] journal commit 직후 프로세스를 kill해도 Attention Item은 유실되지 않는다.
- [ ] push 전송 도중 kill 후 재시작해도 dedup key 기준 최대 한 번만 사용자에게 표시된다.
- [ ] resource acquire/budget debit/checkpoint response 직후 kill fixture에서 부분 lease, 중복 usage, gate 우회 없이 동일 snapshot으로 수렴한다.
- [ ] journal commit 전 worker/runtime 시작 또는 event publish가 없고 acquisition buffer overflow/timeout 뒤 blind retry가 없다.

### SEC-001 — 인증, 암호화, 권한 경계

**우선순위:** P0

**목표:** 원격 편의 기능이 로컬 코드 실행 권한을 넓히거나 relay에 평문을 노출하지 않게 한다.

요구사항:

1. 위협 모델은 최소한 악성 인터넷 클라이언트, 탈취된 기기 token, 신뢰할 수 없는 relay 운영자, replay·순서 바꾸기 공격, 악성 Project 콘텐츠를 다뤄야 한다.
2. loopback API도 무작위 local access token과 Origin/CSRF 검증을 사용해 다른 웹사이트가 브라우저를 통해 daemon을 호출하지 못하게 해야 한다.
3. remote 연결은 기기별 장기 identity key와 세션별 forward-secret channel key를 사용해야 한다. 구체 알고리즘과 라이브러리는 검토된 표준 구현을 ADR로 선택한다.
4. relay가 저장하거나 전달하는 application payload는 종단간 암호화해야 하며 relay는 라우팅에 꼭 필요한 최소 metadata만 가져야 한다.
5. 각 message는 channel, sender device, sequence/nonce에 결합해 위조, replay, 다른 Session으로의 재사용을 차단해야 한다.
6. private key와 refresh token은 OS secure storage 또는 동등한 비밀 저장소에 보관하고 일반 설정·로그·support bundle에서 제외해야 한다.
7. 기기 scope, ProjectPolicy, runtime approval policy의 교집합만 최종 권한으로 인정해야 한다.
8. prompt, tool output, command environment, 파일 경로에서 secret을 완벽히 탐지할 수 있다고 가정하지 말고 기본 알림·로그 payload 자체를 최소화해야 한다.
9. 클라이언트가 요청할 수 있는 mutation은 명시적 allowlist여야 하며, daemon 내부 App Server channel이나 OS process control을 일반 relay message로 노출하지 않아야 한다.
10. 보안상 안전한 실패가 불가능한 schema mismatch, journal 무결성 실패, 키 저장소 실패 시 mutation을 차단해야 한다.
11. Project 파일, AGENTS 지침, upstream artifact와 agent handoff는 신뢰되지 않은 content로 취급하고 ProjectPolicy, execution profile, RunBudget, ResourceClaim, Approval 또는 Checkpoint 결정을 수정하는 권한으로 해석하지 않아야 한다.
12. read-only/write mode와 별도로 tool/MCP/network 같은 외부 side effect capability를 execution profile에서 allowlist해야 하며, downstream artifact나 review comment가 이를 넓힐 수 없어야 한다.
13. task/attempt/depth/output/disk/resident/wall-time hard cap과 resource lease를 적용해 재귀 분해, retry, stdout flood, worktree 증식으로 인한 자원 고갈을 차단해야 한다.
14. process interrupt/termination은 daemon registry의 owner와 PID start identity에 결박해야 한다. 공유 runtime 또는 소유 불명 process는 자동 종료하지 않아야 한다.
15. TaskAttempt마다 새 Dispatch ID를 발급하고 runtime result·heartbeat·Artifact·VerificationResult·lease release를 current pair에 fence해야 한다. stale pair는 성공, 산출물 채택, resource 해제, integration을 일으키지 않아야 한다.
16. P1 UsageWindowRun start는 local·remote 모두 active Device, 인증 channel과 같은 actor, foreground explicit action에 결박된 fresh one-time user-presence receipt를 검증해야 한다. local start는 install-bound `local_controller`와 local-admin channel만, remote start는 revoke되지 않은 `paired_remote` Device의 명시적 `usage_window.start` capability만 허용한다. 이 capability는 preset/queue/task/scope 수정, Approval/Checkpoint accept, credit/reset/결제나 account switch 권한을 포함하지 않아야 하며 loopback API·CLI·voice·notification action은 receipt를 우회 발급할 수 없어야 한다.

보안 경계:

- P0는 사용자의 Machine 자체가 이미 완전히 장악된 상황에서 코드나 token을 보호한다고 약속하지 않는다.
- E2EE는 relay가 traffic timing, 대략적인 message 크기, device routing metadata를 전혀 보지 못하게 한다는 뜻이 아니다. 노출 metadata는 위협 모델에 열거한다.
- Codex의 sandbox와 approval 정책을 약화시키는 것이 Pawdex의 역할이 아니다. Pawdex는 upstream이 요구한 결정을 더 좁게 전달할 수 있지만 더 넓게 grant하지 않는다.

인수 기준:

- [ ] 다른 origin의 브라우저 요청, token 없는 loopback 요청, revoke된 기기 요청이 모두 거부된다.
- [ ] 캡처한 remote message를 같은 channel과 다른 Session에 재전송해도 mutation이 재실행되지 않는다.
- [ ] relay 저장소 dump에 넣은 알려진 prompt·code·approval fixture 문자열이 평문으로 존재하지 않는다.
- [ ] 기기 scope나 upstream 요청보다 넓은 승인 결정이 daemon validation을 통과하지 않는다.
- [ ] 키 저장소 접근 실패 상태에서 remote mode가 fail-open으로 시작하지 않는다.
- [ ] 악성 project instruction/artifact가 execution profile, resource claim, budget 또는 approval scope를 넓히지 못한다.
- [ ] task explosion, output flood, disk cap, PID reuse fixture가 hard cap 또는 managed-owner 검사를 우회하지 못한다.
- [ ] stale TaskAttempt/Dispatch fixture가 Task 성공, Artifact 채택, lease release 또는 integration을 일으키지 않는다.
- [ ] `usage_window.start`만 가진 device가 preset/eligible set을 바꾸거나 stale/replayed receipt로 run을 시작하지 못한다.
- [ ] local loopback token이나 CLI가 `local_controller` actor/channel binding과 foreground user-presence receipt 없이 UsageWindowRun을 시작하지 못한다.

### API-001 — 로컬·원격 API와 event stream

**우선순위:** P0

**목표:** 클라이언트와 외부 하네스가 좁고 타입 안전한 표면으로 Pawdex를 제어한다.

요구사항:

1. API는 `/api/v1`처럼 명시적 major version을 가져야 한다.
2. read API는 machines, projects, sessions, approvals, attentions, plans/tasks/dispatches, worktrees, resource claims/leases, run budgets, checkpoints, referenced context/run manifest, capabilities, diagnostics를 제공해야 한다.
3. mutation API는 project/session/turn/typed approval/plan/task/worktree/checkpoint 동작별 endpoint 또는 command type을 가져야 한다. ResourceLease와 RunBudget debit은 daemon 내부 transition만 허용해야 한다.
4. event stream은 snapshot과 sequence resume을 지원해야 한다.
5. 모든 mutation은 인증, 권한 scope, `Idempotency-Key`를 검사하고, 기존 mutable aggregate를 대상으로 하면 그 종류의 `expected...Revision`을 검증해야 한다. sequence를 concurrency token으로 받지 않는다.
6. 오류는 stable code, user-safe message, retryable 여부, correlation ID를 포함해야 한다.
7. API schema를 저장소에 게시하고 client SDK 또는 생성 타입의 호환성 테스트를 제공해야 한다.
8. 임의 command string을 실행하거나 임의 App Server JSON-RPC result를 통과시키는 범용 endpoint를 금지한다.
9. P0 local CLI는 게시된 schema에서 생성한 daemon API client를 사용해야 하며 App Server stdio, daemon DB, OS process control을 직접 호출하지 않아야 한다.
10. CLI의 read 명령과 typed mutation도 브라우저/원격 클라이언트와 같은 revision·idempotency·approval 정책을 따라야 한다. `exec`, `shell`, 임의 RPC pass-through 같은 범용 명령은 제공하지 않는다.
11. destructive/elevated `accept`가 필요하면 CLI는 잠금 해제된 인증 UI로 이동하도록 안내하고 자체 플래그·stdin 확인으로 confirmation receipt를 대체하지 않아야 한다.

인수 기준:

- [ ] schema 기반 invalid request fuzzing에서 daemon crash 또는 upstream pass-through가 발생하지 않는다.
- [ ] sequence gap이 있는 클라이언트가 자동으로 replay 또는 snapshot으로 수렴한다.
- [ ] 공개 API 목록을 검사하는 보안 테스트가 raw shell/pass-through endpoint를 발견하지 않는다.
- [ ] CLI의 health, Project/Session 조회와 대표 typed mutation이 생성 client를 통해 같은 API fixture를 통과하고 aggregate revision·`Idempotency-Key`를 누락하면 로컬에서 거부된다.
- [ ] CLI 명령 목록에 raw shell/App Server RPC/DB 우회 경로가 없고 destructive/elevated `accept`는 인증 UI confirmation receipt 없이 제출되지 않는다.

### OBS-001 — 감사 로그와 진단

**우선순위:** P0

**목표:** 상태 오판과 보안 결정을 재현하되 secret을 수집하지 않는다.

요구사항:

1. 모든 mutation은 actor device, target, action type, decision, correlation ID, 시각을 audit event로 남겨야 한다.
2. approval audit는 요청 요약과 결정 범위를 남기되 secret 가능성이 있는 원문은 기본 redaction해야 한다.
3. diagnostics는 Codex version, capability, 연결 상태, queue, journal lag, notification channel 상태, 최근 오류 코드를 포함해야 한다.
4. support bundle은 사용자가 preview·redact한 뒤 export할 수 있어야 한다.
5. 제품 telemetry는 기본 비활성 또는 명시적 opt-in이어야 하며 prompt, 코드, 파일 경로, 음성을 수집하지 않아야 한다.
6. 로그 retention과 삭제를 설정할 수 있어야 한다.
7. TaskAttempt 진단에는 redacted RunManifest ID/digest, execution profile, exact base/source/result tree OID, context/artifact provenance, budget/resource/checkpoint 상태를 연결하되 원문 prompt·secret·절대 경로를 기본 로그에 넣지 않아야 한다.

인수 기준:

- [ ] 승인 문제를 Approval/turn/correlation ID로 추적할 수 있고 upstream request ID는 adapter 진단 범위 밖으로 노출되지 않는다.
- [ ] fixture secret을 prompt, command env, path에 넣은 뒤 support bundle scanner가 평문 노출을 차단한다.
- [ ] telemetry off 상태에서 제품 분석 endpoint로 outbound 요청이 발생하지 않는다.
- [ ] 한 Task 결과를 RunManifest→ContextPackage→Artifact/Verification→source tree OID까지 추적할 수 있고 secret fixture 원문은 노출되지 않는다.

### OBS-002 — provider usage·rate-limit 가시성

**우선순위:** P1

**목표:** 사용량과 속도 제한 정보를 출처·신선도와 함께 보여 주고 scheduler가 정직한 queue 판단에 사용할 수 있게 한다.

요구사항:

1. usage snapshot은 provider/runtime가 제공한 source, account의 redacted identity, 수집 시각, 유효/만료 시각, 측정 window, 사용·남은 값, 단위, reset 시각, 신뢰 상태(`fresh`, `stale`, `unknown`)를 가져야 한다.
2. 누락·지원하지 않음·오류를 0 사용 또는 무제한으로 표시하지 않고 `unknown`과 원인을 명시해야 한다. runtime 추정값과 provider authoritative 값을 같은 정밀도로 가장하지 않는다.
3. queue policy는 fresh authoritative rate-limit/usage와 stable retry hint를 pause/resumeAfter/admission 입력으로 사용할 수 있다. stale/unknown 값만으로 위험 작업을 자동 시작하거나 hard token/cost cap 충족을 주장하지 않아야 한다.
4. 계정 인증 정보, 전체 billing 식별자, bearer token을 event/log/remote projection에 노출하지 않아야 한다.
5. Pawdex는 사용량 제한을 피하려고 계정을 자동 hot-swap하거나 여러 계정을 순환하거나 provider quota를 우회하지 않아야 한다. 계정 변경은 사용자가 Codex/provider의 정상 인증 경로에서 명시적으로 수행하고 runtime reconciliation을 거쳐야 한다.
6. usage poll은 provider rate limit을 악화시키지 않게 backoff·jitter·최소 갱신 간격을 적용하고 로컬 실행 자체와 실패 격리를 유지해야 한다.

인수 기준:

- [ ] unavailable fixture가 0% 사용이나 무제한으로 렌더링되지 않고 source/freshness/원인을 보존한다.
- [ ] fresh reset hint는 영향 scope Queue만 pause하며 다른 Project의 독립 queue 상태를 오염시키지 않는다.
- [ ] account 전환이나 quota 우회를 수행하는 mutation·자동 fallback이 공개 API에 없다.

### CFG-001 — 정책과 설정 우선순위

**우선순위:** P0

**목표:** 위험·알림·동시성 정책을 예측 가능하게 적용한다.

요구사항:

1. 정책 출처는 `machine default → ProjectPolicy → confirmed Plan/Task constraint → 허용된 Session execution 선택` 순으로 결합해야 한다. 하위 단계는 보안·권한 범위를 임의로 넓힐 수 없고 더 좁은 제한이 우선한다.
2. 최종 effective policy와 각 값의 출처·제약 이유를 조회할 수 있어야 한다.
3. 알림, quiet hours, concurrency, RunBudget ceiling, stall/acquisition-window threshold, worktree, resource, execution profile, approval, voice, retention을 독립 설정 영역으로 둔다. P1 UsageWindowPreset은 local-admin 전용 별도 영역으로 두고 기존 budget/cost/queue 정책을 참조만 해야 한다.
4. 보안을 약화하는 ProjectPolicy 변경은 기본값이 아니어야 하며 영향과 scope를 보여 주고 `expectedProjectRevision`, `Idempotency-Key`, 필요한 explicit confirmation을 검증해야 한다.
5. 알 수 없는 설정 키는 silent ignore하지 않고 versioned validation 오류 또는 경고를 내야 한다.
6. secret은 일반 설정 파일과 분리해 OS secure storage 또는 동등한 비밀 저장소를 사용해야 한다.

인수 기준:

- [ ] effective policy 조회로 Machine·Project·Plan/Task·Session execution 값 중 어떤 제한이 최종값을 결정했는지 확인할 수 있다.
- [ ] 잘못된 quiet hours/timezone 설정이 저장되지 않는다.
- [ ] exported config에 private key, token, push secret이 포함되지 않는다.

### OSS-001 — 오픈소스 배포와 확장 계약

**우선순위:** P0

**목표:** 개발자가 Pawdex를 감사하고 로컬에서 재현하며 어댑터를 만들 수 있다.

요구사항:

1. core, daemon, 프로토콜, 기본 클라이언트는 저장소의 명시된 오픈소스 라이선스로 배포해야 한다.
2. 지원 플랫폼, Codex 버전, 설치 prerequisites, 위협 모델, 데이터 흐름을 문서화해야 한다.
3. provider-specific 구현은 adapter interface 뒤에 두고 contract fixture를 제공해야 한다.
4. 로컬 개발 명령은 재현 가능해야 하며 lockfile과 CI를 제공해야 한다.
5. 보안 취약점 비공개 제보 경로와 release signing/checksum 계획을 제공해야 한다.
6. hosted relay가 생기더라도 self-host 가능한 relay protocol과 core 기능의 경계를 문서화해야 한다.

인수 기준:

- [ ] 새 checkout에서 문서화된 명령으로 build/test가 통과한다.
- [ ] adapter 샘플이 core state type을 직접 변경하지 않고 fixture test를 통과한다.
- [ ] release artifact의 checksum 또는 signature를 검증할 수 있다.

## 5. 비기능 요구사항

| ID | 영역 | P0 요구사항 |
| --- | --- | --- |
| NFR-PERF-001 | 이벤트 지연 | 정상 로컬 부하에서 App Server event부터 canonical state 반영까지 p95 1초 이내 |
| NFR-PERF-002 | 알림 enqueue | Attention journal commit부터 remote provider enqueue까지 p95 2초 이내 |
| NFR-SCALE-001 | 규모 | 기준 Machine에서 20개 등록 Session, 8개 active turn, 5,000개 보존 event를 기능 저하 없이 처리하고 Plan별 task/depth/attempt/wall-time/resident/output/worktree hard cap을 항상 적용; 실제 한도는 부하 테스트 후 조정 |
| NFR-REL-001 | 전달 | provider 외부 제약을 제외한 journal-to-outbox Attention 손실 0건 |
| NFR-REL-002 | 복구 | daemon 비정상 종료 후 30초 내 API 준비 및 상태 reconcile 시작 |
| NFR-SEC-001 | 네트워크 | P0 loopback-only listener, outbound E2EE relay, TLS, replay protection, 기기 revoke |
| NFR-SEC-002 | 권한 | least privilege, typed approval, elevated/destructive accept는 잠금 해제된 인증 UI action 필수 |
| NFR-PRV-001 | 개인정보 | raw audio 기본 미보존, prompt/code telemetry 금지, notification payload 최소화 |
| NFR-COMPAT-001 | 계약 | 지원 Codex 버전별 생성 schema·fixture CI 통과 |
| NFR-PORT-001 | 플랫폼 | P0 daemon은 macOS를 기준 지원하고 Linux는 검증 범위를 명시; 모바일은 capability 기반 웹 설치형 클라이언트 |
| NFR-I18N-001 | 언어 | 내부 event code는 언어 중립, 사용자 메시지는 최소 한국어·영어 확장 가능한 message key 사용 |
| NFR-OPS-001 | 업그레이드 | DB/schema migration은 backup, dry-run 또는 rollback 가능한 단계를 제공 |
| NFR-UX-001 | 점진적 공개·용어 | 개발자와 비개발자가 같은 흐름을 쓰되 기본 화면은 목표·현재 상태·다음 안전 행동을 쉬운 말로 보여 주고, event ID·revision·digest·raw diagnostics는 명시적으로 펼치는 기술 상세에 둔다 |
| NFR-UX-002 | 정직한 진행 표현 | lifecycle stage와 검증 가능한 근거만 진행으로 표시하고 근거 없는 완료 퍼센트, 정확한 token 잔량·100% 소진 또는 성공 예측을 표시하지 않는다 |
| NFR-A11Y-001 | 조작성·상태 인지 | 핵심 interactive target은 최소 44×44 CSS px이며 keyboard/focus/screen-reader label을 제공하고 모든 상태·위험·성공 표시는 색상만이 아니라 icon과 text를 함께 사용한다 |
| NFR-VOICE-001 | 음성 확인 | 모든 음성 mutation은 전사문, 해석한 action, 정확한 대상 Project/Session/Approval을 전송 전에 보여 주거나 읽어 주고 명시적 확인을 받으며 ambiguous/low-confidence이면 실행하지 않는다 |

## 6. 공통 오류 처리 표

| 상황 | 시스템 동작 | 사용자에게 필요한 정보 | 자동 재시도 |
| --- | --- | --- | --- |
| Codex 로그인 만료 | 새 turn 차단, 기존 journal 유지 | 로그인 필요, 영향 Session | 아니오 |
| App Server 연결 끊김 | 활성 Session을 `offline`으로 전환하고 결과를 추정하지 않음 | 마지막 확인 시각 | backoff+jitter 후 reconciliation |
| 사용량/속도 제한 | 영향 scope queue pause | 오류 종류, 재개 가능 시각(알 수 있을 때) | 서버 힌트가 있을 때 제한적 |
| Approval timeout | Approval `expired`, 연결 Attention `resolved`, 제출 차단 | 이미 만료되었음 | 아니오 |
| stale aggregate revision/turn | `STATE_CONFLICT`, mutation 거부, 최신 resource projection 반환 | 상태가 바뀌었음 | read 후 사용자 재확인 |
| push provider 실패 | outbox retry 또는 fallback | 채널 상태 | TTL·상한 내 예 |
| 음성 전사 실패 | 오디오 폐기, 텍스트 입력 제안 | 로컬/네트워크/권한 원인 | 사용자가 다시 시작 |
| worktree 충돌 | 해당 Task/integration 차단 | 충돌 파일과 안전한 선택 | 아니오 |
| dependency materialization 충돌/OID mismatch | 부분 worktree 보존, Task·Plan block, Worktree Attention 생성 | producer, 적용 순서, 충돌 파일/OID | 아니오 |
| resource lease 대기 상한 | Task는 미실행 유지, Task Attention 생성 | canonical resource 표시명, owner, 대기 시간 | 사용자 재시도/정책 변경 |
| RunBudget hard cap | 새 dispatch 차단, active turn typed interrupt, Plan block | 소진 차원, 측정 지원 여부, 최종 usage | 아니오; 새 Plan revision 필요 |
| Task stall | health만 `stalled`, 상태 결과 추정 금지 | 마지막 검증 activity, 안전한 interrupt 선택 | 자동 강제 종료 금지 |
| write scope 위반 | Task·Plan block, worktree 보존 | 선언 범위와 실제 변경 manifest | 아니오; 재동결·재확인 |
| source/target OID 변경 | verification/integration 거부 | 기대값과 최신 OID, 재검사 필요 | 아니오 |
| disk full/journal 실패 | 새 mutation 중단, read-only 진단 | 데이터 보호를 위한 중단 | 아니오 |
| unsupported schema | App Server mutation 차단 | 지원 범위와 업데이트 안내 | 아니오 |
| relay 불가 | local mode 유지 | 원격만 불가함 | backoff, local 기능은 계속 |

## 7. 보안·개인정보 기능 체크리스트

- [ ] loopback 기본 bind와 local API authentication
- [ ] P0 non-loopback listener 부재와 daemon→relay outbound-only 연결
- [ ] Origin/CSRF 검증과 WebSocket handshake 인증
- [ ] 기기별 키, refresh token 회전, revoke
- [ ] remote payload E2EE와 sequence/nonce replay 방지
- [ ] relay에 prompt, 코드, 명령, 승인 평문 미노출
- [ ] typed approval allowlist와 요청된 범위 부분집합 검증
- [ ] destructive/elevated accept는 잠금 해제된 인증 UI confirmation receipt 필수, 모든 Approval의 음성 accept 금지
- [ ] Project workspace root canonical path와 symlink 탈출 검사
- [ ] notification/로그/support bundle secret redaction
- [ ] raw audio 기본 미저장, 클라우드 전사 opt-in
- [ ] raw shell 및 generic JSON-RPC pass-through endpoint 부재 테스트
- [ ] finite RunBudget, task/depth/attempt/output/disk 폭주 방지와 멱등 usage accounting
- [ ] ResourceClaim 전역 정렬, shared/exclusive 호환성, all-or-nothing lease, TTL/recovery
- [ ] project instruction/artifact가 execution profile·scope·approval을 넓히지 못함
- [ ] process owner/PID start identity 확인과 공유·소유 불명 process 강제 종료 금지
- [ ] actual write scope와 verification/source/target OID freshness gate
- [ ] dependency/SBOM, secret scan, release artifact 검증

## 8. 대표 E2E 인수 시나리오

### E2E-001 — 세 세션 병렬 완료

Given 같은 Git Project의 독립 worktree에 세 Task가 confirm되어 있고 동시성 한도가 3일 때, When 각 Task가 서로 다른 시간에 완료하면, Then 세 Session 이벤트와 결과가 섞이지 않고 각 완료 Attention이 기기당 한 번 생성된다.

### E2E-002 — 모바일 질문 답변

Given 모바일이 페어링되어 있고 한 Session이 `item/tool/requestUserInput`을 보냈을 때, When 사용자가 알림을 열어 Approval ID와 revision으로 답을 제출하면, Then adapter는 답을 원 upstream request에만 전달하고 `serverRequest/resolved` 뒤 active turn이면 Session은 `running`, 이미 turn이 끝났으면 해당 terminal 상태를 유지한다.

### E2E-003 — 음성 steer race

Given 사용자가 실행 중 Session에 음성 steer를 말하는 동안 기존 turn이 완료되고 새 turn이 시작되었을 때, When 이전 `expectedTurnId` 또는 `expectedSessionRevision`으로 요청하면, Then 새 turn에는 입력이 전달되지 않고 `STATE_CONFLICT`, 최신 상태, 재확인 요청을 반환한다.

### E2E-004 — elevated 승인

Given Project workspace root 밖 쓰기 또는 session-scoped 권한 요청이 왔을 때, When 사용자가 음성으로 한 번 또는 여러 번 “허용”이라고 말하면, Then 요청은 실행되지 않는다. 잠금 해제된 인증 UI에서 영향 범위를 본 뒤 명시적으로 accept해야 한다.

### E2E-005 — daemon crash와 push 중복

Given `needs_input` Item이 journal에 기록되고 push provider 호출 직후 daemon이 종료되었을 때, When daemon을 재시작하면, Then Item은 복구되고 같은 dedup stage가 사용자에게 두 번 표시되지 않는다.

같은 시나리오에서 ResourceLease acquire, budget debit 또는 Checkpoint 응답 직후 종료되더라도 부분 lease·중복 usage·gate 우회 없이 snapshot과 event replay가 같은 상태로 수렴해야 한다.

### E2E-006 — DAG 의존성과 실패

Given Task A와 B가 병렬이고 C가 두 Task에 의존할 때, When A는 성공하고 B의 검증이 실패하면, Then C는 `blocked`이며 사용자가 B 재시도 또는 Plan 변경을 선택하기 전 실행되지 않는다.

A와 B가 모두 commit artifact를 만들고 C가 두 결과를 `apply_commit`으로 소비할 때는 frozen order와 exact OID로 materialize한다. 두 번째 commit이 충돌하면 C Session을 시작하지 않고 부분 worktree를 보존하며 Worktree target `integration_required` Attention을 생성한다. 동일 Plan이 budget cap에 도달하면 아직 dispatch되지 않은 Task는 Session/worktree를 만들지 않는다.

### E2E-007 — worktree 데이터 보호

Given 실패한 Task worktree에 미커밋 파일이 있을 때, When Plan 정리를 요청하면, Then 삭제 대상과 복구 불가능성을 보여 주고 잠금 해제된 인증 UI의 명시적 승인 전에는 파일을 제거하지 않는다.

실제 변경 파일이 frozen write scope 밖이거나 검증 뒤 source tree/통합 target OID가 바뀌면 Task/Plan 또는 integration을 차단하고, 새 Plan freeze/confirm 또는 새 inspection 전 기존 결과·receipt를 재사용하지 않는다.

### E2E-008 — relay 침해 가정

Given relay의 DB와 네트워크 로그만 가진 공격자일 때, When 저장 데이터를 분석하면, Then session prompt, 코드, 음성 전사, approval detail을 평문으로 복구할 수 없다.

### E2E-009 — schema 호환성 차단

Given 지원하지 않는 Codex App Server 계약일 때, When daemon이 handshake하면, Then unsafe mutation을 시작하지 않고 버전 오류와 로컬 진단을 제공한다.

### E2E-010 — 알림 capability fallback

Given 모바일 브라우저가 background custom sound를 지원하지 않을 때, When 완료 이벤트가 발생하면, Then 표준 push 또는 silent notification으로 전달하고 야옹 소리 성공으로 기록하지 않는다.

## 9. 추적성 매트릭스

| 사용자 과업 | 주 기능 | 필수 인수 시나리오 | 릴리스 |
| --- | --- | --- | --- |
| JTBD-01 완료·입력 요청 즉시 인지 | ATT-001, ATT-002, NTF-001, NTF-002 | E2E-001, E2E-002, E2E-005, E2E-010 | P0 |
| JTBD-02 음성으로 후속 작업 | VOI-001, VOI-002, APR-002 | E2E-002, E2E-003 | P0 |
| JTBD-03 안전한 병렬 분할 | PROJ-001, SES-002, ORC-001~004 | E2E-001, E2E-006, E2E-007 | P0 |
| JTBD-04 원격 승인 처리 | APR-001, APR-002, SEC-001 | E2E-002, E2E-004 | P0 |
| JTBD-05 연결 후 상태 신뢰 | SES-003, REL-001, API-001 | E2E-003, E2E-005, E2E-009 | P0 |
| JTBD-06 하네스 확장 | SYS-002, API-001, OSS-001 | contract/fuzz/build CI | P0 |
| P1 유휴 Session 자원 회수 | SES-004 | SES-004 hibernation/warm-resume 인수 기준 | P1 |
| P1 동일 spec 후보 비교 | ORC-005 | ORC-005 candidate isolation/winner/cleanup 인수 기준 | P1 |
| P1 사용량 윈도우 큐 실행 | ORC-006, OBS-002, CFG-001 | ORC-006 fresh snapshot/forecast/stop/no-filler 인수 기준 | P1 |
| P1 정확한 코드 리뷰 전달 | REV-001 | REV-001 anchor/idempotency 인수 기준 | P1 |
| P1 provider 한도 가시성 | OBS-002 | OBS-002 source/freshness/no-hot-swap 인수 기준 | P1 |
| 개발자·비개발자 공통 조작 | NFR-UX-001, NFR-A11Y-001 | 핵심 흐름 plain-language walkthrough, 기술 상세 progressive-disclosure, keyboard/screen-reader/44px/non-color audit | P0 |
| 상태·사용량 오해 방지 | NFR-UX-002, SES-003, OBS-002, ORC-006 | lifecycle evidence와 forecast 표기 audit, 근거 없는 완료율·token 잔량·100% 소진 문구 0건 | P0/P1 |
| 음성 오발송 방지 | NFR-VOICE-001, VOI-002 | E2E-003과 대상·의도·전사 확인, ambiguous/low-confidence 차단 테스트 | P0 |

## 10. 출시 판정

P0는 다음 조건을 모두 충족해야 공개 MVP로 표시할 수 있다.

1. 모든 P0 기능의 인수 기준과 E2E-001~010이 자동 또는 재현 가능한 수동 테스트로 통과한다.
2. threat model 리뷰에서 critical/high 미해결 항목이 없다.
3. raw shell endpoint, generic approval pass-through, 기본 외부 bind가 없음을 검증한다.
4. 지원 Codex 버전과 플랫폼 범위를 문서화하고 contract test가 통과한다.
5. daemon crash, App Server restart, relay disconnect, push retry chaos test가 상태 수렴을 보인다.
6. 모바일 custom sound 제한, cloud STT 여부, relay metadata를 사용자 문서에서 과장 없이 설명한다.
7. 사용자 화면은 승인된 Figma 제품 UX의 핵심 흐름·정보 우선순위·안전 확인을 구현하고, `NFR-UX-*`, `NFR-A11Y-001`, `NFR-VOICE-001` 검증을 통과한다. 시각 브랜드 변경은 이 기능·안전 계약을 약화시키지 않아야 한다.
8. 설치, 제거, 데이터 export, 기기 revoke, worktree 수동 복구 절차가 문서화된다.
9. Session이 없는 Plan/Task/Queue/Worktree Attention, dependency materialization, ResourceLease, RunBudget, Checkpoint가 crash/replay 뒤 수렴한다.
10. scope 위반, stale source/target OID, budget exhaustion, 소유 불명 process termination이 fail-closed 테스트를 통과한다.

## 11. 제품 UX 구현 기준

[Figma 제품 UX 초안](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)은 이 문서의 기능 ID와 상태를 화면으로 연결한다. 구현과 후속 디자인 변경은 다음 계약을 변경하지 않고 표현 방법만 발전시킨다.

- Session, Plan, Task의 차이와 TaskState lifecycle
- `needs_input`, `completed`, `failed`와 orchestration blocker의 우선순위
- Attention의 typed target/source, acknowledged/resolved 상태와 연결된 Approval·Checkpoint의 risk/expiry
- typed approval에서 반드시 보여야 할 정보와 명시적 확인
- 음성 대상·전사문·실행 의미 확인
- 알림 capability와 fallback의 정직한 표시
- worktree 결과와 통합 전 검증 상태
- RunBudget·resource 대기·stall 상태와 source/target OID freshness
- P1 UsageWindowRun의 source/freshness, min/likely/max confidence, target/reserve와 stop reason

기능 계약을 바꿔야 하는 디자인 제안은 해당 기능 ID의 명세 변경과 테스트 갱신을 함께 거친다.

## 12. 참고 자료

- [Pawdex 목표 프로토콜](./PROTOCOL.md)
- [Codex App Server 공식 문서](https://learn.chatgpt.com/ko-KR/docs/app-server)
- [Codex Git worktree 공식 문서](https://learn.chatgpt.com/ko-KR/docs/environments/git-worktrees)
- [Codex Voice 공식 문서](https://learn.chatgpt.com/docs/features/voice)
- [Happy 저장소](https://github.com/slopus/happy)
