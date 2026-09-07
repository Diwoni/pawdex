# Pawdex 제품 기획서

> 문서 상태: Draft v0.1
>
> 제품 단계: 구현 착수 전 기획·검증 단계
>
> 제품명: `Pawdex`는 가칭이며 변경 가능
>
> 범위 원칙: 이 문서는 기능과 운영 방식을 정의한다. UI, 캐릭터, 브랜드, 화면 레이아웃은 별도 디자인 입력을 받은 뒤 확정한다.

## 1. 한 줄 정의

Pawdex는 여러 Codex 작업을 안전하게 병렬 실행하고, 사람의 판단이 필요한 순간을 모바일과 Mac으로 알려 주며, 사용자가 음성으로 다음 지시를 이어갈 수 있게 하는 오픈소스·로컬 우선 개발 하네스다.

Pawdex의 핵심은 “Codex를 원격으로 보는 화면”이 아니라 다음 세 가지다.

1. 여러 작업의 실행, 의존성, 격리를 관리하는 오케스트레이터
2. 완료·실패·승인·질문을 놓치지 않게 모으는 Attention Inbox
3. 알림과 음성을 안전한 Codex 입력·질문 답변·승인 거절/취소로 바꾸는 라우터

## 2. 해결하려는 문제

개발자가 AI에게 긴 작업을 맡긴 뒤에도 작업 상태를 확인하려고 책상과 터미널을 반복해서 오간다. 여러 세션을 동시에 돌리면 다음 문제가 더 커진다.

- 어떤 세션이 실행 중이고 어떤 세션이 질문이나 승인을 기다리는지 한눈에 알기 어렵다.
- 작업 완료를 늦게 알아차려 다음 지시가 수십 분씩 지연된다.
- 같은 저장소에서 여러 세션이 파일을 동시에 수정하면 변경이 충돌하거나 작업 디렉터리가 오염될 수 있다.
- 휴대폰에서 짧은 후속 지시를 내리기 위해 전체 개발 환경에 위험한 원격 셸 접근을 열고 싶지는 않다.
- 음성 입력은 편하지만 어느 세션에 어떤 의미로 전달되는지 불명확하면 잘못된 실행을 일으킬 수 있다.
- 앱 재시작이나 네트워크 단절 뒤 이벤트를 놓치면 상태를 신뢰할 수 없다.

## 3. 대상 사용자

### 3.1 1차 사용자

- 한 컴퓨터에서 2개 이상의 Codex 작업을 자주 병렬 실행하는 개인 개발자
- 구현, 테스트, 문서화, 리팩터링을 AI에게 위임하고 중간 승인만 처리하려는 개발자
- 소파나 침대, 다른 방에서도 긴 작업을 이어가고 싶은 개발자
- 로컬 코드와 명령 실행 권한을 외부 SaaS에 그대로 위임하고 싶지 않은 보안 민감 사용자
- Codex 위에 팀 또는 프로젝트 전용 하네스를 개발하려는 오픈소스 기여자

### 3.2 후속 사용자

- 여러 저장소에서 작업하는 소규모 개발팀
- CI, 이슈 트래커, 코드 리뷰를 작업 그래프에 연결하려는 플랫폼 엔지니어
- Codex 이외의 에이전트 런타임도 같은 Attention 모델로 관리하려는 하네스 제작자

## 4. 핵심 사용자 과업(JTBD)

| ID | 사용자가 원하는 일 | 성공한 상태 |
| --- | --- | --- |
| JTBD-01 | 자리를 비워도 Codex가 멈춘 순간을 즉시 알고 싶다 | 완료, 실패, 질문, 승인 요청이 올바른 기기로 전달된다 |
| JTBD-02 | 휴대폰에서 짧게 말해 다음 작업을 이어가고 싶다 | 음성이 대상 세션과 실행 의미를 확인한 뒤 올바른 턴에 전달된다 |
| JTBD-03 | 큰 일을 여러 독립 작업으로 나눠 동시에 처리하고 싶다 | 의존성과 동시성 한도에 맞춰 세션이 실행되고 쓰기 작업은 격리된다 |
| JTBD-04 | 승인 때문에 멈춘 작업을 안전하게 처리하고 싶다 | 명령, 파일, 권한, 질문 유형별 정보와 선택지만 노출된다 |
| JTBD-05 | 연결이 끊겨도 현재 상태를 믿고 싶다 | 재연결 후 누락 이벤트를 복구하고 중복 알림을 만들지 않는다 |
| JTBD-06 | 내 워크플로에 Pawdex를 끼워 넣고 싶다 | 안정된 이벤트 계약과 CLI/API를 통해 확장할 수 있다 |

## 5. 제품 포지셔닝

### 5.1 기존 선택지와의 관계

Codex는 자체적으로 Remote, Voice, Pets, Notifications 같은 사용자 기능을 제공하며, App Server는 스레드, 턴, 항목, 승인, 사용자 질문을 통합 제품이 제어할 수 있는 인터페이스로 제공한다. Pawdex는 이 기능을 대체한다고 주장하지 않는다. 여러 저장소·작업의 그래프 실행, 로컬 우선 운영, 공급자 어댑터, 감사 가능한 이벤트 기록을 원하는 개발자를 위한 별도 하네스 계층을 만든다.

[Happy](https://github.com/slopus/happy)는 모바일·웹·데스크톱에서 코딩 에이전트 세션을 원격으로 이어가는 오픈소스 선례다. Pawdex는 원격 접속 경험 자체보다 Codex App Server 기반 상태 정확성, 안전한 병렬 작업 그래프, typed approval, 고양이 알림 규칙에 우선순위를 둔다.

| 영역 | Codex 기본 경험 | Happy에서 참고할 점 | Pawdex의 초점 |
| --- | --- | --- | --- |
| 단일 세션 원격 사용 | 기본 제품 기능 활용 | 다양한 클라이언트와 세션 연속성 | 최소 구현, 기존 기능과 경쟁하지 않음 |
| 여러 작업의 의존성 | 제품 버전에 따라 가능한 기능을 그대로 사용 | 여러 에이전트 연결 경험 | 명시적 DAG, 동시성, worktree 격리, 통합 게이트 |
| 사람의 개입 | 기본 알림과 승인 흐름 활용 | 모바일 알림과 원격 제어 | 모든 세션을 합친 Attention Inbox와 전달 보장 |
| 음성 | 기본 Voice가 맞는 사용자에게는 그대로 권장 | 원격 음성 아키텍처 참고 | 세션·턴·요청 ID에 결합된 안전한 의도 라우팅 |
| 확장성 | Codex 계약에 맞춤 | 오픈소스 구조 참고 | 런타임 어댑터, 버전 계약 테스트, 로컬 API |
| 보안 | Codex 권한 모델을 존중 | E2EE 설계 참고 | 원격 셸 금지, 최소 정보 relay, 명시적 고위험 승인 |

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
10. **기능이 디자인보다 먼저 검증됨**: 현재 저장소 UI는 폐기 가능한 기술 스파이크이며 최종 디자인 기준이 아니다.

## 7. 핵심 도메인 개념

| 개념 | 정의 |
| --- | --- |
| Machine | Codex App Server와 Pawdex daemon이 실행되는 한 대의 개발 컴퓨터 |
| Project | daemon에 미리 등록된 로컬 실행 경계. 하나의 workspace root와 ProjectPolicy를 가지며 `projectId`로 선택한다 |
| workspace root | Project가 가리키는 실제 로컬 디렉터리. 원격 클라이언트가 임의 `cwd`로 지정하는 API 리소스가 아니다 |
| Session | 하나의 Codex thread에 대응하는 Pawdex 작업 채널 |
| Turn | 사용자의 한 요청과 이에 따른 Codex 실행 단위 |
| Plan / Task | Plan은 확인 전·실행 중인 DAG 전체이고, Task는 확인된 Plan 안에서 목표·입력·의존성·결과를 갖는 실행 노드다 |
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

### 8.2 MVP 비목표

- 화면 디자인, 캐릭터 일러스트, 애니메이션, 최종 정보 구조 확정
- IDE 또는 터미널 전체를 원격 데스크톱처럼 제공
- 임의 셸 명령을 모바일에서 직접 실행
- 사용자의 확인 없이 충돌을 자동 해결하거나 기본 브랜치에 병합
- 항상 켜진 웨이크 워드 또는 백그라운드 상시 녹음
- 모든 모바일 OS에서 동일한 커스텀 알림음을 보장
- 조직용 RBAC, SSO, 감사 보존 정책, 다중 사용자 공동 제어
- Codex 기본 Remote·Voice·Notifications 경험을 그대로 복제
- 첫 릴리스부터 모든 AI 에이전트 공급자를 지원

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
2. Planner가 Task, 입력, 산출물, 의존성, 쓰기 범위, 검증 명령을 제안한다.
3. Pawdex는 예상 충돌과 동시성 비용을 검사하고 실행 전 계획을 고정한다.
4. 독립 쓰기 Task마다 worktree와 브랜치를 만들고 `ready` Task만 실행한다.
5. 선행 Task가 실패하거나 입력을 기다리면 의존 Task는 시작하지 않는다.
6. 완료 결과를 검증하고 integration Task를 실행한다. 병합·삭제처럼 파괴 가능성이 있는 단계는 잠금 해제된 인증 UI에서 사용자가 명시적으로 승인한다.

### 9.4 연결 또는 daemon 재시작

1. 각 이벤트는 단조 증가 sequence와 event ID로 journal에 기록된다.
2. 클라이언트는 마지막으로 확인한 sequence 이후 이벤트를 요청한다.
3. 보존 범위를 벗어났다면 daemon이 authoritative snapshot을 보내고 클라이언트가 로컬 상태를 교체한다.
4. 미해결 Approval은 App Server와 재조정한다. 이미 해결된 요청에 대한 늦은 응답은 거부한다.
5. 알림 발송 기록으로 같은 상태 전환을 다시 울리지 않는다.

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
- 충돌 감지, 검증 명령 결과, 사용자가 확인하는 typed cherry-pick/merge/patch-export 수동 통합 게이트
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
- 작업 결과 비교와 정책 기반 통합 방식 제안

### 10.3 P2: 팀·생태계

- 다중 사용자, 역할, 조직 정책, SSO
- 승인 위임과 감사 보존
- 공급자 중립 agent adapter SDK
- Task Graph 템플릿과 커뮤니티 registry
- 항상 듣기 기능은 별도 명시 동의, 로컬 wake word, 플랫폼 정책 검증 후에만 검토

## 11. 성공 지표와 품질 목표

### 11.1 핵심 지표

- **Attention 발견 시간**: `needs_input`/`completed` 발생부터 사용자가 인지하기까지의 중앙값
- **개입 대기 시간 감소**: Pawdex 미사용 기준 대비 질문·승인 대기 시간 감소율
- **병렬 작업 성공률**: 실행된 DAG 중 격리 위반 없이 검증 게이트까지 도달한 비율
- **원격 후속 성공률**: 모바일 지시가 의도한 세션과 턴에 한 번만 전달된 비율
- **복구 신뢰도**: 강제 재시작·네트워크 단절 테스트에서 누락 또는 중복 Attention Item이 없는 비율
- **활성 사용**: 주당 2개 이상 동시 세션을 실행한 활성 설치 수와 재사용률

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

## 14. 확정할 결정과 열린 질문

### 14.1 현재 확정하는 원칙

- 런타임 기본 경로는 `codex app-server`다.
- P0 daemon은 loopback에만 바인딩하고, 원격 사용은 daemon이 시작한 outbound E2EE relay 연결로만 제공한다. LAN/public 직접 bind는 하지 않는다.
- 원격 클라이언트에 raw shell을 제공하지 않는다.
- 쓰기 병렬 작업은 worktree 격리를 기본값으로 한다.
- 질문과 승인은 method별 타입을 가진다. 임의 JSON 결과를 전달하는 범용 승인 API는 제품 API로 노출하지 않는다.
- destructive/elevated 승인의 수락은 음성으로 완료할 수 없고 잠금 해제된 인증 UI의 명시적 action을 요구한다. 음성은 해당 화면으로 이동하거나 거절·취소만 할 수 있다.
- UI 디자인은 별도 디자인 입력 전까지 확정하지 않는다.

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

이 질문 중 보안, 데이터 보존, 모바일 기술 선택은 구현 전에 ADR로 확정한다. 화면 구조와 비주얼 결정은 기능 계약이 고정된 뒤 별도 디자인 단계에서 다룬다.

## 15. 단계별 제품 검증

1. **Contract Spike**: 실제 App Server로 다중 thread, 승인, 질문, 재연결 fixture를 만든다.
2. **Local Runtime Alpha**: loopback daemon, Project, 다중 Session, global/Machine/Project durable queue, journal, generated local CLI를 내부 사용한다.
3. **Orchestration Alpha**: 자동 제안·사용자 확인형 Task DAG, worktree, typed 승인, 검증·통합 게이트를 dogfood한다.
4. **Notification Alpha**: Attention Inbox, Mac 로컬 알림, foreground event, provider fake를 검증한다. 실제 Web Push는 아직 켜지 않는다.
5. **Remote Alpha**: 기기 페어링, outbound E2EE relay, opaque Web Push, 인증 후 deep link를 제한된 사용자에게 연다.
6. **Voice Beta**: push-to-talk, follow-up/steer, pending 사용자 질문 answer 라우팅을 로컬과 원격 경로에서 검증한다.
7. **Public MVP Beta**: 모든 P0 기능과 보안 Gate, 설치, 업그레이드, 호환성 문서, 장애 복구 테스트를 갖춰 첫 공개 beta로 배포한다.

각 단계는 사용자의 디자인 제공을 기다리지 않고 headless/CLI와 계약 테스트로 검증할 수 있다. 단, 사용자용 화면 구현은 디자인 기준이 확정된 뒤 제품화한다.

## 16. 참고 자료

- [Pawdex 목표 프로토콜](./PROTOCOL.md)
- [Codex App Server 공식 문서](https://learn.chatgpt.com/ko-KR/docs/app-server)
- [Codex Git worktree 공식 문서](https://learn.chatgpt.com/ko-KR/docs/environments/git-worktrees)
- [Codex Remote 공식 문서](https://learn.chatgpt.com/docs/remote)
- [Codex Voice 공식 문서](https://learn.chatgpt.com/docs/features/voice)
- [Codex Notifications 공식 문서](https://learn.chatgpt.com/docs/notifications)
- [Codex Pets 공식 문서](https://learn.chatgpt.com/docs/pets)
- [Happy 저장소](https://github.com/slopus/happy)
