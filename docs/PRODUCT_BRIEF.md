# Pawdex 제품 기획서

> 문서 상태: Draft v0.1
>
> 제품 단계: 구현 착수 전 기획·검증 단계
>
> 제품명: `Pawdex`는 가칭이며 변경 가능
>
> 범위 원칙: 이 문서는 기능과 운영 방식을 정의한다. 화면 동작과 정보 구조는 [Figma의 `Pawdex — Product UX` 페이지](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)를 승인된 구현 기준으로 사용하며, 시각 브랜드는 검증에 따라 발전할 수 있다.

## 1. 한 줄 정의

Pawdex는 여러 Codex 작업을 안전하게 병렬 실행하고, 사람의 판단이 필요한 순간을 모바일과 Mac으로 알려 주며, 사용자가 음성으로 다음 지시를 이어갈 수 있게 하는 오픈소스·로컬 우선 작업 제어 도구이자 개발 하네스다.

Pawdex의 핵심은 “Codex를 원격으로 보는 화면”이 아니라 다음 세 가지다.

1. 여러 작업의 실행, 의존성, 격리를 관리하는 오케스트레이터
2. 완료·실패·승인·질문을 놓치지 않게 모으는 Attention Inbox
3. 알림과 음성을 안전한 Codex 입력·질문 답변·승인 거절/취소로 바꾸는 라우터

## 2. 해결하려는 문제

사용자가 AI에게 긴 작업을 맡긴 뒤에도 작업 상태를 확인하려고 화면과 터미널을 반복해서 오간다. 여러 세션을 동시에 돌리면 기술 숙련도와 관계없이 다음 문제가 더 커진다.

- 어떤 세션이 실행 중이고 어떤 세션이 질문이나 승인을 기다리는지 한눈에 알기 어렵다.
- 작업 완료를 늦게 알아차려 다음 지시가 수십 분씩 지연된다.
- 같은 저장소에서 여러 세션이 파일을 동시에 수정하면 변경이 충돌하거나 작업 디렉터리가 오염될 수 있다.
- 휴대폰에서 짧은 후속 지시를 내리기 위해 전체 개발 환경에 위험한 원격 셸 접근을 열고 싶지는 않다.
- 음성 입력은 편하지만 어느 세션에 어떤 의미로 전달되는지 불명확하면 잘못된 실행을 일으킬 수 있다.
- 앱 재시작이나 네트워크 단절 뒤 이벤트를 놓치면 상태를 신뢰할 수 없다.

## 3. 대상 사용자

### 3.1 1차 사용자

- 코드를 직접 다루지 않더라도 문서, 조사, 콘텐츠, 운영 작업을 Codex에 맡기고 쉬운 언어로 진행 상황과 다음 행동을 확인하려는 사용자
- 한 컴퓨터에서 2개 이상의 Codex 작업을 자주 병렬 실행하는 개인 개발자
- 구현, 테스트, 문서화, 리팩터링을 AI에게 위임하고 중간 승인만 처리하려는 개발자
- 소파나 침대, 다른 방에서도 긴 작업을 이어가고 싶은 개발자
- 로컬 코드와 명령 실행 권한을 외부 SaaS에 그대로 위임하고 싶지 않은 보안 민감 사용자
- Codex 위에 팀 또는 프로젝트 전용 하네스를 개발하려는 오픈소스 기여자

### 3.2 후속 사용자

- 여러 저장소에서 작업하는 소규모 개발팀
- CI, 이슈 트래커, 코드 리뷰를 작업 그래프에 연결하려는 플랫폼 엔지니어
- Codex 이외의 에이전트 런타임도 같은 Attention 모델로 관리하려는 하네스 제작자

### 3.3 공통 UX 요구

- 첫 화면은 `무엇이 진행 중인지`, `무엇이 나를 기다리는지`, `다음에 무엇을 누르면 되는지`를 일상 언어로 보여 준다. 비개발자는 DAG, worktree, revision 같은 내부 개념을 몰라도 핵심 흐름을 완료할 수 있어야 한다.
- 상세 로그, diff, OID, 사용량 snapshot freshness, 실행 정책은 개발자가 필요할 때 펼쳐 보는 progressive disclosure로 제공한다. 별도의 “초보/전문가 모드”를 요구하지 않는다.
- 위험한 동작은 대상과 결과를 명확히 다시 보여 주고 인증된 UI action을 요구한다. 음성은 전사문·대상·의도를 확인한 뒤 전달하며 승인 수락을 대신하지 않는다.
- 상태는 색, 아이콘, 텍스트를 함께 사용한다. 키보드 전용 조작, 가시적인 포커스, 스크린 리더 이름과 순서, 충분한 대비, 최소 44px 터치 목표, 자막·전사문, 소리·진동의 시각적 대체 신호를 제품 기준으로 삼는다.
- 사용자가 선택한 reduced motion, 조용한 시간, 알림음 설정을 존중하고 고양이 표현은 중요한 상태를 가리거나 유일한 상태 신호가 되지 않는다.

## 4. 핵심 사용자 과업(JTBD)

| ID | 사용자가 원하는 일 | 성공한 상태 |
| --- | --- | --- |
| JTBD-01 | 자리를 비워도 Codex가 멈춘 순간을 즉시 알고 싶다 | 완료, 실패, 질문, 승인 요청이 올바른 기기로 전달된다 |
| JTBD-02 | 휴대폰에서 짧게 말해 다음 작업을 이어가고 싶다 | 음성이 대상 세션과 실행 의미를 확인한 뒤 올바른 턴에 전달된다 |
| JTBD-03 | 큰 일을 여러 독립 작업으로 나눠 동시에 처리하고 싶다 | 의존성과 동시성 한도에 맞춰 세션이 실행되고 쓰기 작업은 격리된다 |
| JTBD-04 | 승인 때문에 멈춘 작업을 안전하게 처리하고 싶다 | 명령, 파일, 권한, 질문 유형별 정보와 선택지만 노출된다 |
| JTBD-05 | 연결이 끊겨도 현재 상태를 믿고 싶다 | 재연결 후 누락 이벤트를 복구하고 중복 알림을 만들지 않는다 |
| JTBD-06 | 내 워크플로에 Pawdex를 끼워 넣고 싶다 | 안정된 이벤트 계약과 CLI/API를 통해 확장할 수 있다 |
| JTBD-07 | 같은 문제의 여러 해법을 공정하게 비교하고 싶다 | 동일한 기준과 예산으로 격리 실행한 후보의 diff·검증 결과를 보고 직접 선택한다 |
| JTBD-08 | AI가 만든 diff에 정확한 수정 피드백을 주고 싶다 | 줄에 고정한 여러 코멘트를 하나의 구조화된 후속 지시로 전달하고 재검토한다 |
| JTBD-09 | reset이 가까운 남은 사용량을 가치 있는 backlog에 쓰고 싶다 | 미리 고른 큐와 안전 상한을 한 번 확인해 실행하고, reset 전 목표 사용률 범위 또는 안전 중지 조건에서 멈춘다 |

## 5. 제품 포지셔닝

### 5.1 기존 선택지와의 관계

Codex는 자체적으로 Remote, Voice, Pets, Notifications 같은 사용자 기능을 제공하며, App Server는 스레드, 턴, 항목, 승인, 사용자 질문을 통합 제품이 제어할 수 있는 인터페이스로 제공한다. Pawdex는 이 기능을 대체한다고 주장하지 않는다. 여러 저장소·작업의 그래프 실행, 로컬 우선 운영, 공급자 어댑터, 감사 가능한 이벤트 기록을 원하는 개발자를 위한 별도 하네스 계층을 만든다.

[Happy](https://github.com/slopus/happy)는 모바일·웹·데스크톱에서 코딩 에이전트 세션을 원격으로 이어가는 오픈소스 선례다. Pawdex는 원격 접속 경험 자체보다 Codex App Server 기반 상태 정확성, 안전한 병렬 작업 그래프, typed approval, 고양이 알림 규칙에 우선순위를 둔다.

[Orca](https://github.com/stablyai/orca)는 여러 CLI 에이전트, worktree, 터미널, 편집기, 브라우저, 모바일과 원격 실행까지 하나의 ADE로 묶은 선행 제품이다. Pawdex는 Orca의 worktree lifecycle, comparative run, 세션 복원, diff feedback과 공식 문서상 experimental인 durable orchestration 패턴을 참고하지만 전체 IDE·PTY·SSH 제품이 되지는 않는다. 특히 worktree를 OS sandbox로 간주하거나 agent approval/sandbox를 기본 우회하는 정책은 채택하지 않는다.

| 영역 | Codex 기본 경험 | Happy에서 참고할 점 | Pawdex의 초점 |
| --- | --- | --- | --- |
| 단일 세션 원격 사용 | 기본 제품 기능 활용 | 다양한 클라이언트와 세션 연속성 | 최소 구현, 기존 기능과 경쟁하지 않음 |
| 여러 작업의 의존성 | 제품 버전에 따라 가능한 기능을 그대로 사용 | 여러 에이전트 연결 경험 | 명시적 DAG, 동시성, worktree 격리, 통합 게이트 |
| 사람의 개입 | 기본 알림과 승인 흐름 활용 | 모바일 알림과 원격 제어 | 모든 세션을 합친 Attention Inbox와 전달 보장 |
| 음성 | 기본 Voice가 맞는 사용자에게는 그대로 권장 | 원격 음성 아키텍처 참고 | 세션·턴·요청 ID에 결합된 안전한 의도 라우팅 |
| 확장성 | Codex 계약에 맞춤 | 오픈소스 구조 참고 | 런타임 어댑터, 버전 계약 테스트, 로컬 API |
| 보안 | Codex 권한 모델을 존중 | E2EE 설계 참고 | 원격 셸 금지, 최소 정보 relay, 명시적 고위험 승인 |

Orca와의 세부 비교 및 채택/보류 결정은 [REFERENCE_REVIEW.md](./REFERENCE_REVIEW.md)에 기록한다.

### 5.2 제품 약속

“Pawdex가 조용하면 놓친 일이 없고, 울면 어떤 세션이 왜 사람을 기다리는지 바로 알 수 있다.”

## 6. 제품 원칙

1. **로컬 우선**: daemon과 코드 실행은 사용자의 컴퓨터에서 동작한다. P0 listener는 loopback에만 bind하고 원격은 outbound E2EE relay로 연결한다.
2. **원격 셸 금지**: 원격 클라이언트에는 임의 명령 실행 API를 제공하지 않는다. 허용된 세션 동작과 typed approval만 제공한다.
3. **상태는 이벤트에서 파생**: 화면 추측이나 로그 문자열이 아니라 App Server의 버전된 이벤트 계약을 사용한다.
4. **Attention은 전달 가능한 데이터**: 모든 개입 항목은 고유 ID, 세션, 턴, 원인, 처리 상태를 가지며, 연결된 Approval의 만료와 별도로 관리된다.
5. **자동화 전에 격리**: 쓰기 가능한 병렬 작업은 기본적으로 서로 다른 worktree를 사용한다.
6. **음성은 편의 입력이지 권한 우회가 아님**: 모호한 지시는 확인하며, 파괴적·권한 상승 승인의 수락은 음성 발화 횟수와 무관하게 잠금 해제된 인증 UI의 명시적 action으로만 가능하다.
7. **알림 피로를 제품 결함으로 취급**: durable Attention과 기기·정책 단계 조합당 한 번만 알리고, 조용한 시간과 제한된 escalation을 적용한다.
8. **복구 가능성 우선**: 프로세스와 네트워크가 중단되어도 journal과 snapshot으로 상태를 재구성한다.
9. **공급자 종속은 어댑터 안에 격리**: Codex 전용 코드는 `apps/daemon/src/codex` 아래에 둔다.
10. **단순한 기본 흐름, 필요할 때 세부정보**: 승인된 Figma 제품 UX 초안의 정보 구조를 구현 기준으로 삼고, 일상 언어의 핵심 행동을 먼저 보여 준 뒤 기술 세부정보를 점진적으로 공개한다.
11. **사용량보다 유용한 결과가 우선**: reset 전 활용 모드는 사용자가 미리 선택한 가치 있는 큐만 실행한다. 목표를 채우기 위한 filler·중복 작업을 만들거나 정확한 100% 소진을 약속하지 않는다.
12. **접근성은 완료 조건**: 상태와 행동을 색이나 소리에만 의존하지 않으며 키보드, 스크린 리더, 대비, 터치 목표, reduced motion을 화면 구현과 테스트의 승인 기준에 포함한다.

## 7. 핵심 도메인 개념

| 개념 | 정의 |
| --- | --- |
| Machine | Codex App Server와 Pawdex daemon이 실행되는 한 대의 개발 컴퓨터 |
| Project | daemon에 미리 등록된 로컬 실행 경계. 하나의 workspace root와 ProjectPolicy를 가지며 `projectId`로 선택한다 |
| workspace root | Project가 가리키는 실제 로컬 디렉터리. 원격 클라이언트가 임의 `cwd`로 지정하는 API 리소스가 아니다 |
| Session | 하나의 Codex thread에 대응하는 Pawdex 작업 채널 |
| Turn | 사용자의 한 요청과 이에 따른 Codex 실행 단위 |
| Plan / Task | Plan은 확인 전·실행 중인 DAG 전체이고, Task는 확인된 Plan 안에서 목표·입력·의존성·결과를 갖는 안정된 실행 노드다 |
| TaskAttempt | 한 Task의 한 번의 구체적 실행 시도. 재시도마다 새 ID를 사용해 이전 시도의 늦은 완료·실패 신호가 현재 결과를 덮지 못하게 한다 |
| Artifact / Checkpoint | Artifact는 의존 Task가 commit/tree/checksum으로 고정해 전달하는 결과이고, Checkpoint는 다음 단계 전 정책 또는 사람의 결정을 기다리는 durable gate다 |
| RunBudget | Task 수·DAG 깊이·attempt 수·벽시계 시간·동시 resident process·output·disk에 적용하는 실행 hard cap. provider가 신뢰 가능한 값을 주는 경우에만 token/cost도 포함한다 |
| UsageWindowPreset / Run | Preset은 선택 queue, 목표 사용률 범위, reserve, reset 전 launch 중지 시각, 동시성·비용 상한을 로컬 관리자가 미리 고정한 P1 정책이다. Run은 최신 provider snapshot과 해당 preset revision에 결박한 한 번의 실행이다 |
| Worktree | 쓰기 가능한 Task를 다른 Task와 격리하는 Git 작업 디렉터리 |
| Approval | 명령·파일·권한·사용자 질문·MCP elicitation을 method별 타입으로 정규화한 응답 대상 |
| Attention Item | Approval, 완료, 실패, 상태 재조정 필요처럼 사람의 인지가 필요한 durable 사건 |
| Device | 알림을 받고 음성 또는 텍스트 지시를 보내는 Mac, 모바일, 브라우저 클라이언트 |
| Relay | 선택적 원격 모드에서 암호화된 메시지를 전달하되 코드와 평문을 보지 않는 중계 계층 |

Session의 정규 상태는 `starting`, `ready`, `running`, `needs_input`, `completed`, `failed`, `interrupted`, `offline`이다. Pawdex의 `completed`는 “가장 최근 턴이 정상 종료됨”을 뜻할 뿐 작업 목표가 검증되었다는 의미가 아니다. 스파이크의 `idle`과 `stopped`는 각각 `ready`와 `interrupted`로 migration하며 목표 프로토콜에서는 내보내지 않는다.

## 8. 목표와 비목표

### 8.1 MVP 목표

- 한 Machine에서 여러 Codex Session을 생성, 재개, 중단하고 동시에 관찰한다.
- 준비, 실행 중, 입력 필요, 완료, 실패, 중단, 연결 끊김을 신뢰할 수 있는 상태 머신으로 표현한다.
- 질문과 명령·파일·권한 승인 요청을 Attention Inbox에 모은다.
- Mac과 모바일에 상태 알림을 보내고 세션으로 바로 돌아갈 수 있게 한다.
- 사용자가 선택한 고양이 소리 정책을 지원 가능한 채널에서 재생한다.
- 모바일의 push-to-talk 음성을 텍스트와 실행 의도로 변환해 정확한 세션에 전달한다.
- 큰 작업을 제안된 Task DAG로 분해하고, 확인된 그래프를 동시성 한도와 의존성에 맞춰 실행한다.
- 쓰기 Task는 worktree로 격리하고 결과 통합 전 충돌과 테스트 상태를 보여준다.
- daemon 재시작과 네트워크 재연결 뒤 상태와 미처리 Attention Item을 복구한다.
- 로컬 API, 이벤트 프로토콜, 테스트 fixture를 공개해 하네스 확장을 쉽게 한다.
- 데스크톱과 모바일의 핵심 화면은 승인된 Figma 제품 UX 초안의 흐름·정보 우선순위와 접근성 기준을 따른다.

### 8.2 MVP 비목표

- 최종 시각 브랜드, 캐릭터 일러스트, 정교한 애니메이션과 마케팅 표현 확정
- IDE 또는 터미널 전체를 원격 데스크톱처럼 제공
- 터미널 split, Monaco 편집기, 내장 브라우저·Design Mode를 포함하는 범용 ADE 구축
- 임의 셸 명령을 모바일에서 직접 실행
- 모바일 raw terminal, 임의 keystroke 전달, 범용 stage/commit·포트 포워딩
- 사용자의 확인 없이 충돌을 자동 해결하거나 기본 브랜치에 병합
- 항상 켜진 웨이크 워드 또는 백그라운드 상시 녹음
- 모든 모바일 OS에서 동일한 커스텀 알림음을 보장
- 조직용 RBAC, SSO, 감사 보존 정책, 다중 사용자 공동 제어
- Codex 기본 Remote·Voice·Notifications 경험을 그대로 복제
- 첫 릴리스부터 모든 AI 에이전트 공급자를 지원
- 여러 Codex 자격증명 디렉터리를 복제하거나 계정을 자동 전환해 사용량 제한을 우회
- reset 전 사용량을 채우기 위해 새 filler·중복 작업을 만들거나, reset credit·유료 credit·overage를 자동 소비해 실행을 연장
- provider 집계 지연과 작업별 편차를 무시하고 “남은 token을 정확히 100% 사용”한다고 보장

## 9. 핵심 사용자 여정

### 9.1 자리를 비운 동안 완료 또는 입력 요청

1. 사용자가 Mac에서 3개 세션에 작업을 맡긴다.
2. Pawdex는 App Server 이벤트를 session/turn/approval/event ID와 함께 journal에 기록한다. upstream JSON-RPC request ID는 adapter 내부에만 둔다.
3. 한 세션이 질문을 보내면 상태를 `needs_input`으로 전환하고 Attention Item을 한 번 생성한다.
4. 알림 정책 엔진이 조용한 시간, 중복, 기기 가용성을 평가한다.
5. 휴대폰 또는 Mac에 “어느 작업이 무엇을 기다리는지” 최소 정보 알림이 도착한다.
6. 사용자가 알림을 열어 Approval ID에 답하면 daemon이 내부 upstream request ID에 매핑하고, 해결 이벤트를 받은 뒤 Inbox에서 닫는다.

### 9.2 음성으로 후속 작업 지시

1. 사용자가 특정 세션을 연 뒤 push-to-talk로 “테스트 실패 원인을 고치고 다시 돌려”라고 말한다.
2. 클라이언트가 전사문, 신뢰도, 대상 세션을 보여 주거나 읽어 준다.
3. 세션이 `ready`, `completed`, `failed`, `interrupted`이면 새 `turn/start`, `running`이면 확인된 active turn에 `turn/steer`로 보낸다. `offline`에서는 재조정 전 전송하지 않는다.
4. 대상 또는 의미가 모호하면 실행하지 않고 선택을 요청한다.
5. 서버가 수락한 turn ID를 반환한 뒤에만 “전달됨”으로 표시한다.

### 9.3 큰 작업 자동 분할

1. 사용자가 목표와 미리 등록된 Project를 지정하고 “병렬로 나눠 줘”라고 요청한다.
2. Planner가 Task, 입력, 산출물, 의존성, 쓰기 범위와 로컬 관리자가 미리 등록한 `verificationTemplateId` 및 typed 인자를 제안한다. Planner와 원격 클라이언트는 검증 템플릿을 만들거나 바꿀 수 없다.
3. Pawdex는 예상 충돌, resource claim, source tree OID, `RunBudget`을 검사하고 사용자가 확인한 Plan revision을 동결한다.
4. 독립 쓰기 Task마다 worktree와 브랜치를 만들고, 필요한 lease를 획득한 `ready` Task에 고유 `TaskAttempt`를 발급해 실행한다.
5. 선행 Task가 실패하거나 입력을 기다리면 의존 Task는 시작하지 않는다. 성공한 선행 결과는 commit/tree/checksum으로 고정된 Artifact로만 materialize하며 fan-in 충돌은 Attention으로 막는다.
6. 완료 결과를 동결된 source tree OID와 allowlisted verification template로 검증하고 integration Task를 실행한다. 병합·삭제처럼 파괴 가능성이 있는 단계는 잠금 해제된 인증 UI에서 사용자가 명시적으로 승인한다.

### 9.4 연결 또는 daemon 재시작

1. 각 이벤트는 단조 증가 sequence와 event ID로 journal에 기록된다.
2. 클라이언트는 마지막으로 확인한 sequence 이후 이벤트를 요청한다.
3. 보존 범위를 벗어났다면 daemon이 authoritative snapshot을 보내고 클라이언트가 로컬 상태를 교체한다.
4. 미해결 Approval은 App Server와 재조정한다. 이미 해결된 요청에 대한 늦은 응답은 거부한다.
5. 알림 발송 기록으로 같은 상태 전환을 다시 울리지 않는다.

### 9.5 한 버튼으로 reset 전 작업 큐 실행(P1)

1. 사용자는 평소에 가치가 독립적으로 검증된 Task만 전용 queue에 넣고, 목표 사용률 범위·reserve·reset 전 launch buffer·동시성·비용 상한을 `UsageWindowPreset`으로 로컬에서 저장한다.
2. Pawdex는 Codex App Server의 최신 rate-limit bucket(`usedPercent`, `windowDurationMins`, `resetsAt`)과 로컬 실행 이력으로 각 Task의 사용량·시간을 `min/likely/max` 범위와 confidence로 예측한다.
3. 사용자가 잠금 해제된 인증 UI의 단일 실행 action을 누르면, daemon은 현재 snapshot·preset/queue/Project revision·예측 요약·user-presence receipt에 결박한 idempotent `UsageWindowRun`을 만든다. 원격 시작은 별도 capability가 있는 폐기되지 않은 paired device만 가능하고 preset·queue 편집은 계속 로컬 전용이다. snapshot이 stale/unknown이거나 조건이 바뀌었으면 실행 대신 새 preview를 요구한다.
4. scheduler는 이미 확인·동결되어 `ready`인 Task만 기존 lease, `RunBudget`, Checkpoint, Approval 규칙으로 시작하고 각 attempt 완료 또는 rate-limit 갱신 뒤 예측을 다시 계산한다.
5. 목표 범위 도달, 큐 소진, reset 시각 변경, launch buffer 진입, stale usage, blocker/실패 임계값, 비용 위험 또는 사용자 취소 중 하나가 발생하면 새 작업 시작을 멈추고 결과·남은 큐·중지 이유를 Attention으로 남긴다. 실행 중 작업은 토큰을 맞추려고 강제 중단하지 않는다.

## 10. 출시 범위

### 10.1 P0: 공개 가능한 MVP

- Codex App Server 어댑터와 버전 호환성 검사
- 로컬에서 등록한 Project와 ProjectPolicy 기반 실행 경계
- 다중 Session 생성·재개·중단·상태 관찰과 global/Machine/Project별 durable 실행 queue·동시성 제한
- Attention Inbox와 typed question/approval 응답
- 이벤트 journal, snapshot, sequence 기반 재연결
- Mac 로컬 알림과 기기 페어링·E2EE relay 이후 활성화하는 설치형 웹 클라이언트의 표준 Web Push
- 공개 P0에 포함하되 사용자 opt-in으로 켜는 outbound E2EE relay 외부 연결과 기기 페어링
- push-to-talk 음성 전사, 대상 확인, follow-up/steer 및 pending 사용자 질문 answer 라우팅
- 사용자가 확인한 Task DAG, 동시성 제한, worktree 격리
- 충돌 감지, allowlisted verification template 실행 결과, 사용자가 확인하는 typed cherry-pick/merge/patch-export 수동 통합 게이트
- 이벤트 WebSocket/HTTP API와 로컬 CLI
- 고양이 알림 프리셋과 지원 채널의 야옹 소리

P0의 “야옹 소리”는 채널 capability에 따라 동작한다. 웹 푸시나 운영체제가 커스텀 사운드를 허용하지 않으면 기본 시스템 알림음, 진동, 앱을 연 상태의 인앱 사운드로 폴백한다. 모든 모바일 환경에서 커스텀 소리를 보장한다는 약속은 하지 않는다.

### 10.2 P1: 베타 확장

- iOS/Android/macOS 네이티브 companion으로 더 안정적인 background delivery와 커스텀 사운드
- 여러 Machine과 여러 Project 통합 Inbox
- 상태 요약 TTS와 한국어·영어 등 다국어 명령 템플릿
- 조건부 자동 계획 실행과 정책 기반 재시도
- GitHub 이슈·PR·CI 어댑터
- cross-Machine quota, 비용·시간 예산, 고급 scheduling 정책
- 동일한 frozen task/base를 여러 후보에 실행하는 comparative run과 사용자가 고르는 winner 통합
- line-anchored diff 코멘트의 batch feedback·재검토 루프
- 최근 turn이 완료되고 idle window가 지났으며 resumable이고 해당 Session에 active control lease·pending Approval·unsettled TaskAttempt/subagent가 없을 때의 hibernation/warm resume, 그리고 provider usage·rate-limit 가시성
- `UsageWindowPreset`으로 미리 선택한 큐를 reset 전 목표 사용률 범위까지 한 번에 실행하는 `UsageWindowRun`; 정확한 소진, 자동 결제·reset credit 소비, 계정 전환은 제외

### 10.3 P2: 팀·생태계

- 다중 사용자, 역할, 조직 정책, SSO
- 승인 위임과 감사 보존
- 공급자 중립 agent adapter SDK
- Task Graph 템플릿과 커뮤니티 registry
- 항상 듣기 기능은 별도 명시 동의, 로컬 wake word, 플랫폼 정책 검증 후에만 검토
- SSH/원격 실행 host, 포트 포워딩, 다중 provider federated worker는 별도 위협 모델과 제품 검증 뒤 검토

## 11. 성공 지표와 품질 목표

### 11.1 핵심 지표

- **Attention 발견 시간**: `needs_input`/`completed` 발생부터 사용자가 인지하기까지의 중앙값
- **개입 대기 시간 감소**: Pawdex 미사용 기준 대비 질문·승인 대기 시간 감소율
- **병렬 작업 성공률**: 실행된 DAG 중 격리 위반 없이 검증 게이트까지 도달한 비율
- **원격 후속 성공률**: 모바일 지시가 의도한 세션과 턴에 한 번만 전달된 비율
- **복구 신뢰도**: 강제 재시작·네트워크 단절 테스트에서 누락 또는 중복 Attention Item이 없는 비율
- **활성 사용**: 주당 2개 이상 동시 세션을 실행한 활성 설치 수와 재사용률
- **Usage Window 유효 결과율(P1)**: 실행한 Task 중 중복·filler 없이 원래 큐의 수용 기준을 통과한 비율과 안전 중지 조건 준수율

### 11.2 MVP 품질 게이트

| 항목 | 목표 |
| --- | --- |
| 로컬 이벤트 반영 | 정상 부하에서 p95 1초 이내 |
| 원격 알림 enqueue | 이벤트 journal 기록 후 p95 2초 이내 |
| 알림 중복 | 동일 Attention·정책 revision·기기·escalation stage 조합당 최대 1건 |
| 재연결 복구 | 보존 범위 내 이벤트 100% 재생, 범위 밖은 snapshot으로 수렴 |
| 잘못된 세션 라우팅 | 통합·chaos 테스트에서 0건 |
| 고위험 승인 우회 | 음성·원격 API를 포함해 0건 |
| raw shell endpoint | 공개 API 표면에 0개 |
| 이벤트 계약 | 지원 Codex 버전별 fixture와 상태 머신 테스트 통과 |

알림의 실제 표시 시간은 APNs, 브라우저, 운영체제 전원 정책 같은 외부 조건의 영향을 받는다. SLA는 daemon의 enqueue/전달 확인과 플랫폼 수신을 구분해 측정한다.

## 12. 가정과 제약

- Codex App Server는 외부 버전 계약으로 취급하고 지원 버전 범위와 capability를 명시한다.
- 한 App Server 연결에서 여러 thread를 다룰 수 있지만, 연결 장애의 blast radius와 업그레이드 전략은 기술 검증한다.
- P0에서 Git이 아니거나 Git worktree를 사용할 수 없는 Project는 read-only만 허용한다. non-Git managed-copy 쓰기 격리는 P1의 별도 제안으로 두며 P0에서 단일 쓰기로 우회하지 않는다.
- 모바일 background 알림과 마이크는 플랫폼 권한과 브라우저 정책을 따른다.
- 원격 모드는 opt-in이며, 로컬 모드는 relay 계정 없이 사용할 수 있어야 한다.
- 음성 전사 공급자는 어댑터로 교체 가능해야 한다. 클라우드 전사를 쓰면 전송 여부를 명확히 알리고 동의를 받는다.
- 현재 저장소의 daemon/web 코드는 가능성 확인용 스파이크다. 데이터 모델과 API가 이 문서와 맞지 않으면 문서를 기준으로 재설계한다.

## 13. 주요 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| Codex 이벤트 스키마 변경 | 상태 오판, 승인 응답 실패 | 생성 스키마 고정, 버전 매트릭스, contract fixture, 알 수 없는 이벤트 fail-safe |
| 모바일 푸시 지연·제한 | 사용자가 입력 요청을 늦게 인지 | 채널 capability, 전달 상태 분리, 복수 기기, 유효기간 내 제한적 escalation |
| 음성 오인식 또는 대상 혼동 | 잘못된 세션에서 작업 실행 | 명시적 대상, 신뢰도 임계값, read-back, expected Session revision·turn ID, 위험 동작 UI 확인 |
| 병렬 파일 충돌 | 변경 유실 또는 잘못된 통합 | write-set 힌트, worktree 격리, 충돌 사전 검사, 통합 게이트 |
| relay 침해 | 세션 내용 노출 또는 위조 | E2EE, 기기 키, 짧은 수명 토큰, nonce/replay 방지, 최소 메타데이터 |
| 알림 폭주 | 알림 무시·이탈 | 상태 진입 시 한 번, dedup key, quiet hours, rate limit, digest |
| daemon 재시작 | 진행 상태·Approval 유실 | append-only journal, idempotent reducer, App Server reconciliation |
| 자동 분할의 잘못된 계획 | 범위 증가, 비용 낭비 | 제안과 실행 분리, 동시성·예산 상한, destructive integration의 인증 UI 승인 |
| 기존 Codex 기능과 중복 | 제품 가치 불명확 | 오케스트레이션·개방형 계약·self-host에 집중하고 기본 기능은 재사용 |
| 전체 ADE로의 범위 팽창 | 핵심 가치 검증 지연, 공격 표면 증가 | terminal/editor/browser/SSH는 비목표로 유지하고 orchestration·attention·review 계약만 선별 채택 |
| stale usage·낙관적 예측으로 과도 실행 | reset 이후 작업 중단, 유료 사용·자원 낭비 | official bucket freshness 확인, min/likely/max 예측, reserve·launch buffer·RunBudget, 매 attempt 재계산, 결제·reset credit 자동 소비 금지 |
| prompt가 reset 활용을 빌미로 큐를 늘림 | 무의미·중복 작업과 비용 증가 | local-admin preset의 기존 Task만 허용, queue/Plan revision 결박, 자동 filler 생성·scope 확장 금지 |

## 14. 확정할 결정과 열린 질문

### 14.1 현재 확정하는 원칙

- 런타임 기본 경로는 `codex app-server`다.
- P0 daemon은 loopback에만 바인딩하고, 원격 사용은 daemon이 시작한 outbound E2EE relay 연결로만 제공한다. LAN/public 직접 bind는 하지 않는다.
- 원격 클라이언트에 raw shell을 제공하지 않는다.
- 쓰기 병렬 작업은 worktree 격리를 기본값으로 한다.
- 질문과 승인은 method별 타입을 가진다. 임의 JSON 결과를 전달하는 범용 승인 API는 제품 API로 노출하지 않는다.
- destructive/elevated 승인의 수락은 음성으로 완료할 수 없고 잠금 해제된 인증 UI의 명시적 action을 요구한다. 음성은 해당 화면으로 이동하거나 거절·취소만 할 수 있다.
- `Pawdex — Product UX` Figma 초안을 화면 동작·정보 구조의 구현 기준으로 사용하되 시각 브랜드는 사용성·접근성 검증에 따라 발전시킨다.

### 14.2 구현 전 답해야 할 질문

- P0 원격 relay를 프로젝트가 직접 운영할지, self-host 패키지만 제공할지, 둘 다 제공할지
- P0 모바일 클라이언트를 설치형 웹 앱으로 한정할지, 처음부터 네이티브를 병행할지
- 지원할 Codex 최소·최대 버전과 업그레이드 경고 정책
- 음성 전사의 기본값을 온디바이스로 할 수 있는 플랫폼 범위와 클라우드 fallback 정책
- Task Planner의 출력 계약을 고정 JSON schema로 할지, Codex 동적 도구로 받을지
- 자동 생성 worktree의 보존 기간과 사용자가 수정한 미커밋 파일의 정리 정책
- 기본 알림 정책에서 `needs_input`, `failed`, `completed` 중 quiet hours를 우회할 수 있는 종류
- 오픈소스 core와 향후 hosted relay의 경계 및 비용 모델
- 익명 telemetry를 완전히 opt-in으로 할지, 기본 비활성으로 둘지
- `UsageWindowPreset`의 기본 reserve/launch buffer, 최소 이력 표본 수, 허용할 forecast confidence와 원격 단일 action의 재인증 시간

이 질문 중 보안, 데이터 보존, 모바일 기술 선택은 구현 전에 ADR로 확정한다. 화면 구조 변경은 기능 계약과 Figma 구현 기준을 함께 갱신하고, 비주얼 브랜드 결정은 별도 디자인 검증으로 다룬다.

## 15. 단계별 제품 검증

1. **Contract Spike**: 실제 App Server로 다중 thread, 승인, 질문, 재연결 fixture를 만든다.
2. **Local Runtime Alpha**: loopback daemon, Project, 다중 Session, global/Machine/Project durable queue, journal, generated local CLI를 내부 사용한다.
3. **Orchestration Alpha**: 자동 제안·사용자 확인형 Task DAG, worktree, typed 승인, 검증·통합 게이트를 dogfood한다.
4. **Notification Alpha**: Attention Inbox, Mac 로컬 알림, foreground event, provider fake를 검증한다. 실제 Web Push는 아직 켜지 않는다.
5. **Remote Alpha**: 기기 페어링, outbound E2EE relay, opaque Web Push, 인증 후 deep link를 제한된 사용자에게 연다.
6. **Voice Beta**: push-to-talk, follow-up/steer, pending 사용자 질문 answer 라우팅을 로컬과 원격 경로에서 검증한다.
7. **Public MVP Beta**: 모든 P0 기능과 보안 Gate, 설치, 업그레이드, 호환성 문서, 장애 복구 테스트를 갖춰 첫 공개 beta로 배포한다.

각 단계의 headless/CLI와 계약은 화면과 독립적으로 검증한다. 사용자용 화면은 승인된 Figma 제품 UX 초안을 기준으로 구현하고, 사용성·접근성 검증 결과를 기능 계약과 초안에 함께 반영한다.

## 16. 참고 자료

- [Pawdex 목표 프로토콜](./PROTOCOL.md)
- [Pawdex Figma 제품 UX 초안](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)
- [Codex App Server 공식 문서](https://learn.chatgpt.com/ko-KR/docs/app-server)
- [Codex App Server usage·rate-limit 계약](https://learn.chatgpt.com/docs/app-server)
- [Codex Git worktree 공식 문서](https://learn.chatgpt.com/ko-KR/docs/environments/git-worktrees)
- [Codex Remote 공식 문서](https://learn.chatgpt.com/docs/remote)
- [Codex Voice 공식 문서](https://learn.chatgpt.com/docs/features/voice)
- [Codex Notifications 공식 문서](https://learn.chatgpt.com/docs/notifications)
- [Codex Pets 공식 문서](https://learn.chatgpt.com/docs/pets)
- [Happy 저장소](https://github.com/slopus/happy)
- [Orca 저장소](https://github.com/stablyai/orca)
- [Orca 공식 문서](https://www.onorca.dev/docs)
- [GeekNews Orca 소개](https://news.hada.io/topic?id=32253)
