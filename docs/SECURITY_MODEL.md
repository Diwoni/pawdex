# Pawdex 보안 모델

> 상태: 원격 기능 구현 전 검토가 필요한 설계 초안
> 최종 수정: 2026-09-12
> 기본 자세: Pawdex는 개발자의 소스 코드, 프롬프트, Codex 출력, 로컬 실행 권한을 다룬다. 따라서 일반 알림 앱이 아니라 **원격 개발 제어면(control plane)** 으로 취급한다.

기능 요구사항의 canonical 보안 ID는 [기능 명세](./FEATURE_SPEC.md)의 `SEC-001`이다. 이 문서의 `T01`~`T38`은 위협 ID, `S1`~`S5`는 출시 보안 Gate이므로 기능 ID와 namespace가 다르다.

## 1. 보안 목표

1. 페어링되지 않은 주체는 세션 메타데이터를 읽거나 명령·승인 응답을 보낼 수 없어야 한다.
2. 릴레이와 푸시 제공자는 프롬프트, 출력, 파일 경로, 승인 내용을 평문으로 알 수 없어야 한다.
3. 하나의 기기·세션·turn 권한이 다른 기기·세션·turn으로 확대되지 않아야 한다.
4. 파괴적 작업과 권한 상승의 수락은 언제나 사람이 잠금 해제된 인증 UI에서 구체적 대상과 영향을 보고 명시적으로 눌러야 한다.
5. 네트워크 재전송·replay·순서 뒤바뀜이 명령의 중복 실행으로 이어지지 않아야 한다.
6. 버그나 침해가 발생해도 사용자의 기존 Git 작업과 비밀을 보존하고 기기/키를 폐기할 수 있어야 한다.
7. 이전 TaskAttempt/Dispatch의 늦은 결과, 위조 heartbeat, stale verification이 현재 실행을 성공·통합·lease 해제로 바꾸지 못해야 한다.
8. 작업 그래프, 출력, 시간, resident process, 디스크, 자원 lease는 명시된 hard cap과 fail-safe 복구 경계 안에 있어야 한다.
9. 실행 결과는 frozen Plan, ExecutionProfile, RunManifest, ContextPackage와 exact Git OID까지 추적 가능해야 한다.

## 2. 비목표와 가정

- 완전히 장악된 로컬 OS, 커널, Codex 바이너리로부터 사용자를 보호하는 것은 보장 범위가 아니다.
- 사용자가 직접 허용한 Codex 작업이 저장소 안에서 만든 논리적 코드 변경의 안전성을 자동 보장하지 않는다.
- 트래픽 크기·접속 시간·IP 등 모든 메타데이터를 릴레이로부터 숨기는 익명 통신 시스템을 목표로 하지 않는다.
- Pawdex는 Codex의 sandbox/approval 체계를 대체하지 않고 더 제한적인 상위 제어 계층을 제공한다.
- 원격 셸은 제품 기능이 아니다. 원격 클라이언트는 승인된 타입 명령만 전송한다.
- Git worktree는 변경 분리와 복구 수단이지 OS/process/network/secret 보안 경계가 아니다.
- Pawdex는 provider 계정 hot-swap, quota 우회, credential 중계를 제공하지 않는다.

## 3. 보호 자산

| 자산 | 민감도 | 손상 시 영향 |
|---|---:|---|
| 저장소 소스·미커밋 변경 | 매우 높음 | 지식재산 유출, 데이터 손실, 공급망 오염 |
| 프롬프트·Codex 출력·질문 | 매우 높음 | 코드/조직 정보 유출, 사회공학 단서 |
| API 키·환경 변수·Git 자격 증명 | 매우 높음 | 외부 계정 및 인프라 침해 |
| 승인 요청과 사용자 결정 | 매우 높음 | 임의 명령 실행, 권한 확대 |
| 기기 identity key·세션 키 | 매우 높음 | 원격 세션 탈취 및 복호화 |
| 세션/프로젝트/브랜치 메타데이터 | 높음 | 개발 활동·제품 로드맵 유출 |
| 음성 원본·전사 텍스트 | 높음 | 생체/대화 개인정보 유출 |
| 푸시 토큰·릴레이 라우팅 ID | 중간~높음 | 추적, 알림 스팸, 기기 연결 추론 |
| 이벤트 저널·진단 로그 | 높음 | 과거 활동·경로·오류 내용 유출 |
| 릴리스 서명 키·업데이트 채널 | 매우 높음 | 전체 설치 기반 공급망 침해 |
| Plan/Task/Checkpoint·실행 budget | 높음 | 무단 실행 확대, 비용·자원 고갈, 사람 gate 우회 |
| TaskAttempt/Dispatch·ResourceLease identity | 매우 높음 | stale 실행의 성공 승격, 이중 자원 소유, 잘못된 프로세스 종료 |
| ExecutionProfile·VerificationTemplate·RunManifest·ContextPackage | 매우 높음 | 실행 입력/권한 변조, provenance 위조, 비밀 전파 |
| Artifact·commit/tree OID·VerificationResult | 매우 높음 | 검증하지 않은 코드 통합, dependency 오염 |
| P1 UsageWindowPreset·UsageWindowRun·usage snapshot/forecast | 높음 | 무단 연속 실행, 비용·quota·기기 자원 고갈, 잘못된 사용률 주장 |

## 4. 주체와 신뢰 경계

### 주체

- **개발자**: 로컬 머신을 소유하고 기기를 페어링하며 승인 결정을 내린다.
- **로컬 Pawdex 데몬**: 세션 상태와 정책의 권위 있는 소스이며 Codex App Server에 연결한다.
- **Codex App Server**: 버전이 변할 수 있는 외부 프로세스 계약이다.
- **관리된 실행 프로세스**: daemon이 spawn identity/process group과 TaskAttempt/Dispatch를 기록해 수명 주기를 관리하는 Codex/검증 자식 프로세스다.
- **로컬 브라우저 클라이언트**: loopback origin에서 설치별 local access token으로 인증한다. 원격 기기 identity나 relay credential을 사용하지 않는다.
- **페어링된 원격 클라이언트**: 모바일/Mac 클라이언트. 기기별 identity key와 capability scope를 가진다.
- **원격 릴레이**: 암호화된 frame을 전달·임시 저장하지만 내용을 신뢰하지 않는다.
- **푸시 제공자**: 기기를 깨우는 최소 payload만 전달하며 내용을 신뢰하지 않는다.
- **STT/TTS 제공자**: 기본은 기기 내 처리. 외부 서비스는 명시적 opt-in인 제3자다.
- **공격자**: 같은 LAN의 프로세스, 악성 웹 페이지, 릴레이 운영자/침해자, 탈취 기기, replay 공격자, 악성 의존성 등을 포함한다.
- **Planner/agent output**: 사용자 의도를 돕는 비신뢰 입력이다. scope, dependency, template, budget, checkpoint를 제안할 수 있지만 정책·권한을 확정하지 않는다.
- **usage/rate-limit snapshot과 forecast**: App Server 관찰값과 로컬 통계로 만든 비신뢰 admission 신호다. 권한, budget, 정확한 token 잔량 또는 결제 한도를 대신하지 않는다.

### 신뢰 경계

```text
[Codex App Server] <-- local IPC/stdio --> [Pawdex daemon + policy + journal]
                                              |
                         loopback + local browser token/origin
                                              |
                                  [local browser client]

[Pawdex daemon] -- outbound E2EE frames --> [untrusted relay] <-- E2EE --> [paired device]
                                                        |
                                                opaque wake only
                                                        |
                                             [untrusted push provider]
```

데몬의 journal만 Session/Plan/Task/TaskAttempt/Dispatch/Lease/Checkpoint 상태와 pending Approval↔upstream request 매핑의 권위 있는 사본을 가진다. runtime stdout/event, Planner 출력, 릴레이·푸시·클라이언트 캐시는 최종 결정권이 없다. daemon도 journal에 commit하기 전에 외부 publish 또는 worker dispatch를 하지 않는다.

## 5. 로컬 우선 기본값

- P0 daemon은 설정·실행 인자와 무관하게 `127.0.0.1`/`::1` 또는 권한이 제한된 로컬 IPC에만 bind한다. LAN/public interface 직접 listener는 만들지 않는다.
- P0 원격 사용은 daemon이 릴레이로 시작하는 **outbound E2EE 연결**만 사용하며 relay가 Machine 방향 inbound socket을 열 수 없다. 직접 LAN mode는 P1 후보로만 남기고 별도 위협 모델·ADR·상호 인증 설계 전에는 구현하지 않는다.
- 원격 기능, 텔레메트리, 외부 STT는 모두 기본 꺼짐이다.
- loopback도 무조건 신뢰하지 않는다. 악성 웹 페이지의 DNS rebinding/CSRF를 막기 위해 다음을 적용한다.
  - 설치 시 생성한 고엔트로피 로컬 bearer secret 또는 OS IPC 자격 증명
  - 정확한 `Origin` allowlist와 Host 검증
  - state-changing 요청의 CSRF 방어 및 제한된 CORS
  - 세션 쿠키를 쓴다면 `HttpOnly`, `SameSite=Strict`, 짧은 수명
- 비밀은 OS keychain을 우선 사용하고, 파일 fallback은 사용자 전용 권한으로 저장한다. 로그·설정 파일에 토큰을 기록하지 않는다.
- raw command string을 받는 범용 셸/터미널 HTTP·WebSocket endpoint를 만들지 않는다.
- 모바일/원격에 raw PTY stream, 실시간 keystroke injection, 임의 terminal command, SSH tunnel/port forwarding을 노출하지 않는다.
- provider credential을 원격으로 내보내거나 계정 전환·quota 우회를 자동화하지 않는다.

### 로컬 브라우저와 원격 기기의 인증 분리

- local access token은 설치 시 만든 고엔트로피 비밀이며 loopback HTTP에서만 유효하다. relay frame이나 원격 기기 인증에 재사용하지 않는다.
- 브라우저가 장기 token을 URL, WebSocket query, `localStorage`, 로그에 보관하지 않게 한다. 로컬 bootstrap 뒤 짧은 수명의 `HttpOnly`/`SameSite=Strict` 세션 또는 1회성 event ticket으로 교환한다.
- 원격 기기는 local access token을 받지 않는다. 기기 identity key, E2EE channel, device scope로 인증하고 daemon이 최종 권한을 검증한다.
- local browser session과 remote device credential은 서로 다른 issuer/audience와 폐기 목록을 사용한다. 한쪽 credential을 다른 endpoint에 보내면 `UNAUTHENTICATED`로 거부한다.
- 어느 인증 경로도 ProjectPolicy, Session/Approval aggregate revision, typed approval, confirmation receipt 검증을 우회하지 않는다.

## 6. 페어링과 기기 인증

### 제안 흐름

1. 사용자가 로컬 데몬에서 “기기 추가”를 명시적으로 시작한다.
2. 데몬이 5분 이내 만료되는 일회용 pairing intent를 만들고 QR/코드를 표시한다. 코드에는 비밀 전체를 장기 저장하지 않는다.
3. 새 기기는 자체 hardware-backed 가능 identity key를 만들고 ephemeral key와 함께 pairing intent를 증명한다.
4. 데몬과 기기는 검증된 표준 handshake 라이브러리로 상호 인증하고, 사람이 두 화면의 짧은 인증 문자열을 비교한다.
5. 데몬은 기기 ID, 공개키, 생성 시각, 권한 scope, 마지막 사용 시각만 기기 목록에 저장한다.
6. 이후 연결은 기기 identity, 짧은 수명의 connection key, 단조 증가 counter로 인증한다.

### 정책

- pairing code는 일회용·짧은 수명이며 시도 횟수와 IP/relay identity rate limit을 가진다.
- 기기별 권한은 최소 `view`, `send_input`, `respond_safe`, `respond_elevated`로 분리하고, 중단 등 제어 capability가 필요하면 별도 scope로 둔다.
- P0 기본 모바일 기기에는 `respond_elevated`를 자동 부여하지 않는다. 이 scope가 있더라도 잠금 해제된 인증 UI의 단일 승인용 confirmation receipt 없이는 elevated/destructive `accept`를 처리하지 않는다.
- P1 `usage_window.start`는 `send_input`/`control`에서 파생되지 않는 별도 capability이며 기본 모바일 기기에 부여하지 않는다. local unlocked UI 또는 이 capability가 있는 paired device의 foreground unlocked authenticated UI만 fresh user-presence receipt를 발급할 수 있고, daemon은 매번 device revocation 상태를 다시 검사한다.
- 기기 폐기는 즉시 새 연결을 막고 해당 기기의 queued frame과 push token을 제거한다.
- 마지막 관리자 기기 폐기, 전체 키 초기화, 새 recovery material 발급은 로컬 확인이 필요하다.
- 생체 인증은 OS가 제공할 때 민감 승인 화면 진입에 사용하되, 암호 프로토콜의 대체물로 보지 않는다.

## 7. 원격 릴레이와 E2EE

### 원칙

- 암호 프로토콜을 직접 설계·구현하지 않는다. 보안 리뷰를 받은 표준 handshake/ratchet 구현을 선택하고 버전을 고정한다.
- “zero-knowledge”라는 표현은 **콘텐츠 기밀성**에만 사용한다. 릴레이는 계정/라우팅 ID, IP, 시간, frame 크기 같은 메타데이터를 볼 수 있음을 개인정보 문서에 밝힌다.
- 릴레이는 인증된 암호문 frame의 라우팅, 제한된 TTL 큐, ACK 전달만 수행한다. 명령 해석·권한 판단·복호화를 하지 않는다.

### 암호 envelope 요구사항

모든 E2EE frame은 암호문 밖에 최소 라우팅 정보만 두고, 다음 값은 AEAD associated data 또는 암호문에 결합한다.

- 프로토콜 버전과 message type
- daemon/device identity 및 key ID
- connection/session ID
- E2EE transport의 단조 증가 counter(daemon event `sequence`와 별개)
- 고유 idempotency key
- 생성·만료 시각
- ciphertext와 인증 tag

권장 원시 요소는 검토 시점의 감사된 라이브러리가 제공하는 X25519/Ed25519, HKDF, ChaCha20-Poly1305 또는 동급 구성이다. 구체적 조합은 별도 ADR과 외부 검토 없이 확정하지 않는다.

### 키 수명주기

- 기기 identity key는 기기별로 생성하고 export 불가 secure storage를 우선 사용한다.
- 연결 키는 ephemeral DH로 만들고 재접속·시간/메시지 수 기준으로 회전한다.
- 여러 기기에 하나의 장기 대칭키를 공유하지 않는다. 각 기기에 별도 암호화해 단일 기기 revoke가 가능해야 한다.
- 이전 키는 제한된 grace window 후 파기하고, key ID/counter rollback을 거부한다.
- 복구는 새 페어링을 기본으로 한다. 복구 코드가 필요하다면 오프라인 보관, 1회 사용, 회전 가능해야 한다.
- 백업에 개인키를 포함하지 않는 것을 기본으로 하며, 포함 옵션은 별도 암호와 명시적 경고가 필요하다.

### 푸시 개인정보

- APNs/FCM/Web Push payload에는 프롬프트, 출력, 저장소명, 브랜치, 파일 경로, 승인 종류를 넣지 않는다.
- application payload는 추측 불가능하고 짧게 만료되는 단일 opaque wake token과 provider가 요구하는 최소 전송 필드만 담는다. `attentionId`, `sessionId`/alias, 상태/kind, preview, deep link 대상은 넣지 않는다.
- 앱이 깨어난 뒤 E2EE 채널에서 최신 상태를 가져온다.
- 잠금 화면 문구가 필요하면 앱이 인증된 E2EE fetch 뒤 로컬에서 일반 문구를 생성한다. push provider payload에서 사용자별 문구나 상세 내용을 전달하지 않는다.
- push token은 기기 ID와 분리해 암호화 저장하고 기기 폐기/로그아웃 시 삭제한다.

## 8. 명령·질문·승인 모델

### 허용되는 타입 경로

- `register_project(local_root, policy, idempotency_key)` — 로컬 UI 전용
- `start_session(project_id, expected_project_revision, task, idempotency_key)`
- `send_prompt(session_id, expected_session_revision, text, idempotency_key)`
- `steer_turn(session_id, expected_session_revision, expected_turn_id, text, idempotency_key)`
- `interrupt_turn(session_id, expected_session_revision, expected_turn_id, idempotency_key)`
- `confirm_plan(plan_id, expected_plan_revision, task_ids, idempotency_key)`
- `decide_checkpoint(checkpoint_id, expected_checkpoint_revision, decision, evidence_digest, confirmation_receipt?, idempotency_key)`
- `integrate_attempt(attempt_id, expected_attempt_revision, expected_source_commit_oid, expected_source_tree_oid, target_ref, expected_target_head_oid, strategy, confirmation_receipt, idempotency_key)`
- `answer_user_input(approval_id, expected_approval_revision, structured_answers, idempotency_key)`
- `respond_command_approval(approval_id, expected_approval_revision, accept|decline|cancel, confirmation_receipt?, idempotency_key)`
- `respond_file_approval(approval_id, expected_approval_revision, accept|decline|cancel, confirmation_receipt?, idempotency_key)`
- P1 `start_usage_window_run(preset_id, expected_preset_revision, expected_preset_digest, expected_revision_bindings, eligible_set_digest, rate_limit_snapshot_id, rate_limit_snapshot_digest, preview_id, preview_digest, user_presence_receipt, idempotency_key)`
- P1 `cancel_usage_window_run(run_id, expected_run_revision, idempotency_key)` — 새 admission만 중단하며 active Attempt interrupt는 별도 명령

실제 이름은 프로토콜 명세가 정하지만 다음 원칙은 바뀌지 않는다.

- 임의 메서드명/임의 JSON `result`/raw shell string을 원격에서 받지 않는다.
- `VerificationTemplate`의 등록·수정·폐기는 local-admin UI 전용이다. Planner와 원격 기기는 allowlisted template ID/revision과 schema가 허용한 typed parameter만 고를 수 있고 executable, argv fragment, cwd, environment 이름/값 또는 선택된 ExecutionProfile의 network/sandbox policy를 만들거나 바꾸지 못한다.
- P1 `UsageWindowPreset` 생성·교체·폐기와 eligible Queue/Task selector, `controlQueueId`, single-provider bucket 구성은 local-admin UI 전용이며 immutable revision/digest를 사용한다. start는 preset을 수정하는 shortcut이 아니고 fresh snapshot, exact provider/account/window identity, Project/Queue/Plan/Task/QueueEntry revision binding과 sealed eligible-set digest에 결합된 잠금 해제 인증 receipt를 요구한다. 원격 payload의 Queue/Task/scope/concurrency/budget/provider override는 schema에서 거부한다.
- P1 runner start receipt는 local unlocked UI 또는 explicit `usage_window.start` capability가 있고 revoke되지 않은 paired device의 foreground unlocked authenticated UI만 fresh user-presence proof로 발급할 수 있다. 음성, TTS, notification/push quick action, deep link 자동 실행은 start나 receipt 발급을 할 수 없다.
- 모든 공개 mutation은 대상 mutable aggregate(Project, Session, Plan, Task, Worktree, Queue, Device, NotificationPolicy, Approval, Attention, Checkpoint, P1 UsageWindowPreset, P1 UsageWindowRun)의 대응 `expected...Revision`을 검증하고 별도의 `Idempotency-Key`를 요구한다. 새 Session/Plan/UsageWindowPreset은 정책을 소비하므로 `expectedProjectRevision`을 요구하고, steer/interrupt는 `expectedTurnId`도 검증한다. Device push-subscription create/delete/revoke도 `expectedDeviceRevision`과 `Idempotency-Key` 없이는 실행하지 않는다. TaskAttempt·Dispatch·Lease·NotificationDelivery는 daemon 내부 전이만 허용하고 내부 operation/revision을 검증하며, finalized Artifact·VerificationResult·RunManifest·ContextPackage는 immutable로 취급한다.
- Checkpoint Decision은 frozen manifest/evidence digest와 allowed decision에 결합하고, destructive/elevated 의미가 있으면 Plan confirm이나 일반 Decision으로 대체하지 않고 별도 confirmation receipt를 요구한다.
- 통합은 producer의 expected source commit/tree OID와 target의 expected head OID를 모두 비교하는 typed CAS operation만 허용한다. symbolic branch name이나 검증 시점 이후 움직인 현재 HEAD를 추측해 사용하지 않는다.
- daemon database 전역 `sequence`는 event ordering/resume cursor일 뿐 권한 또는 optimistic concurrency token으로 사용하지 않는다.
- 클라이언트에는 Pawdex Approval ID만 노출하고 upstream App Server request ID는 adapter 안에 보존한다. 데몬은 Approval이 현재 pending이고 타입·세션·turn·revision·요청 주체 scope가 일치할 때만 upstream 응답을 전달한다.
- 만료·이미 처리·취소된 요청은 성공처럼 보이지 않게 명시적으로 거부한다.

### 승인 안전 정책

- 명령 승인에는 명령 요약, cwd, sandbox/권한 변화, 영향 파일 또는 위험 등급을 표시한다.
- 파일 승인에는 canonical path, 작업 종류, 저장소/worktree 경계를 표시한다.
- 파괴적·권한 상승·network·Project/worktree root 밖 접근의 수락은 ProjectPolicy exact allowlist와 `respond_elevated` scope를 먼저 만족한 경우에만 매번 잠금 해제된 인증 UI에서 확인하며 “항상 허용”으로 승격하지 않는다. P0 managed worktree 밖 쓰기는 confirmation receipt가 있어도 거절하고, out-of-root는 allowlisted read-only turn scope만 허용한다.
- UI는 Approval ID, revision, actor/device, decision과 영향 payload digest에 묶인 짧은 수명·1회성 confirmation receipt를 발급하고 daemon이 제출 시 검증한다.
- 음성은 승인 화면으로 이동하거나 `decline`/`cancel`만 제출할 수 있다. 음성 발화, TTS read-back, 알림 quick action은 위험도와 무관하게 어떤 Approval `accept`도 제출하거나 confirmation receipt를 발급할 수 없다.
- 현재 기술 spike에 범용 `result` 응답 endpoint가 있다면 공개/원격 기능 전에 제거하고 타입 endpoint로 교체해야 한다. 이는 릴리스 차단 조건이다.

## 9. 음성 개인정보와 안전

- 기기 내 STT/TTS를 기본으로 하고, 원본 오디오는 처리 직후 폐기한다.
- 클라우드 STT는 제공자, 전송 데이터, 보존 정책, 비용을 보여 준 뒤 작업별 또는 기기별 opt-in을 받는다.
- 전사 텍스트는 일반 프롬프트와 동일한 민감도로 E2EE 전송하며 진단 로그에서 제거한다.
- 인식 confidence가 낮거나 세션 대상이 모호하면 자동 전송하지 않고 텍스트 미리보기를 요구한다.
- 음성 승인 의도는 화면 이동과 `decline`/`cancel`만 허용한다. 어떤 Approval `accept`도 여러 번 확인해도 음성 경로로 실행하지 않으며, “중단” 같은 다른 mutation도 대상과 최신 revision을 확인한다.
- 냐옹 소리와 TTS는 로컬 asset/OS voice를 우선 사용하고, 민감한 세션 내용을 잠금 화면에서 읽지 않는다.

## 10. worktree·파일 시스템 안전

- Project root는 사용자가 로컬 UI에서 `PROJ-001`로 등록한 allowlist에 있어야 하며 모든 경로는 접근 전에 canonicalize한다. 원격 클라이언트는 새 절대 경로나 `cwd`를 등록·변경할 수 없다.
- symlink를 따라 허용 root 밖으로 벗어나는 접근, `..` traversal, device path, 제어 문자가 있는 브랜치/작업 이름을 거부한다.
- 쓰기 세션은 기본적으로 별도 worktree와 `codex/` 접두사 브랜치를 사용한다.
- worktree 생성 시 symbolic ref뿐 아니라 exact base commit/tree OID를 고정하고 Attach 시 다시 확인한다.
- worktree 생성/삭제/정리는 argv 배열 또는 안전한 라이브러리 호출로 수행하고 셸 문자열 보간을 쓰지 않는다.
- 미커밋 변경, untracked 파일, 진행 중 rebase/merge가 있으면 자동 정리하지 않는다. 상태와 복구 명령을 보여 주고 명시적 확인을 받는다.
- worktree quota, 저장 공간 하한, 최대 동시 세션을 적용해 디스크 고갈을 막는다.
- 데몬의 OS 권한은 등록된 프로젝트와 필요한 설정 디렉터리에 한정한다. Codex sandbox를 완화하는 요청은 별도 elevated approval 대상이다.
- Git 자격 증명과 SSH agent socket을 모든 세션에 자동 전달하지 않는다. 필요한 작업에서만 기존 사용자 정책을 따른다.
- `.env`, credential file, cloud config, SSH key/agent socket, keychain material을 worktree, Artifact, ContextPackage에 copy 또는 symlink하지 않는다. 필요한 secret은 명시적 ProjectPolicy와 최소 scope로 process launch 순간에만 주입하고 값·hash·reference를 journal/manifest에 남기지 않는다.
- `--dangerously-bypass-approvals-and-sandbox`와 동급 full-autonomy/permission-bypass 플래그를 ExecutionProfile과 process argv에서 금지한다. worktree가 있다는 이유로 sandbox, approval, network policy를 완화하지 않는다.
- frozen Task의 declared write scope 밖 변경을 발견하면 실행을 block하고 변경을 보존한다. scope 확대는 새 Plan revision의 재검증·freeze·사용자 confirm 없이는 허용하지 않는다.
- VerificationTemplate은 local-admin이 ProjectPolicy에 등록한 immutable ID/revision만 실행한다. canonical executable ID, typed argv slot, reserved worktree/read-only cwd, `inherit=false` clean env와 환경 변수/secret-reference ID allowlist, 최대 timeout을 daemon이 재검증하고 output/network/sandbox 상한은 RunBudget과 ExecutionProfile에서 적용한다. Planner/remote가 raw argv·cwd·env/profile을 덮어쓰는 경로는 두지 않는다.
- VerificationResult는 user index를 건드리지 않는 isolated temporary index로 tracked 파일과 scope 안의 non-ignored untracked 파일을 snapshot해 계산한 exact source tree OID와 template hash에 결합한다. ignored/secret path를 snapshot하거나 검증 범위라고 표시하지 않는다. 입력 파일이 바뀌면 stale이며, integration은 expected source commit/tree와 target head OID가 모두 일치할 때만 진행한다.

### 오케스트레이션 실행 안전

- TaskAttempt마다 새 Dispatch ID를 발급하고 runtime event, heartbeat, completion, Artifact, VerificationResult, lease release에 둘을 함께 요구한다. 현재 Task의 active pair와 다른 late result는 상태를 바꾸지 못한다.
- upstream ID acquisition 중 먼저 온 event는 schema 검증 후 operation별 bounded buffer에만 보관한다. 응답으로 매핑을 확정한 뒤 journal transaction에서 reduce하며 overflow/timeout은 drop이나 성공 추정 대신 `outcome_unknown`/reconciliation Attention으로 fail-safe한다. 알 수 없는 notification은 격리하고 상태를 바꾸지 않으며, 알 수 없는 server request는 fail-closed 응답과 reconcile을 요구한다.
- 상태 전이, event, Attention, notification outbox, dispatch intent를 먼저 한 transaction으로 journal에 commit하고 그 다음 publish/worker start를 수행한다.
- typed Artifact/commit DependencyBinding은 producer attempt/dispatch, content hash와 commit/tree OID를 검증한 뒤 최소 ContextPackage로 전달한다. fan-in 충돌은 자동 해결·부분 적용하지 않고 block한다.
- ResourceClaim은 canonical resource identity에 대해 `shared|exclusive`로 선언하고 `(resource kind rank, canonical key UTF-8 bytes, claim ID)` 전역 순서로 원자 취득한다. Lease는 owner attempt/dispatch, generation, TTL/heartbeat를 가지며 만료만으로 소유권을 넘기지 않고 managed process/worktree reconcile 뒤 회수한다.
- RunBudget은 task count, DAG depth, attempt/dispatch, wall time, active/resident process, output/artifact bytes, disk bytes를 hard cap한다. provider token/cost는 source와 freshness가 신뢰 가능한 경우에만 hard cap에 쓰고 아니면 `unknown`으로 둔다. exhaustion은 새 dispatch를 막고 해당 Plan/Task Attention을 만든다.
- stall 판정은 열린 Approval/Checkpoint/input wait를 제외하고 canonical progress와 managed child identity를 사용한다. 정책상 자동 종료가 허용돼도 daemon이 spawn한 process group과 검증된 descendants만 중단하며 호스트의 임의 PID, 사용자가 연 terminal, 다른 agent 프로세스는 건드리지 않는다.
- Checkpoint/Decision Gate는 durable typed aggregate다. allowed decision, evidence digest, actor/device, revision, idempotency를 검증하고, elevated/destructive 결정은 별도의 잠금 해제 confirmation receipt 없이는 통과시키지 않는다.
- ExecutionProfile, RunManifest, ContextPackage는 content-addressed immutable provenance다. secret 값, provider credential, raw environment dump, 전체 대화는 포함하지 않는다.

P1 `SES-004`, `ORC-005`, `ORC-006`, `REV-001`, `OBS-002`는 P0 출시 조건이 아니다. 착수 시 각각 hibernation 중 unsettled dispatch/approval/checkpoint 차단과 warm/cold identity 검증, 비교 candidate의 동일 spec/base 및 수동 winner 선택·loser 보존, usage-window admission 안전, path/base/head/side/line/content-hash review anchor의 stale 처리, usage source/freshness/unknown 표시와 account hot-swap 금지를 추가 위협 조건으로 적용한다.

#### P1 ORC-006 Usage Window Runner 보안 경계

`ORC-006`도 P0 출시 조건이 아니다. runner는 quota를 “소진”하는 자동 agent가 아니라 이미 확정된 Task에 대한 보수적 admission loop다.

- Codex rate-limit 수집·정규화는 `apps/daemon/src/codex`의 versioned adapter와 negotiated capability 뒤에서만 수행한다. 공식 App Server의 `usedPercent`, `windowDurationMins`, `resetsAt`와 관찰 시각·valid-until·bucket/window identity·install-local redacted account binding을 immutable `RateLimitSnapshotRef`로 만든다. raw account ID는 저장·전송하지 않는다. missing/out-of-range/unknown-version, freshness 초과 또는 legacy/multi-bucket identity 불일치는 fail-closed한다.
- `usedPercent`는 현재 window의 비율이고 exact remaining token count가 아니다. `account/usage/read`의 lifetime/daily token activity도 남은 window를 뜻하지 않는다. local history는 account의 다른 사용과 동시 Attempt 영향을 분리할 수 없는 추정치다. UI/API는 `(taskId, providerAdapterId, bucketId)` identity와 `used_percent_points` 단위 `min|likely|max`, sample count, source, freshness, confidence를 함께 보여 주고 bounded fresh `max`가 없으면 launch하지 않는다. “100% 사용”, “token 0”, “완전 소진 보장”이라고 표현하지 않는다.
- local-admin immutable preset revision은 비어 있지 않고 중복 없는 Queue ID 목록과 그중 정확히 하나인 `controlQueueId`, confirmed Plan의 frozen Task selector, 하나의 `providerAdapterId`에만 속하는 비어 있지 않고 중복 없는 bucket target, bucket별 `targetUsedPercent` band, `0 ≤ reserveFloorPercent < 100`, 양의 `maxSnapshotAgeMs`/`stopLaunchingBeforeResetMs`/concurrency/failure threshold, 기존 RunBudget을 그대로 존중하는 cost stop policy만 담는다. target upper bound는 `100 - reserveFloorPercent`보다 클 수 없고 preset은 ProjectPolicy나 RunBudget을 넓히지 못한다. `maxSnapshotAgeMs`는 provider capability hard ceiling을 완화할 수 없으며 여러 provider는 별도 preset/Run으로 분리한다.
- start는 local unlocked UI 또는 explicit `usage_window.start` capability가 있는 revocation-checked paired device의 foreground unlocked UI에서 fresh user-presence receipt로만 허용한다. receipt는 actor device, preset revision/digest, rate-limit snapshot ID/digest, expected Project/Queue/Plan/Task/QueueEntry binding digest, eligible-set digest, candidate/forecast/cost-risk preview ID/digest, expiry, nonce에 결합한다. paired device는 exact preset ID/revision을 선택할 수 있을 뿐 Queue, Task, scope, concurrency, budget, provider를 추가·교체하지 못한다.
- start 시 exact Project/Queue/Plan/Task/QueueEntry revision, Queue admission policy digest, Task definition digest와 Plan frozen hash를 `startRevisionBindings`에 봉인하고 같은 값으로 `currentRevisionBindings`를 만든다. Project policy digest는 별도 immutable start field로 저장한다. exact preset revision의 policy를 immutable `effectivePresetPolicy`로 Run에 복제하므로 이후 preset 수정·retire가 active Run의 control Queue나 admission 한도를 바꾸지 못한다. actor device ID와 one-time receipt digest만 보존하고 원 receipt는 재사용 가능한 형태로 저장하지 않는다. `(run, task)`와 `(run, queue entry)` uniqueness를 적용하고 active/succeeded/duplicate Task를 제외한다. prompt, tool output, Planner 또는 Task가 membership을 추가하거나 filler, clone, retry, unblock을 만들 수 없다.
- sealed membership 안에서도 기존 Queue priority/order를 보존하며 모든 관련 bucket의 `current usedPercent + forecast.max`, `reserveFloorPercent`와 현재 reset buffer를 통과한 Task만 admission한다. bounded fresh `max`가 없는 Task를 작은 합성 prompt로 바꾸거나 다른 Task로 대체하지 않는다.
- 매 admission 직전 snapshot이 provider-authoritative/fresh이고 effective max age 안이며 preset의 단일 provider, 시작 `redactedAccountId`, bucket set, `windowDurationMins`/`resetsAt` identity와 일치하는지 다시 검증한다. `startRevisionBindings`는 감사용으로 바꾸지 않고 admission은 `currentRevisionBindings`의 Project/Queue/Plan/Task/QueueEntry revision 전체를 CAS한다. 같은 Run의 lifecycle transition은 current cursor를 같은 transaction에서 올리고, 외부 revision 전진은 policy/definition/frozen/membership identity와 eligibility가 그대로일 때만 별도 journal transaction으로 수용한다. identity가 달라지거나 귀속이 불명확하면 새 launch를 막는다. account/window identity가 검사 뒤 worker start 전에 바뀌면 Dispatch를 시작하지 않고 journal에서 취소·lease release한다.
- daemon restart 뒤 persisted Run revision, sealed members, current TaskAttempt/Dispatch/process/lease와 fresh provider snapshot을 reconcile하기 전에는 Run을 재개하거나 새 launch를 하지 않는다.
- every-attempt lifecycle 및 rate-limit update마다 stable source event ID로 forecast한다. target/reserve, empty sealed queue, account/bucket/window/reset change, stale/unknown/max-age 초과, deadline buffer, Approval/Checkpoint/dependency/resource/scope blocker, failure threshold, cancel, RunBudget/cost risk 중 하나라도 발생하면 새 launch를 멈춘다. valid start는 `running` aggregate를 원자 생성하고, `user_cancelled`만 `cancelled`, `reconciliation_required`만 `failed`, 나머지 stop reason은 `stopped`로 reduce한다. terminal state/reason과 `effectivePresetPolicy.controlQueueId` target·UsageWindowRun source의 `usage_window_run_stopped` Attention은 journal-first transaction으로 정확히 한 번 기록하며 terminal Run은 재개하지 않는다.
- runner concurrency는 기존 global/Machine/Project/ResourceLease보다 좁은 추가 cap이다. 모든 Attempt는 기존 RunBudget, Approval, Checkpoint, sandbox, verification, scope/OID 정책을 그대로 거치며 runner가 lease를 선점하거나 blocker를 자동 해결하지 않는다.
- cancel은 새 admission만 멈추고 active Attempt를 죽이지 않는다. earned rate-limit reset credit consume, credit 구매/overage, 결제 동의, account login/logout/hot-swap, credential export는 runner capability와 호출 graph에서 제거한다.
- stop Attention의 push provider payload에도 기존 opaque wake token 규칙을 적용하고 preset, 사용률, reset 시각, Queue/Task identity를 넣지 않는다.

## 11. 이벤트 저널·로그·redaction

### 기본 저장

- 상태 복구에 필요한 식별자, daemon database 범위의 event `sequence`, aggregate revision, 상태 전이, 타임스탬프, 오류 코드만 기본 저장한다. event `sequence`는 ordering/cursor 전용이며 mutation 충돌 검증에 사용하지 않는다.
- 전체 프롬프트, 모델 출력, 명령 stdout/stderr, 환경 변수, 파일 내용, 음성 원본은 기본 저널 대상이 아니다.
- 이벤트 payload는 allowlist 기반 구조화 필드만 로그하고, 알 수 없는 객체를 통째로 stringify하지 않는다.
- 토큰, Authorization header, URL credential, 일반적인 비밀 패턴을 sink 직전 다시 redaction한다.
- state/event/Attention/outbox를 commit한 뒤에만 외부 publish한다. acquisition buffer 원문은 일반 로그로 복사하지 않고 schema가 허용한 메서드·size·hash와 reconcile 결과만 진단한다.
- RunManifest/ContextPackage에는 ID, revision, policy/content hash, Git OID와 redacted summary만 저장하며 환경 변수 값·credential reference·전체 대화는 제외한다.
- P1 usage history에는 coarse task class, profile/model, Attempt duration, snapshot delta와 불확실성만 로컬 보존한다. snapshot의 install-local redacted account binding 외 raw account/email/workspace ID, prompt, 파일명, credential, reset-credit detail은 feature·로그·telemetry에 넣지 않는다. snapshot/forecast retention과 삭제는 별도 P1 정책으로 제한한다.

### 접근·보존

- 로컬 DB/로그는 사용자 전용 권한으로 생성하고 OS 암호화 저장소를 활용한다.
- 보존 기간과 최대 용량을 정하고 만료 데이터는 안전하게 삭제한다.
- debug mode는 명시적 opt-in, 시간 제한, 화면 경고가 있어야 하며 export 전에 redaction preview를 제공한다.
- 릴레이 로그는 콘텐츠·push token·IP의 불필요한 결합을 피하고 짧은 TTL을 적용한다.
- crash report와 텔레메트리는 opt-in이며 session/task text 대신 난수 상관 ID를 사용한다.

## 12. 위협과 완화책

| ID | 위협/공격 | 영향 | 필수 완화·검증 |
|---|---|---|---|
| `T01` | 데몬이 LAN/public interface에 노출 | 임의 읽기·명령 | P0 non-loopback bind 코드/설정 금지, outbound relay만 허용, 모든 인자 조합 시작 테스트 |
| `T02` | DNS rebinding/CSRF로 로컬 API 호출 | 브라우저를 통한 세션 탈취 | Origin/Host allowlist, local token/CSRF, 제한 CORS, event ticket, negative test |
| `T03` | 페어링 코드 탈취·brute force | 악성 기기 등록 | 짧은 TTL, 1회 사용, rate limit, 양쪽 short-auth 비교 |
| `T04` | 기기 분실·토큰 유출 | 지속 원격 접근 | 기기별 키/권한, 즉시 revoke, 연결 키 회전 |
| `T05` | 악성/침해 릴레이가 내용 열람 | 소스·프롬프트 유출 | E2EE, relay log 검사, 패킷에서 평문 부재 검증 |
| `T06` | frame replay·중복 delivery | 명령/승인 중복 실행 | transport counter, nonce, 만료, aggregate revision, idempotency store, replay test |
| `T07` | 세션/turn/Approval ID 바꿔치기 | confused deputy, 잘못된 승인 | 모든 ID·revision 암호 결합, pending 타입 검사, 교차 주입 테스트 |
| `T08` | 임의 JSON, raw shell 또는 악성 verification template 주입 | 원격 코드 실행 확대 | 타입 endpoint, local-admin-only immutable template, typed argv/cwd/env policy, raw shell API 금지, fuzz |
| `T09` | 음성 오인식/재생 공격 | 엉뚱한 작업·승인 | 전송 전 preview, confidence threshold, 음성은 승인 화면 이동·decline/cancel만 허용 |
| `T10` | path traversal/symlink escape | 저장소 밖 읽기·쓰기 | canonical allowlist, symlink 검사, malicious path test |
| `T11` | worktree 자동 정리로 변경 손실 | 사용자 데이터 손실 | dirty-state gate, 명시적 확인, 복구 테스트 |
| `T12` | 알림/푸시에 민감 내용 노출 | 잠금 화면·provider 유출 | opaque wake token만 push, E2EE fetch 뒤 로컬 표시, payload privacy test |
| `T13` | 알림·명령 flood | 방해, 비용, 자원 고갈 | device/session quota, rate limit, dedupe, backpressure |
| `T14` | Codex 스키마 drift/악성 frame | 잘못된 상태·승인 처리 | 버전 pin/capability, generated schema, unknown quarantine |
| `T15` | 로그·crash report 비밀 유출 | 장기 정보 노출 | allowlist logging, sink redaction, fixture secret scan |
| `T16` | 악성/탈취 의존성 | 빌드·런타임 침해 | lockfile, provenance, SBOM, 최소 deps, 정기 audit |
| `T17` | 업데이트 채널/서명 키 침해 | 전체 사용자 공급망 공격 | 서명, 보호된 release 권한, key rotation, rollback |
| `T18` | XSS로 로컬 토큰 탈취 | 세션 제어 | 엄격 CSP, HTML sanitization, token 비노출, E2E XSS test |
| `T19` | 오래된 오프라인 승인 재전송 | 취소된 위험 작업 실행 | 짧은 만료, pending 확인, expected Approval revision/turn, 1회성 receipt, stale UI 표시 |
| `T20` | 다중 기기 공유키로 revoke 실패 | 폐기 기기의 지속 복호화 | 기기별 envelope/key, rekey, revoked-key negative test |
| `T21` | local browser token과 remote device credential 혼용 | 인증 경계 우회·원격 권한 확대 | issuer/audience·endpoint 분리, local token relay 금지, 교차 credential negative test |
| `T22` | 이전 TaskAttempt/Dispatch의 늦은 완료·heartbeat | 실패한 실행의 성공 승격, 잘못된 lease 해제 | attempt+dispatch fence, active pair CAS, stale-result replay test |
| `T23` | dependency Artifact/commit 변조 또는 fan-in 충돌 | consumer 오염, 변경 유실 | immutable binding, content hash+commit/tree OID, typed materializer, conflict block |
| `T24` | ResourceClaim 순환·이중 lease·TTL 오판 | deadlock, 동시 외부 변경 | canonical order, atomic acquire, owner/generation, heartbeat, reconcile-before-reuse |
| `T25` | 과대 DAG·재시도·출력·resident process·stall | 비용/디스크/가용성 고갈 | RunBudget hard cap, admission 차단, exhaustion Attention, managed-process-only termination |
| `T26` | agent가 declared scope 밖 파일 변경 | 의도하지 않은 코드/비밀 수정 | canonical diff guard, 즉시 block, 변경 보존, Plan re-freeze/reconfirm |
| `T27` | 검증 뒤 source/target OID 변경 | 검증하지 않은 코드 통합, TOCTOU | VerificationResult exact tree OID, source/target OID CAS, stale invalidation |
| `T28` | acquisition event flood·unknown frame | 메모리 고갈, 잘못된 aggregate 상태 | bounded buffer, schema validation, overflow fail-safe, outcome reconciliation |
| `T29` | worktree를 sandbox로 오인해 full-autonomy 실행 | host/네트워크/secret 권한 확대 | bypass flag denylist+argv test, Codex sandbox/approval 유지, 최소 OS 권한 |
| `T30` | `.env`·credential·SSH agent가 worktree/context로 전파 | 외부 계정 침해, 장기 비밀 유출 | copy/symlink 금지, env-name allowlist, launch-time 최소 주입, secret fixture scan |
| `T31` | P1 hibernation이 unsettled 실행을 분리하거나 다른 thread로 복원 | 중복 실행, 승인/결과 오귀속 | blocker 검사, attachment state 분리, manifest/thread identity 검증, warm/cold 표시 |
| `T32` | P1 비교 실행 후보의 base/spec 혼동 또는 loser 자동 삭제 | 잘못된 winner 통합, 증거 손실 | 동일 frozen spec/base 증명, candidate budget, 수동 winner, loser 보존 gate |
| `T33` | P1 line review anchor가 stale diff의 다른 줄에 적용 | 잘못된 수정 지시 | path/base/head/side/line/content hash, stale 차단, immutable batch, one-turn binding |
| `T34` | P1 usage 값 위조·stale 또는 account hot-swap | 잘못된 admission, quota 우회·credential 노출 | source/freshness/unknown, reliable-only cap, credential 비저장, account-switch 기능 금지 |
| `T35` | P1 runner start/dispatch에 forged 또는 stale RateLimitSnapshotRef·device receipt 재사용 | 잘못된 account/window에서 무단 연속 실행 | adapter-produced journaled snapshot identity/hash, provider/account binding, freshness/max-age, `usage_window.start`+revocation check, preset/snapshot/revision-bound user-presence receipt, rolling binding CAS |
| `T36` | prompt/agent가 runner queue를 늘리거나 filler·duplicate·retry를 생성 | 의도 밖 작업·quota 소비 | start/current binding과 eligible set 봉인, immutable effective policy/control Queue, confirmed/frozen membership, unique run/task+entry, Planner/create/retry capability 없음 |
| `T37` | forecast 오차·cost 미계측으로 runaway spend | 과금·quota·로컬 자원 고갈 | 검증된 reserve 범위, 보수적 interval, existing RunBudget/cost policy, failure cap, unknown/cost-risk stop |
| `T38` | snapshot 검사와 launch 사이 account/reset boundary race | 다른 account·새 window quota를 의도치 않게 소비 | single-provider preset, exact redacted account/bucket/window/`resetsAt` CAS, stop-launch buffer, pre-worker recheck, reserved Dispatch 취소·lease 반환 |

## 13. 최소 권한과 권한 등급

| 등급 | 예 | 원격 처리 |
|---|---|---|
| 관찰 | 상태/요약 읽기 | `view` scope, E2EE |
| 일반 입력 | 새 프롬프트, 현재 turn steer | `send_input`, aggregate revision·대상 확인 |
| 제어 | interrupt, 새 세션 시작 | 별도 scope, aggregate revision, idempotency |
| 질문 응답 | Codex structured user input | `respond_safe`, Approval 타입·revision·만료 검증 |
| 안전 승인 | sandbox 안의 제한된 승인 | `respond_safe`, 명시적 UI, 정책에 허용된 경우만 |
| P1 usage-window 시작 | immutable preset의 sealed Task 연속 admission | 별도 `usage_window.start` capability + revocation check + fresh snapshot/revision + unlocked user-presence receipt; voice/quick action 금지 |
| 권한 상승/파괴 수락 | sandbox 완화, Project 밖, 삭제 | `respond_elevated` + 잠금 해제 인증 UI + 1회성 receipt; 음성/quick action 금지 |

“관리자 기기”라는 단일 전권 토큰보다 capability별 scope를 사용한다. 로컬 브라우저 인증도 effective Project/Session 정책과 typed approval을 따라야 한다. 권한 변경과 기기 추가/폐기는 감사 이벤트를 남기되 민감 내용은 기록하지 않는다.

## 14. 의존성·빌드·업데이트 보안

- lockfile을 커밋하고 CI에서 frozen install을 사용한다.
- 새 의존성은 maintainer/릴리스 활동, 알려진 취약점, transitive 규모, 라이선스, 네이티브 권한을 검토한다.
- 릴리스마다 SBOM과 checksum을 생성하고 가능한 경우 provenance attestation을 게시한다.
- macOS/모바일 바이너리는 플랫폼 코드 서명과 notarization을 사용한다.
- 자동 업데이트는 TLS만 믿지 않고 서명된 manifest/artifact를 검증한다.
- Codex 바이너리를 임의 URL에서 자동 다운로드하지 않는다. 발견된 로컬 바이너리의 버전과 출처를 표시하고 지원 범위를 검사한다.
- relay/client/daemon 프로토콜은 downgrade 공격을 막도록 최소 허용 버전을 인증된 handshake에 포함한다.
- 릴리스 서명 키는 CI 일반 secret과 분리하고 최소 인원·보호된 환경·회전 runbook을 적용한다.

## 15. 보안 테스트·출시 Gate

### S1 — 로컬 알파 Gate

- 모든 P0 설정·실행 인자에서 loopback/IPC 외 listener가 열리지 않는 테스트
- Origin/Host/CORS/CSRF와 local-token/remote-credential 교차 사용 negative test
- 브라우저 장기 token이 URL/WebSocket query/`localStorage`/로그에 남지 않는 검사
- raw shell endpoint 없음 확인
- mobile/remote raw PTY·keystroke·terminal command·SSH/port-forward endpoint 없음 확인
- process argv에 sandbox/approval bypass flag가 없고 VerificationTemplate executable/argv/cwd/env policy를 Planner·remote가 바꿀 수 없는지 확인
- App Server event schema와 state-machine 테스트
- acquisition buffer limit/timeout/unknown frame이 상태를 성공으로 전이하지 않고 journal commit 전 event가 publish되지 않는지 확인
- 로그 fixture에 canary secret이 남지 않는 검사

### S2 — 병렬 제어 Gate

- 범용 approval `result` endpoint 제거
- Approval/session/turn 교차 주입, stale aggregate revision, idempotency 충돌 거부
- canonical path/symlink/worktree dirty-state 테스트
- stale TaskAttempt/Dispatch 결과의 성공·Artifact·lease release 차단
- DependencyBinding hash/OID 변조 및 fan-in 충돌 차단
- shared/exclusive ResourceClaim canonical ordering, atomic acquire, lease generation/TTL reconcile 테스트
- task/depth/attempt/wall-time/resident/output/disk RunBudget 경계와 exhaustion Attention 테스트
- stall detector가 input/Approval/Checkpoint wait를 제외하고 daemon-managed process group 밖 PID를 종료하지 않는지 확인
- declared scope escape가 block되고 새 Plan revision의 re-freeze/reconfirm 전 재개되지 않는지 확인
- VerificationResult source tree OID와 integration source/target OID drift 차단
- Checkpoint Decision의 revision/idempotency/evidence 및 elevated receipt 우회 경로 없음
- 파괴적·권한 상승 `accept`의 잠금 해제 인증 UI와 1회성 confirmation receipt 우회 경로 없음

### S3 — 원격 알파 Gate

- 페어링/키/E2EE ADR과 독립 리뷰 완료
- relay DB·로그·패킷에 콘텐츠 평문 없음
- replay/idempotency/revoke/offline queue 테스트
- push application payload에 opaque wake token 외 Attention/Session/kind/preview/deep-link 정보가 없는지 자동 검사
- 원격 기능 기본 off와 kill switch 검증
- daemon outbound E2EE 연결만 존재하고 relay가 Machine 방향 inbound socket을 열 수 없는지 검증
- 원격 클라이언트가 VerificationTemplate·ExecutionProfile·raw cwd/env/argv를 등록·수정할 수 없고 push payload가 wake token 외 실행 identity를 담지 않는지 검증

### S4 — 음성 베타 Gate

- 녹음 상태, 권한 철회, 원본 보존 기본 off
- 낮은 confidence/모호한 대상 확인
- 음성은 승인 UI 탐색과 `decline`/`cancel`만 허용하고 모든 Approval `accept` 제출·receipt 발급 차단
- 외부 STT opt-in·개인정보 고지 검증

### S5 — 공개 베타/안정판 Gate

- 외부 침투/암호 설계 리뷰에서 치명적·높음 미해결 0개
- 의존성/SBOM/서명/provenance와 롤백 리허설
- 보안 연락처, 지원 버전, 업데이트 SLA, 사고 대응 runbook 공개
- 키 폐기·기기 분실·relay 침해 tabletop exercise 완료
- P1 기능을 함께 출시할 경우 hibernation blocker/identity, comparative 동일 base/spec·loser 보존, usage-window admission, stale review anchor, usage source/freshness/account-switch 금지 회귀 테스트 완료

### ORC-006 P1 활성화 Gate

- 지원 app-server version/capability별 `account/rateLimits/read|updated` fixture와 missing/out-of-range/unknown bucket fail-closed state-machine test
- 빈·중복 Queue/eligible/Task/bucket, 선택 목록 밖 `controlQueueId`, multi-provider bucket, invalid target/reserve와 비양수 max-age/buffer/concurrency/failure threshold preset 거부
- stale/forged snapshot, expected Project/Queue/Plan/Task/QueueEntry binding, eligible-set/preset digest, idempotency, `usage_window.start` capability, device revocation, fresh user-presence receipt 각각의 negative test
- start 뒤 preset 수정·retire가 immutable effective policy/control Queue/admission limit을 바꾸지 않고 원 receipt를 재사용 가능한 형태로 저장하지 않는지 검증
- 같은 Run의 정상 lifecycle revision은 current cursor와 원자 전진하고 start binding은 불변인지, 외부 policy/definition/frozen/membership 변경 또는 불명확한 event가 cursor를 전진시키지 않고 stop하는지 검증
- target, reserve floor, empty queue, account/bucket/window/reset identity 변경, stale/unknown/max-age, stop-launch buffer, blocker, failure threshold, cancel, cost risk마다 새 dispatch가 0건이고 `controlQueueId` target의 dedupe된 stop Attention이 1건인지 검증
- forecast/recheck와 worker start 사이 `resetsAt` 변경 fault injection에서 reserved Dispatch가 실행되지 않고 기존 lease가 journal과 함께 반환되는지 검증
- prompt/agent가 새 Task, filler, duplicate, clone, retry/unblock을 runner membership에 넣을 수 없고 sealed Task가 run당 최대 한 번만 시작되는지 검증
- runner concurrency가 global/Machine/Project/ResourceLease/RunBudget을 우회하지 않고 Approval/Checkpoint에서 정지하는지 검증
- paired device가 preset ID/revision 외 Queue/Task/scope/concurrency/budget/provider override를 보내면 거부되고, 음성·TTS·notification/push quick action start와 earned-reset consume, purchase/overage, login/logout/account-switch 호출 graph가 정적·동적 검사 모두에서 0건인지 확인
- UI/API 문구와 forecast fixture가 exact remaining token, 100% 소진 또는 비용 안전을 보장한다고 표시하지 않는지 확인

## 16. 사고 대응

### 탐지와 분류

- `SEV-0`: 서명 키/대규모 identity key 침해, 원격 임의 코드 실행, 광범위 평문 유출.
- `SEV-1`: 특정 기기/세션 탈취, 승인 우회, 사용자 변경 데이터 손실.
- `SEV-2`: 제한된 메타데이터 노출, 반복적인 DoS, 우회 가능한 보안 기본값 오류.

### 대응 순서

1. 관련 릴레이 경로·버전·기기 키를 kill switch 또는 denylist로 봉쇄한다.
2. 로그를 더 수집하기 전에 개인정보 범위와 보존 영향을 확인하고 증거를 보전한다.
3. 사용자에게 영향을 받는 버전/기기/키, 즉시 할 일, 데이터 노출 범위를 명확히 알린다.
4. 서명된 수정 버전을 배포하고 필요하면 전체 re-pair/rekey를 강제한다.
5. exploit regression test, 타임라인, 근본 원인, 재발 방지 조치를 공개 가능한 수준으로 기록한다.
6. 사고 종료 뒤 위협 모델·runbook·키/권한 정책을 갱신한다.

## 17. 구현 전에 닫아야 할 보안 결정

| 결정 | 선택지/질문 | 마감 Gate |
|---|---|---|
| E2EE 프로토콜 | Noise 계열, 검증된 ratchet 라이브러리, 다중 기기 envelope 중 무엇을 채택할까? | S3 전 |
| identity key 저장 | macOS Keychain, iOS/Android secure hardware, Linux fallback 정책은? | S3 전 |
| relay 운영 | 공식 hosted, self-host, 둘 다 지원 시 tenancy/abuse 방어는? | S3 전 |
| 계정 필요 여부 | 계정 없는 pairing routing과 계정 기반 복구 중 어느 모델인가? | S3 전 |
| 메타데이터 최소화 | relay TTL, IP 로그, frame padding을 어느 수준까지 제공할까? | S3 전 |
| 원격 승인 상한 | 어떤 승인까지 모바일에서 허용하고 어떤 것은 로컬 전용으로 둘까? | S2 전 |
| 로컬 API 형태 | TCP loopback+token과 Unix domain socket/Named Pipe의 플랫폼별 선택은? | S1 전 |
| P1 직접 LAN mode | 필요성이 입증되면 별도 listener·상호 TLS/기기 인증·새 위협 모델로 제공할까, 계속 relay-only로 둘까? | P1 착수 전 |
| 클라이언트 패키징 | PWA와 native wrapper의 키 보관·push·생체 인증 차이는? | S3 전 |
| 데이터 암호화 at rest | 이벤트 저널을 OS 사용자 보호만 둘지 app-level 암호화할지? | S1 전 |
| 보안 업데이트 정책 | 지원 버전 수, 긴급 revoke, stable SLA는? | S5 전 |

## 18. 절대 출시 금지 조건

- 원격에서 임의 shell string 또는 임의 App Server JSON-RPC 메서드를 호출할 수 있다.
- 모바일/원격에서 raw PTY, keystroke injection, 임의 terminal command, SSH tunnel/port forwarding에 접근할 수 있다.
- P0 daemon이 어떤 설정/인자 조합에서든 LAN/public interface에 직접 listen한다.
- local browser token과 remote device credential이 같은 issuer/audience 또는 endpoint에서 상호 교환 가능하다.
- 승인 응답이 Approval/session/turn/type/revision/idempotency에 강하게 결합되지 않는다.
- 음성·TTS·알림 quick action이 어떤 Approval `accept`든 제출하거나, destructive/elevated `accept`가 잠금 해제 인증 UI의 1회성 confirmation receipt 없이 실행된다.
- 릴레이에서 프롬프트·출력·저장소명이 평문으로 보이거나 push application payload가 opaque wake token 이외의 Attention/Session/kind/preview 정보를 담는다.
- 기기 폐기 후에도 기존 키로 새 메시지를 복호화하거나 명령을 보낼 수 있다.
- 미커밋 worktree를 사용자 확인 없이 삭제하는 경로가 있다.
- worktree를 sandbox로 간주해 Codex sandbox/approval을 우회하거나 full-autonomy 플래그로 runtime을 시작한다.
- `.env`, credential, SSH agent socket, cloud config가 worktree/Artifact/ContextPackage에 copy·symlink되거나 RunManifest에 저장된다.
- Planner 또는 원격 기기가 VerificationTemplate의 executable, raw argv, cwd, env/network/sandbox policy를 등록·변경할 수 있다.
- journal commit 전에 state/event/Attention을 publish하거나 worker를 dispatch한다.
- 현재 TaskAttempt/Dispatch와 일치하지 않는 결과가 Task 성공, Artifact 채택, lease 해제 또는 integration을 일으킨다.
- Task/DAG/attempt/wall-time/resident/output/disk에 hard cap이 없거나 RunBudget 소진 뒤 새 dispatch가 자동 진행된다.
- TTL 만료만으로 ResourceLease를 재할당하거나 daemon이 관리하지 않는 process를 stall 처리로 종료한다.
- declared scope 밖 변경이 Plan re-freeze/reconfirm 없이 성공 처리되거나, exact source tree·target head OID가 다른 상태에서 verification/integration 결과를 재사용한다.
- Codex unknown event를 성공/완료 상태로 추정한다.
- provider account hot-swap·quota 우회 또는 credential export를 사용량 표시 기능으로 제공한다.
- P1 UsageWindowRun이 local unlocked UI 또는 revoke되지 않은 `usage_window.start` paired device의 fresh user-presence receipt, fresh snapshot, exact expected revisions와 sealed eligible-set digest 없이 시작되거나 voice/notification quick action으로 시작된다.
- P1 paired device가 UsageWindowPreset, eligible Queue/Task, scope, concurrency, budget 또는 provider를 생성·수정·override할 수 있다.
- P1 UsageWindowRun이 exact preset revision의 immutable effective policy와 `controlQueueId`, single-provider/account binding, immutable start binding과 rolling current binding을 보존하지 않거나 start revision을 admission CAS에 재사용한다.
- P1 UsageWindowRun이 새 prompt/Task/Plan, filler, duplicate, clone, 자동 retry/unblock을 만들어 quota를 소비한다.
- P1 UsageWindowRun이 stale/unknown/max-age snapshot, provider/account/bucket/window/reset identity 변경, current binding mismatch, stop-launch buffer, blocker, failure threshold, RunBudget/cost risk 뒤에도 새 Dispatch를 시작한다.
- P1 usage 기능이 exact remaining token·100% quota 소진·비용 안전을 보장한다고 표시하거나 earned reset credit, 구매/overage, account login/logout/hot-swap을 자동 호출한다.
- debug/telemetry가 opt-out이거나 비밀 redaction 검증이 없다.
- 서명되지 않은 업데이트를 자동 설치할 수 있다.
