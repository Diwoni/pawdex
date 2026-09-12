# Pawdex 🐾

> A local-first, cat-powered control plane for parallel Codex work.

Pawdex는 개발자와 비개발자 모두가 여러 Codex 작업을 안전하게 병렬 실행하고, 작업 완료나 사용자 입력이 필요한 순간을 모바일·Mac 알림으로 받고, 음성으로 다음 지시를 이어갈 수 있게 하는 오픈소스 작업 제어 도구이자 개발자 하네스입니다.

## 현재 단계

**기획 및 기술 검증 단계**입니다. [Figma의 `Pawdex — Product UX` 페이지](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)를 제품 UX 초안이자 화면 구현 기준으로 승인했습니다. 핵심 흐름과 정보 구조는 이 초안을 따르며, 색·타이포그래피·캐릭터 표현 같은 시각 브랜드는 사용성 검증에 따라 계속 발전할 수 있습니다.

저장소의 코드는 Codex `app-server` 연동, 세션 상태 변환, 로컬 알림 흐름이 가능한지 확인한 **폐기 가능한 기술 스파이크**입니다. 공개 API나 완성된 제품으로 간주하면 안 됩니다. 실제 구현은 아래 문서의 범위와 승인 기준이 확정된 뒤 시작합니다.

## 해결하려는 문제

- 여러 저장소·브랜치의 Codex 작업 상태를 한곳에서 추적한다.
- `작업 중`, `입력 필요`, `완료`, `실패`를 일관된 상태 모델로 정규화한다.
- 화면 앞에 없어도 고양이 알림과 선택 가능한 냐옹 소리로 주의가 필요한 순간을 알린다.
- 음성 지시를 정확한 세션에 라우팅하며, 승인·권한 변경·파괴적 작업은 명시적으로 확인한다.
- 큰 목표를 의존성 있는 하위 작업으로 나누고 격리된 worktree에서 병렬 실행한다.
- 원격 클라이언트에 raw shell을 노출하지 않는다.

## 제품의 초점

Codex 자체에도 원격 작업, 음성 입력, 알림과 Pets가 있습니다. Pawdex의 차별점은 이를 다시 만드는 것이 아니라 다음 개발자 워크플로 계층에 있습니다.

1. 여러 로컬/원격 Codex 세션의 통합 attention inbox
2. 작업 DAG와 worktree 기반의 안전한 병렬 오케스트레이션
3. 재연결 가능한 이벤트 저널과 개발자용 자동화 API
4. 로컬 우선 및 선택적 종단간 암호화 원격 접속
5. 세션 문맥을 고려한 음성 라우팅과 명시적 승인 정책
6. reset 전 남은 사용량을 사전 선택한 유용한 작업 큐에 배분하는 안전한 P1 Usage Window Runner

[Happy](https://github.com/slopus/happy)는 모바일 원격 제어, 음성, 푸시 및 암호화 설계의 중요한 선행 사례입니다. [Orca](https://github.com/stablyai/orca)는 worktree-native 병렬 실행, 세션 복원, 비교 실행과 diff 리뷰의 선행 사례입니다. Pawdex는 전체 IDE나 범용 터미널을 다시 만들지 않고 Codex `app-server` 계약, 안전한 다중 작업 오케스트레이션, attention·voice 제어면에 더 좁고 깊게 집중합니다.

## 기획 문서

| 문서 | 답하는 질문 |
| --- | --- |
| [제품 기획서](docs/PRODUCT_BRIEF.md) | 누구의 어떤 문제를 왜 푸는가? |
| [기능 명세](docs/FEATURE_SPEC.md) | 기능은 정확히 어떻게 동작하고 언제 완료인가? |
| [기술 설계](docs/TECHNICAL_DESIGN.md) | 어떤 구성요소와 경계로 구현하는가? |
| [프로토콜 명세](docs/PROTOCOL.md) | 상태·이벤트·API 계약은 무엇인가? |
| [보안 모델](docs/SECURITY_MODEL.md) | 무엇을 신뢰하고 어떤 위협을 막는가? |
| [개발 로드맵](docs/DELIVERY_PLAN.md) | 무엇을 어떤 검증 순서로 만드는가? |
| [핵심 결정 기록](docs/DECISIONS.md) | 이미 선택한 것과 아직 열어 둔 것은 무엇인가? |
| [선행 제품 검토](docs/REFERENCE_REVIEW.md) | Codex·Happy·Orca와 무엇이 겹치고 무엇이 다른가? |

화면을 구현하거나 리뷰할 때는 [Figma 제품 UX 초안](https://www.figma.com/design/24X7ul4Vb9aTKZXpSY0OL3/pinpop?node-id=2290-2)을 함께 기준으로 사용합니다.

문서 간 추적의 기준은 `FEATURE_SPEC.md`의 기능 ID입니다. 구현 이슈와 테스트는 해당 ID를 참조해야 합니다.

## 검증용 스파이크 실행

> 로컬 기술 검증에만 사용하세요. 기본 바인딩은 `127.0.0.1`이며 인터넷에 직접 노출하지 마세요.

요구 사항: Node.js 20 이상, pnpm 10, 로그인된 Codex 설치.

```bash
pnpm install
pnpm build
pnpm test
pnpm dev
```

현재 스파이크는 다음만 검증합니다.

- Codex `app-server` 시작 및 thread/turn 제어
- Codex 이벤트를 Pawdex 세션 상태로 변환
- 여러 세션 조회·전송·중단·fork
- WebSocket 상태 스트림과 Web Push 연결 지점
- 승인·질문은 감지만 하며 응답 API는 안전을 위해 비활성화

승인 응답 API, 영속 저장소, worktree 스케줄러, 원격 페어링/E2EE, 음성 파이프라인은 목표 설계로 교체해야 합니다.

## 핵심 원칙

- local-first; P0 daemon은 로컬 IPC 또는 loopback에만 bind
- provider 계약은 versioned adapter 뒤에 격리
- raw shell 원격 API 금지
- 권한 상승과 파괴적 작업은 명시적 확인
- 이벤트 매핑 변경에는 상태 머신 테스트 필수
- 이벤트 재전송과 명령 재시도를 견디는 멱등성

## 참고 자료

- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Codex notifications](https://learn.chatgpt.com/docs/notifications)
- [Codex Remote](https://learn.chatgpt.com/docs/remote)
- [Happy repository](https://github.com/slopus/happy)
- [Orca repository](https://github.com/stablyai/orca)
- [Orca documentation](https://www.onorca.dev/docs)

## 라이선스

[MIT](LICENSE)
