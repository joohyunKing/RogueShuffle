# Rogue Shuffle — CLAUDE.md

## 프로젝트 개요
트럼프 카드 기반 로그라이크 점수 게임.
Phaser 3 + Vite(ES Modules) 구성.

## 파일 구조
```
src/
  main.js                   # Phaser.Game config + 씬 등록만
  constants.js              # 레이아웃 전용 상수 (GW/GH/CW/CH/FIELD_Y/HAND_Y 등)
  scoring.js                # 족보 점수 계산 로직
  levels.js                 # 레벨별 게임플레이 수치 (getLevelConfig)
  monsters.js               # 몬스터 종류 4×4 그리드 정의 (preloadMonsters 포함)
  scenes/
    MainMenuScene.js        # 타이틀 화면 (PLAY / OPTIONS 버튼)
    OptionsScene.js         # 볼륨 · 언어 설정 (registry에 저장)
    GameScene.js            # 플레이 씬
  counter.js                # 미사용 (Vite 기본 템플릿 유물)
  style.css                 # 미사용
public/
  cards/       # 카드 이미지 56장 (CA.png ~ SK.png, _card_back.png 등)
  monster/     # 몬스터 이미지 (skeleton.jpg, zombi.jpg — 이미지 추가 시 monsters.js에 등록)
```

## 씬 전환 흐름
```
MainMenuScene → (PLAY)    → GameScene
MainMenuScene → (OPTIONS) → OptionsScene → (뒤로) → MainMenuScene
GameScene     → (덱 소진) → GameOver 오버레이 → (메인 메뉴로) → MainMenuScene
GameScene     → (≡ 메뉴)  → MainMenuScene
```

## 설정 저장 (Phaser registry)
| 키 | 기본값 | 설명 |
|----|--------|------|
| `volume` | 7 | 볼륨 (0~10) |
| `lang`   | "ko" | 언어 ("ko" \| "en") |

## 기술 스택
- **Phaser 3** (npm install로 설치됨, package.json에 등록)
- **Vite ^8.0.0** (개발 서버: `npm run dev`)
- **ES Modules** (import/export)
- 캔버스 크기: **1280 × 800**

## 게임 규칙
- 트럼프 52장 (조커 제외)
- 시작: 핸드 7장, 필드 5장, 덱 나머지 40장
- **턴 구조**
  - 필드 카드 1장만 드래그해서 핸드로 가져올 수 있음 (선택사항)
  - 핸드에서 카드 선택 → 실시간 족보/점수 프리뷰
  - FIRE 버튼: 선택 카드 채점 + 기존 필드 → 더미, 덱에서 5장 새 필드

## 점수 계산 (scoring.js)
| 족보 | 조건 | 점수 공식 |
|------|------|-----------|
| 포카드 | 같은 val 4장 | val 합산 × 5 |
| 플러시 | 같은 suit 5장 이상 | 상위 5장 val 합산 × 4 |
| 스트레이트 | 연속 val 5장 이상 | 상위 5장 val 합산 × 4 |
| 트리플 | 같은 val 3장 | val 합산 × 2 |
| 페어 | 같은 val 2장 | val 합산 × 2 |

- A=1, J=11, Q=12, K=13
- 여러 패턴 중 **가장 높은 점수 1개** 적용

## 주요 상수 (constants.js)
```js
// 레이아웃 전용 (고정값)
GW=1280, GH=800      // 캔버스 크기
CW=100,  CH=145      // 카드 표시 크기
FIELD_Y=195          // 필드 카드 Y 중심
HAND_Y=515           // 핸드 카드 Y 중심
HAND_TOP             // 드래그 드롭 판정 기준 Y
```

## 레벨 설정 (levels.js)
게임플레이 수치는 레벨별로 다르므로 `constants.js`가 아닌 `levels.js`에서 관리.

```js
getLevelConfig(level)   // level(1~) → LevelConfig 반환
```

| 필드 | 설명 |
|------|------|
| `handSize` | 라운드 시작 시 핸드 배치 수 |
| `handSizeLimit` | 핸드 최대 보유 수 |
| `turnStartDrawLimit` | 턴 시작 시 핸드 보충 최대 수 |
| `fieldSize` | 라운드/턴 시작 시 필드 배치 수 |
| `fieldSizeLimit` | 필드 최대 카드 수 |
| `fieldPickLimit` | 턴당 필드 픽업 가능 수 |
| `monsterCount` | 등장 몬스터 수 |
| `monsterTier` | 등장 몬스터 티어 (0~3, monsters.js MONSTER_GRID 행 인덱스) |
| `monsterStats` | `{ hp:[min,max], atk:[min,max], def:[min,max] }` |

GameScene은 `this.lv`에 현재 레벨 설정을 보관.
레벨 전환 시 `this.scene.start("GameScene", { level: nextLevel })`로 전달.

## 주요 상태 (GameScene)
| 변수 | 설명 |
|------|------|
| `level` | 현재 레벨 번호 |
| `lv` | `getLevelConfig(level)` 결과 |
| `playerHp/MaxHp/Def` | 플레이어 스탯 (라운드 클리어 시 유지) |
| `score` | 누적 점수 |
| `handData[]` | 핸드 카드 배열 |
| `fieldData[]` | 필드 카드 배열 |
| `deckData[]` | 남은 덱 |
| `dummyData[]` | 버린 카드 |
| `monsters[]` | 몬스터 배열 `{type, hp, maxHp, atk, def, isDead}` |
| `selected` | Set — 핸드 선택 인덱스 |
| `fieldPickCount` | 이번 턴 필드 픽 횟수 (`lv.fieldPickLimit`과 비교) |
| `isDealing` | 딜링/애니메이션 중 인터랙션 차단 여부 |
| `sortMode` | 'suit' \| 'rank' \| null |
| `cardObjs[]` | 렌더 시마다 재생성 (카드) |
| `monsterObjs[]` | 렌더 시마다 재생성 (몬스터 UI) |
| `animObjs[]` | 딜링 애니메이션 전용 |
| `battleLogLines[]` | 배틀 로그 최근 4줄 |

## 턴 흐름 (GameScene)
```
create() → startDealAnimation() → render()
  ↓ 플레이어 행동 (반복 가능)
  - 필드 카드 드래그 → 핸드로 (fieldPickCount < fieldPickLimit)
  - 핸드 카드 클릭 → 선택/해제 → 족보 프리뷰
  - 몬스터 클릭 (족보 있을 때) → attackMonster() → 카드 소모
  ↓ 턴종료 클릭
  onTurnEnd() → 몬스터 반격 → 게임오버 or startTurn()
  startTurn() → 핸드 보충 + 필드 교체 → render()
```

## 렌더 방식
- `render()` 호출 시 `cardObjs` 전체 destroy 후 재생성
- UI 요소(버튼, 텍스트)는 `create()`에서 한 번만 생성 — `cardObjs`에 넣지 않음
- 정렬 버튼도 한 번만 생성, `refreshSortBtns()`로 상태만 갱신

## 개발 서버
```bash
cd C:/Users/rundo/Rogue-Shuffle
npm run dev   # http://localhost:5173 (포트 중복 시 5174, 5175 ...)
```
