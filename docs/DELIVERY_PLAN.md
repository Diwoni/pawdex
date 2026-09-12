# Pawdex 구현·출시 계획

> 상태: 초안(기능·기술 계획용)
> 전제: 시각 디자인은 별도 산출물에서 발전시키되, 이 문서는 1~2명의 개발자가 기능 위험과 공통 UX·접근성 품질을 순서대로 제거하는 계획이다.

## 1. 계획 원칙

- **로컬에서 먼저 증명한다.** 원격 릴레이와 모바일 앱보다 로컬 데몬, Codex 이벤트 매핑, 병렬 세션 복구를 먼저 완성한다.
- **안전 기능은 부가기능이 아니다.** 원격 제어 전에 페어링, 타입이 지정된 승인, 권한 분리, 감사 이벤트를 구현한다.
- **Codex App Server를 외부 계약으로 취급한다.** 지원 버전을 명시하고 생성 스키마와 골든 테스트로 변경을 감지한다.
- **병렬 작업은 Git 격리와 함께 제공한다.** 쓰기 작업은 기본적으로 전용 worktree를 사용하며, 정리 과정에서 미커밋 변경을 자동 삭제하지 않는다.
- **출시 단계는 날짜가 아니라 종료 조건으로 통과한다.** 노력 범위는 우선순위 조정용 추정치이며 납기 약속이 아니다.

## 2. 기능 ID 체계

| 접두사 | 영역 | 예시 |
|---|---|---|
| `SYS` | 로컬 데몬과 Codex 외부 계약 | `SYS-002 App Server 어댑터` |
| `DEV` | 기기 등록과 연결 capability | `DEV-001 기기 페어링` |
| `PROJ` | 등록 Project와 실행 경계 | `PROJ-001 Project 등록` |
| `SES` | 세션 수명주기, 병렬 실행, 상태 | `SES-002 병렬 실행` |
| `ATT` | Attention Inbox와 알림 정책 | `ATT-002 중복 억제` |
| `NTF` | OS 알림과 감각 피드백 채널 | `NTF-001 Mac·모바일 알림` |
| `APR` | 승인과 구조화된 질문 응답 | `APR-001 typed approval` |
| `VOI` | 음성 인식, 명령 라우팅, TTS | `VOI-002 세션 선택` |
| `ORC` | 작업 분해, DAG, worktree, 통합 | `ORC-003 worktree 격리` |
| `REV` | diff 검토와 구조화된 리뷰 전달 | `REV-001 line-anchored 리뷰` |
| `REL` | 이벤트 저널과 재연결 | `REL-001 durable journal` |
| `SEC` | 인증, E2EE, 권한 경계 | `SEC-001 보안 경계` |
| `API` | 타입 안전 API와 이벤트 스트림 | `API-001 공개 계약` |
| `OBS` | 감사 로그와 진단 | `OBS-001 관측성` |
| `CFG` | 정책과 설정 우선순위 | `CFG-001 effective policy` |
| `OSS` | 오픈소스 배포·확장 계약 | `OSS-001 확장 경계` |
| `NFR` | 성능·신뢰성·보안·UX·접근성 등 횡단 품질 | `NFR-UX-001 점진적 공개` |

이 ID는 기능 명세, 이슈, 테스트, 변경 로그에서 동일하게 사용한다. 하나의 이슈가 여러 기능을 건드리면 주 ID 하나와 관련 ID를 따로 기록한다.

## 3. 범위 기준선

`P0`는 기능 우선순위이고 `beta`는 배포 채널이다. 첫 public beta는 모든 P0 기능과 S1~S5 보안 Gate를 갖춘 **공개 MVP**이며 P1은 선택 사항이다. `stable`은 같은 안전 기준을 유지한 채 호환성·운영 성숙도와 롤백 검증을 더 쌓은 후 승격한다.

### 로컬 알파에 반드시 포함

- 하나의 로컬 데몬이 여러 Codex 세션을 시작·재개·중단하고 상태를 일관되게 표시한다.
- global/Machine/Project 각각의 durable queue와 동시성 한도가 daemon 재시작 뒤에도 순서·pause·lease를 복구한다.
- 실행 root는 로컬에서 `Project`로 먼저 등록하며 세션·원격 요청은 임의 절대 경로나 `cwd` 대신 `projectId`를 사용한다.
- Session canonical 상태는 `starting`, `ready`, `running`, `needs_input`, `completed`, `failed`, `interrupted`, `offline`만 사용한다.
- 각 쓰기 세션은 기본적으로 전용 managed Git worktree를 사용한다. 격리를 끄는 예외는 원격 API가 아니라 명시적인 로컬 전용 정책으로만 추가할 수 있다.
- 승인·사용자 질문은 Pawdex Approval ID와 원래 세션, aggregate revision에 결합된 타입 안전 응답으로만 처리한다.
- 완료·입력 필요·실패 이벤트에 로컬 macOS 알림과 고양이 소리를 연결하고 중복을 억제한다.
- 데몬 재시작 후 세션 목록과 미처리 요청을 복구하거나, 복구 불가 상태를 명시한다.
- 개발자와 비개발자는 같은 canonical 흐름을 쓰며 기본 화면은 쉬운 말과 다음 행동을, 펼친 상세는 ID·revision·진단 근거를 보여 준다.
- 핵심 조작은 최소 44×44 CSS px, keyboard/focus/screen-reader label을 갖고 상태는 color+icon+text로 함께 구분한다.

### 공개 베타 이전에 포함

- 기기 페어링, 기기별 폐기, E2EE 원격 채널, 내용이 없는 푸시 wake-up payload.
- 모바일에서 상태 확인, 일반 텍스트/음성 후속 지시, pending 사용자 질문의 음성 answer, 안전한 승인 화면.
- Planner가 자동 제안하고 사용자가 confirm한 Task DAG, 동시성 한도, 실패 격리, 취소 전파, 결과 요약, 사용자 확인형 typed 통합.
- 지원 Codex 버전 범위, 자동 호환성 검사, 서명된 릴리스 및 롤백 절차.

### 공개 베타 이후 선택 P1

- 동일한 동결 명세와 source tree에서 여러 후보를 실행하고 사람이 결과를 비교·선택하는 comparative run.
- 파일·줄·diff side에 고정한 리뷰 코멘트를 한 turn의 구조화된 피드백으로 묶어 원 세션에 전달하는 기능.
- 최근 turn이 완료되고 idle window가 지났으며 resumable이고, 해당 Session에 active control lease·pending Approval·unsettled TaskAttempt/subagent가 없을 때만 process attachment를 hibernate하고 안전하게 재연결하는 기능.
- provider가 공식적으로 제공하는 usage/rate-limit 정보를 출처·관측 시각·신선도와 함께 보여 주는 기능. 계정 전환이나 quota 우회는 제공하지 않는다.
- 로컬에서 미리 고정한 queue·목표 사용률 범위·reserve·launch buffer·RunBudget을 잠금 해제된 인증 UI의 단일 action으로 실행하는 `UsageWindowRun`. 정확한 100% 소진, filler 생성, 자동 결제·reset credit 소비는 제공하지 않는다.

### 첫 안정판 이후 후보

- 팀/조직 다중 사용자 권한 모델.
- 클라우드에서 Codex 실행 환경을 직접 호스팅하는 기능.
- daemon이 직접 listen하는 LAN 연결(P1 후보이며 별도 위협 모델·ADR 필요).
- 완전 자율 브랜치 병합 및 자동 PR 승인.

### 제품 비목표

- 범용 터미널·원격 셸.
- 음성, TTS 확인 또는 알림 quick action으로 어떤 Approval의 **수락**이든 완료하는 기능.

## 4. 단계별 실행 계획

노력은 **집중 개발 1인일(person-day)** 기준의 범위다. 두 명이 작업하더라도 계약·보안 검토 같은 직렬 작업 때문에 단순히 절반으로 줄지 않는다.

| 범위 | 총 노력 | 개발자 1명 | 개발자 2명 |
|---|---:|---:|---:|
| Gate 0~M3 로컬 기능 알파 | 36~59인일 | 약 8~12 집중 주 | 약 5~8 집중 주 |
| M4~M6 원격·음성·하드닝 추가 | 31~53인일 | 약 7~11 집중 주 추가 | 약 4~7 집중 주 추가 |
| 전체 공개 베타 기준선 | **67~112인일** | **약 14~23 집중 주** | **약 8~15 집중 주** |
| 선택 P1 비교·리뷰·자원·사용량 활용 묶음 | 22~37인일 추가 | 약 5~8 집중 주 추가 | 약 3~5 집중 주 추가 |

이는 납기 약속이 아니라 범위 비교용 공수다. 기능 검증용 최소 클라이언트 구현은 포함하지만, 최종 UI·브랜드·캐릭터 디자인, 앱 스토어/entitlement 심사 대기, 외부 보안 검토 대기, 법무 검토, 운영 인프라 조달 시간은 제외한다. 개발자 1명 구성이어도 원격 암호·승인 경계에는 별도의 독립 보안 리뷰어가 필요하다.

### Gate 0 — 계획 기준선과 계약 동결

예상 노력: **3~5인일**

핵심 작업:

- 제품 기획서·기능 명세·기술 설계·보안 모델을 상호 링크하고 P0 범위를 동결한다.
- 지원할 Codex App Server 최소/최대 버전 정책을 정한다.
- 실제 App Server에서 TypeScript/JSON Schema를 생성해 `fixtures/contracts/<version>`에 보관하는 방식을 확정한다.
- 이벤트 이름을 내부 상태로 변환하는 표와 알 수 없는 이벤트 처리 정책을 승인한다.
- 데이터 보존 기본값, 원격 기능 opt-in, 텔레메트리 기본값을 결정한다.

산출물:

- 승인된 P0 기능 목록과 제외 목록
- 첫 ADR 세트: App Server, 로컬 데몬, 이벤트 저널, worktree, 원격 E2EE
- 위험 등록부와 테스트 매트릭스

종료 조건:

- 모든 P0 기능이 단일 소유 영역과 관찰 가능한 수용 기준을 가진다.
- 스키마 변경을 CI에서 실패시키는 최소 계약 테스트가 있다.
- 원격 제어를 켜기 전에 통과해야 할 보안 Gate가 문서화되어 있다.

### Milestone 1 — 로컬 런타임 알파

예상 노력: **10~16인일**

선행 조건: Gate 0

핵심 에픽:

- `SYS-001` 데몬 수명주기와 로컬 진단
- `SYS-002` App Server 프로세스 시작·초기화·기능 협상
- `PROJ-001` Project 등록, canonical root, Git/ref 탐지, 정책 revision
- `SES-001` 세션 생성·재개·분기·중단
- `SES-002` global/Machine/Project durable queue, lease, 세션 동시 실행과 자원 제한
- `SES-003` Codex 이벤트 → Pawdex 상태 머신 매핑
- `REL-001` durable 이벤트 저널과 스냅샷 복구
- `API-001` local CLI용 generated typed client와 health/Project/Session 기본 API(M1 slice)

필수 테스트:

- 모든 새 이벤트 매핑에 상태 머신 단위 테스트
- canonical Session 상태 8개 외 값이 출력되지 않고 legacy 값은 migration 입력에서만 정규화되는 테스트
- 실제 지원 Codex 바이너리와의 시작/turn/interrupt 계약 테스트
- 데몬 강제 종료 직전·직후 재시작 복구 테스트
- 동일 이벤트 재전송, 순서 뒤바뀜, sequence cursor gap 테스트
- Project root symlink 탈출, 원격 임의 경로 등록, stale `expectedProjectRevision` 거부 테스트
- Session mutation의 stale `expectedSessionRevision`과 idempotency 재시도 테스트
- daemon 재시작 뒤 세 scope queue의 순서·pause reason·lease를 복구하고 한 Project pause가 다른 Project를 막지 않는지 테스트
- local CLI가 loopback daemon API만 사용하고 App Server/SQLite/OS process를 직접 호출하거나 raw shell/RPC pass-through를 제공하지 않는지 검사
- 1/5/10개 세션의 동시 실행과 취소 격리 테스트

종료 조건:

- 10개 세션 부하에서 한 세션의 실패가 다른 세션의 프로세스·상태를 손상시키지 않는다.
- 실행 operation은 global/Machine/Project slot을 모두 확보한 durable lease가 있을 때만 한 번 시작된다.
- 새 Session은 등록된 `projectId`로만 만들어지며 원격 클라이언트가 root/`cwd`를 바꿀 수 없다.
- local CLI에서 Project/Session 상태 조회와 대표 typed mutation이 generated API client를 통해 동작하고 revision/idempotency 정책을 우회하지 않는다.
- 재시작 후 실행 중이던 세션이 `running`으로 오인되지 않고 재연결 또는 `offline`으로 확정된다.
- 지원하지 않는 Codex 버전에서는 조용히 오작동하지 않고 명확한 진단을 제공한다.

### Milestone 2 — 안전한 병렬 오케스트레이션

예상 노력: **18~30인일**

선행 조건: Milestone 1, `APR-001` 설계 승인

핵심 에픽:

- `ORC-001` 사용자의 자동 분할 요청을 검토 가능한 Plan/Task DAG로 자동 제안
- `ORC-002` DAG 실행, 의존성 검증, 동시성 한도
- `ORC-003` 세션별 worktree 생성·상태 확인·보존
- `ORC-004` 로컬 관리자 등록 allowlisted template 검증, 사용자 확인형 typed cherry-pick/merge/patch-export, 안전한 worktree 정리
- `APR-001`/`APR-002` 타입 승인과 구조화된 질문 응답
- `API-001` aggregate revision과 idempotency를 강제하는 타입 API·event stream
- `OBS-001` 작업·세션·브랜치 상관관계가 있는 구조화 이벤트

필수 테스트:

- 순환 DAG 거부, 상위 실패 시 하위 작업 정책, 취소 전파
- 동일 저장소를 사용하는 병렬 쓰기 작업의 파일·브랜치 격리
- 미커밋 변경이 있는 worktree 정리 거부 및 복구 안내
- Planner/원격 클라이언트의 verification template 등록·변경 거부와 allowlisted `verificationTemplateId`·typed argv/cwd/env policy 강제
- typed 통합 mutation의 stale Worktree revision, 잘못된 대상 ref, 같은 idempotency key의 다른 payload 거부
- Pawdex Approval ID/세션 ID/turn ID 교차 주입 거부
- Session/Plan/Approval의 stale aggregate revision 거부와 동일 idempotency key 재시도 결과 고정
- 파괴적 또는 권한 상승 **수락**의 잠금 해제·인증 UI confirmation receipt 누락 거부

종료 조건:

- Planner가 자동 제안한 P0 Plan은 해당 revision과 Task 목록을 사람이 confirm한 뒤에만 N개 세션으로 시작할 수 있다.
- worktree 수명주기에서 사용자 변경을 자동 삭제하는 경로가 없다.
- P0 통합은 사용자가 diff·검증 결과·대상 ref를 보고 선택한 typed mutation으로만 실행되며 generic Git command나 자동 main 변경이 없다.
- 일반 후속 지시, 현재 turn steer, 질문 응답, 승인 응답이 서로 다른 타입 경로를 사용한다.
- daemon database `sequence`는 event cursor/order에만 쓰고 mutation 충돌 검사는 `expected...Revision`으로 수행한다.

### Milestone 3 — Attention·Mac 로컬 알림 알파

예상 노력: **5~8인일**

선행 조건: Milestone 1

핵심 에픽:

- `ATT-001` `completed`, `needs_input`, `failed`에서 로컬 미처리 항목 생성
- `ATT-002` 로컬 중복 제거, quiet hours, 프로젝트/세션별 정책, 에스컬레이션
- `NTF-001` Mac 로컬 알림, foreground event, provider fake(M3 slice)
- `NTF-002` 로컬 고양이 소리와 capability 기반 fallback

필수 테스트:

- 같은 이벤트를 재수신해도 한 번만 알림
- `needs_input` 해소 후 이전 로컬 알림을 열어도 최신 Attention projection만 표시
- quiet hours 예외(실패/권한 요청) 정책 테스트
- Mac 알림 본문 redaction, foreground/background 중복, provider fake 실패 격리 테스트

종료 조건:

- 상태 머신의 주의 필요 전이가 알림과 정확히 1:1로 추적된다.
- Mac 로컬 알림은 인증된 local client의 최신 Attention 읽기 화면으로만 이동하며 승인 결정을 직접 실행하지 않는다.
- 소리는 음소거 가능하며 알림 실패가 세션 실행을 실패시키지 않는다.
- M3는 실제 모바일/Web Push, 인터넷 deep link, 원격 승인 응답을 출시하지 않는다.

### Milestone 4 — 원격 페어링·모바일 알파

예상 노력: **14~23인일**

선행 조건: Milestone 2, Milestone 3, Security Gate S1·S2

출시 조건: Security Gate S3

핵심 에픽:

- `DEV-001` 만료되는 일회용 페어링, 기기별 인증·폐기
- `DEV-002` 로컬/원격 연결 모드와 capability 협상
- `SEC-001` 릴레이 E2EE, 키 수명주기, 최소 권한
- `NTF-001` 실제 모바일/Web Push의 opaque wake-up, 앱 내 E2EE fetch, 인증 후 deep-link 라우팅(M4 slice)
- `REL-001` 연결 복구, ACK, 재전송, idempotency, 오프라인 수렴

필수 테스트:

- 릴레이가 평문 프롬프트·출력·승인 내용을 볼 수 없는지 패킷/로그 검사
- 캡처 패킷 replay, 카운터 rollback, 만료 명령, 폐기 기기 거부
- 푸시 application payload가 짧게 만료되는 opaque wake token 외에 Attention/Session ID·상태·별칭·preview·deep-link 대상을 담지 않는지 검사
- 만료 wake token, revoke 기기, 오래된 deep link가 내용을 노출하거나 Approval을 실행하지 않고 foreground event와 background push가 한 번의 Attention으로 수렴하는지 검사
- 네트워크 전환·장기 오프라인·중복 delivery 후 상태 수렴
- 페어링 코드 brute force 및 rate-limit 테스트
- 모든 P0 설정/실행 인자에서 non-loopback listener가 열리지 않고 relay가 Machine 방향 inbound socket을 만들 수 없는지 검사

종료 조건:

- 원격 기능은 기본 꺼짐이며 로컬에서 명시적으로 활성화·페어링해야 한다.
- P0 daemon은 LAN/public interface에 직접 bind하지 않고 outbound E2EE relay 연결만 만든다.
- 모바일/Web Push는 opaque wake 뒤 인증된 E2EE fetch로 최신 Attention을 읽고, deep link만으로 승인 결정을 제출하지 않는다.
- 기기 하나를 폐기해도 다른 기기와 로컬 세션은 유지된다.
- 외부 보안 리뷰에서 원격 명령 실행을 막는 치명적/높음 취약점이 열려 있지 않다.

### Milestone 5 — 음성 후속 지시 베타

예상 노력: **7~12인일**

선행 조건: Milestone 2; 원격 사용은 Milestone 4 필요

핵심 에픽:

- `VOI-001` 기기 내 우선 STT, 명시적 녹음 상태, 전사 미리보기
- `VOI-002` 세션 선택, 일반 프롬프트, steer, pending 사용자 질문 answer, 중단 의도 라우팅
- `VOI-003` 개인정보를 줄인 상태 TTS와 즉시 중지
- `NTF-002` 로컬 고양이 소리 피드백과 접근성 정책

필수 테스트:

- 비슷한 세션 이름, 활성 turn 없음, 여러 후보가 있는 명령의 확인 흐름
- 낮은 STT confidence에서 자동 전송 금지
- 모든 음성 mutation에서 전사문, 해석한 action과 정확한 Project/Session/Approval target을 함께 확인하고 모호하면 실행하지 않음
- 잠금 화면/백그라운드/마이크 권한 철회 상태
- 음성은 승인 화면 탐색과 `decline`/`cancel`까지만 허용하고 위험도와 무관하게 모든 Approval `accept`는 거부
- 오디오 원본 보존 안 함 기본값과 진단 로그 redaction

종료 조건:

- 사용자가 전송 전 인식 문장과 대상 세션을 확인할 수 있다.
- 음성 실패는 텍스트 입력 경로로 복구 가능하다.
- 음성·TTS·알림 quick action은 어떤 Approval `accept`도 제출하지 않는다.
- elevated/destructive `accept`는 잠금 해제·인증 UI의 명시적 action으로만 완료된다.

### Milestone 6 — P0 공개 MVP/베타 하드닝

예상 노력: **10~18인일**

선행 조건: Milestone 1~5의 모든 P0 기능과 Security Gate S1~S4. P1 기능은 공개 범위로 선택한 것만 포함한다.
핵심 작업:

- 장시간 soak, fault injection, 성능/메모리 회귀 기준선
- `CFG-001` 정책 우선순위와 안전한 설정 검증
- `OSS-001` 공개 확장 계약과 호환성 정책
- 위협 모델 재검토, 외부 보안 검토, 의존성/SBOM 검사
- 마이그레이션·백업·롤백·키 폐기 runbook
- 크래시 리포트/텔레메트리 opt-in과 개인정보 검증
- 바이너리/앱 코드 서명, 배포 출처 검증, 변경 로그
- 설치·페어링·복구·문제 해결 문서

종료 조건:

- Security Gate S5를 완료하고 치명적/높음 보안 이슈가 열려 있지 않다.
- 지원 OS/Codex 버전 매트릭스가 CI 또는 릴리스 체크리스트에서 검증된다.
- 데이터 손실 P0 버그가 0개다.
- 이전 베타로 되돌리는 절차와 로컬 데이터 마이그레이션 복구를 리허설했다.
- 최소 두 명의 외부 사용자가 설치→첫 병렬 작업→알림→후속 지시를 문서만으로 완료한다.

### Milestone 7 — 선택 P1 비교·리뷰·자원·사용량 활용

예상 노력: **22~37인일**

공수 구성: `ORC-005` 5~8인일, `REV-001` 4~7인일, `SES-004` 4~6인일, `OBS-002` 3~6인일, `ORC-006` 6~10인일. 공급자 usage 계약이나 세션 resume capability가 부족하면 각각의 상한을 다시 추정한다.

선행 조건: Milestone 2와 Milestone 6. `ORC-006`의 canonical 의존성은 `OBS-002`, `ORC-002`, `ORC-004`, `CFG-001`, `ATT-001`, `APR-001`, `APR-002`, `SEC-001`, `DEV-001`, `DEV-002`이며 이 단계는 공개 MVP/P0 출시 조건이 아니다.

핵심 에픽:

- `ORC-005` 같은 동결 명세·base에서 제한된 수의 후보 attempt를 실행하고 결과를 수동 선택
- `REV-001` line-anchored diff 코멘트 수집, stale 판정, 한 번의 구조화된 리뷰 turn 전달
- `SES-004` 완료 turn·idle window·resumable 상태와 Session별 blocker 검사를 통과한 hibernation 및 warm/cold resume
- `OBS-002` provider usage/rate-limit 출처·신선도 표시와 scheduler 입력
- `ORC-006` 사전 저장 preset과 최신 usage snapshot을 사용하는 reset-window queue 실행·재예측·안전 중지

필수 테스트:

- 후보별 worktree·budget·attempt ID가 격리되고 서로 다른 base에서 시작한 결과는 같은 비교군으로 표시되지 않는지 검사
- winner 선택 전 어떤 후보도 자동 통합되지 않으며 loser의 미커밋·미병합 결과가 자동 삭제되지 않는지 검사
- base/head OID나 content hash가 달라진 line comment가 stale 처리되고 다른 줄에 조용히 적용되지 않는지 검사
- 해당 Session에 pending Approval, unsettled attempt/subagent, active control lease가 있을 때 hibernation이 거부되고 daemon 재시작 뒤 복구되는지 검사
- 오래되었거나 지원되지 않는 usage 값이 `unknown`/`stale`로 표시되며 하드 quota처럼 오인되지 않는지 검사
- preset·queue·Project·usage snapshot의 stale revision 거부, 같은 idempotency key 재시도 결과 고정, reset 시각 변경 시 새 attempt launch 중지
- 목표 범위·reserve·launch buffer·기존 RunBudget 중 가장 보수적인 상한을 적용하고, 큐 밖 filler·중복 Task·자동 credit/reset 소비·account switch가 생성되지 않는지 검사
- 각 TaskAttempt 뒤 `min/likely/max` forecast가 갱신되며 target/queue empty/stale/blocker/failure/cost/cancel별 stop Attention이 정확히 한 번 생성되는지 검사
- local controller와 paired remote 모두 actor Device ID/kind/channel과 foreground one-time user-presence receipt를 검증하고 loopback API·CLI·음성·push가 이를 우회하지 못하는지 검사
- Queue priority/order의 결정적 scan과 typed skip reason을 보존하며 queue와 slot이 남아도 safe candidate와 기다릴 active governed Attempt가 없으면 `no_safe_candidate`로 즉시 한 번만 중단하는지 검사

종료 조건:

- 사용자는 동일 입력의 후보들을 diff·검증 결과와 함께 비교하고 typed action으로 winner만 선택할 수 있다.
- 리뷰 코멘트는 code mutation이나 Approval 수락이 아니라 원래 세션의 새로운 피드백 turn으로만 전달된다.
- hibernation은 논리 상태를 보존하면서 프로세스 자원 연결만 해제하며, 복원 불가 시 명시적인 cold-restore 상태와 다음 행동을 제공한다.
- usage 데이터가 없거나 오래돼도 scheduler는 안전한 로컬 동시성·RunBudget 상한을 계속 적용한다.
- `UsageWindowRun`은 이미 confirmed/frozen 상태의 preset queue만 실행하고, 정확한 소진 대신 사용자 목표 범위와 안전 중지 이유를 감사 가능한 summary로 남긴다.

## 5. 우선순위 백로그

| ID | 우선순위 | 기능 | 선행 조건 | 목표 단계 | 핵심 수용 기준 |
|---|---:|---|---|---|---|
| `SYS-001` | P0 | 로컬 daemon 수명주기 | 없음 | M1 | 모든 설정에서 loopback/IPC만 bind하고 장애 원인을 구조화한다 |
| `SYS-002` | P0 | App Server 어댑터·버전 계약 | `SYS-001` | M1 | 스키마 drift가 CI를 실패시킨다 |
| `PROJ-001` | P0 | Project 등록·실행 경계 | `SYS-001` | M1 | 로컬에서 등록한 canonical root와 정책 revision만 사용한다 |
| `SES-001` | P0 | Session 생성·재개·분기·중단 | `SYS-002`, `PROJ-001` | M1 | 세션 이벤트와 응답이 섞이지 않는다 |
| `SES-002` | P0 | 3-scope durable queue·병렬 실행 | `SES-001` | M1 | global/Machine/Project lease를 모두 확보하고 재시작 뒤 중복 없이 복구한다 |
| `SES-003` | P0 | 상태 reducer·진행 정보 | `SYS-002` | M1 | 매핑마다 테스트가 있고 unknown은 격리된다 |
| `REL-001` | P0 | durable journal·재연결 | `SES-003` | M1→M4 | 재시작·재전송 뒤 중복 없이 상태가 수렴한다 |
| `APR-001` | P0 | typed approval | `SES-003` | M2 | 임의 JSON 응답이나 raw shell API가 없다 |
| `APR-002` | P0 | 사용자 질문·MCP elicitation | `SES-003` | M2 | 만료·잘못된 answer가 upstream 전 차단된다 |
| `API-001` | P0 | 타입 API·event stream·local CLI client | `SYS-001` (M1); `REL-001`, `APR-001` (M2 확장) | M1→M2 | CLI도 generated API client와 aggregate revision/idempotency를 사용하고 raw shell 우회가 없다 |
| `CFG-001` | P0 | 정책·설정 우선순위 | `API-001` | M2 | effective policy와 출처를 조회할 수 있다 |
| `ORC-001` | P0 | 자동 작업 분해·Plan 제안 | `PROJ-001`, `SES-002`, `CFG-001` | M2 | P0 Plan은 사용자 confirm 전 쓰기 작업을 시작하지 않는다 |
| `ORC-002` | P0 | DAG scheduler | `ORC-001` | M2 | 순환·고아 노드가 실행 전에 거부된다 |
| `ORC-003` | P0 | Git worktree 격리 | `ORC-002`, `PROJ-001` | M2 | 미커밋 worktree를 자동 삭제하지 않는다 |
| `ORC-004` | P0 | allowlisted 검증·typed 통합·정리 | `ORC-003` | M2 | 로컬 관리자 template와 typed 인자만 실행하고 사용자 확인형 통합에서 stale/dirty 상태를 막는다 |
| `ORC-005` | P1 | 동일 명세 후보 비교 실행 | `ORC-004` | M7 | 동일 frozen spec/base와 후보 budget을 보장하고 winner만 사람이 선택한다 |
| `ORC-006` | P1 | Usage Window queue run | `OBS-002`, `ORC-002`, `ORC-004`, `CFG-001`, `ATT-001`, `APR-001`, `APR-002`, `SEC-001`, `DEV-001`, `DEV-002` | M7 | fresh bucket·immutable preset·expected revisions·actor/channel-bound user-presence receipt에 결박하고 매 attempt 재예측하며 `no_safe_candidate`를 포함한 모든 안전 상한에서 중지한다 |
| `REV-001` | P1 | line-anchored batched review | `ORC-004` | M7 | OID·side·line·content hash로 stale을 감지하고 한 turn으로 전달한다 |
| `OBS-001` | P0 | 감사 로그·진단 | `API-001` | M2→M6 | 결정을 추적하되 fixture secret은 남지 않는다 |
| `OBS-002` | P1 | provider usage·rate-limit 가시성 | `SYS-002`, `OBS-001`, `SES-002`, `CFG-001` | M7 | 출처·관측 시각·신선도·unknown을 표시하고 stale/unknown이면 scheduler가 로컬 hard cap으로 fail-safe하며 계정 전환은 제공하지 않는다 |
| `ATT-001` | P0 | 통합 Attention Inbox | `SES-003`; 응답 action은 `APR-001` | M2→M3 | 미처리 요청의 최신 유효 상태를 보존한다 |
| `ATT-002` | P0 | dedup·quiet hours·escalation | `ATT-001` | M3 | 동일 이벤트는 한 번만 울리고 해결 시 예약을 취소한다 |
| `NTF-001` | P0 | Mac·모바일 알림 채널 | `ATT-001` (M3 로컬); `DEV-001`, `SEC-001` (M4 원격) | M3→M4 | Mac은 로컬 projection, mobile push는 opaque wake 뒤 E2EE fetch만 사용한다 |
| `NTF-002` | P0/P1 | 고양이 소리·감각 피드백 | `NTF-001` (원격 확장은 `DEV-002`) | M3→M5 | capability와 음소거 정책을 지킨다 |
| `DEV-001` | P0 | 기기 등록·페어링 | `APR-001`, `SEC-001` | M4 | 만료 코드와 기기별 revoke를 지원한다 |
| `DEV-002` | P0 | 연결 모드·capability 협상 | `DEV-001` | M4 | 원격은 outbound opt-in이고 fallback을 기록한다 |
| `SEC-001` | P0 | 인증·E2EE·권한 경계 | `SYS-001`, `PROJ-001` | M1→M4 | 릴레이는 콘텐츠 평문을 볼 수 없다 |
| `VOI-001` | P0 | push-to-talk·전사 | `SEC-001` | M5 | 녹음 상태와 원본 미보존 기본값이 명확하다 |
| `VOI-002` | P0 | 음성 의도·Session/질문 라우팅 | `VOI-001`, `API-001`, `APR-002` | M5 | 대상·의미를 확인하고 pending 사용자 질문 answer를 원 Approval에만 제출한다 |
| `VOI-003` | P1 | 안전한 상태 TTS | `VOI-002` | M5 | 코드·secret·명령 전문을 읽지 않는다 |
| `SES-004` | P1 | 안전한 hibernation·resume | `SES-001`, `REL-001`, `APR-001`, `ATT-001`, `ORC-002`, `DEV-002` | M7 | Session별 control lease·Approval·attempt/subagent blocker를 검사하고 상태와 process attachment를 분리한다 |
| `OSS-001` | P0 | 오픈소스·확장 계약 | 없음 | M1→M6 | 새 checkout 재현성과 서명 검증을 제공한다 |

### 제품 요구 추적

| 제품 요구 | canonical 기능 | 구현 단계 | 출시 증거 |
|---|---|---|---|
| `PRODUCT_BRIEF` JTBD-01 완료·입력 필요를 놓치지 않음 | `ATT-001`, `ATT-002`, `NTF-001`, `NTF-002` | M2→M4 | 상태→Attention 1:1 추적, dedupe·quiet-hours·opaque push 테스트 |
| `PRODUCT_BRIEF` JTBD-02 음성으로 정확한 다음 지시 | `VOI-001`, `VOI-002`, `APR-002` | M5 | 대상·의도 확인, 낮은 confidence 차단, 원 질문 결박 테스트 |
| `PRODUCT_BRIEF` JTBD-03 큰 작업의 안전한 병렬 분할 | `SES-002`, `ORC-001`~`ORC-004` | M1→M2 | frozen Plan, resource lease, worktree 격리, artifact·OID·budget gate 테스트 |
| `PRODUCT_BRIEF` JTBD-04 승인 안전 처리 | `APR-001`, `APR-002`, `SEC-001` | M2→M4 | request/attempt/device 결박, stale revision, 인증 UI confirmation 테스트 |
| `PRODUCT_BRIEF` JTBD-05 단절 뒤 신뢰 가능한 복구 | `REL-001`, `DEV-002` | M1→M4 | journal replay, snapshot, ACK/retry, offline reconciliation 테스트 |
| `PRODUCT_BRIEF` JTBD-06 및 P0의 “이벤트 WebSocket/HTTP API와 로컬 CLI” | `API-001`, `OSS-001` | M1에서 generated local CLI client·기본 API, M2에서 approval/Plan/event stream 확장, M6에서 재현 가능한 배포 | `FEATURE_SPEC`의 `API-001` CLI 인수 기준, schema/contract/fuzz 테스트, 새 checkout build/test |
| `PRODUCT_BRIEF` JTBD-07 동일 작업의 여러 후보 비교·선택 | `ORC-005` | M7 선택 P1 | 동일 frozen spec/base 증거, 후보별 검증 결과, 수동 winner audit event |
| `PRODUCT_BRIEF` JTBD-08 diff 줄 단위 피드백 묶음 전달 | `REV-001` | M7 선택 P1 | stale anchor 테스트, batched feedback turn, Approval 경계 테스트 |
| `PRODUCT_BRIEF` JTBD-09 reset 전 선택 큐 활용 | `ORC-006`, `OBS-002` | M7 선택 P1 | fresh snapshot·forecast band·preset fence·stop matrix·no-filler/no-auto-credit 테스트 |
| `PRODUCT_BRIEF` P1 완료 Session 자원 절감 | `SES-004` | M7 선택 P1 | blocker matrix, warm/cold resume, restart recovery 테스트 |
| `PRODUCT_BRIEF` P1 provider 사용량 가시성 | `OBS-002` | M7 선택 P1 | source/freshness/unknown 표기와 scheduler fail-safe 테스트 |
| 공통 개발자·비개발자 UX 품질 | `NFR-UX-001`, `NFR-A11Y-001` | M1부터 모든 UI 단계 | plain-language walkthrough, progressive-disclosure, keyboard/screen-reader/44px/non-color audit |
| 정직한 상태·사용량 표현 | `NFR-UX-002`, `SES-003`, `OBS-002`, `ORC-006` | M1 상태 UI, M7 usage UI | lifecycle evidence·forecast audit와 근거 없는 완료율/token 잔량/100% 소진 문구 0건 |
| 음성 오발송 방지 | `NFR-VOICE-001`, `VOI-002` | M5 | 전사문·action·target 확인과 ambiguous/low-confidence 차단 테스트 |

## 6. 테스트 전략과 품질 게이트

### 테스트 층

1. **순수 단위 테스트**: 상태 전이, aggregate revision, idempotency, 정책 평가, 알림 dedupe, DAG 검증, 암호 envelope 검증.
2. **계약 테스트**: 지원하는 각 Codex App Server 스키마/메서드/응답 fixture.
3. **통합 테스트**: 실제 App Server 프로세스, 임시 Git 저장소/worktree, 로컬 알림 어댑터 fake.
4. **종단간 테스트**: 데몬↔클라이언트↔릴레이↔푸시 wake-up, 네트워크 장애와 재접속 포함.
5. **보안 테스트**: replay, 권한 교차, path traversal, malformed frame, rate limit, 비밀 redaction.
6. **수동 탐색 테스트**: 음성 모호성, 잠금 화면 프라이버시, OS 권한/백그라운드 제한.

### 병합 필수 체크

- 타입 검사, lint, 단위 테스트, 계약 fixture diff.
- 이벤트 매핑 변경에는 상태 머신 테스트가 반드시 포함되어야 한다.
- 네트워크/권한/API 변경에는 threat delta를 PR 본문에 기록한다.
- 데이터 모델 변경에는 forward migration, rollback 또는 복구 전략이 있어야 한다.
- 의존성 추가에는 라이선스, 유지보수 상태, 권한/번들 크기 영향 검토가 있어야 한다.

## 7. 릴리스 채널

| 채널 | 대상 | 배포 방식 | 안정성 약속 |
|---|---|---|---|
| `dev` | 기여자 | `main` 빌드/로컬 실행 | 데이터 포맷 변경 가능, 마이그레이션 보장 없음 |
| `canary` | 명시적 opt-in 테스터 | 커밋 SHA가 있는 자동 빌드 | 진단 우선, 빠른 롤백 가능 |
| `alpha` | 초대 사용자 | 서명된 prerelease 태그 | 지원 버전/알려진 제한 명시 |
| `beta` | 공개 테스터 | 서명·notarization된 prerelease | 데이터 마이그레이션과 롤백 경로 제공 |
| `stable` | 일반 사용자 | 검증된 서명 릴리스 | 호환성 정책과 보안 업데이트 정책 준수 |

`stable`은 M6 종료 조건, 보안 모델의 S1~S5 Gate, 최소 한 번의 롤백 리허설이 모두 완료되기 전에는 만들지 않는다.

## 8. Definition of Ready

구현 이슈는 다음 조건을 충족해야 시작 가능하다.

- 기능 ID, 사용자 문제, 범위 밖 항목이 명시되어 있다.
- 정상/실패/취소/재접속 수용 기준이 관찰 가능한 문장으로 적혀 있다.
- 변경 대상 aggregate와 필요한 `expected...Revision`/`Idempotency-Key`가 명시되어 있다.
- 외부 계약, 데이터 저장, 권한, 알림, 원격 호출 영향이 표시되어 있다.
- 선행 이슈와 차단 관계가 연결되어 있다.
- UI 결정이 필요하면 기능 계약과 분리되어 있으며 임시 인터페이스로 검증 가능하다.
- 보안 민감 기능은 관련 위협 ID와 필요한 보안 테스트를 가진다.

## 9. Definition of Done

- 구현과 테스트가 수용 기준을 충족하고 지원 플랫폼에서 검증되었다.
- 상태/프로토콜 변경은 문서·타입·fixture·마이그레이션과 함께 업데이트되었다.
- mutation은 aggregate revision 충돌과 same-key same/different-payload 재시도 테스트를 통과했다.
- 실패 시 사용자가 복구할 수 있는 진단과 다음 행동이 있다.
- 로그·알림·크래시 리포트에서 비밀과 프롬프트가 기본적으로 노출되지 않는다.
- 신규 권한은 최소 권한이며 해제·폐기 경로가 있다.
- 기여자 문서와 변경 로그가 갱신되었다.
- 고위험 경로는 두 번째 리뷰어 또는 보안 리뷰 체크를 통과했다.

## 10. GitHub 운영 규칙

### 이슈 라벨

- 영역: `area:project`, `area:session`, `area:orchestrator`, `area:notification`, `area:voice`, `area:security`, `area:ops`
- 우선순위: `priority:p0`, `priority:p1`, `priority:p2`
- 종류: `type:feature`, `type:bug`, `type:contract`, `type:security`, `type:docs`
- 상태: `status:needs-spec`, `status:ready`, `status:blocked`, `status:needs-verification`
- 위험: `risk:data-loss`, `risk:remote-control`, `risk:privacy`, `risk:compatibility`

### 브랜치·커밋·PR

- 기여자/PR 브랜치: `codex/<type>-<feature-id>-<short-name>`, 예: `codex/feat-ses-003-state-machine`.
- runtime managed TaskAttempt 브랜치: daemon이 `codex/pawdex/<plan-short-id>/<task-attempt-short-id>` 내부 namespace로 생성한다. 기여자 브랜치와 수명주기·정리 정책을 공유하거나 서로 대신 사용하지 않는다.
- PR 제목: `<FEATURE-ID> concise change`, 예: `ATT-002 Deduplicate attention alerts`.
- 하나의 PR은 하나의 주 위험만 다루는 크기를 선호한다.
- PR 본문에 수용 기준, 테스트 증거, 계약/마이그레이션 영향, 위협 모델 delta를 기록한다.
- 스키마 fixture 변경은 생성에 사용한 Codex 버전과 diff 설명을 포함한다.

## 11. 계획 변경 규칙

- 종료 조건을 충족하지 못한 단계의 후속 단계 기능을 기본 브랜치에 활성화하지 않는다. 실험은 feature flag 뒤에 둔다.
- 실제 사용성 검증으로 우선순위를 바꿀 수 있지만 `APR-001`, `SEC-001`, 원격 Security Gate, 데이터 손실 방지 조건은 삭제하지 않는다.
- 일정 압박 시 범위를 줄이고, 암호화·승인·worktree 보존·호환성 검사를 생략하지 않는다.
- 디자인이 전달되면 기능 ID와 수용 기준을 유지한 채 별도의 UX 명세와 접근성 기준을 연결한다.
