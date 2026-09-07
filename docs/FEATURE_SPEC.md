# Pawdex 기능 명세서

> 문서 상태: Draft v0.1
>
> 기준 제품 범위: 공개 가능한 P0 MVP
>
> 선행 문서: [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md)
>
> 정규 계약: [PROTOCOL.md](./PROTOCOL.md)
>
> 제외 범위: UI 구조, 비주얼, 고양이 캐릭터 표현, 브랜드·카피의 최종안은 디자인 단계로 미룬다.

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

Attention의 정규 상태는 `open`, `acknowledged`, `resolved` 세 가지다. 질문·승인의 응답 수명 주기는 별도 Approval aggregate의 `pending`, `responding`, `accepted`, `declined`, `cancelled`, `expired`로 표현한다. `responding`은 전송 성공을 뜻하지 않으며 authoritative `serverRequest/resolved` 또는 그에 준하는 이벤트를 받은 뒤에만 Approval의 최종 상태와 Attention의 `resolved`를 확정한다.

### 3.4 시스템 불변식

- 한 Session에는 동시에 최대 하나의 active turn만 존재한다.
- 하나의 App Server request ID에는 최대 하나의 성공 응답만 적용한다.
- 모든 정규 이벤트에는 `eventId`, daemon database 범위의 `sequence`, `occurredAt`, aggregate type/ID/revision이 있다. 관련 `machineId`·`sessionId`는 payload 또는 projection으로 연결한다.
- `sequence`는 event ordering과 cursor에만 사용하며 mutation 충돌 검증에는 사용하지 않는다.
- Session, Plan, Approval 같은 mutable aggregate는 각각 1씩 증가하는 `revision`을 갖고 mutation은 대응하는 `expected...Revision`을 검증한다.
- 모든 mutation은 aggregate revision과 별개로 `Idempotency-Key`를 요구한다.
- 같은 notification dedup key로 같은 기기에 두 번 울리지 않는다.
- 원격 API는 사용자가 입력한 문자열을 임의 셸로 실행하는 기능을 제공하지 않는다.
- 쓰기 가능한 병렬 Task는 같은 working directory를 공유하지 않는다.
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

용어 규칙:

- **Project**는 API와 권한의 aggregate이며 항상 `projectId`로 참조한다.
- **workspace root**는 Project가 가리키는 로컬 filesystem directory다. 별도 `workspaceId` 리소스가 아니며 Session 생성 body의 `cwd`가 아니다.

인수 기준:

- [ ] remote 기기가 새 절대 경로 또는 `cwd`를 보내 Project/Session을 만들 수 없다.
- [ ] symlink를 이용한 workspace root 또는 허용된 하위 경계 탈출이 차단된다.
- [ ] stale `expectedProjectRevision` 정책 변경은 `STATE_CONFLICT`이고 같은 idempotency key 재시도는 최초 결과를 반환한다.

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

인수 기준:

- [ ] 한도 2에서 5개 작업을 넣으면 동시에 최대 2개만 active turn이 된다.
- [ ] 하나의 App Server 요청이 실패해도 무관한 Session은 계속 진행한다.
- [ ] daemon 재시작 뒤 global/Machine/Project queue의 순서, pause reason, lease, idempotency가 보존되고 같은 operation이 중복 실행되지 않는다.
- [ ] 한 Project queue의 pause 또는 한도 도달이 다른 Project의 여유 slot 실행을 막지 않으며 global/Machine 한도는 두 Project에 함께 적용된다.

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

## 4.4 Attention Inbox와 알림

### ATT-001 — 통합 Attention Inbox

**우선순위:** P0

**목표:** 모든 Session의 사람 개입 항목을 손실 없이 한곳에 모은다.

요구사항:

1. durable Attention은 `needs_input`, `failed`, `completed`, `reconciliation_required` kind로 생성해야 한다. 알림은 Session 상태를 직접 구독하지 않고 이 aggregate를 원천으로 삼아야 한다.
2. Attention은 ID, session ID, kind, `open`/`acknowledged`/`resolved` 상태, title, 안전한 preview, 생성 시각, aggregate revision을 포함해야 한다. machine/project/turn과 risk는 연결 projection으로 조회하고 upstream request ID를 노출하지 않는다.
3. 기본 정렬은 파생 risk와 연결된 Approval expiry를 우선한 뒤 생성 시각을 사용해야 한다.
4. 질문·승인 Attention은 Approval이 해결되기 전 dismiss 또는 resolved 처리할 수 없다. P0의 사용자 동작은 acknowledge이며 snooze는 notification policy의 후속 확장으로 둔다.
5. 완료 Attention은 사용자가 열면 `acknowledged`, 새 turn으로 의미가 사라지면 `resolved` 처리해야 한다.
6. 여러 기기가 같은 Attention을 열어도 연결된 Approval의 `pending`/`responding`/최종 상태를 실시간 동기화해야 한다.
7. 원 요청이 사라지면 Approval을 `expired`, 연결된 Attention을 `resolved`로 바꾸고 늦은 응답을 보내지 않아야 한다.

인수 기준:

- [ ] 3개 Session에서 동시에 질문·실패·완료가 발생하면 서로 다른 Item 3개가 생긴다.
- [ ] 한 기기가 응답을 시작하면 다른 기기에 연결된 Approval의 `responding` 상태가 반영된다.
- [ ] App Server가 요청을 먼저 정리한 경우 모바일의 늦은 승인에 `APPROVAL_EXPIRED`가 반환된다.

### ATT-002 — 알림 정책, dedup, quiet hours, escalation

**우선순위:** P0

**목표:** 중요한 개입은 놓치지 않되 같은 사건으로 반복해서 울리지 않는다.

요구사항:

1. notification dedup key는 최소 `deviceId + attentionId + policyRevision + stage`로 계산해야 한다.
2. 기본 정책은 `needs_input`과 `failed`를 즉시, `completed`를 즉시 또는 사용자가 선택한 digest로 전송해야 한다.
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
   - 예상 read/write scope
   - 등록된 `projectId`, base Git revision, 실행 정책
   - 완료 조건과 검증 명령의 선언형 목록
   - 예상 위험, 사람 확인 지점, 결과 전달 계약
3. 실행 전 cycle, 존재하지 않는 dependency, write scope 중복, 동시성·예산 초과를 검사해야 한다.
4. P0는 제안된 Plan을 사용자가 confirm한 뒤에만 쓰기 Task를 시작해야 한다.
5. 승인된 Plan aggregate revision은 실행 중 묵시적으로 바뀌지 않아야 한다. 변경은 새 revision과 diff를 만든다.
6. Planner가 만든 검증 명령도 raw remote shell이 아니라 ProjectPolicy에 허용된 command template 또는 typed approval을 거쳐야 한다.
7. Plan confirm은 `expectedPlanRevision`과 `Idempotency-Key`를 요구하고, 사용자가 본 revision과 다르면 어떤 Task도 시작하지 않아야 한다.

인수 기준:

- [ ] cycle 또는 없는 dependency가 있는 Plan은 어떤 Task도 실행하지 않는다.
- [ ] 계획 승인 전에 파일 쓰기 turn 또는 worktree를 만들지 않는다.
- [ ] 실행 중 계획 변경은 기존 revision의 실행 기록을 보존한다.

### ORC-002 — DAG scheduler

**우선순위:** P0

**목표:** 의존성과 자원 한도에 따라 준비된 Task를 병렬 실행한다.

Plan 상태는 `draft`, `proposed`, `editing`, `validated`, `frozen`, `confirmed`, `running`, `blocked`, `succeeded`, `failed`, `cancelled`를 사용한다. 확인 전 node는 Plan 문서의 정의일 뿐 실행 Task 상태 `planned`를 만들지 않는다. 수정은 기존 validation/freeze를 무효화하며, `confirmed` 전에는 실행 Task를 dispatch할 수 없다.

확인 후 생성·실행되는 Task 상태는 `queued`, `ready`, `dispatching`, `running`, `needs_input`, `blocked`, `succeeded`, `failed`, `cancelled`만 사용한다.

| Task 상태 | lifecycle 의미 |
| --- | --- |
| `queued` | Plan이 확인되었지만 성공해야 할 dependency가 아직 남음 |
| `ready` | dependency가 모두 성공했고 concurrency slot을 기다리거나 바로 시작 가능 |
| `dispatching` | slot과 lane lease를 확보하고 operation/worktree/Session을 durable하게 예약하는 중 |
| `running` | 연결된 Session turn이 실행 중 |
| `needs_input` | 연결된 Session/Approval이 사용자 입력을 기다림 |
| `blocked` | 선행 실패, 정책 충돌, reconciliation 문제 등으로 자동 진행 불가 |
| `succeeded` | Task 결과 계약과 검증을 통과함 |
| `failed` | 실행 또는 검증이 실패함 |
| `cancelled` | 사용자 또는 Plan 취소로 더 실행하지 않음 |

Worktree 통합은 `worktree.integrated`와 Worktree projection으로 추적한다. Task에 `integrated` 상태를 추가하지 않는다. 통합 자체에 실행·검증 의존성이 있으면 같은 TaskState를 쓰는 명시적 integration Task를 Plan에 넣는다.

요구사항:

1. 모든 dependency가 `succeeded`인 Task만 `ready`가 된다. 통합이 선행 조건이면 integration Task의 `succeeded`에 의존한다.
2. scheduler는 Machine/Project concurrency와 Task priority를 동시에 적용해야 한다.
3. 선행 Task 실패 시 후속 Task는 기본적으로 `blocked`가 되며 사용자 선택 없이 계속 실행하지 않는다.
4. 재시도는 Task attempt ID를 새로 만들고 이전 Session, worktree, 결과를 보존해야 한다.
5. 취소는 실행 중 Task의 turn을 interrupt하고 아직 시작하지 않은 후속 Task를 cancel하되, worktree를 자동 삭제하지 않아야 한다.
6. 결과 계약에는 summary, changed files, verification result, artifacts, source session/turn ID가 포함되어야 한다.
7. planner와 executor를 같은 세션으로 강제하지 않고 목적에 따라 새 thread 또는 fork를 선택할 수 있어야 한다.
8. retry/unblock/cancel 같은 Task mutation은 `expectedTaskRevision`과 `Idempotency-Key`를 검증해야 한다.

인수 기준:

- [ ] 다이아몬드 의존 Plan에서 두 중간 Task는 병렬 실행되고 integration Task는 둘 다 성공한 후 시작한다.
- [ ] 선행 Task 실패 뒤 후속 Task가 실행되지 않는다.
- [ ] daemon 재시작 뒤 running/queued Task가 중복 실행되지 않고 reconcile된다.

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

인수 기준:

- [ ] 두 쓰기 Task가 각자의 worktree 밖 파일을 변경할 수 없다.
- [ ] dirty base opt-in이 없으면 graph 실행이 멈추고 이유를 반환한다.
- [ ] 취소 또는 실패 뒤 미커밋 변경이 있는 worktree가 보존되고 정리 후보로만 표시된다.

### ORC-004 — 검증, 통합, 정리

**우선순위:** P0

**목표:** 산출물을 검증한 뒤 사용자가 통제하는 방식으로 합친다.

요구사항:

1. Task별 검증 명령과 결과(exit code, duration, redacted output, artifact)를 기록해야 한다.
2. 통합 전 changed-file manifest와 base 대비 diff summary를 계산해야 한다.
3. 충돌이 예상되면 자동 merge 전에 integration Task를 만들거나 사용자에게 순서를 요청해야 한다.
4. P0는 기본 브랜치 자동 merge/push를 기본 비활성으로 해야 한다.
5. P0는 사용자가 diff·검증 결과·대상을 확인한 뒤 선택하는 typed `cherry-pick`, `merge`, `patch-export` 통합 mutation을 제공해야 한다. 각 mutation은 대상 `worktreeId`, 검증할 Worktree revision, 대상 ref와 `Idempotency-Key`를 명시하고 generic Git command를 받지 않아야 한다.
6. branch/worktree 삭제는 uncommitted 상태, 미통합 commit, 사용자 생성 파일을 검사하고 잠금 해제된 인증 UI의 명시적 확인을 받아야 한다. 음성은 정리 화면으로 이동하거나 취소할 수 있지만 삭제를 확정할 수 없다.

인수 기준:

- [ ] 검증 실패 Task는 `succeeded`가 되지 않고 후속 통합을 차단한다.
- [ ] default 설정에서 모든 node가 성공해도 main branch가 자동 변경되지 않는다.
- [ ] typed cherry-pick/merge/patch-export는 사용자가 본 Worktree revision과 대상 ref가 일치할 때만 한 번 실행되고 stale revision 또는 같은 key의 다른 payload는 거부된다.
- [ ] 미커밋 파일이 있는 worktree 정리 요청은 경고와 확인 없이 실행되지 않는다.

## 4.8 복구, API, 관찰 가능성

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

인수 기준:

- [ ] event를 중복·역순·재생해도 최종 snapshot이 fixture의 기대값과 일치한다.
- [ ] journal commit 직후 프로세스를 kill해도 Attention Item은 유실되지 않는다.
- [ ] push 전송 도중 kill 후 재시작해도 dedup key 기준 최대 한 번만 사용자에게 표시된다.

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

### API-001 — 로컬·원격 API와 event stream

**우선순위:** P0

**목표:** 클라이언트와 외부 하네스가 좁고 타입 안전한 표면으로 Pawdex를 제어한다.

요구사항:

1. API는 `/api/v1`처럼 명시적 major version을 가져야 한다.
2. read API는 machines, projects, sessions, approvals, attentions, plans/tasks, capabilities, diagnostics를 제공해야 한다.
3. mutation API는 project/session/turn/typed approval/plan/task/worktree 동작별 endpoint 또는 command type을 가져야 한다.
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

인수 기준:

- [ ] 승인 문제를 Approval/turn/correlation ID로 추적할 수 있고 upstream request ID는 adapter 진단 범위 밖으로 노출되지 않는다.
- [ ] fixture secret을 prompt, command env, path에 넣은 뒤 support bundle scanner가 평문 노출을 차단한다.
- [ ] telemetry off 상태에서 제품 분석 endpoint로 outbound 요청이 발생하지 않는다.

### CFG-001 — 정책과 설정 우선순위

**우선순위:** P0

**목표:** 위험·알림·동시성 정책을 예측 가능하게 적용한다.

요구사항:

1. 정책 출처는 `machine default → ProjectPolicy → confirmed Plan/Task constraint → 허용된 Session execution 선택` 순으로 결합해야 한다. 하위 단계는 보안·권한 범위를 임의로 넓힐 수 없고 더 좁은 제한이 우선한다.
2. 최종 effective policy와 각 값의 출처·제약 이유를 조회할 수 있어야 한다.
3. 알림, quiet hours, concurrency, worktree, approval, voice, retention을 독립 설정 영역으로 둔다.
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
| NFR-SCALE-001 | 규모 | 기준 Machine에서 20개 등록 Session, 8개 active turn, 5,000개 보존 event를 기능 저하 없이 처리; 실제 한도는 부하 테스트 후 조정 |
| NFR-REL-001 | 전달 | provider 외부 제약을 제외한 journal-to-outbox Attention 손실 0건 |
| NFR-REL-002 | 복구 | daemon 비정상 종료 후 30초 내 API 준비 및 상태 reconcile 시작 |
| NFR-SEC-001 | 네트워크 | P0 loopback-only listener, outbound E2EE relay, TLS, replay protection, 기기 revoke |
| NFR-SEC-002 | 권한 | least privilege, typed approval, elevated/destructive accept는 잠금 해제된 인증 UI action 필수 |
| NFR-PRV-001 | 개인정보 | raw audio 기본 미보존, prompt/code telemetry 금지, notification payload 최소화 |
| NFR-COMPAT-001 | 계약 | 지원 Codex 버전별 생성 schema·fixture CI 통과 |
| NFR-PORT-001 | 플랫폼 | P0 daemon은 macOS를 기준 지원하고 Linux는 검증 범위를 명시; 모바일은 capability 기반 웹 설치형 클라이언트 |
| NFR-I18N-001 | 언어 | 내부 event code는 언어 중립, 사용자 메시지는 최소 한국어·영어 확장 가능한 message key 사용 |
| NFR-OPS-001 | 업그레이드 | DB/schema migration은 backup, dry-run 또는 rollback 가능한 단계를 제공 |

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

### E2E-006 — DAG 의존성과 실패

Given Task A와 B가 병렬이고 C가 두 Task에 의존할 때, When A는 성공하고 B의 검증이 실패하면, Then C는 `blocked`이며 사용자가 B 재시도 또는 Plan 변경을 선택하기 전 실행되지 않는다.

### E2E-007 — worktree 데이터 보호

Given 실패한 Task worktree에 미커밋 파일이 있을 때, When Plan 정리를 요청하면, Then 삭제 대상과 복구 불가능성을 보여 주고 잠금 해제된 인증 UI의 명시적 승인 전에는 파일을 제거하지 않는다.

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

## 10. 출시 판정

P0는 다음 조건을 모두 충족해야 공개 MVP로 표시할 수 있다.

1. 모든 P0 기능의 인수 기준과 E2E-001~010이 자동 또는 재현 가능한 수동 테스트로 통과한다.
2. threat model 리뷰에서 critical/high 미해결 항목이 없다.
3. raw shell endpoint, generic approval pass-through, 기본 외부 bind가 없음을 검증한다.
4. 지원 Codex 버전과 플랫폼 범위를 문서화하고 contract test가 통과한다.
5. daemon crash, App Server restart, relay disconnect, push retry chaos test가 상태 수렴을 보인다.
6. 모바일 custom sound 제한, cloud STT 여부, relay metadata를 사용자 문서에서 과장 없이 설명한다.
7. UI 디자인은 별도 승인을 받지 않았더라도 기능 테스트용 최소 클라이언트로 검증할 수 있다. 이 최소 클라이언트는 최종 제품 디자인으로 간주하지 않는다.
8. 설치, 제거, 데이터 export, 기기 revoke, worktree 수동 복구 절차가 문서화된다.

## 11. 후속 설계 입력

디자인 단계에는 이 문서의 기능 ID와 상태를 입력으로 전달한다. 디자인은 다음 계약을 변경하지 않고 표현 방법을 결정한다.

- Session, Plan, Task의 차이와 TaskState lifecycle
- `needs_input`, `completed`, `failed`의 우선순위
- Attention의 acknowledged/resolved 상태와 연결된 Approval의 risk/expiry
- typed approval에서 반드시 보여야 할 정보와 명시적 확인
- 음성 대상·전사문·실행 의미 확인
- 알림 capability와 fallback의 정직한 표시
- worktree 결과와 통합 전 검증 상태

기능 계약을 바꿔야 하는 디자인 제안은 해당 기능 ID의 명세 변경과 테스트 갱신을 함께 거친다.

## 12. 참고 자료

- [Pawdex 목표 프로토콜](./PROTOCOL.md)
- [Codex App Server 공식 문서](https://learn.chatgpt.com/ko-KR/docs/app-server)
- [Codex Git worktree 공식 문서](https://learn.chatgpt.com/ko-KR/docs/environments/git-worktrees)
- [Codex Voice 공식 문서](https://learn.chatgpt.com/docs/features/voice)
- [Happy 저장소](https://github.com/slopus/happy)
