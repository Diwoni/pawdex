# Pawdex 프로토콜 명세

> 상태: **제안안(Proposal), 구현 전 변경 가능**
> 프로토콜 버전: `1`
> 최종 수정: 2026-09-07

## 1. 범위와 규범

이 문서는 Pawdex 클라이언트와 local daemon 사이의 정규화된 계약을 정의한다. Codex app-server JSON-RPC는 `apps/daemon/src/codex` adapter 내부 구현이며 이 프로토콜에 그대로 노출되지 않는다.

현재 스파이크의 `/api/...` endpoint, `state.json`, `@pawdex/protocol` 타입은 가능성 검증용이다. 이 문서의 `/api/v1/...`, event envelope, typed approval API가 목표 계약이다. 구현 전 ADR 승인과 OpenAPI/JSON Schema 생성이 필요하다.

문서에서 **MUST**, **MUST NOT**, **SHOULD**, **MAY**는 각각 필수, 금지, 권고, 선택을 뜻한다.

## 2. 전송과 공통 형식

- 로컬 HTTP: `http://127.0.0.1:<port>/api/v1`
- 실시간 이벤트: WebSocket `/api/v1/events`
- 본문: UTF-8 JSON
- 시간: UTC RFC 3339, 예: `2026-09-07T03:04:05.678Z`
- ID: 서버가 발급한 UUIDv7 권장. ID는 불투명 문자열로 취급한다.
- 정수 sequence/revision: JSON safe integer 범위 내 음이 아닌 정수
- 모든 mutation은 `Idempotency-Key` header를 MUST 포함한다.
- 클라이언트는 `Pawdex-Protocol-Version: 1` header를 SHOULD 포함한다.

daemon은 loopback에만 기본 바인딩한다. 브라우저 WebSocket에는 장기 token을 query string으로 전달하지 않는다. 인증된 HTTP 호출로 30초 이하의 일회성 event ticket을 받은 후 ticket으로 연결한다.

### 2.1 성공 응답

```json
{
  "data": {},
  "meta": {
    "protocolVersion": 1,
    "requestId": "req_01...",
    "correlationId": "cor_01..."
  }
}
```

### 2.2 오류 응답

```json
{
  "error": {
    "code": "APPROVAL_EXPIRED",
    "message": "이 승인 요청은 더 이상 유효하지 않습니다.",
    "retryable": false,
    "details": {
      "approvalId": "apr_01..."
    }
  },
  "meta": {
    "protocolVersion": 1,
    "requestId": "req_01...",
    "correlationId": "cor_01..."
  }
}
```

표준 오류 코드:

| HTTP | code | 의미 |
|---:|---|---|
| 400 | `VALIDATION_FAILED` | schema 또는 상태 전제 불일치 |
| 401 | `UNAUTHENTICATED` | 인증 없음/만료 |
| 403 | `FORBIDDEN` | 기기 또는 프로젝트 권한 부족 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `STATE_CONFLICT` | 현재 상태에서 명령 불가 |
| 409 | `IDEMPOTENCY_CONFLICT` | 같은 key에 다른 payload 사용 |
| 410 | `APPROVAL_EXPIRED` | runtime 요청이 해결/만료됨 |
| 410 | `CURSOR_EXPIRED` | event 보존 범위 밖 cursor |
| 422 | `AMBIGUOUS_TARGET` | 음성/별칭 대상이 둘 이상 |
| 422 | `EXECUTION_MODE_UNAVAILABLE` | Project/capability에서 실행 조합을 허용하지 않음 |
| 429 | `CONCURRENCY_LIMITED` | 동시성 정책 초과 |
| 502 | `RUNTIME_UNAVAILABLE` | Codex app-server 사용 불가 |
| 503 | `RECONCILIATION_REQUIRED` | runtime 상태 확정 필요 |

`requestId`는 한 HTTP 시도를 추적하는 edge id다. `correlationId`는 같은 idempotent command의 재시도, operation, durable event를 잇는 감사 id이며 API-001의 correlation ID를 뜻한다. 둘은 alias가 아니며 모든 성공/오류 응답에 포함한다. `details`는 오류 코드별 JSON object이며 secret, 원본 음성, 전체 환경 변수는 포함하지 않는다.

## 3. 도메인 식별자와 엔터티

### 3.1 Machine

daemon이 실행되는 개발 머신이다.

```ts
interface Machine {
  id: string;
  name: string;
  state: "online" | "degraded" | "offline";
  runtime: RuntimeDescriptor | null;
  capabilities: CapabilitySet;
  revision: number;
  latestSequence: number;
}
```

### 3.2 Project

실행이 허용된 로컬 작업공간이다. 클라이언트가 임의 절대 경로를 매 요청마다 지정할 수 없고, 등록된 `projectId`를 사용한다.

```ts
interface Project {
  id: string;
  name: string;
  rootPathDisplay: string;
  isGitRepository: boolean;
  defaultRef: string | null;
  policy: ProjectPolicy;
  revision: number;
}

interface ProjectPolicy {
  allowedModes: Array<"read_only" | "managed_write">;
  allowedModels: string[];
  allowedBaseRefs: string[];
  concurrency: {
    maxActiveTurns: number;
    maxResidentNeedsInput: number;
    needsInputSlotPolicy: "release_active_slot" | "hold_active_slot";
  };
  runtime: {
    approvalsReviewer: "user";
    sandboxByMode: { readOnly: "read-only"; managedWrite: "workspace-write" };
    allowDangerFullAccess: false;
    allowSessionScopeApproval: boolean;
    allowExecPolicyAmendment: boolean;
    allowNetworkPolicyAmendment: boolean;
    allowedNetworkTargets: Array<{ host: string; protocol: string; ports?: number[] }>;
    allowedExternalReadPathIds: string[];
  };
  verificationTemplates: Array<{
    id: string;
    executableId: string;
    allowedArgsSchema: Record<string, unknown>;
    cwd: "managed_worktree" | "project_read_only";
    maxTimeoutMs: number;
  }>;
  remoteControl: "disabled" | "e2ee_relay";
}

interface CapabilitySet {
  runtimeMethods: string[];
  approvalKinds: ApprovalKind[];
  voice: string[];
  notifications: string[];
}

interface FailureSummary {
  code: string;
  message: string;
  retryable: boolean;
}

type InputContent =
  | { type: "text"; text: string }
  | { type: "image_ref"; artifactId: string };

interface ArtifactSpec {
  id: string;
  name: string;
  kind: "file" | "commit" | "report" | "test_result";
  required: boolean;
}
```

원격 클라이언트에는 전체 절대 경로 대신 redacted display path를 반환할 수 있다.

`ProjectPolicy.allowedModes`의 `managed_write`는 세션 생성 계약의 `execution: { mode: "write", worktree: "managed" }` 조합을 가리키는 정책 이름이다. `mode: "write"`와 `worktree: "none"` 조합은 로컬·원격 모두 공개 P0 계약에서 허용하지 않는다.

P0에서 `Project.isGitRepository=false`이거나 worktree capability가 없으면 effective `allowedModes`는 `read_only`뿐이다. `managed_write` 요청은 `EXECUTION_MODE_UNAVAILABLE`로 거절하며 단일 checkout 쓰기나 managed copy로 우회하지 않는다. managed copy isolation은 P1 capability다.

P0의 `ProjectPolicy → app-server` 매핑은 고정한다.

| Pawdex 실행 모드 | `approvalsReviewer` | sandbox | cwd |
|---|---|---|---|
| 원격 `read_only` | `user` | `read-only` | 등록 프로젝트 checkout |
| 원격 `managed_write` | `user` | `workspace-write` | 해당 task에 예약된 managed worktree만 |

원격 API에는 `danger-full-access`, 임의 approval policy, arbitrary sandbox, 임의 cwd를 노출하지 않는다. 로컬 UI에서 별도 고급 정책을 추가하더라도 P0 원격 계약과 섞지 않는다. daemon은 LAN/public interface에 직접 listen하지 않고 outbound E2EE relay만 사용한다.

Session 생성 시 daemon은 요청 model이 `allowedModels`에 있는지, Git/worktree capability와 execution 조합, `sandboxByMode`, `approvalsReviewer="user"`를 함께 검증한다. 정책 booleans는 upstream이 제안한 결정을 더 좁힐 수만 있고 임의 payload로 확대할 수 없다.

### 3.3 Session

Pawdex의 사용자 대화 단위이며 하나의 Codex thread와 연결된다.

```ts
type SessionState =
  | "starting"
  | "ready"
  | "running"
  | "needs_input"
  | "completed"
  | "failed"
  | "interrupted"
  | "offline";

interface Session {
  id: string;
  projectId: string;
  name: string;
  state: SessionState;
  revision: number;
  activeTurnId: string | null;
  primaryAttentionId: string | null;
  blockingRequestCount: number;
  worktreeId: string | null;
  execution: { mode: "read_only"; worktree: "none" } | { mode: "write"; worktree: "managed" };
  model: string | null;
  createdAt: string;
  updatedAt: string;
  lastSummary: string | null;
  failure: FailureSummary | null;
}
```

스파이크의 `idle`은 목표 계약의 `ready`, `stopped`는 `interrupted`로 migration한다.

### 3.4 Turn

```ts
type TurnState = "queued" | "running" | "needs_input" | "succeeded" | "failed" | "interrupted";

interface Turn {
  id: string;
  sessionId: string;
  state: TurnState;
  revision: number;
  startedAt: string | null;
  endedAt: string | null;
  finalMessage: string | null;
  failure: FailureSummary | null;
}
```

### 3.5 Plan과 Task

```ts
type PlanState = "draft" | "proposed" | "editing" | "validated" | "frozen" | "confirmed" | "running" | "blocked" | "succeeded" | "failed" | "cancelled";
type TaskState = "queued" | "ready" | "dispatching" | "running" | "needs_input" | "blocked" | "succeeded" | "failed" | "cancelled";

interface Plan {
  id: string;
  projectId: string;
  goal: string;
  baseGitRevision: string | null;
  state: PlanState;
  revision: number;
  frozenHash: string | null;
  taskIds: string[];
  policy: { maxParallelTasks: number; failureMode: "stop_dependents" | "pause_plan" };
}

interface Task {
  id: string;
  planId: string;
  title: string;
  instruction: string;
  mode: "read_only" | "write";
  expectedScope: { readPatterns: string[]; writePatterns: string[] };
  risk: "low" | "medium" | "high";
  humanCheckpoints: string[];
  state: TaskState;
  dependsOn: string[];
  lane: string | null;
  sessionId: string | null;
  worktreeId: string | null;
  expectedArtifacts: ArtifactSpec[];
  consumedArtifacts: Array<{ artifactSpecId: string; fromTaskId: string }>;
  completionCriteria: CompletionCriteria;
  verification: VerificationSpec[];
  currentAttemptId: string | null;
  revision: number;
}

interface CompletionCriteria {
  requiredArtifacts: string[];
  requireAllVerificationPassed: boolean;
  changedPathPatterns?: string[];
  summaryRequired: boolean;
}

interface VerificationSpec {
  id: string;
  templateId: string;
  args: Record<string, string | number | boolean>;
  timeoutMs: number;
  expectedExitCodes: number[];
}

interface VerificationResult {
  id: string;
  attemptId: string;
  verificationSpecId: string;
  exitCode: number | null;
  durationMs: number;
  passed: boolean;
  redactedOutputArtifactId: string | null;
  revision: number;
}

interface Artifact {
  id: string;
  artifactSpecId: string;
  producerTaskAttemptId: string;
  kind: "file" | "commit" | "report" | "test_result";
  contentHash: string;
  reference: string;
  redactedHandoffSummary: string;
  createdAt: string;
  revision: number;
}

interface TaskAttempt {
  id: string;
  taskId: string;
  ordinal: number;
  state: "reserved" | "running" | "verifying" | "succeeded" | "failed" | "cancelled";
  leaseId: string | null;
  sessionId: string | null;
  worktreeId: string | null;
  sourceTurnId: string | null;
  resultSummary: string | null;
  changedFiles: Array<{ pathDisplay: string; operation: "add" | "modify" | "delete" }>;
  artifactIds: string[];
  verificationResultIds: string[];
  revision: number;
}
```

### 3.6 Worktree

```ts
interface Worktree {
  id: string;
  projectId: string;
  owner: { type: "session"; sessionId: string } | { type: "task_attempt"; taskAttemptId: string };
  branch: string;
  baseRef: string;
  pathDisplay: string;
  gitCommonDirId: string;
  state: "reserved" | "ready" | "dirty" | "integrated" | "orphaned" | "removed";
  revision: number;
}
```

standalone `write+managed` Session은 `owner.type="session"`, Plan Task 실행은 새 attempt별 `owner.type="task_attempt"`를 사용한다. retry는 이전 worktree를 보존하고 새 TaskAttempt와 새 worktree를 만든다.

`Artifact.artifactSpecId`는 frozen Plan의 `ArtifactSpec.id`를 반드시 참조한다. artifact id는 `(planFrozenHash, artifactSpecId, producerTaskAttemptId, outputOrdinal)`의 canonical encoding으로 결정적으로 생성해 crash/retry 중복을 막는다. 다른 attempt가 같은 spec을 생산해도 artifact id는 달라지며 TaskAttempt의 `artifactIds`와 후속 Task의 `consumedArtifacts.artifactSpecId`로 provenance를 닫는다.

### 3.7 Approval

`Approval`은 실행 권한 요청과 사용자 질문을 통합해 attention inbox에 전달하는 엔터티다. API 응답은 kind별로 다르며 generic JSON result endpoint는 MUST NOT 제공한다.

```ts
type ApprovalKind =
  | "command_execution"
  | "file_change"
  | "permissions"
  | "user_input"
  | "mcp_elicitation";

type ApprovalState = "pending" | "responding" | "accepted" | "declined" | "cancelled" | "expired";

interface Approval {
  id: string;
  kind: ApprovalKind;
  state: ApprovalState;
  sessionId: string;
  turnId: string | null;
  itemId: string | null;
  request: CommandApprovalRequest | FileApprovalRequest | PermissionRequest | UserInputRequest | ElicitationRequest;
  isBlocking: boolean;
  explicitConfirmationRequired: boolean;
  expiresAt: string | null;
  revision: number;
}
```

upstream JSON-RPC request id는 보안상 내부에만 저장하고 클라이언트에 노출하지 않는다.

### 3.8 Durable 실행 Queue와 Lease

Turn과 Task 상태에 queue 의미를 억지로 합치지 않는다. 전역/Machine/Project scope마다 durable queue projection을 둔다.

```ts
type QueuePauseReason = "manual" | "rate_limit" | "usage_limit" | "runtime_unavailable" | "policy_changed" | "waiting_on_input";

interface ExecutionQueue {
  id: string;
  scope: { type: "global" } | { type: "machine"; machineId: string } | { type: "project"; projectId: string };
  state: "running" | "paused";
  pauseReason: QueuePauseReason | null;
  resumeAfter: string | null;
  activeCount: number;
  limit: number;
  residentNeedsInputCount: number;
  residentNeedsInputLimit: number;
  needsInputSlotPolicy: "release_active_slot" | "hold_active_slot";
  revision: number;
}

interface QueueEntry {
  id: string;
  queueId: string;
  operationId: string;
  sessionId: string | null;
  taskAttemptId: string | null;
  state: "queued" | "leased" | "running" | "paused" | "completed" | "cancelled";
  priority: number;
  enqueuedAt: string;
  pauseReason: QueuePauseReason | null;
  leaseId: string | null;
  revision: number;
}

interface ExecutionLease {
  id: string;
  operationId: string;
  scopeGrants: Array<{
    queueId: string;
    queueEntryId: string;
    scope: "global" | "machine" | "project";
  }>;
  machineId: string;
  taskAttemptId: string | null;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  state: "active" | "released" | "expired";
  revision: number;
}
```

각 operation/TaskAttempt는 global, 대상 Machine, 대상 Project queue에 정확히 하나씩 총 세 QueueEntry를 가진다. composite `ExecutionLease.scopeGrants`도 세 scope를 모두 포함해야 한다. daemon은 한 transaction에서 세 queue의 상태/한도와 entry 선두 자격을 검사해 세 slot을 전부 reserve하거나 아무것도 reserve하지 않는다. 일부 acquire 상태는 commit할 수 없다.

dispatch 실패 시 같은 transaction 또는 복구 operation으로 세 grant를 모두 rollback/release한다. heartbeat와 만료는 composite lease 전체에 적용한다. daemon 재시작 뒤 runtime operation과 세 entry를 reconcile하기 전에는 lease를 재발급하지 않는다. turn/attempt가 terminal이거나 dispatch가 취소되면 세 slot을 원자적으로 release하고 각 entry를 terminal로 만든다. rate/usage-limit은 관련 scope queue를 durable `paused`로 바꾸고 원인과 `resumeAfter`를 기록한다.

P0 기본 `needsInputSlotPolicy`는 `release_active_slot`이다. blocking 입력으로 Session이 `needs_input`이 되면 세 active-turn grant를 release하고 entry를 `paused(reason=waiting_on_input)`로 둔다. app-server process/thread는 resident로 남아 global/Machine/Project의 `residentNeedsInputCount`에 각각 1로 계수하며 별도 limit을 넘으면 새 dispatch를 멈춘다. `hold_active_slot`은 명시적 ProjectPolicy 선택일 때만 사용한다.

사용자 응답이 접수돼도 blocker를 즉시 풀지 않는다. release 정책에서는 resume operation을 queue하고 세 scope composite lease를 다시 얻은 뒤에만 upstream approval/user-input response를 보낸다. daemon 재시작 시 `Thread.status`, active flags, pending Approval로 resident count와 paused entry를 복구하며, reconcile 전에는 slot이나 response를 중복 발급하지 않는다. nonblocking user input은 active slot/lease에 영향을 주지 않는다.

## 4. 세션 상태 머신

### 4.1 허용 전이

| 현재 | 입력/이벤트 | 다음 | 비고 |
|---|---|---|---|
| 없음 | `session.create` | `starting` | thread 생성 중 |
| `starting` | runtime thread 생성 | `ready` | prompt가 있으면 곧바로 `running` 가능 |
| `ready`, `completed`, `failed`, `interrupted` | `turn.start` | `running` | 새 턴 |
| `running` | `turn.steer` | `running` | `expectedTurnId` 검증 |
| `running` | blocking 승인/질문 요청 | `needs_input` | 해당 요청 `isBlocking=true` 또는 runtime active flag 기준 |
| `running` | nonblocking 질문 요청 | `running` | attention만 생성, blocker가 아님 |
| `needs_input` | 요청 하나 resolved | reducer 재평가 | 다른 blocker/turn 상태를 보존, `running` 가정 금지 |
| `running`, `needs_input` | turn 성공 | `completed` | attention 생성 |
| `running`, `needs_input` | turn 실패 | `failed` | attention 생성 |
| `running`, `needs_input` | turn 중단 | `interrupted` | 사용자 중단 |
| 활성 상태 | runtime 연결 종료 | `offline` | 결과를 추정하지 않음 |
| `offline` | reconcile 결과 active | `running` 또는 `needs_input` | runtime canonical 상태 |
| `offline` | reconcile 결과 terminal | terminal state | attention 재생성은 dedupe |

`completed`는 thread가 폐기됐다는 뜻이 아니라 가장 최근 턴이 정상 종료되어 새 지시를 받을 수 있다는 뜻이다. 클라이언트는 `completed`에서 바로 새 `turn.start`를 보낼 수 있다.

### 4.2 runtime reconciliation 기준

세션 상태의 canonical 입력은 `Thread.status`, `thread/status/changed`, 현재 turn, 그리고 thread의 `activeFlags.waitingOnApproval`/`activeFlags.waitingOnUserInput`이다. local approval 목록은 사용자에게 보여 주는 projection이며 upstream 상태를 임의로 덮지 않는다.

reducer 우선순위:

1. runtime 연결이 없으면 활성 세션은 `offline`이다.
2. terminal turn이면 그 결과를 `completed`/`failed`/`interrupted`로 적용한다.
3. `waitingOnApproval=true`, `waitingOnUserInput=true`, 또는 미해결 `isBlocking=true` request가 있으면 `needs_input`이다.
4. active turn이면 `running`이다.
5. 그 외 thread가 사용 가능하면 `ready` 또는 직전 terminal state를 유지한다.

upstream mapping 또는 reconciliation reducer가 Session의 계산 상태를 바꾸면 projection update와 canonical `session.state_changed` append를 반드시 같은 SQLite transaction에서 수행한다. `session.runtime_status_observed`, Approval/Turn 이벤트만 발행한 채 Session 상태를 암묵적으로 바꾸는 것은 금지한다. 계산 결과가 기존 상태와 같으면 중복 state event를 발행하지 않는다.

`serverRequest/resolved.requestId`는 같은 runtime connection의 정확히 한 request만 해결한다. 다른 pending request와 attention은 유지한다. 응답을 보낸 순간에도 approval을 terminal로 확정하지 않고 `serverRequest/resolved` 또는 reconciliation 결과를 기다린다.

### 4.3 upstream 이벤트 매핑

| Codex app-server 메시지 | 정규 이벤트 | 상태 효과 |
|---|---|---|
| `thread/started` | `session.runtime_attached` | `starting → ready` |
| `thread/status/changed` 또는 `Thread.status` read 결과 | `session.runtime_status_observed` | reducer 전체 재평가 |
| `turn/started` | `turn.state_changed(to=running)` | `→ running` |
| `item/agentMessage/delta` | `ephemeral.delta(channel=agent_text)` | 상태 변경 없음, 비영속 |
| `item/completed` agent message | `turn.message_finalized` | 최종 메시지 projection 갱신 |
| `item/commandExecution/requestApproval` | `approval.requested` kind command | `running → needs_input` |
| `item/fileChange/requestApproval` | `approval.requested` kind file | `running → needs_input` |
| `item/permissions/requestApproval` | `approval.requested` kind permissions | `running → needs_input` |
| `item/tool/requestUserInput(isBlocking=true)` | `approval.requested` kind user_input | `running → needs_input` |
| `item/tool/requestUserInput(isBlocking=false)` | `approval.requested` kind user_input | 상태 유지, attention만 생성 |
| `mcpServer/elicitation/request` | `approval.requested` kind mcp_elicitation | `running → needs_input` |
| `serverRequest/resolved` | `approval.resolved` | 일치하는 요청 하나 제거 후 reducer 재평가 |
| `turn/completed(status=completed)` | `turn.state_changed(to=succeeded)` | `→ completed` |
| `turn/completed(status=failed)` + `error` | `turn.state_changed(to=failed)` | `→ failed` |
| `turn/completed(status=interrupted)` | `turn.state_changed(to=interrupted)` | `→ interrupted` |
| child process exit | `machine.runtime_state_changed(to=offline)` | 활성 세션 `→ offline` |

구버전 `tool/requestUserInput`은 adapter compatibility fixture로만 받을 수 있으며 정규 이벤트는 동일하다. 알 수 없는 upstream **notification**은 method와 payload hash를 진단에 남기고 상태 변경 없이 무시한다. 반면 알 수 없는 JSON-RPC **server request**는 hang을 막기 위해 지원하지 않는 요청 오류로 응답하고, 관련 세션을 reconcile하며 `reconciliation_required` attention을 생성한다. 새 매핑에는 반드시 state-machine test를 추가한다.

server request allowlist는 command/file/permissions approval, user input, MCP elicitation이다. `item/tool/call` dynamic tool은 P0에서 비활성화한다. auth-refresh 계열 요청과 `attestation/generate`는 전용 credential broker/서명된 desktop host, `initialize` capability, Pawdex 기능 플래그, typed handler가 모두 활성화된 경우에만 allowlist에 들어간다. token/attestation 값은 event나 로그에 포함하지 않는다.

allowlist 밖 server request에는 같은 JSON-RPC `id`로 `-32601`과 안전한 `Method not supported by Pawdex client` 오류를 응답한다. payload는 실행하지 않으며 raw params를 클라이언트로 전달하지 않는다. 이후 thread를 read/reconcile하고 attention을 남긴다.

같은 세션에서 동시에 여러 서버 요청이 생길 수 있으므로 단일 attention id로 전체 대기열을 표현하지 않는다. `approvals` collection과 `blockingRequestCount`가 기준이며 session의 `primaryAttentionId`는 표시용 요약이다.

## 5. 정규 이벤트 계약

### 5.1 Envelope

```ts
interface PawdexEvent<T = unknown> {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  type: EventType;
  occurredAt: string;
  aggregate: {
    type: "machine" | "project" | "session" | "turn" | "plan" | "task" | "task_attempt" | "worktree" | "queue" | "queue_entry" | "lease" | "artifact" | "verification" | "approval" | "attention" | "notification_policy" | "notification" | "device";
    id: string;
    revision: number;
  };
  correlationId: string | null;
  causationId: string | null;
  payload: T;
}
```

규칙:

- `sequence`는 한 daemon database 안에서 단조 증가하고 이벤트마다 고유하다.
- `sequence`는 durable event를 commit할 때만 배정한다. rollback되거나 ephemeral frame인 항목은 sequence를 소비하지 않으며, 보존 중인 범위의 published stream에는 gap이 없어야 한다.
- `aggregate.revision`은 해당 aggregate에서 1씩 증가한다.
- 동일 `eventId`는 동일 payload를 뜻한다.
- 클라이언트는 마지막 반영 `sequence` 이하의 이벤트를 무시해야 한다.
- aggregate revision이 하나 이상 건너뛰면 클라이언트는 해당 리소스를 다시 읽어야 한다. durable event만 revision을 증가시킨다.
- 이벤트 순서는 `sequence`가 기준이며 `occurredAt` 정렬을 사용하지 않는다.
- 민감한 upstream payload를 `payload`에 그대로 넣지 않는다.

### 5.2 EventType

MVP canonical event:

```text
machine.runtime_state_changed
machine.capabilities_changed
project.registered
project.policy_changed
session.created
session.runtime_attached
session.forked
session.state_changed
session.runtime_status_observed
turn.created
turn.message_finalized
turn.state_changed
approval.requested
approval.response_submitted
approval.resolved
approval.expired
attention.created
attention.acknowledged
attention.resolved
plan.created
plan.state_changed
task.state_changed
task_attempt.created
task_attempt.state_changed
worktree.created
worktree.orphaned
worktree.integrated
worktree.removed
queue.state_changed
queue_entry.created
queue_entry.state_changed
lease.acquired
lease.renewed
lease.released
verification.completed
artifact.created
notification.delivery_changed
notification_policy.changed
device.paired
device.revoked
```

Session, Turn, Plan, Task, TaskAttempt, Queue, QueueEntry의 상태 전이는 각 aggregate의 `*.state_changed`가 유일한 canonical event다. 이 aggregate들에 `succeeded`/`failed` 같은 중복 event 이름을 별도 발행하지 않는다. Worktree, Approval, Attention, Lease, Device는 위 목록에 명시한 lifecycle event 이름을 사용한다. `session.runtime_status_observed`는 reconciliation의 source status와 active flags를 기록할 필요가 있을 때만 durable하게 남긴다.

핵심 payload 최소 필드:

| event | 최소 payload |
|---|---|
| `session.state_changed` | `from`, `to`, `reason`, `activeTurnId`, `blockingRequestCount` |
| `turn.state_changed` | `sessionId`, `from`, `to`, `runtimeTurnId`, `failure?` |
| `approval.requested` | `approvalId`, `sessionId`, `kind`, `isBlocking`, `explicitConfirmationRequired`, redacted request summary |
| `approval.resolved` | `approvalId`, `resolution`, `resolvedByRuntime`, `remainingBlockingCount` |
| `attention.created` | `attentionId`, `sessionId`, `kind`, `blocking`, `sourceId` |
| `task.state_changed` | `planId`, `taskId`, `from`, `to`, `reason`, `currentAttemptId?` |
| `task_attempt.state_changed` | `taskId`, `attemptId`, `ordinal`, `from`, `to`, `leaseId?`, `sessionId?`, `worktreeId?` |
| `worktree.created` | `worktreeId`, `ownerType`, `ownerId`, `branch`, redacted path id, `baseRef`, `gitCommonDirId` |
| `queue.state_changed` | `queueId`, `scope`, `from`, `to`, `pauseReason`, `resumeAfter` |
| `queue_entry.state_changed` | `queueEntryId`, `operationId`, `from`, `to`, `pauseReason`, `leaseId?` |
| `lease.acquired` | `leaseId`, `operationId`, 세 scope의 `queueId`/`queueEntryId`, `taskAttemptId?`, `expiresAt` |
| `verification.completed` | `attemptId`, `verificationResultId`, `templateId`, `exitCode`, `durationMs`, `passed` |
| `notification.delivery_changed` | `deliveryId`, `deviceId`, `attentionId`, `policyRevision`, `stage`, `dedupKey`, `from`, `to` |

한 command transaction의 event 순서는 결정적이다. `operations` row를 먼저 생성하고 projection을 갱신한 뒤, aggregate type 순서 `machine → project → plan → task → task_attempt → worktree → queue → queue_entry → lease → session → turn → verification → artifact → approval → attention → notification_policy → notification → device`, 같은 type이면 aggregate id 순서로 event를 append한다. outbox는 마지막에 만들고 commit 후 sequence 순으로 publish한다.

### 5.3 Ephemeral frame

토큰/명령 출력 delta는 `PawdexEvent`가 아니라 다음 별도 frame이다.

```ts
interface EphemeralDeltaFrame {
  schemaVersion: 1;
  type: "ephemeral.delta";
  streamId: string;
  offset: number;
  sessionId: string;
  turnId: string;
  itemId: string;
  channel: "agent_text" | "command_output" | "reasoning_summary";
  delta: string;
}
```

ephemeral frame은 durable `sequence`와 aggregate `revision`을 갖지 않으며 replay를 보장하지 않는다. 유실돼도 cursor gap이 생기지 않는다. 최종 `turn.message_finalized`/item 결과만 durable하다.

### 5.4 Snapshot

초기 연결 또는 cursor 만료 시 다음 프레임을 먼저 보낸다.

```json
{
  "schemaVersion": 1,
  "type": "snapshot",
  "baseSequence": 4281,
  "generatedAt": "2026-09-07T03:04:05.678Z",
  "data": {
    "machine": {},
    "projects": [],
    "sessions": [],
    "turns": [],
    "plans": [],
    "tasks": [],
    "taskAttempts": [],
    "worktrees": [],
    "queues": [],
    "queueEntries": [],
    "leases": [],
    "artifacts": [],
    "verificationResults": [],
    "pendingApprovals": [],
    "openAttentions": [],
    "devices": [],
    "notificationPolicies": [],
    "notificationDeliveries": []
  }
}
```

snapshot 적용 중 발생한 event는 `baseSequence + 1`부터 같은 연결에서 이어서 전송한다.

snapshot의 각 mutable entity는 자신의 aggregate `revision`을 포함한다. 클라이언트는 같은 권한 scope의 기존 projection을 snapshot으로 원자 교체하고 `baseSequence` 이후 durable event만 적용한다. revoked Device, open/최근 terminal NotificationDelivery, referenced Artifact와 VerificationResult는 retention 기간 동안 포함해 오프라인 클라이언트가 삭제·전송·검증 결과를 오판하지 않게 한다. snapshot에 없는 secret answer, raw audio, ephemeral delta는 복구 대상이 아니다.

## 6. 명령 API

### 6.1 시스템과 연결

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | process liveness, 민감 정보 없음 |
| GET | `/ready` | DB migration, runtime handshake, adapter 호환성 |
| GET | `/machines` | 연결/runtime 상태와 redacted capability 목록 |
| GET | `/capabilities` | protocol/runtime/client 기능 협상 |
| GET | `/diagnostics` | 권한별 redacted 운영 진단; snapshot 대체 아님 |
| POST | `/event-tickets` | 일회성 WebSocket ticket 발급 |
| GET | `/snapshot` | 권한 범위의 현재 projection |

`GET /capabilities` 응답 예:

```json
{
  "data": {
    "protocol": { "current": 1, "minimum": 1 },
    "runtime": {
      "kind": "codex_app_server",
      "version": "opaque-version",
      "compatible": true,
      "features": ["thread.fork", "turn.steer", "approval.permissions"]
    },
    "server": {
      "voice": ["transcript_input"],
      "notifications": ["mac_local", "web_push"],
      "orchestration": ["manual_parallel", "dag"]
    }
  },
  "meta": { "protocolVersion": 1, "requestId": "req_01...", "correlationId": "cor_01..." }
}
```

`GET /diagnostics`는 Codex/adapter version, capability, runtime connection, queue 상태, journal lag, notification channel health, 최근 stable error code를 제공한다. 로컬 `diagnostics:read`는 redacted 상세를, 원격 `view`는 요약만 받는다. prompt, command/output 전문, 절대 경로, token, secret answer, raw app-server payload는 반환하지 않는다. snapshot은 상태 복구용이며 diagnostics를 대체하지 않는다.

### 6.2 프로젝트와 세션

| Method | Path | Body / 의미 |
|---|---|---|
| GET | `/projects` | 등록 프로젝트 목록 |
| POST | `/projects` | 로컬에서만 path 등록; 원격 등록 금지 기본 |
| PATCH | `/projects/{projectId}/policy` | `expectedProjectRevision`으로 정책 변경 |
| GET | `/sessions` | cursor pagination, state/project 필터 |
| POST | `/sessions` | `CreateSessionCommand` |
| GET | `/sessions/{sessionId}` | session projection |
| POST | `/sessions/{sessionId}/turns` | `StartTurnCommand` |
| POST | `/sessions/{sessionId}/steer` | `SteerTurnCommand` |
| POST | `/sessions/{sessionId}/interrupt` | `InterruptTurnCommand` |
| POST | `/sessions/{sessionId}/forks` | `ForkSessionCommand` |
| GET | `/sessions/{sessionId}/turns` | turn 상태/요약 cursor 조회 |

```ts
interface UpdateProjectPolicyCommand {
  expectedProjectRevision: number;
  policy: ProjectPolicy;
  confirmationReceipt?: string;
}

interface CreateSessionCommand {
  projectId: string;
  expectedProjectRevision: number;
  name?: string;
  model?: string;
  execution:
    | { mode: "read_only"; worktree: "none" }
    | { mode: "write"; worktree: "managed" };
  initialInstruction?: InputContent[];
}

interface StartTurnCommand {
  input: InputContent[];
  expectedSessionRevision: number;
}

interface SteerTurnCommand {
  input: InputContent[];
  expectedTurnId: string;
  expectedSessionRevision: number;
}

interface InterruptTurnCommand {
  expectedSessionRevision: number;
  expectedTurnId: string;
  reason?: string;
}

interface ForkSessionCommand {
  expectedSessionRevision: number;
  name?: string;
  lastTurnId?: string;
  execution:
    | { mode: "read_only"; worktree: "none" }
    | { mode: "write"; worktree: "managed" };
  initialInstruction?: InputContent[];
}
```

daemon은 mutation을 받으면 upstream 호출보다 먼저 operation row를 기록한다. `turn/start`와 `turn/steer`의 `clientUserMessageId`는 `HMAC(machineKey, operationId + idempotencyKey + route)`로 결정적으로 만들고 adapter에 전달한다. 같은 명령 재시도는 같은 id를 사용한다. `thread/start` 응답이 유실된 경우 새 thread를 blind retry하지 않고 operation을 `outcome_unknown`으로 둔 뒤 thread list/read와 correlation 정보로 orphan을 reconcile한다.

`ForkSessionCommand.lastTurnId`는 upstream `thread/fork.lastTurnId`로 전달한다. source에 활성 turn이 있거나 지정한 turn이 source thread에 속하지 않으면 409로 거절한다.

P0 쓰기는 로컬·원격 모두 반드시 `worktree="managed"`다. 독립 Session의 `write+managed` 생성은 daemon이 Session 소유 worktree를 먼저 예약·생성한 뒤 그 정확한 cwd로 thread를 시작한다. Plan 실행 Session은 Task가 아니라 현재 TaskAttempt 소유 worktree를 사용한다. 두 경우 모두 Worktree projection의 `ownerType`/`ownerId`로 소유자가 닫힌다. worktree 실패 시 thread를 기본 checkout으로 우회하지 않는다. 원격 클라이언트가 임의 `cwd`, sandbox 문자열, approval policy 또는 `danger-full-access`를 body로 넘길 수 없다.

모든 mutation은 `Idempotency-Key`와 대상 aggregate의 현재 revision을 요구한다. Session 생성은 `expectedProjectRevision`, 기존 Session start/steer/interrupt/fork는 `expectedSessionRevision`, Task·Plan·Worktree·Queue·Device·NotificationPolicy·Approval·Attention mutation은 각각 대응하는 `expected...Revision`을 검증한다. machine `sequence`는 cursor이며 concurrency token으로 사용할 수 없다.

### 6.3 Plan과 Task

| Method | Path | 설명 |
|---|---|---|
| POST | `/plans` | 목표와 제약으로 `draft` 생성 |
| GET | `/plans/{planId}` | DAG와 상태 조회 |
| GET | `/tasks` | `planId`, `state`, `projectId`, cursor 필터 |
| POST | `/plans/{planId}/propose` | 분해기가 task/edge/artifact 초안을 제안 |
| PATCH | `/plans/{planId}` | `draft`, `proposed`, `editing`에서 task/edge 수정 |
| POST | `/plans/{planId}/validate` | cycle, policy, lane, artifact 계약 검사 |
| POST | `/plans/{planId}/freeze` | 검증된 정확한 revision을 불변 실행 후보로 고정 |
| POST | `/plans/{planId}/confirm` | frozen revision을 확인하고 실행 허용 |
| POST | `/plans/{planId}/cancel` | 미시작 task 취소, 실행 중 task는 정책대로 interrupt |
| POST | `/tasks/{taskId}/retry` | 재시도 가능 실패만 |
| POST | `/tasks/{taskId}/unblock` | 사용자가 새 입력/정책으로 차단 해제 |
| POST | `/tasks/{taskId}/cancel` | 실행 중 attempt interrupt 또는 미시작 Task 취소 |
| POST | `/worktrees/{worktreeId}/integrate` | 타입이 있는 통합 요청, 명시적 확인 |
| POST | `/worktrees/{worktreeId}/cleanup` | 변경 상태 검사 후 정리 |
| GET | `/worktrees` | `projectId`, `ownerType`, `state`, cursor 필터 |

```ts
interface CreatePlanCommand {
  projectId: string;
  expectedProjectRevision: number;
  goal: string;
  baseGitRevision: string | null;
  constraints: string[];
  maxParallelTasks: number;
}

interface EditPlanCommand {
  expectedPlanRevision: number;
  tasks: Array<Pick<Task, "id" | "title" | "instruction" | "mode" | "expectedScope" | "risk" | "humanCheckpoints" | "dependsOn" | "lane" | "expectedArtifacts" | "consumedArtifacts" | "completionCriteria" | "verification">>;
}

interface ProposePlanCommand { expectedPlanRevision: number }
interface ValidatePlanCommand { expectedPlanRevision: number }

interface FreezePlanCommand {
  expectedPlanRevision: number;
  validationId: string;
}

interface ConfirmPlanCommand {
  expectedPlanRevision: number;
  frozenHash: string;
  taskIds: string[];
}

interface CancelPlanCommand {
  expectedPlanRevision: number;
  reason: string;
}

interface MutateTaskCommand {
  expectedTaskRevision: number;
  reason?: string;
}

interface IntegrateWorktreeCommand {
  expectedWorktreeRevision: number;
  expectedProjectRevision: number;
  action: "cherry_pick" | "merge" | "patch_export";
  targetRef: string;
  confirmationReceipt: string;
}

interface CleanupWorktreeCommand {
  expectedWorktreeRevision: number;
  inspectionDigest: string;
  confirmationReceipt: string;
}
```

Plan 상태는 `draft → proposed ↔ editing → validated → frozen → confirmed → running → succeeded|failed|blocked|cancelled`다. canonical Plan document는 exact `baseGitRevision`, 모든 Task의 read/write scope, risk, 사람 checkpoint, produced/consumed artifact ref, completion criteria, verification spec을 포함한다. `validate`는 DAG cycle, dependency 존재, artifact producer/consumer, write task managed worktree, lane/동시성 정책을 검사한다. 독립 Task의 write scope가 겹치면 dependency/lane 없이는 실패하고, consumed artifact의 producer가 dependency ancestor가 아니거나 spec id가 없으면 실패한다. 수정하면 validation/freeze가 무효화된다. `freeze`는 이 전체 document hash와 base revision을 저장하고 이후 수정은 새 revision으로 되돌린다. `confirm` 요청에는 `expectedPlanRevision`, `frozenHash`, 전체 task id가 필요하며 다르면 실행하지 않는다.

Task 상태는 `queued → ready → dispatching → running → needs_input|succeeded|failed|cancelled`, 실패 dependency가 있으면 `blocked`다. confirmed plan에서만 `ready`가 가능하고, dependency가 모두 succeeded이며 lane lease와 동시성 slot을 확보해야 `dispatching`으로 간다. task lease와 operation을 먼저 저장한 뒤 session/worktree를 만든다.

| 현재 | 명령/조건 | 다음 | Attempt 규칙 |
|---|---|---|---|
| `queued` | confirmed Plan, 모든 dependency succeeded | `ready` | 첫 attempt는 dispatch 시 생성 |
| `queued`, `ready` | dependency 실패·정책/reconciliation 차단 | `blocked` | 기존 attempt가 있으면 보존 |
| `ready` | 세 scope composite lease 예약 | `dispatching` | 첫 실행이면 새 attempt 생성, retry/unblock이면 이미 생성한 reserved attempt 사용 |
| `dispatching` | worktree/Session/turn 연결 성공 | `running` | attempt `running`, source Session/Turn 기록 |
| `running` | blocking Approval/질문 | `needs_input` | 같은 attempt 유지, 기본 active slot release |
| `needs_input` | 모든 blocker resolved, resume composite lease 획득 | `running` | 같은 attempt 재개; nonblocking 질문은 이 전이를 만들지 않음 |
| `running` | 실행 종료 후 required verification 시작 | `running` | attempt만 `verifying` |
| `running` | 완료 조건과 모든 required verification 통과 | `succeeded` | result summary, changed files, sourceTurnId, artifact/result refs 확정 |
| `running` | 실행/검증 실패 | `failed` | 실패 attempt와 산출물 보존 |
| `failed` | 유효한 retry + `expectedTaskRevision` | `ready` | **반드시 새 attempt**; 이전 Session/worktree/result 보존 |
| `blocked` | 원인 해소 + 명시적 unblock + `expectedTaskRevision` | `ready` | **반드시 새 attempt**; dependency/policy를 재검증 |
| 비-terminal | cancel | `cancelled` | active turn interrupt, worktree 자동 삭제 금지 |

retry/unblock은 confirmed/frozen Plan revision이 그대로이고 dependency, scope/lane, ProjectPolicy, queue capability가 다시 유효할 때만 허용한다. `needs_input → running`은 새 attempt를 만들지 않지만 pending 질문/승인이 전부 해결되고 세 scope lease를 다시 얻기 전에는 전이하지 않는다.

artifact는 `id`, `producerTaskAttemptId`, `kind`, `contentHash`, `worktreeCommitOrBlobRef`, `redactedHandoffSummary`, `createdAt`을 가진다. 후속 task에는 DAG에 선언된 artifact와 handoff summary만 전달하며 원 대화나 secret answer를 자동 전달하지 않는다.

`VerificationSpec.templateId`는 ProjectPolicy의 allowlisted template만 가리킨다. daemon이 고정 executable과 schema 검증된 argv를 조합하며 remote가 raw shell, executable path, command string을 공급할 수 없다. 각 attempt는 모든 required verification의 `exitCode`, `durationMs`, `passed`, redacted output artifact를 기록하고 완료 조건을 만족하기 전에는 Task를 `succeeded`로 만들지 않는다.

managed worktree 명령은 DB에 예약한 canonical path와 Git common-dir identity의 정확한 일치를 요구한다. integrate는 target ref와 inspection digest를 보여 준 잠금 해제 UI receipt가 필수이고, 기본 브랜치 자동 merge/push는 금지한다. cleanup은 pristine 여부와 무관하게 잠금 해제 UI receipt가 필수이며 dirty, untracked, ignored 또는 아직 통합되지 않은 commit의 목록 digest를 receipt에 묶는다.

### 6.4 Durable queue API

| Method | Path | 설명 |
|---|---|---|
| GET | `/queues` | global/machine/project queue 상태와 한도 조회 |
| GET | `/queue-entries` | `queued`, `leased`, `running`, `paused` entry 조회 |
| POST | `/queues/{queueId}/pause` | 수동 pause |
| POST | `/queues/{queueId}/resume` | 원인 해소 후 resume |

```ts
interface PauseQueueCommand {
  expectedQueueRevision: number;
  reason: "manual";
}

interface ResumeQueueCommand {
  expectedQueueRevision: number;
  acknowledgedPauseReason: QueuePauseReason;
}
```

rate/usage-limit pause는 adapter 오류 분류가 같은 transaction에서 `queue.state_changed(to=paused)`를 기록한다. `resumeAfter` 전 자동 resume는 금지하며, manual resume도 현재 runtime capability/limit을 재검사한다. lease 발급·갱신·회수는 daemon 내부 명령으로만 수행하고 원격 API에 노출하지 않는다.

## 7. 타입이 있는 승인 API

조회와 응답 endpoint:

```text
GET  /approvals?state=<...>&kind=<...>&sessionId=<...>&cursor=<...>
POST /approvals/{approvalId}/responses
```

body는 `approval.kind`에 대응하는 discriminated union이어야 한다. daemon은 pending approval의 kind, revision, 허용 결정과 대조한다. generic `result: unknown`은 허용하지 않는다. 승인 응답의 upstream wire shape는 adapter만 생성한다.

### 7.1 명령 실행 승인

```ts
interface CommandApprovalRequest {
  kind: "command_execution";
  approvalId: string | null;
  executionKind: "command" | "writeStdin";
  commandPreview: string[];
  cwdDisplay: string;
  reason: string | null;
  networkTarget: { host: string; protocol: string; port: number | null } | null;
  availableDecisions: CommandDecision[];
  proposedAmendments: Array<{
    id: string;
    hash: string;
    kind: "exec_policy" | "network_policy";
    safeSummary: string;
  }>;
}

type CommandDecision =
  | "accept_once"
  | "accept_for_session"
  | "decline"
  | "cancel"
  | "apply_exec_policy_amendment"
  | "apply_network_policy_amendment";

interface CommandApprovalResponse {
  kind: "command_execution";
  decision: CommandDecision;
  expectedApprovalRevision: number;
  proposedAmendment?: { id: string; hash: string };
  confirmationReceipt?: string;
}
```

adapter 매핑:

- `accept_once` → upstream `accept`
- `accept_for_session` → `acceptForSession`
- `decline` → `decline`
- `cancel` → `cancel`
- `apply_exec_policy_amendment` → upstream이 제안한 정확한 값으로 `acceptWithExecpolicyAmendment`
- `apply_network_policy_amendment` → upstream이 제안한 정확한 값으로 `applyNetworkPolicyAmendment`

클라이언트는 daemon이 제시한 amendment `id`와 `hash`만 선택할 수 있고 새 policy 문자열/host/path를 만들 수 없다. daemon은 pending upstream 요청에서 id/hash가 일치하는 원 제안 payload를 찾아 wire response를 합성한다. upstream의 `approvalId`, `executionKind`, command와 writeStdin의 차이를 adapter가 보존하고 응답 schema가 요구하면 같은 `approvalId`를 되돌려준다. `accept_for_session`, exec/network amendment, network 접근 accept에는 `respond_elevated` device scope와 잠금 해제된 UI confirmation receipt가 필수다. network approval은 command preview 대신 정확한 target을 기준으로 설명하고 receipt digest에 묶는다.

### 7.2 파일 변경 승인

```ts
interface FileApprovalRequest {
  kind: "file_change";
  approvalId: string | null;
  reason: string | null;
  grantRoot: { pathId: string; pathDisplay: string } | null;
  changes: Array<{ pathDisplay: string; operation: "add" | "modify" | "delete" }>;
  availableDecisions: Array<"accept_once" | "accept_for_session" | "decline" | "cancel">;
}

interface FileApprovalResponse {
  kind: "file_change";
  decision: "accept_once" | "accept_for_session" | "decline" | "cancel";
  expectedApprovalRevision: number;
  confirmationReceipt?: string;
}
```

adapter는 각각 `accept`, `acceptForSession`, `decline`, `cancel`로 매핑한다. P0 managed write에서 worktree 밖 쓰기 `grantRoot`는 receipt 여부와 무관하게 거절한다. 삭제/대량 변경과 session 범위 수락은 `respond_elevated` scope와 UI confirmation receipt를 요구한다.

### 7.3 권한 승인

```ts
interface PermissionRequest {
  kind: "permissions";
  reason: string | null;
  cwdDisplay: string;
  requested: {
    network?: Array<{ host: string; protocol: string; ports?: number[] }>;
    fileSystem?: Array<{ pathId: string; pathDisplay: string; access: "read" | "write" }>;
  };
}

interface PermissionApprovalResponse {
  kind: "permissions";
  permissions: {
    network?: Array<{ host: string; protocol: string; ports?: number[] }>;
    fileSystem?: Array<{ pathId: string; access: "read" | "write" }>;
  };
  scope: "turn" | "session";
  strictAutoReview?: boolean;
  expectedApprovalRevision: number;
  confirmationReceipt?: string;
}
```

upstream wire response는 `{ permissions, scope, strictAutoReview? }`이며 별도 decision union이 없다. 거절은 빈 `permissions`와 `scope="turn"`으로 표현하되 지원 runtime fixture로 검증한다. `permissions`는 요청받은 권한의 부분집합이어야 한다. raw path 대신 request가 발급한 `pathId`를 회신한다.

network grant, Project/worktree root 밖 접근, `scope="session"`, `strictAutoReview=true`는 high-risk다. accept하려면 target이 ProjectPolicy의 정확한 allowlist에 있어야 하고 device가 `respond_elevated` scope를 가지며, 영향 digest에 묶인 잠금 해제 UI confirmation receipt를 매번 제출해야 한다. allowlist 밖 target은 receipt가 있어도 거절한다. P0 managed write의 파일 쓰기 root는 exact worktree 밖으로 절대 확장하지 않는다. 허용 가능한 out-of-root는 명시적으로 allowlist된 read-only 경로에 한정하며 turn scope만 허용한다.

### 7.4 사용자 질문

```ts
interface UserInputRequest {
  kind: "user_input";
  isBlocking: boolean;
  questions: Array<{
    id: string;
    prompt: string;
    required: boolean;
    secret: boolean;
    options?: Array<{ value: string; label: string }>;
  }>;
}

interface UserInputApprovalResponse {
  kind: "user_input";
  answers: Record<string, { answers: string[] }>;
  expectedApprovalRevision: number;
}
```

upstream response는 `{ answers }`만 허용한다. required question id와 option/free-form 제약을 만족해야 한다. 이 요청 자체에는 cancel 응답을 합성하지 않는다. 사용자가 질문을 취소하려면 별도 `turn/interrupt`를 호출하고 이후 `serverRequest/resolved`를 기다린다. `isBlocking=false` 질문은 세션을 막지 않는다. secret/form answer 값은 runtime 전달 뒤 폐기하고 field id와 redacted 제출 marker만 감사 기록에 남긴다.

### 7.5 MCP elicitation

```ts
interface ElicitationRequest {
  kind: "mcp_elicitation";
  mode: "form" | "openai_form" | "url";
  message: string;
  schema?: Record<string, unknown>;
  urlDisplay?: string;
}

interface ElicitationApprovalResponse {
  kind: "mcp_elicitation";
  action: "accept" | "decline" | "cancel";
  content: Record<string, unknown> | null;
  expectedApprovalRevision: number;
  confirmationReceipt?: string;
}
```

`accept`만 schema에 맞는 content를 가질 수 있다. adapter는 현재 upstream 호환성을 위해 응답에 `_meta: null`을 합성한다. side effect 또는 파괴적 annotation이 있는 MCP 호출은 UI confirmation receipt가 필수다. secret form answer는 저장하지 않는다.

### 7.6 명시적 확인

```text
POST /confirmation-challenges
POST /confirmation-challenges/{challengeId}/complete
```

challenge 생성 body는 `{ target: { type, id, revision }, action, impactDigest }`다. Approval이면 여전히 pending인지도 검사한다. 현재 device가 잠금 해제된 explicit UI interaction을 증명할 때만 생성한다. challenge는 target id/revision, `deviceId`, action, amendment 또는 inspection digest, risk ids에 바인딩되고 60초 이내 만료된다. 완료 endpoint는 1회성 opaque `confirmationReceipt`를 반환하며 typed mutation은 이 receipt를 제출한다. daemon은 receipt를 검증·소비한 뒤 재사용을 거절한다.

`Approval`에는 `explicitConfirmationRequired`만 저장하고 challenge/receipt secret을 넣지 않는다. 음성, background action, push action은 approval accept challenge를 생성/완료할 수 없다. 음성은 해당 UI로 이동시키거나 `decline`/`cancel`만 수행할 수 있다.

## 8. 이벤트 연결과 cursor

### 8.1 Ticket 발급

```http
POST /api/v1/event-tickets
Authorization: Bearer <short-lived-access-token>
Content-Type: application/json

{ "afterSequence": 4281 }
```

응답:

```json
{
  "data": {
    "ticket": "opaque-single-use-value",
    "expiresAt": "2026-09-07T03:04:35.678Z"
  },
  "meta": { "protocolVersion": 1, "requestId": "req_01...", "correlationId": "cor_01..." }
}
```

WebSocket 연결: `/api/v1/events?ticket=<opaque>`. ticket은 로그에서 redaction하고 첫 사용 즉시 폐기한다.

### 8.2 프레임 종류

- `snapshot`: 전체 projection과 `baseSequence`
- `event`: `PawdexEvent`
- `heartbeat`: server time과 latest sequence
- `flow_control`: 클라이언트가 너무 느릴 때 재연결 지시
- `ephemeral.delta`: replay되지 않는 출력 delta, durable sequence 없음
- `visibility.skip`: 권한 필터로 숨긴 durable sequence 구간을 payload 없이 건너뛰는 frame
- `error`: 연결 범위 오류

서버는 durable event를 sequence 순으로 보낸다. 클라이언트 ack는 `POST /devices/{deviceId}/cursors`로 비동기 저장하며 event 처리 자체를 막지 않는다.

global journal sequence는 gap-free지만 기기 권한 필터가 event 내용을 숨길 수 있다. 서버는 허용된 `event` 또는 `{ "type":"visibility.skip", "fromSequence":N, "toSequence":M }`를 보내 모든 global sequence를 연속으로 덮는다. skip frame에는 aggregate type/id, event type, timestamp 등 숨겨진 내용을 넣지 않는다. 클라이언트는 `toSequence`까지 cursor를 전진시키되 projection/revision을 바꾸지 않는다. relay에서는 이 frame도 E2EE application payload 안에 둔다.

느린 클라이언트 큐가 한도를 넘으면 메모리를 무한히 늘리지 않는다. `flow_control`에 마지막 안전 sequence를 넣고 연결을 닫아 snapshot/replay하게 한다.

## 9. 멱등성, 동시성, 재시도

### 9.1 Mutation

모든 mutation은 `Idempotency-Key`를 사용한다.

1. daemon은 `(actor_id, route, key)`와 canonical payload hash를 저장한다.
2. 같은 key와 같은 hash면 이전 status/response를 반환한다.
3. 같은 key와 다른 hash면 `IDEMPOTENCY_CONFLICT`를 반환한다.
4. 처리 중 연결이 끊겨도 클라이언트는 같은 key로 재시도한다.
5. daemon이 upstream에 명령을 보낸 뒤 결과가 불명확하면 새 turn을 만들지 않고 reconcile한다.

권장 보존 기간은 command 결과 24시간 이상이며 승인 response는 감사 보존 정책을 따른다.

secret input/form answer가 있는 명령은 값이나 값의 hash를 저장하지 않는다. canonical payload hash에는 field id와 `secret_submitted` marker만 넣고, operation response에도 값 대신 접수 여부만 남긴다. 전송 결과가 불명확하면 값을 자동 재전송하지 않고 runtime request 상태를 reconcile한다.

### 9.2 Optimistic concurrency

모든 mutable aggregate mutation은 해당 `expected...Revision`을 MUST 포함한다. Project, Session, Plan, Task, TaskAttempt(내부), Worktree, Queue, Device, NotificationPolicy, Approval, Attention이 대상이며 현재 revision과 다르면 409를 반환한다. 새 Session/Plan처럼 Project 정책을 소비해 생성하는 명령은 `expectedProjectRevision`을 검증한다. `steer`와 `interrupt`는 `expectedTurnId`도 검증한다. daemon 전역 event sequence는 이 검사를 대체할 수 없다.

### 9.3 재시도 분류

- GET, cursor replay: 자동 재시도 가능
- idempotency key가 있는 명령: 네트워크 오류 시 같은 key로 재시도 가능
- approval response: 같은 key로만 재시도, expired이면 중단
- runtime `turn/start`: upstream 수락 여부가 불명확하면 먼저 thread 상태 reconcile
- runtime `thread/start`: 결과가 불명확하면 orphan/reconcile하고 blind retry 금지
- worktree integrate/cleanup: 자동 재시도 금지, 실제 Git 상태 확인 후 사용자에게 결과 제시

## 10. 음성 명령 계약

초기 버전은 오디오 streaming 프로토콜을 고정하지 않고 transcript 기반 endpoint를 안정 계약으로 둔다.

```text
POST /voice/intents:parse
POST /voice/intents/{intentId}:confirm
POST /voice/intents/{intentId}:cancel
```

```ts
type VoiceIntent =
  | {
      type: "send_instruction";
      sessionId: string;
      expectedSessionRevision: number;
      route: "start" | "steer" | "queued_after_blocker";
      expectedTurnId: string | null;
      text: string;
    }
  | {
      type: "create_session";
      projectId: string;
      expectedProjectRevision: number;
      execution: { mode: "read_only"; worktree: "none" } | { mode: "write"; worktree: "managed" };
      text: string;
    }
  | {
      type: "fork_session";
      sessionId: string;
      expectedSessionRevision: number;
      lastTurnId: string;
      text: string;
    }
  | {
      type: "answer_question";
      sessionId: string;
      expectedSessionRevision: number;
      approvalId: string;
      expectedApprovalRevision: number;
      answers: Record<string, { answers: string[] }>;
    }
  | {
      type: "approval_response";
      sessionId: string;
      expectedSessionRevision: number;
      approvalId: string;
      expectedApprovalRevision: number;
      decision: "decline" | "cancel";
    }
  | {
      type: "interrupt";
      sessionId: string;
      expectedSessionRevision: number;
      expectedTurnId: string;
    }
  | { type: "status_query"; sessionId: string | null };
```

parse 시 alias를 실제 id로 resolve하고 그 시점의 Project/Session/Turn/Approval revision token을 intent에 고정한다. confirm 시 모든 token을 다시 검증하며 하나라도 stale이면 `STATE_CONFLICT`와 최신 projection을 반환하고 재해석·다른 target fallback을 하지 않는다. `create_session`도 `expectedProjectRevision` 없이 실행할 수 없다.

parse 입력:

```json
{
  "transcript": "치즈 세션에 테스트도 같이 돌리라고 해줘",
  "locale": "ko-KR",
  "context": {
    "foregroundSessionId": null,
    "attentionId": null
  }
}
```

parse 결과:

```json
{
  "data": {
    "intentId": "vin_01...",
    "intent": {
      "type": "send_instruction",
      "sessionId": "ses_01...",
      "expectedSessionRevision": 17,
      "route": "steer",
      "expectedTurnId": "trn_01...",
      "text": "테스트도 같이 실행해줘"
    },
    "risk": "safe",
    "state": "needs_confirmation",
    "expiresAt": "2026-09-07T03:05:05.678Z"
  },
  "meta": { "protocolVersion": 1, "requestId": "req_01...", "correlationId": "cor_01..." }
}
```

규칙:

- STT transcript와 intent를 구분하고 원문을 직접 runtime 명령으로 실행하지 않는다.
- 대상이 모호하면 `AMBIGUOUS_TARGET`과 후보 id/별칭만 반환한다.
- 모든 음성 mutation은 화면/음성 되읽기 후 confirm endpoint를 거친다.
- 세션이 `needs_input`이면 해당 approval id의 typed answer/decision만 blocker로 전달한다. 일반 follow-up은 명시적 `queued_after_blocker`로 저장하거나 409로 거절하며 blocker를 해제하지 않는다.
- 음성은 typed 사용자 질문 답변과 approval의 `decline`/`cancel`만 제출할 수 있다. 위험도와 무관하게 모든 approval `accept`는 잠금 해제된 UI로 이동시키며 음성으로 confirmation challenge/receipt를 생성하거나 완료하지 않는다. interrupt 같은 별도 제어 mutation은 대상/revision 확인 뒤 허용한다.
- 음성 endpoint는 raw shell, 임의 path, 임의 HTTP URL 실행 intent를 정의하지 않는다.

## 11. 알림 계약

알림의 원천은 session 상태 자체가 아니라 durable `attention`이다.

```ts
type AttentionKind = "needs_input" | "completed" | "failed" | "reconciliation_required";

interface Attention {
  id: string;
  sessionId: string;
  kind: AttentionKind;
  blocking: boolean;
  state: "open" | "acknowledged" | "resolved";
  title: string;
  safePreview: string | null;
  createdAt: string;
  revision: number;
}

type NotificationDeliveryState =
  | "queued"
  | "provider_accepted"
  | "device_acknowledged"
  | "opened"
  | "acted"
  | "failed"
  | "expired";

interface NotificationPolicy {
  id: string;
  deviceId: string;
  revision: number;
  immediateKinds: AttentionKind[];
  completedMode: "immediate" | "digest";
  quietHours: { start: string; end: string; timeZone: string } | null;
  escalationStages: Array<{ stage: number; delayMs: number; ttlMs: number }>;
  sound: "off" | "system_default" | "meow_soft" | "meow_attention" | "meow_failure";
}

interface Device {
  id: string;
  name: string;
  state: "active" | "offline" | "revoked";
  scopes: Array<"view" | "send_input" | "respond_safe" | "respond_elevated" | "control">;
  capabilities: string[];
  keyId: string;
  lastSeenAt: string | null;
  revision: number;
}

interface NotificationDelivery {
  id: string;
  deviceId: string;
  attentionId: string;
  policyRevision: number;
  stage: number;
  dedupKey: string;
  state: NotificationDeliveryState;
  expiresAt: string;
  revision: number;
}

interface UpdateNotificationPolicyCommand {
  expectedNotificationPolicyRevision: number;
  policy: Omit<NotificationPolicy, "id" | "deviceId" | "revision">;
}
```

blocking과 nonblocking 입력 요청 모두 `kind="needs_input"` Attention을 만들되 `blocking`으로 구분한다. `blocking=false`는 Session 상태를 `needs_input`으로 바꾸지 않으며 알림 정책이 별도로 억제할 수 있다.

endpoint:

| Method | Path | 설명 |
|---|---|---|
| GET | `/attentions` | `state`, `kind`, `sessionId`, cursor로 inbox 조회 |
| GET | `/devices` | scope/capability/state를 redaction해 조회 |
| GET | `/notification-deliveries` | `deviceId`, `attentionId`, `state`, cursor 필터 |
| POST | `/attentions/{id}/acknowledge` | `AcknowledgeAttentionCommand`; 실행 상태에는 영향 없음 |
| POST | `/devices/{id}/push-subscriptions` | `CreatePushSubscriptionCommand` |
| DELETE | `/devices/{id}/push-subscriptions/{subscriptionId}` | `DeletePushSubscriptionCommand` |
| PUT | `/devices/{id}/notification-policy` | quiet hours, kind, sound, privacy 설정 |

```ts
interface AcknowledgeAttentionCommand {
  expectedAttentionRevision: number;
}

interface CreatePushSubscriptionCommand {
  expectedDeviceRevision: number;
  subscription:
    | { channel: "web_push"; endpoint: string; p256dh: string; auth: string }
    | { channel: "apns" | "fcm"; providerToken: string; environment: "development" | "production" };
}

interface DeletePushSubscriptionCommand {
  expectedDeviceRevision: number;
}

interface RevokeDeviceCommand {
  expectedDeviceRevision: number;
  reason: string;
  confirmationReceipt: string;
}
```

세 명령 모두 `Idempotency-Key`가 필수다. create/delete는 path의 device/subscription 소유권과 `expectedDeviceRevision`을 검사한다. revoke는 잠금 해제된 로컬 UI receipt에 device id/revision/key fingerprint를 묶고 모든 subscription과 relay capability를 원자적으로 폐기한다. provider token과 Web Push auth material은 encrypted secret store에만 저장하고 event/snapshot에는 포함하지 않는다.

`acknowledged`와 `resolved`는 다르다. 알림을 눌러도 승인 요청은 해결되지 않는다. approval이 해결되거나 새 turn으로 attention 의미가 사라질 때만 `resolved`가 된다.

notification dedup key는 `deviceId + attentionId + policyRevision + stage`의 canonical encoding으로 계산한다. `stage`는 최초 전송 또는 escalation 단계다. 같은 key는 provider retry와 event replay에서도 한 delivery만 가진다. 상태는 `queued → provider_accepted → device_acknowledged → opened → acted` 또는 어느 단계에서든 `failed|expired`로 전이하며 이전 상태로 되돌리지 않는다.

public push provider payload 형식:

```json
{
  "version": 1,
  "wakeToken": "opaque-random-single-use-value"
}
```

`wakeToken`은 relay가 내부적으로 device mailbox에 매핑하는 짧게 만료되는 1회성 값이다. push payload는 완전 opaque wake-up이며 session 별칭, 상태, attention id, command, diff, prompt, preview, 안정적인 device 식별자를 push provider에 전달하지 않는다. 기기는 wake-up 후 relay에서 E2EE ciphertext를 가져와 로컬에서 복호화한다.

## 12. 버전과 기능 협상

### 12.1 Pawdex protocol

- URL major version(`/v1`)은 breaking 변경에만 올린다.
- 같은 major에서 필드는 optional additive 방식으로 추가한다.
- enum 추가를 모르는 클라이언트는 `unknown` UI로 안전하게 표시하고 destructive action을 제공하지 않는다.
- 필드 제거, 의미 변경, required 추가는 다음 major가 필요하다.
- event consumer는 모르는 event type을 journal cursor만 전진시키며 무시할 수 있어야 한다.

### 12.2 Runtime adapter

Codex app-server version은 Pawdex protocol version과 독립이다. daemon은 다음을 보고한다.

```ts
interface RuntimeDescriptor {
  kind: "codex_app_server";
  version: string;
  adapterVersion: string;
  compatibility: "supported" | "degraded" | "unsupported";
  capabilities: string[];
}
```

지원 범위 밖 runtime에서 mutation을 허용하지 않는 것이 기본이다. 읽기/진단만 가능한 `degraded` 모드는 명시적으로 표시한다. 실험적 app-server 기능은 Pawdex feature flag와 upstream capability가 모두 참일 때만 사용한다.

## 13. 인증과 기기 페어링

### 로컬 브라우저

- loopback 접근이어도 임의 웹사이트의 요청을 막기 위해 strict Origin allowlist와 CSRF token을 사용한다.
- 세션 cookie는 `HttpOnly`, `SameSite=Strict`다.
- CORS wildcard는 금지한다.
- daemon은 LAN/public address에 listen하지 않는다.

### 원격 기기

1. 로컬 daemon이 짧은 수명의 pairing challenge를 만든다.
2. 사용자가 QR/코드를 모바일에서 읽는다.
3. 양쪽 기기가 공개키와 device capability를 교환한다.
4. daemon 화면에서 device 이름/fingerprint를 확인한다.
5. device별 권한 scope와 revoke 가능한 credential을 발급한다.

relay를 사용하는 command/event body는 device key로 암호화한다. relay가 가진 routing token만으로 daemon 명령을 위조할 수 없어야 한다. 기기 해제는 새 명령을 즉시 차단하며 기존 장기 key rotation을 촉발한다.

## 14. 원격 relay와 E2EE

공개 P0의 최소 원격 경로는 다음 계약을 MUST 구현한다. daemon은 relay로 outbound WebSocket/HTTPS 연결만 만들며 relay가 daemon으로 inbound 연결하지 않는다.

### 14.1 페어링

로컬 daemon API:

```text
POST /api/v1/pairings
GET  /api/v1/pairings/{pairingId}
POST /api/v1/pairings/{pairingId}/confirm
POST /api/v1/devices/{deviceId}/revoke
```

1. daemon과 device는 선택된 보안 프로파일이 요구하는 identity/agreement key를 OS Keychain/Keystore에 만든다. 현재 검토 후보는 Ed25519 identity와 X25519 agreement key다.
2. `POST /pairings`는 5분 만료의 `pairingId`, one-time secret, daemon public keys, relay URL을 QR로 반환한다. secret 전문은 DB에 저장하지 않고 verifier만 저장한다.
3. device는 relay의 `POST /v1/pairings/{pairingId}/join`에 public keys와 secret proof를 제출한다.
4. daemon은 outbound relay stream으로 join을 받고 양쪽 key fingerprint와 device 이름을 **로컬 잠금 해제 UI**에 표시한다.
5. 사용자가 확인하면 양측은 외부 검토로 승인된 상호 인증 handshake(현재 후보: Noise XX 호환)를 통해 pairwise root key를 만들고 device capability/scope를 서명해 교환한다.
6. daemon이 confirm ciphertext를 relay mailbox에 쓰기 전까지 device는 command 권한을 얻지 않는다.

QR secret만 탈취한 공격자가 silent pairing하지 못하도록 로컬 UI fingerprint 확인은 생략할 수 없다.

### 14.2 Relay API

```text
POST /v1/mailboxes/{routingId}/messages
GET  /v1/mailboxes/{routingId}/messages?after=<relayCursor>
POST /v1/mailboxes/{routingId}/acks
GET  /v1/mailboxes/{routingId}/stream     # WebSocket upgrade
```

relay는 인증된 rotating `routingId`와 mailbox bearer capability만 이해한다. Pawdex session/attention/event id, 사용자 id, 프로젝트명, plaintext content를 알 수 없다. retention 만료 후 ciphertext를 삭제하며 delivery용 최소 timestamp/IP 로그도 짧게 보존한다.

### 14.3 암호문 envelope

```ts
interface RelayEnvelopeV1 {
  version: 1;
  routingId: string;
  messageId: string;
  keyId: string;
  counter: number;
  nonce: string;
  ciphertext: string;
}
```

ADR·외부 검토에 올릴 후보 프로파일은 X25519 key agreement, HKDF-SHA-256, XChaCha20-Poly1305 AEAD, Ed25519 device identity다. 이는 이 제안서만으로 확정되지 않으며 P0 원격 구현 전에 suite ID, 라이브러리, handshake transcript, rotation 규칙을 보안 ADR로 고정해야 한다. 직접 암호 primitive를 구현하지 않고 감사된 Noise/libsodium 계열 라이브러리를 사용한다. 선택된 프로파일은 `version`, `routingId`, `messageId`, `keyId`, `counter`를 AEAD associated data에 포함해야 한다. 송신 방향별 monotonic counter와 최근 message id window로 replay/reorder를 검증한다. counter 재사용 또는 rollback은 연결을 차단하고 재키한다. root key에서 daemon→device와 device→daemon 키를 분리하고 정기·기기해제·counter 이상 시 rotate한다.

복호화된 내부 메시지는 `{ protocolVersion, messageType, commandId|eventSequence, issuedAt, expiresAt, body }`다. mutation은 로컬 HTTP와 동일한 idempotency, revision, typed approval 검사를 통과해야 한다. E2EE는 권한 검사를 대체하지 않는다.

### 14.4 Push wake-up

relay는 mailbox에 새 ciphertext가 생기면 push provider에 짧게 만료되는 opaque 1회성 `wakeToken`만 보낸다. 모바일은 E2EE mailbox를 fetch해 로컬 복호화하기 전까지 알림 문구를 알 수 없다. push action에서 승인 accept를 수행하지 않는다.

## 15. 계약 테스트 요구사항

1. 각 event schema는 JSON Schema fixture와 round-trip test가 있어야 한다.
2. 새 upstream Codex 이벤트 매핑에는 상태 머신 전이/중복/역순 test를 추가한다.
3. 각 approval kind는 accept/decline/cancel/expired/replay test를 갖는다.
4. generic response endpoint와 raw shell endpoint가 route table에 없음을 보안 test로 확인한다.
5. cursor 경계, snapshot과 live 전환, 느린 consumer를 test한다.
6. mutation마다 idempotency same-payload/different-payload/crash-after-upstream test를 둔다.
7. OpenAPI breaking-change checker를 CI에 둔다.
8. 지원하는 app-server 버전마다 생성 schema diff와 recorded fixture replay를 수행한다.
9. unknown notification safe-ignore와 unknown server request fail-closed/error-response/reconcile를 구분해 검사한다.
10. E2EE known-answer, replay/counter rollback, key rotation, revoked device, relay plaintext 비노출을 검사한다.
11. secret user-input/form answer가 DB, event, log, push에 남지 않는지 검사한다.
12. 두 개 이상의 blocking request에서 하나의 `serverRequest/resolved`가 다른 blocker를 지우지 않는지, nonblocking user input이 세션을 멈추지 않는지 검사한다.
13. managed worktree의 canonical path/common-dir mismatch 거절과 dirty/untracked/ignored/unintegrated cleanup challenge를 검사한다.
14. Plan edit가 validation/freeze를 무효화하고 cycle/artifact/lane invariants를 위반한 task가 dispatch되지 않는지 검사한다.
15. `needs_input` 중 음성 일반 지시가 blocker를 해제하지 않고 어떤 approval accept challenge도 생성할 수 없는지 검사한다.

## 16. 구현 전 결정 사항

- ephemeral delta rolling buffer를 어느 크기까지 둘지
- 원격 클라이언트에 노출할 path/command preview redaction 수준
- 잠금 해제 UI confirmation challenge의 플랫폼별 attestation 방식
- approval이 여러 개일 때 우선순위와 알림 묶음 규칙
- session/turn terminal 상태와 Codex의 실제 enum 사이 최종 매핑
- event 보존 기간과 snapshot 압축 정책
- 오디오 streaming이 필요할 경우 WebRTC/WebSocket 중 선택 및 별도 protocol version

위 사항이 미정이어도 raw upstream payload 비노출, typed approval, cursor/idempotency, loopback 기본 원칙은 바뀌지 않는다.
