import Phaser from "phaser";
import { calculateScore, getScoreDetails } from "../service/scoreService.js";
import {
  GW, GH, CW, CH, FIELD_CW, FIELD_CH, PILE_CW, PILE_CH,
  SUITS, RANKS, SUIT_ORDER,
  PLAYER_PANEL_W, ITEM_PANEL_W,
  BATTLE_LOG_H, MONSTER_AREA_TOP, MONSTER_AREA_H, MONSTER_IMG_Y,
  FIELD_Y, HAND_Y, HAND_TOP, DEAL_DELAY,
  HAND_DATA, HAND_RANK, DEBUG_MODE,
  context
} from "../constants.js";
import { getLang, getHandName } from "../service/langService.js";
import { relicMap as _relicMap } from "../manager/relicManager.js";
import { sealMap, getSealTypes } from '../manager/sealManager.js';

import { writeSave, deleteSave } from "../save.js";
import { CardRenderer } from "../CardRenderer.js";
import { TS, suitColors } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import effectManager from '../manager/effectManager.js';
import DeckManager from '../manager/deckManager.js';
import { applyItemEffect, revertItemEffect, itemMap, getAllItems } from '../manager/itemManager.js';
import { DebuffManager, debuffData, debuffMap as _debuffMap } from '../manager/debuffManager.js';
import { PlayerUI } from '../ui/PlayerUI.js';
import { BattleLogUI } from '../ui/BattleLogUI.js';
import { ItemUI } from '../ui/ItemUI.js';
import { OptionUI } from '../ui/OptionUI.js';
import { PilePopupUI } from '../ui/PilePopupUI.js';


import { MonsterManager } from '../manager/monsterManager.js';
import { BossManager } from '../manager/bossManager.js';
import { BossHPBarUI } from '../ui/BossHPBarUI.js';

import { roundManager } from "../manager/roundManager.js";
import { spawnManager } from '../manager/spawnManager.js';
import MonsterView from '../ui/MonsterView.js';
import { BattleAnimationManager } from '../manager/battleAnimationManager.js';
import { BattleUIManager } from '../ui/BattleUIManager.js';
import { BattleItemManager } from '../manager/battleItemManager.js';
import { ModalUI } from '../ui/ModalUI.js';


// ─── 씬 ──────────────────────────────────────────────────────────────────────
export class BattleScene extends Phaser.Scene {
  constructor() { super("BattleScene"); }

  // ── deck 배열 단일화 — DeckManager 내부 재할당과 항상 동기화 ─────────────────
  get handData() { return this.deck.hand; }
  set handData(arr) { this.deck.hand = arr; }

  get deckData() { return this.deck.deckPile; }
  set deckData(arr) { this.deck.deckPile = arr; }

  get dummyData() { return this.deck.dummyPile; }
  set dummyData(arr) { this.deck.dummyPile = arr; }

  // ── preload ──────────────────────────────────────────────────────────────
  preload() {
    CardRenderer.preload(this);
    this.deck = new DeckManager();
    this.effects = new effectManager(this);
    this.animManager = new BattleAnimationManager(this);
    this.uiManager = new BattleUIManager(this);
    this.battleItemManager = new BattleItemManager(this);
  }

  _sfx(key) {
    const sfxVol = (this.registry.get("sfxVolume") ?? 7) / 10;
    this.sound.play(key, { volume: sfxVol * 0.6 });
  }

  // ── BGM ─────────────────────────────────────────────────────────────────
  _BGM_KEYS = ['bgm_0', 'bgm_1'];
  _bgmSound = null;
  _lastBgmKey = null;

  _playBgm() {
    const vol = (this.registry.get("bgmVolume") ?? 7) / 10;
    if (vol <= 0) return;

    // 이전과 다른 트랙 선택 (2곡이면 교대, 그 이상이면 랜덤)
    const candidates = this._BGM_KEYS.length > 1
      ? this._BGM_KEYS.filter(k => k !== this._lastBgmKey)
      : this._BGM_KEYS;
    const key = candidates[Math.floor(Math.random() * candidates.length)];
    this._lastBgmKey = key;

    this._bgmSound = this.sound.add(key, { volume: vol });
    this._bgmSound.once('complete', () => {
      this._bgmSound = null;
      if (this.scene.isActive('BattleScene')) this._playBgm();
    });
    this._bgmSound.play();
  }

  _stopBgm() {
    if (this._bgmSound) {
      this._bgmSound.stop();
      this._bgmSound.destroy();
      this._bgmSound = null;
    }
  }

  // ── create ───────────────────────────────────────────────────────────────
  create() {
    const data = this.scene.settings.data || {};

    this._initBattleData(data);
    this._initManagers(data);
    this._initGameState();

    this.drawBg();
    this.createUI();
    this.createSortButton();
    this.setupDrag();
    this.startDealAnimation();

    this._initMonsters(data);
    this._initBgm();
  }

  _initBattleData(data) {
    this.round = data.round ?? 1;
    this.battleIndex = data.battleIndex ?? 0;
    this.normalCount = data.normalCount ?? 3;
    this._fullBattleLog = data.battleLog ?? [];

    // UI 생성(_createUI) 시점에 isBoss가 필요하므로 여기서 초기화
    this.roundData = data.roundData ?? roundManager.getRoundData(this.round, this.battleIndex);
    this.isBoss = this.roundData.isBoss ?? false;
  }

  _initManagers(data) {
    this.player = new Player(data.player ?? {});
    this.deck = new DeckManager(data.deck ?? {}, this.player);
    this.debuffManager = new DebuffManager(this);
    this.monsterManager = new MonsterManager(this);
  }

  _initGameState() {
    if (this.deckData.length > 0 && this.handData.length === 0) {
      this.deck.draw(this.player.handSize);
    }
    if (this.deckData.length > 0 && this.deck.field.length === 0) {
      this.deck.startTurn(this.player.fieldSize);
    }

    const slotPos0 = this.uiManager.calcFieldPositions(this.player.fieldSize);
    this.fieldData = this.deck.field.map((c, i) => ({ ...c, slotX: slotPos0[i].x }));

    this._refreshContext();

    this.selected = new Set();
    this.forcedSelectedUids = new Set();
    this.cardObjs = [];
    this._debuffObjs = [];
    this._debuffTipObjs = [];
    this.isDragging = false;
    this.isDealing = true;
    this.fieldPickCount = 0;
    this.attackCount = 0;
    this.sortMode = null;
    this.sortAsc = true;
    this._suitLevelUpCount = 0;
    this._battleItemEffects = [];
    this._pilePopup = new PilePopupUI(this, () => this._hideCardPreview());
    this._cardPreviewObjs = null;
    this._handDropIndicator = null;
    this._pendingToggleIdx = null;
    this._dragSealImg = null;
    this._pendingDrawCards = [];
    this._isAnimatingDraw = false;

    this._optionUI = new OptionUI(this, {
      onOpen: () => { this.isDealing = true; },
      onClose: () => { this.isDealing = false; },
      onMainMenu: () => {
        writeSave(this.round, this.player.toData(), this.deck.getState(), {
          isBoss: this.isBoss,
          battleIndex: this.battleIndex,
          normalCount: this.normalCount,
          monsters: this.monsterManager.monsters,
        });
        this.scene.start("MainMenuScene");
      },
    });

    CardRenderer.createAll(this);
  }

  _initMonsters(data) {
    const rd = this.roundData;
    this.battleType = rd.battleInfo?.type ?? 'normal';
    this.monsterImgScale = this.battleType === 'elite' ? 1.4 : 1.0;

    this.monsterObjs = [];
    this._monsterSprites = [];
    this.monsters = data.monsters ? data.monsters : spawnManager.generate(rd);
    this.monsterManager.setMonsters(this.monsters);

    const positions = this.monsterManager.calcMonsterPositions(this.monsterManager.monsters.length);
    this.monsterViews = this.monsterManager.monsters.map((mon, idx) => {
      const { x, y } = positions[idx];
      const scale = mon.isBoss ? 1.8 : mon.isSummoned ? 1.0 : this.monsterImgScale;
      const offsetY = mon.isBoss ? 40 : 0;
      return new MonsterView(this, mon, idx, x, y, (i) => {
        if (!this.isDealing) this.monsterManager.attackMonster(i);
      }, scale, offsetY);
    });

    this._monsterSprites = this.monsterViews.map(v => v.sprite);
    this.input.on('pointerdown', () => this.monsterViews.forEach(v => v.hideTooltip()));

    if (this.isBoss && this.monsters.length > 0) {
      this.bossManager = new BossManager(this);
      this.bossHPBar = new BossHPBarUI(this, this.monsters[0], this.bossManager);
      this.monsterViews[0].hideHPBar();
      this.monsterViews[0].hideStats();
    }
  }

  _initBgm() {
    this._playBgm();
    this.registry.events.on('changedata-bgmVolume', (_parent, value) => {
      if (this._bgmSound) {
        const vol = value / 10;
        if (vol <= 0) this._stopBgm();
        else this._bgmSound.setVolume(vol);
      } else if (value > 0) this._playBgm();
    }, this);
    this.events.once('shutdown', () => {
      this.registry.events.off('changedata-bgmVolume', undefined, this);
      this._stopBgm();
    });
  }

  // ── 배경 & 패널 ──────────────────────────────────────────────────────────
  drawBg() {
    const PW = PLAYER_PANEL_W;
    const IPW = ITEM_PANEL_W;
    const IPX = GW - IPW;
    const FAW = GW - PW - IPW;
    const CX = PW;
    const FAW_ = FAW;

    const bgKey = this._bgKey ?? `bg_${this.round}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(GW / 2, GH / 2, bgKey)
        .setOrigin(0.5, 0.5).setDisplaySize(GW, GW).setDepth(-1);
    }

    const frameKey = "ui_frame";
    if (this.textures.exists(frameKey)) {
      // ── 배틀 로그 헤더 (상단) ──────────────────────────────────────────
      this.add.rectangle(CX, 0, FAW_, BATTLE_LOG_H, 0x000000)
        .setOrigin(0, 0).setDepth(0);

      // ── 몬스터 영역 배경 제거됨

      // ── 필드 / 핸드 공통 백그라운드 ──────────────────────────────────────────
      const boardY = FIELD_Y - FIELD_CH / 2 - 18;
      this.add.image(CX, boardY, "ui_field_hand")
        .setOrigin(0, 0).setDisplaySize(FAW_, GH - boardY - 5).setDepth(0);

      // ── 아이템 패널 (우측) ──────────────────────────────────────────────
      this.add.nineslice(IPX, 0, frameKey, 0, IPW, GH, 8, 8, 8, 8)
        .setOrigin(0, 0).setDepth(0);

      this.add.rectangle(IPX + 8, BATTLE_LOG_H, IPW - 16, 1, 0x2a4a5a).setDepth(1);
    } else {
      const g = this.add.graphics().setDepth(0);
      const boardY = FIELD_Y - FIELD_CH / 2 - 18;
      g.fillStyle(0x000000, 1.0);
      g.fillRect(CX, 0, FAW_, BATTLE_LOG_H);

      // 몬스터 영역 배경 제거됨

      // 텍스처가 없을 경우를 대비한 대체 드로잉 (이미지가 있으면 이미지가 덮어씌움)
      if (this.textures.exists("ui_field_hand")) {
        this.add.image(CX, boardY, "ui_field_hand")
          .setOrigin(0, 0).setDisplaySize(FAW_, GH - boardY - 5).setDepth(0);
      } else {
        g.fillStyle(0x050e08, 0.88);
        g.fillRoundedRect(CX, boardY, FAW_, GH - boardY - 5, 12);
        g.lineStyle(1, 0x4a7055, 1);
        g.strokeRoundedRect(CX, boardY, FAW_, GH - boardY - 5, 12);
      }
    }
  }

  // ── UI 생성 (한 번만) ─────────────────────────────────────────────────────
  createUI() {
    const PW = PLAYER_PANEL_W;
    const IPW = ITEM_PANEL_W;
    const IPX = GW - IPW;
    const IPCX = IPX + IPW / 2;
    const FAW = GW - PW - IPW;
    const faCX = PW + FAW / 2;

    // ── 플레이어 패널 (PlayerUI) ─────────────────────────────────────────
    const battleLabel = this.isBoss
      ? 'BOSS'
      : `${roundManager.getBattleDisplayNumber(this.round, this.battleIndex)}`;
    this.playerUI = new PlayerUI(this, this.player, {
      round: this.round,
      battleLabel,
      showDeckCounts: true,
      showHandConfig: true,
      onOptions: () => this._optionUI.show(),
    });
    this.playerUI.create();

    // ── 배틀 로그 (BattleLogUI) ──────────────────────────────────────────
    this.battleLogUI = new BattleLogUI(this, this._fullBattleLog);
    this.battleLogUI.create();

    // ── 아이템 패널 (ItemUI) ─────────────────────────────────────────────
    this.itemUI = new ItemUI(this, this.player, {
      panelX: IPX, panelW: IPW,
      startY: BATTLE_LOG_H,
      onItemClick: (idx) => this._useItem(idx, null),
      onRelicSell: (relicId) => {
        this.player.applyRelicOnRemove(relicId);
        this.player.removeRelic(relicId);
        this.itemUI.refresh();
        this.playerUI?.refresh();
        this.playerUI?.refreshHandConfig();
      },
      onItemSell: (idx) => {
        this.player.applyItemOnSell(idx);
        this.player.items.splice(idx, 1);
        this.itemUI.refresh();
        this.playerUI?.refresh();
      },
    });
    this.itemUI.create();

    // ── 파일 hover 툴팁 ──────────────────────────────────────────────────
    this._tooltipBg = this.add.rectangle(0, 0, 70, 26, 0x000000, 0.85).setDepth(200).setVisible(false);
    this._tooltipTxt = this.add.text(0, 0, "", TS.tooltipTxt)
      .setOrigin(0.5).setDepth(201).setVisible(false);

    // ── FIELD / HAND 카운트 (각 패널 우측 하단) ─────────────────────────
    const cornerX = GW - ITEM_PANEL_W - 16;
    //const cornerStyle = { fontFamily: TS.defaultFont, fontSize: '9px', color: '#556655' };
    this._fieldCountCornerTxt = this.add.text(cornerX, FIELD_Y + FIELD_CH / 2 + 10, "", TS.countTxt).setOrigin(1, 1).setDepth(15);
    this._handCountCornerTxt = this.add.text(cornerX, HAND_Y + CH / 2 + 10, "", TS.countTxt).setOrigin(1, 1).setDepth(15);

    // ── 메시지 텍스트 ──────────────────────────────────────────────────────
    this.msgTxt = this.add.text(faCX, BATTLE_LOG_H + 8, "", TS.msg).setOrigin(0.5, 0).setDepth(100);


    // ── DEBUG
    const debugTextX = PW + FAW - 8;
    const debugTextY = MONSTER_AREA_TOP + MONSTER_AREA_H - 8;

    // ── DEBUG: 핸드 이름 ──────────────────────────────
    this._handText = DEBUG_MODE
      ? this.add.text(debugTextX, debugTextY - 20, "", TS.countTxt)
        .setOrigin(1, 1).setDepth(31).setVisible(false)
      : null;

    // ── DEBUG: 점수 프리뷰 (몬스터 영역 우측 하단) ────────────────────────
    this.previewScoreTxt = DEBUG_MODE
      ? this.add.text(debugTextX, debugTextY, "", TS.countTxt)
        .setOrigin(1, 1).setDepth(50)
      : null;



    // ── TURN END 버튼 — 아이템 패널 하단 ────────────────────────────────
    const turnBtnX = IPCX;
    const turnBtnY = HAND_Y + CH / 2 - 15;
    this.turnEndBtn = this.add.image(turnBtnX, turnBtnY, "ui_btn")
      .setDisplaySize(140, 52).setDepth(60).setInteractive();
    this.add.text(turnBtnX, turnBtnY, "END TURN", TS.turnEndBtn)
      .setOrigin(0.5).setDepth(61);
    this.turnEndBtn.on("pointerdown", () => { if (!this.isDealing) this.onTurnEnd(); });
    this.turnEndBtn.on("pointerover", () => this.turnEndBtn.setTint(0xdddddd));
    this.turnEndBtn.on("pointerout", () => this.turnEndBtn.clearTint());

    this._attackTxt = this.add.text(turnBtnX, turnBtnY - 35, "", TS.infoValue)
      .setOrigin(0.5, 1).setDepth(61);

    this.refreshPlayerStats();
  }

  // ── 좌측 하단 정렬 버튼 ──────────────────────────────────────────────────
  createSortButton() {
    const sortCH = 50;
    const sortBottom = HAND_Y + CH / 2;
    const sortY = sortBottom - sortCH / 2;
    const sortCX = PLAYER_PANEL_W / 2;

    // 정렬 버튼
    this.sortBg = this.add.image(sortCX, sortY, "ui_btn")
      .setDisplaySize(140, sortCH + 2).setDepth(60).setInteractive();
    this.sortLabel = this.add.text(sortCX, sortY, (this.sortMode || "rank").toUpperCase(), TS.sortBtn)
      .setOrigin(0.5).setDepth(61);
    this.sortBg.on("pointerdown", () => {
      if (this.isDealing) return;
      this.sortBy(this.sortMode === "suit" ? "rank" : "suit");
    });
    this.sortBg.on("pointerover", () => this.sortBg.setTint(0xdddddd));
    this.sortBg.on("pointerout", () => this.refreshSortBtns());
  }

  refreshSortBtns() {
    if (this.sortMode) this.sortBg?.setTint(0xaaaaaa);
    else this.sortBg?.clearTint();
  }

  // 애니메이션은 animManager에 위임됨
  _animateDraw(cards, onComplete) {
    this.animManager.animateDraw(cards, this.handData, onComplete);
  }

  startDealAnimation() {
    this.animManager.showTurnNotice("PLAYER TURN", "#55ff55");
    this.time.delayedCall(1000, () => {
      this.animManager.startDealAnimation(this.handData, this.fieldData, () => {
        this.isDealing = false;
        this._applySortToHand();
        if (this.isBoss && this.bossManager && this.monsters.length > 0) {
          this.bossManager.activatePassive(this.monsters[0], 'player_turn');
        }
        this.render();
        this._saveTurnState();
      });
    });
  }

  // ── 위치 계산 (Delegated to uiManager) ────────────────────────────────────────────────────────────
  calcFieldPositions(count) { return this.uiManager.calcFieldPositions(count); }
  calcHandPositions(count) { return this.uiManager.calcHandPositions(count); }

  // ── 드래그 ───────────────────────────────────────────────────────────────
  setupDrag() {
    // 짧은 클릭이 drag로 오인되지 않도록 threshold 설정
    this.input.dragDistanceThreshold = 6;

    this.events.once('shutdown', () => {
      this.input.off('dragstart');
      this.input.off('drag');
      this.input.off('dragend');
    });

    this.input.on("dragstart", (pointer, obj) => {
      if (this.isDealing) return;
      this._sfx("sfx_slide");
      this.isDragging = true;
      obj.setDepth(200);
      if (obj.getData("itemIndex") !== undefined) {
        // 아이템 컨테이너
        this.tweens.killTweensOf(obj);
        this.tweens.add({ targets: obj, scaleX: 0.9, scaleY: 0.9, duration: 60 });
      } else if (obj.getData("handIndex") !== undefined) {
        // 핸드 카드 — drag 시작 시 pending 선택 취소 (pointerup에서 처리 예정이었던 것)
        this._pendingToggleIdx = null;
        this._lastWiggleObj = null;
        this.tweens.killTweensOf(obj);
        obj.setY(HAND_Y);
        // cardObjs에서 제거 — drag 중 render() 호출 시 파괴되지 않도록
        const cIdx = this.cardObjs.indexOf(obj);
        if (cIdx !== -1) this.cardObjs.splice(cIdx, 1);
        const hIdx = this.handCardObjs?.indexOf(obj);
        if (hIdx !== -1 && hIdx !== undefined) this.handCardObjs?.splice(hIdx, 1);
        // sealImg도 함께 추적 — drag 중 card와 같이 이동
        const seal = obj.getData("sealImg");
        if (seal?.active) {
          this._dragSealImg = seal;
          this._dragSealOffsetX = seal.x - obj.x;
          this._dragSealOffsetY = seal.y - obj.y;
          seal.setDepth(201);
          const sIdx = this.cardObjs.indexOf(seal);
          if (sIdx !== -1) this.cardObjs.splice(sIdx, 1);
        } else {
          this._dragSealImg = null;
        }
      } else {
        // 필드 카드
        obj.setDisplaySize(Math.round(CW * 0.9), Math.round(CH * 0.9));
        const idx = this.cardObjs.indexOf(obj);
        if (idx !== -1) this.cardObjs.splice(idx, 1);
      }
    });

    this.input.on("drag", (pointer, obj, dragX, dragY) => {
      obj.x = dragX;
      obj.y = dragY;
      // 핸드 카드 이동 중: 지나치는 카드 wiggle + sealImg 추적
      if (obj.getData("handIndex") !== undefined) {
        this._wiggleNearestHandCard(pointer.x);
        if (this._dragSealImg?.active) {
          this._dragSealImg.x = dragX + this._dragSealOffsetX;
          this._dragSealImg.y = dragY + this._dragSealOffsetY;
        }
      }
    });

    this.input.on("dragend", (pointer, obj) => {
      this.isDragging = false;

      // ── 아이템 drag ──────────────────────────────────────────────────
      if (obj.getData("itemIndex") !== undefined) {
        if (this._isValidItemDropZone(pointer.x, pointer.y)) {
          this._useItem(obj.getData("itemIndex"), obj);
        } else {
          this.tweens.add({
            targets: obj,
            x: obj.getData("origX"), y: obj.getData("origY"),
            scaleX: 1, scaleY: 1,
            duration: 200, ease: "Back.Out",
            onComplete: () => { obj.destroy(); this.render(); },
          });
        }
        return;
      }

      // ── 핸드 카드 순서 변경 drag ─────────────────────────────────────
      if (obj.getData("handIndex") !== undefined) {
        this._lastWiggleObj = null;
        this._dragSealImg?.destroy();
        this._dragSealImg = null;
        const fromIdx = obj.getData("handIndex");
        const positions = this.calcHandPositions(this.handData.length);

        // 드롭 위치에서 가장 가까운 슬롯 탐색
        let toIdx = fromIdx;
        let minDist = Infinity;
        positions.forEach((p, i) => {
          const dist = Math.abs(pointer.x - p.x);
          if (dist < minDist) { minDist = dist; toIdx = i; }
        });

        if (toIdx !== fromIdx) {
          const [card] = this.handData.splice(fromIdx, 1);
          this.handData.splice(toIdx, 0, card);

          // 선택 인덱스 보정
          const newSel = new Set();
          for (const idx of this.selected) {
            if (idx === fromIdx) {
              newSel.add(toIdx > fromIdx ? toIdx - 1 : toIdx);
            } else if (fromIdx < toIdx && idx > fromIdx && idx <= toIdx) {
              newSel.add(idx - 1);
            } else if (fromIdx > toIdx && idx >= toIdx && idx < fromIdx) {
              newSel.add(idx + 1);
            } else {
              newSel.add(idx);
            }
          }
          this.selected = newSel;
        }
        obj.destroy();
        this.render();
        return;
      }

      // ── 필드 카드 drag ───────────────────────────────────────────────
      if (pointer.y >= HAND_TOP) {
        const cardData = obj.getData("cardData");
        const fieldIdx = obj.getData("fieldIndex");
        if (this.handData.length >= this.player.handSizeLimit) {
          this._snapBack(obj);
          return;
        }
        const newPositions = this.calcHandPositions(this.handData.length + 1);
        const insertIdx = newPositions.findIndex(p => pointer.x < p.x);
        const handInsert = insertIdx === -1 ? this.handData.length : insertIdx;

        this.fieldData.splice(fieldIdx, 1);
        this.deck.field = this.deck.field.filter(c => c.uid !== cardData.uid);
        this.handData.splice(handInsert, 0, cardData);
        if (this.sortMode) this.doSorting(this.sortMode);
        this.fieldPickCount++;
        this.selected.clear();
        obj.destroy();
        this.render();
      } else {
        this._snapBack(obj);
      }
    });
  }

  // ── 핸드 카드 드래그 중 근처 카드 wiggle ────────────────────────────────
  _wiggleNearestHandCard(mouseX) {
    if (!this.handCardObjs?.length) return;

    // 드래그 중인 카드를 제외한 핸드 카드 중 가장 가까운 것 탐색
    let nearestObj = null;
    let minDist = Infinity;
    this.handCardObjs.forEach(cardObj => {
      if (!cardObj?.active) return;
      const dist = Math.abs(mouseX - cardObj.x);
      if (dist < minDist) { minDist = dist; nearestObj = cardObj; }
    });

    // 이전과 같은 카드면 skip, 너무 멀면 skip
    if (!nearestObj || minDist > 65 || nearestObj === this._lastWiggleObj) return;
    this._lastWiggleObj = nearestObj;

    const baseX = nearestObj.x;
    this.tweens.killTweensOf(nearestObj);
    this.tweens.chain({
      targets: nearestObj,
      tweens: [
        { x: baseX - 7, duration: 50, ease: 'Power2.Out' },
        { x: baseX + 7, duration: 50, ease: 'Power2.Out' },
        { x: baseX, duration: 50, ease: 'Back.Out' },
      ],
    });
  }

  _isValidItemDropZone(px, py) {
    if (px < PLAYER_PANEL_W || px > GW - ITEM_PANEL_W) return false;
    // 몬스터 영역
    if (py >= MONSTER_AREA_TOP && py <= MONSTER_AREA_TOP + MONSTER_AREA_H) return true;
    // 필드 영역
    if (py >= FIELD_Y - FIELD_CH / 2 - 18 && py <= FIELD_Y + FIELD_CH / 2 + 18) return true;
    // 핸드 영역
    if (py >= HAND_TOP) return true;
    return false;
  }

  _useItem(idx, obj) {
    this.battleItemManager.use(idx, obj);
  }

  _saveTurnState() {
    writeSave(this.round, this.player.toData(), this.deck.getState(), {
      isBoss: this.isBoss,
      battleIndex: this.battleIndex,
      normalCount: this.normalCount,
      monsterTier: this.monsterTier,
      totalCost: this.totalCost,
      monsters: this.monsterManager.monsters,
    });
  }

  _hideCardPreview() {
    if (!this._cardPreviewObjs) return;
    this._cardPreviewObjs.forEach(o => o?.destroy());
    this._cardPreviewObjs = null;
  }

  _snapBack(obj) {
    this.tweens.add({
      targets: obj,
      x: obj.getData("origX"),
      y: obj.getData("origY"),
      displayWidth: obj.getData("origW") ?? FIELD_CW,
      displayHeight: obj.getData("origH") ?? FIELD_CH,
      duration: 200,
      ease: "Back.Out",
      onComplete: () => { obj.destroy(); this.render(); },
    });
  }

  // ── 전체 렌더 ────────────────────────────────────────────────────────────
  render() {
    this._clearTemporaryObjects();

    this.renderDeckPile();
    this.renderDummyPile();
    this.renderField();
    this.renderHand();
    this.renderMonsters();
    this.renderDebuffIcons();
    
    this.uiManager.refreshPlayerStats();
    this.uiManager.refreshAttackCount();
    this.uiManager.refreshBattleLog();
    this.itemUI.refresh();
    this.updatePreview();
    this.refreshSortBtns();

    this._processPendingDraws();
  }

  _clearTemporaryObjects() {
    this.cardObjs.forEach(o => o.destroy());
    this.cardObjs = [];
    this.handCardObjs = [];
    this.monsterObjs.forEach(o => o.destroy());
    this.monsterObjs = [];
  }

  _processPendingDraws() {
    if (this._pendingDrawCards?.length > 0 && !this._isAnimatingDraw) {
      this._isAnimatingDraw = true;
      const pending = [...this._pendingDrawCards];
      this._pendingDrawCards = [];
      this._animateDraw(pending, () => { this._isAnimatingDraw = false; });
    }
  }

  renderDeckPile() {
    const x = PLAYER_PANEL_W + 100, y = FIELD_Y;
    const count = this.deckData.length;

    if (count > 0) {
      const maxStack = Math.min(8, Math.max(1, Math.ceil(count / 4)));
      for (let i = 0; i < maxStack; i++) {
        const dx = i * 1.5;
        const dy = i * 2.5;
        const img = this.add.image(x - dx, y - dy, "card_back")
          .setDisplaySize(FIELD_CW, FIELD_CH).setDepth(10 + i);
        this.cardObjs.push(img);
      }
    } else {
      const empty = this.add.rectangle(x, y, FIELD_CW, FIELD_CH, 0x223344, 0.5)
        .setStrokeStyle(1, 0x445566).setDepth(10);
      this.cardObjs.push(empty);
    }

    const hit = this.add.rectangle(x, y, FIELD_CW + 10, FIELD_CH + 10, 0xffffff, 0)
      .setDepth(20).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`DECK: ${count}`);
      this._tooltipBg.setPosition(x, y - FIELD_CH / 2 - 28);
      this._tooltipTxt.setPosition(x, y - FIELD_CH / 2 - 28);
      this._tooltipBg.setVisible(true).setDisplaySize(this._tooltipTxt.width + 16, 26);
      this._tooltipTxt.setVisible(true);
    });
    hit.on("pointerout", () => { this._tooltipBg.setVisible(false); this._tooltipTxt.setVisible(false); });
    hit.on("pointerdown", () => { if (!this._pilePopup.isOpen) this._pilePopup.show(this.deckData, "DECK"); });
    this.cardObjs.push(hit);
  }

  renderDummyPile() {
    const x = GW - ITEM_PANEL_W - 100, y = FIELD_Y;
    const count = this.dummyData.length;

    if (count > 0) {
      const maxStack = Math.min(8, Math.max(1, Math.ceil(count / 4)));
      for (let i = 0; i < maxStack; i++) {
        const dx = i * 1.2;
        const dy = i * 2;
        const angle = (i % 2 === 0 ? 1 : -1) * (i * 2 + 1);
        const img = this.add.image(x + dx, y - dy, "card_back")
          .setDisplaySize(FIELD_CW, FIELD_CH)
          .setAngle(angle)
          .setDepth(10 + i);
        if (i < maxStack - 1) {
          const shade = 255 - (maxStack - 1 - i) * 12;
          img.setTint(Phaser.Display.Color.GetColor(shade, shade, shade));
        }
        this.cardObjs.push(img);
      }
    } else {
      const empty = this.add.rectangle(x, y, FIELD_CW, FIELD_CH, 0x332211, 0.5)
        .setStrokeStyle(1, 0x554433).setDepth(10);
      this.cardObjs.push(empty);
    }

    const hit = this.add.rectangle(x, y, FIELD_CW + 10, FIELD_CH + 10, 0xffffff, 0)
      .setDepth(20).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`DUMMY: ${count}`);
      this._tooltipBg.setPosition(x, y - FIELD_CH / 2 - 28);
      this._tooltipTxt.setPosition(x, y - FIELD_CH / 2 - 28);
      this._tooltipBg.setVisible(true).setDisplaySize(this._tooltipTxt.width + 16, 26);
      this._tooltipTxt.setVisible(true);
    });
    hit.on("pointerout", () => { this._tooltipBg.setVisible(false); this._tooltipTxt.setVisible(false); });
    hit.on("pointerdown", () => { if (!this._pilePopup.isOpen) this._pilePopup.show(this.dummyData, "DUMMY CARDS"); });
    this.cardObjs.push(hit);
  }

  renderField() {
    // 공격 횟수 소진 또는 필드픽 한도 도달 시 비활성화
    const canPick = this.fieldPickCount < this.player.fieldSize
      && this.attackCount < this.player.attacksPerTurn;

    this.fieldData.forEach((card, i) => {
      const x = card.slotX;
      const isDisabled = this._isCardDisabled(card);
      const { cardImg: img, sealImg } = CardRenderer.drawCard(this, x, FIELD_Y, card, { width: FIELD_CW, height: FIELD_CH, depth: 10, disabled: isDisabled, objs: this.cardObjs });

      img.setInteractive({ draggable: canPick });

      if (canPick) {
        img.setData("fieldIndex", i);
        img.setData("cardData", card);
        img.setData("origX", x);
        img.setData("origY", FIELD_Y);
        img.setData("origW", FIELD_CW);
        img.setData("origH", FIELD_CH);
        img.on("pointerover", () => {
          if (!this.isDragging) {
            const hW = FIELD_CW * 1.4;
            const hH = FIELD_CH * 1.4;
            this.tweens.add({ targets: img, displayWidth: hW, displayHeight: hH, y: FIELD_Y - 10, duration: 100 });
            img.setDepth(20);
            if (sealImg) {
              const sz = Math.round(Math.min(hW, hH) * 0.3);
              const offX = Math.round(hW * 0.16);
              const offY = Math.round(hH * 0.14);
              this.tweens.add({ targets: sealImg, displayWidth: sz, displayHeight: sz, x: x + hW / 2 - sz / 2 - offX, y: (FIELD_Y - 10) - hH / 2 + sz / 2 + offY, duration: 100 });
              sealImg.setDepth(22);
            }
            CardRenderer.showSealTooltip(this, card, x, FIELD_Y, FIELD_CH);
          }
        });
        img.on("pointerout", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: FIELD_CW, displayHeight: FIELD_CH, y: FIELD_Y, duration: 100 });
            img.setDepth(10);
            if (sealImg) {
              const sz = Math.round(Math.min(FIELD_CW, FIELD_CH) * 0.3);
              const offX = Math.round(FIELD_CW * 0.16);
              const offY = Math.round(FIELD_CH * 0.14);
              this.tweens.add({ targets: sealImg, displayWidth: sz, displayHeight: sz, x: x + FIELD_CW / 2 - sz / 2 - offX, y: FIELD_Y - FIELD_CH / 2 + sz / 2 + offY, duration: 100 });
              sealImg.setDepth(12);
            }
            CardRenderer.hideSealTooltip();
          }
        });
      } else {
        img.on("pointerdown", () => {
          this.addBattleLog(`이번 턴 공격 횟수 초과! (${this.player.attacksPerTurn}회)`);
        });
        img.setAlpha(0.45);
        sealImg?.setAlpha(0.45);
      }
    });
  }

  renderHand() {
    if (this.handData.length === 0) return;

    // 공격 횟수 소진 시 비활성화
    const canPick = this.attackCount < this.player.attacksPerTurn;

    const positions = this.calcHandPositions(this.handData.length);
    const combo = this._getSelectedCombo();
    const hasValidCombo = combo.rank != null && (combo.cards?.length ?? 0) > 0;

    const comboCardSet = new Set(combo.cards ?? []);

    const count = this.handData.length;
    // 기본 크기: CW * 0.85, 9장 이상이면 추가 축소
    const baseW = Math.round(CW * 0.85);
    const baseH = Math.round(CH * 0.85);
    const scale = count >= 9 ? Math.max(0.65, 8 / count) : 1;
    const cardW = Math.round(baseW * scale);
    const cardH = Math.round(baseH * scale);
    const hoverW = Math.round(cardW * 1.35);
    const hoverH = Math.round(cardH * 1.35);

    // 강제 선택 카드 자동 반영 (selected.clear() 이후에도 유지)
    if (this.forcedSelectedUids?.size > 0) {
      this.handData.forEach((card, i) => {
        if (this.forcedSelectedUids.has(card.uid)) this.selected.add(i);
      });
    }

    this.handData.forEach((card, i) => {
      const sel = this.selected.has(i);
      const inCombo = sel && hasValidCombo && comboCardSet.has(card);
      const x = positions[i].x;
      const selOffset = Math.round(22 * scale);
      const y = sel ? HAND_Y - selOffset : HAND_Y;

      const isDisabled = this._isCardDisabled(card);
      const isFlipped = card.flipped === true;
      let img, sealImg;
      if (isFlipped) {
        img = this.add.image(x, y, 'card_back').setDisplaySize(cardW, cardH).setDepth(sel ? 32 : 30);
        this.cardObjs.push(img);
        sealImg = null;
      } else {
        ({ cardImg: img, sealImg } = CardRenderer.drawCard(this, x, y, card, { width: cardW, height: cardH, depth: sel ? 32 : 30, disabled: isDisabled, objs: this.cardObjs }));
      }

      // 핸드 카드는 항상 드래그 가능 (순서 변경)
      img.setInteractive();
      this.input.setDraggable(img);
      img.setData("handIndex", i);
      img.setData("sealImg", sealImg ?? null);

      if (canPick) {
        // pointerdown: drag 여부 판단을 위해 pending만 설정, 실제 선택은 pointerup에서 처리
        img.on("pointerdown", () => { if (!this.isDealing) this._pendingToggleIdx = i; });
        img.on("pointerup", () => {
          if (this._pendingToggleIdx === i && !this.isDealing) this.toggleHand(i);
          this._pendingToggleIdx = null;
        });
        img.on("pointerover", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: hoverW, displayHeight: hoverH, y: y - 8, duration: 100 });
            img.setDepth(40);
            if (sealImg) {
              const hSz = Math.round(Math.min(hoverW, hoverH) * 0.3);
              const offX = Math.round(hoverW * 0.16);
              const offY = Math.round(hoverH * 0.14);
              this.tweens.add({ targets: sealImg, displayWidth: hSz, displayHeight: hSz, x: x + hoverW / 2 - hSz / 2 - offX, y: (y - 8) - hoverH / 2 + hSz / 2 + offY, duration: 100 });
              sealImg.setDepth(42);
            }
            CardRenderer.showSealTooltip(this, card, x, y, cardH);
          }
        });
        img.on("pointerout", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: cardW, displayHeight: cardH, y, duration: 100 });
            img.setDepth(sel ? 32 : 30);
            if (sealImg) {
              const oSz = Math.round(Math.min(cardW, cardH) * 0.3);
              const oOffX = Math.round(cardW * 0.16);
              const oOffY = Math.round(cardH * 0.14);
              this.tweens.add({ targets: sealImg, displayWidth: oSz, displayHeight: oSz, x: x + cardW / 2 - oSz / 2 - oOffX, y: y - cardH / 2 + oSz / 2 + oOffY, duration: 100 });
              sealImg.setDepth(sel ? 34 : 32);
            }
            CardRenderer.hideSealTooltip();
          }
        });
      } else {
        img.on("pointerdown", () => {
          this.addBattleLog(`이번 턴 공격 횟수 초과! (${this.player.attacksPerTurn}회)`);
        });
      }

      this.handCardObjs.push(img);

      if (inCombo) {
        this.tweens.add({
          targets: img,
          x: { from: x - 3, to: x + 3 },
          duration: 55, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
    });
  }

  // ── 몬스터 렌더 ──────────────────────────────────────────────────────────
  renderMonsters() {
    const mons = this.monsterManager.monsters;
    const positions = this.monsterManager.calcMonsterPositions(mons.length);

    const _combo = this._getSelectedCombo();
    const hasCombo = _combo.rank != null && (_combo.cards?.length ?? 0) > 0
      && this.attackCount < this.player.attacksPerTurn
      && !this.debuffManager.disabledHandRanks.has(_combo.rank);
    const imgW = 156, imgH = 156;

    // 하단 기준 레이아웃
    const MON_BOTTOM = MONSTER_AREA_TOP + MONSTER_AREA_H - 4;  // 400
    const BAR_H = 10;
    const STAT_H = 14;
    const barY = MON_BOTTOM - STAT_H - 6 - BAR_H / 2;    // bar 중심
    const statY = MON_BOTTOM - STAT_H / 2;                 // ATK/DEF 중심
    const spriteY = barY - BAR_H / 2 - 8 - imgH / 2;        // 스프라이트 중심

    mons.forEach((mon, idx) => {
      this.monsterViews[idx].update(mon, positions[idx].x, hasCombo && !mon.isDead);
    });

    this._monsterSprites = this.monsterViews.map(v => v.sprite);

    if (this.isBoss && this.bossHPBar && mons[0]) {
      this.bossHPBar.update(mons[0], this.bossManager);
    }
  }

  // ── 아이템 패널 렌더 ─────────────────────────────────────────────────────
  // ── 현재 선택에서 효과 받는 relic id 목록 ──────────────────────────────
  _getApplicableRelicIds(rank) {
    const deckCount = this.deckData?.length ?? 0;
    const allDeckCount = (this.deckData?.length ?? 0) + (this.dummyData?.length ?? 0) + (this.handData?.length ?? 0) + (this.fieldData?.length ?? 0);
    const selectedCards = [...this.selected].map(i => this.handData[i]);
    const hp = this.player.hp, maxHp = this.player.maxHp;
    const handRemaining = this.handData.length - this.selected.size;

    return (this.player.relics ?? []).filter(id => {
      const relic = _relicMap[id];
      if (!relic) return false;
      const SCORE_SCOPES = new Set(['card', 'hand', 'final']);

      return relic.effects.some(eff => {
        if (!SCORE_SCOPES.has(eff.scope)) return false;

        // 1. 특정 효과 타입별 조건 체크
        if (eff.type === 'timesMultiWhenNoHand' && handRemaining > 0) return false;
        if (eff.type === 'plusMultiPerHandRemaining' && handRemaining <= 0) return false;
        if (eff.type === 'plusMultiPerItemUsage' && this.player.itemUseCount <= 0) return false;
        if (eff.type === 'plusMultiPerExcessDeck' && allDeckCount < (eff.threshold ?? 50)) return false;
        if (eff.type === 'addPerExcessDeck' && deckCount < (eff.threshold ?? 0)) return false;

        // 2. 공통 Condition 체크
        const cond = eff.condition;
        if (!cond) return true;

        if (cond.handRank != null && cond.handRank !== rank) return false;
        if (cond.deckCountGte && deckCount < cond.deckCountGte) return false;
        if (cond.deckCountLte != null && deckCount > cond.deckCountLte) return false;
        if (cond.isFullHp && hp !== maxHp) return false;
        if (cond.cardCount != null && selectedCards.length !== cond.cardCount) return false;

        if (cond.cardValSumLt != null) {
          const sum = selectedCards.reduce((s, c) => s + (c.baseScore ?? 0), 0);
          if (sum >= cond.cardValSumLt) return false;
        }

        if (cond.suit || cond.rank || cond.rankIn) {
          if (!selectedCards.some(c =>
            (!cond.suit || c.suit === cond.suit) &&
            (!cond.rank || c.rank === cond.rank) &&
            (!cond.rankIn || cond.rankIn.includes(c.rank))
          )) return false;
        }
        return true;
      });
    });
  }

  // ── 디버프 아이콘 렌더 (몬스터 영역 좌상단) ──────────────────────────────
  renderDebuffIcons() {
    this._hideDebuffTip();
    this._debuffObjs.forEach(o => o.destroy());
    this._debuffObjs = [];
    if (!this.debuffManager.activeDebuffs.length) return;

    const SIZE = 28;
    const GAP = 34;
    const startX = PLAYER_PANEL_W + 10 + SIZE / 2;
    // 보스전: boss HP bar(MONSTER_AREA_TOP+4, h=20) + ATK/DEF행(+6, ~10px) 아래
    const iconY = this.isBoss
      ? MONSTER_AREA_TOP + 4 + 20 + 6 + 14 + SIZE / 2   // ≈ 138
      : MONSTER_AREA_TOP + 8 + SIZE / 2;                 // 일반: 102

    this.debuffManager.activeDebuffs.forEach((active, idx) => {
      const def = _debuffMap[active.id];
      if (!def) return;
      const x = startX + idx * GAP;

      // 배경
      const bg = this.add.rectangle(x, iconY, SIZE, SIZE, 0x1a0a2e, 0.88)
        .setDepth(20).setStrokeStyle(1, 0xaa44ff);
      this._debuffObjs.push(bg);

      // 아이콘 이미지 or 텍스트 폴백
      const imgKey = active.id;
      const icon = this.textures.exists(imgKey)
        ? this.add.image(x, iconY, imgKey).setDisplaySize(SIZE - 4, SIZE - 4).setDepth(21)
        : this.add.text(x, iconY, def.name[0], { fontFamily: TS.defaultFont, fontSize: '9px', color: '#cc88ff' }).setOrigin(0.5).setDepth(21);
      this._debuffObjs.push(icon);

      // 남은 턴 / B 표시
      const durLabel = active.turnsLeft > 0 ? `${active.turnsLeft}` : 'B';
      const dur = this.add.text(x + SIZE / 2 - 1, iconY + SIZE / 2 - 1, durLabel,
        { fontFamily: TS.defaultFont, fontSize: '7px', color: '#ffff44' })
        .setOrigin(1, 1).setDepth(22);
      this._debuffObjs.push(dur);

      // 히트 영역 + 툴팁
      const hit = this.add.rectangle(x, iconY, SIZE + 4, SIZE + 4, 0xffffff, 0)
        .setDepth(23).setInteractive();
      hit.on('pointerover', () => {
        const durStr = active.turnsLeft > 0 ? `남은 턴: ${active.turnsLeft}` : '배틀 종료 시 제거';
        this._showDebuffTip(def, durStr, x, iconY + SIZE / 2 + 6);
      });
      hit.on('pointerout', () => this._hideDebuffTip());
      this._debuffObjs.push(hit);
    });
  }

  // ── 디버프 툴팁 (PlayerUI 스타일 통일) ───────────────────────────────────
  _showDebuffTip(def, durStr, tipX, tipY) {
    this._hideDebuffTip();
    const TIER_COLORS = { 1: '#44cc88', 2: '#4488ff', 3: '#aa44ff' };
    const color = TIER_COLORS[def.tier] ?? '#44cc88';
    const colorN = parseInt(color.replace('#', ''), 16);
    const lines = [def.name, def.description, durStr];
    const tw = 210, pad = 12, lineH = 20;
    const th = pad * 2 + lines.length * lineH;
    const tx = Math.min(tipX, GW - ITEM_PANEL_W - tw - 4);

    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x0a1e12, 0.95);
    g.fillRoundedRect(tx, tipY, tw, th, 6);
    g.lineStyle(1, colorN);
    g.strokeRoundedRect(tx, tipY, tw, th, 6);
    this._debuffTipObjs.push(g);

    lines.forEach((line, i) => {
      const style = i === 0
        ? { fontFamily: TS.defaultFont, fontSize: '10px', color }
        : { fontFamily: 'Arial', fontSize: '14px', color: '#aaccbb' };
      this._debuffTipObjs.push(
        this.add.text(tx + pad, tipY + pad + i * lineH, line, style)
          .setOrigin(0, 0).setDepth(301)
      );
    });
  }

  _hideDebuffTip() {
    this._debuffTipObjs.forEach(o => o.destroy());
    this._debuffTipObjs = [];
  }

  // ── context 갱신 (ATK 레벨업 등 mid-battle 변경 반영) ────────────────────
  _refreshContext() {
    context.deckCount = this.deckData?.length ?? 0;
    context.allDeckCount = (this.deckData?.length ?? 0) + (this.dummyData?.length ?? 0) + (this.handData?.length ?? 0) + (this.fieldData?.length ?? 0);
    context.dummyCount = this.dummyData?.length ?? 0;
    context.handConfig = this.player.getEffectiveHandConfig();
    context.relics = this.player.relics ?? [];
    context.relicSlots = this.player.relicSlots ?? null;
    context.enabledHands = this.player.getEnabledHands();
    context.suitAliases = this.player.getEffectiveSuitAliases();
    context.atk = this.player.atk;
    context.hp = this.player.hp;
    context.maxHp = this.player.maxHp;
    context.handUseCounts = this.player.handUseCounts ?? {};
    context.itemUseCount = this.player.itemUseCount ?? 0;
    context.attrs = this.player.attrs;
    context.adaptability = this.player.adaptability;
    context.bingoLevels = this.player.bingoLevels;

    const rankCounts = {};
    (this.deckData ?? []).forEach(c => {
      rankCounts[c.rank] = (rankCounts[c.rank] ?? 0) + 1;
    });
    context.deckRankCounts = rankCounts;
  }

  // ── 디버프 카드 여부 (DebuffManager에 위임) ────────────────────────────────
  _isCardDisabled(card) {
    return this.debuffManager.isCardDisabled(card);
  }

  // ── 씰 효과 적용 (공격에 사용된 카드 기준) ───────────────────────────────
  _applySealEffects(cards) {
    let goldGained = 0;

    for (const card of cards) {
      for (const enh of (card.enhancements ?? [])) {
        if (enh.type === 'gold') {
          goldGained += sealMap['gold']?.goldBonus ?? 5;
        } else if (enh.type === 'green') {
          if (this.player.items.length < this.player.maxItemCount) {
            const all = getAllItems();
            const item = all[Math.floor(Math.random() * all.length)];
            this.player.items.push({
              uid: `seal_item_${crypto.randomUUID()}`,
              id: item.id, name: item.name, desc: item.desc,
              rarity: item.rarity, img: item.img,
            });
            this.addBattleLog(`[씰] ${card.key} → 아이템 [${item.name}] 획득!`);
          }
        } else if (enh.type === 'pink') {
          const healAmt = sealMap['pink']?.healBonus ?? 5;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
          this.addBattleLog(`[씰] ${card.key} → HP +${healAmt} 회복!`);
        } else if (enh.type === 'purple') {
          // handData + 대기 중인 pending 카드까지 합산해 limit 체크
          const projectedLen = this.handData.length + this._pendingDrawCards.length;
          if (this.deckData.length > 0 && projectedLen < this.player.handSizeLimit) {
            const drawn = this.deckData.pop();
            this._pendingDrawCards.push(drawn);  // render() 후 애니메이션으로 handData에 추가
            this.addBattleLog(`[씰] ${card.key} → 덱에서 ${drawn.key} 드로우!`);
          }
        }
      }
    }

    if (goldGained > 0) {
      this.player.gold += goldGained;
      this.addBattleLog(`[씰] +${goldGained}G 획득!`);
    }
  }

  _getSelectedCombo() {
    if (this.selected.size === 0) return { score: 0, handName: "" };
    const activeCards = [...this.selected]
      .map(i => this.handData[i])
      .filter(c => !this._isCardDisabled(c));
    if (activeCards.length === 0) return { score: 0, handName: "" };
    context.handRemainingCount = this.handData.length - activeCards.length;
    return calculateScore(activeCards, context);
  }

  _updateHandPreviewLabel(rank, handRankSealed) {
    const lang = getLang(this);
    const key = HAND_DATA[rank]?.key ?? '';
    const name = getHandName(lang, key);

    if (handRankSealed) {
      this._handText?.setText(`${name} [봉인]`).setVisible(true);
      this.playerUI?.highlightHand(null);
      this.itemUI?.rattleRelics([]);
    } else {
      this._handText?.setText(name).setVisible(true);
      this.playerUI?.highlightHand(rank);
      this.itemUI?.rattleRelics(this._getApplicableRelicIds(rank));
    }
  }

  /** 턴 시작 시 발동하는 유물 효과 적용 */
  _applyTurnStartRelics() {
    (this.player.relics ?? []).forEach(relicId => {
      const relic = _relicMap[relicId];
      if (!relic) return;
      relic.effects.forEach(eff => {
        if (eff.type === 'heal_per_turn_percent') {
          const healAmt = Math.floor(this.player.maxHp * eff.value);
          if (healAmt > 0) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
            this.addBattleLog(`[${relic.name}] HP ${healAmt} 회복!`);
          }
        }
      });
    });
    this.refreshPlayerStats();
  }

  updatePreview() {
    this._refreshContext();
    const result = this._getSelectedCombo();
    this.uiManager.updatePreview(result, this.handData, this.selected);
  }

  refreshAttackCount() { this.uiManager.refreshAttackCount(); }
  refreshPlayerStats() { this.uiManager.refreshPlayerStats(); }
  refreshPlayerLevel() { this.playerUI.refreshLevel(); }
  addBattleLog(text) { this.uiManager.addBattleLog(text); }
  refreshBattleLog() { this.uiManager.refreshBattleLog(); }


  toggleHand(i) {
    if (this.selected.has(i)) {
      if (this.forcedSelectedUids?.has(this.handData[i]?.uid)) return;
      this.selected.delete(i);
    } else {
      if (this.selected.size >= 5) return;
      this.selected.add(i);
    }
    this._sfx("sfx_place");
    this.render();
  }

  _flyToDummy(fromX, fromY, key = "card_back") {
    this.animManager.flyToDummy(fromX, fromY, key);
  }

  playAttackAnimation(details, cardFlyInfo, onCardsConsumed, onComplete) {
    this.animManager.playAttackAnimation(details, cardFlyInfo, onCardsConsumed, onComplete);
  }

  _applySortToHand() {
    if (this.sortMode === null) { this.sortMode = "rank"; this.sortAsc = true; }
    this.doSorting(this.sortMode);
  }

  sortBy(mode) {
    this.sortMode === mode
      ? (this.sortAsc = !this.sortAsc)
      : (this.sortMode = mode, this.sortAsc = true);

    // 버튼 텍스트 업데이트
    if (this.sortLabel) {
      this.sortLabel.setText(mode.toUpperCase());
    }

    this.doSorting(mode);
    this.selected.clear();
    this.render();
  }

  doSorting(mode) {
    const suitCmp = (a, b) => {
      const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return sd !== 0
        ? (this.sortAsc ? sd : -sd)
        : (this.sortAsc ? RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) : RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank));
    };
    const rankCmp = (a, b) => {
      const vd = RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
      return vd !== 0
        ? (this.sortAsc ? vd : -vd)
        : (this.sortAsc ? SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] : SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit]);
    };
    const cmp = mode === "suit" ? suitCmp : rankCmp;

    this.handData.sort(cmp);

    if (this.fieldData?.length > 0) {
      const slotXs = this.fieldData.map(c => c.slotX);
      this.fieldData.sort(cmp);
      slotXs.forEach((sx, i) => { this.fieldData[i].slotX = sx; });
    }
  }



  // ── 턴 종료 ──────────────────────────────────────────────────────────────
  onTurnEnd() {
    this.isDealing = true;
    this.selected.clear();
    this.render();

    // 플립 해제 (샤먼 베일 효과는 플레이어 턴 동안만 지속)
    this.handData.forEach(c => { delete c.flipped; });
    this.fieldData.forEach(c => { delete c.flipped; });
    this.deckData.forEach(c => { delete c.flipped; });
    this.dummyData.forEach(c => { delete c.flipped; });
    // 강제 선택 해제 (바바리안 효과는 플레이어 턴 동안만 지속)
    this.forcedSelectedUids?.clear();

    // first_turn_def 기믹 해제
    this.monsters?.forEach(m => {
      if (m.gimmick?.type === 'first_turn_def' && m.gimmick.firstTurnActive) {
        m.gimmick.firstTurnActive = false;
      }
    });

    const triggerEnemyTurns = () => {
      const onMonstersDone = () => {
        try { this.render(); } catch (e) { console.error("[onTurnEnd render]", e); }
        this.bossHPBar?.update(this.monsters[0], this.bossManager, false);
        if (this.player.hp <= 0) {
          this.time.delayedCall(500, () => this.showGameOver());
          return;
        }
        if (this.deckData.length === 0) {
          this.addBattleLog("덱 소진!");
          this.refreshBattleLog();
          this.time.delayedCall(500, () => this.showGameOver());
          return;
        }

        this.fieldData.forEach(card => this._flyToDummy(card.slotX, FIELD_Y, card.key));
        this.fieldData = [];
        this.deck.endTurn();  // dummyData/deckData/handData는 getter → 자동 반영
        this.render();        // 빈 필드로 즉시 재렌더 (ghost 애니메이션은 진행 중)

        this.time.delayedCall(500, () => this.startTurn());
      };

      // 보스 턴
      if (this.isBoss && this.bossManager) {
        const boss = this.monsters[0];
        if (!boss || boss.isDead) {
          onMonstersDone();
          return;
        }
        this.bossManager.doTurn(boss, onMonstersDone);
        return;
      }

      // 일반 몬스터 턴
      const alive = this.monsterManager.monsters.filter(m => !m.isDead);
      const ATK_GAP = 650;

      alive.forEach((m, localIdx) => {
        const globalIdx = this.monsterManager.monsters.indexOf(m);
        this.time.delayedCall(localIdx * ATK_GAP, () => {
          this.monsterManager.doMonsterAction(globalIdx, m);
          this.refreshPlayerStats();
          this.refreshBattleLog();
        });
      });

      this.time.delayedCall(alive.length * ATK_GAP + 300, onMonstersDone);
    };

    // 알림 후 몬스터 턴 시작
    this.animManager.showTurnNotice("ENEMY TURN", "#ff5555");
    this.time.delayedCall(1000, triggerEnemyTurns);
  }

  // ── 턴 시작 ──────────────────────────────────────────────────────────────
  startTurn() {
    this.animManager.showTurnNotice("PLAYER TURN", "#55ff55");

    this.time.delayedCall(800, () => {
      try {
        // ── 유물 턴 시작 효과 ──────────────────────────────────────────────────
        this._applyTurnStartRelics();

        // ── 필드 보충 ──────────────────────────────────────────────────────────
        const slotPos = this.calcFieldPositions(this.player.fieldSize);
        const draw = Math.min(this.player.fieldSize, this.deckData.length);
        const newCards = Array.from({ length: draw }, () => this.deckData.pop());
        this.deck.field = newCards;
        const newFieldData = newCards.map((c, k) => ({ ...c, slotX: slotPos[k].x }));
        this.fieldData = []; // 애니메이션 전 빈 상태로 렌더

        // ── 핸드 최솟값 보충 (드로우 애니메이션용: handData에 즉시 추가 안 함) ──
        const handMin = this.player.getEffectiveHandSizeMinimum();
        const drawLimit = this.player.canBypassDrawLimit() ? 99 : (this.player.turnStartDrawLimit ?? 0);
        const shortage = handMin - this.handData.length;
        const drawnCards = [];
        if (shortage > 0 && drawLimit > 0 && this.deckData.length > 0) {
          const toDraw = Math.min(shortage, drawLimit, this.deckData.length);
          for (let i = 0; i < toDraw; i++) drawnCards.push(this.deckData.pop());
        }

        if (this.isBoss && this.bossManager && this.monsters.length > 0) {
          this.bossManager.activatePassive(this.monsters[0], 'player_turn');
        }

        this.debuffManager.tick();
        this.fieldPickCount = 0;
        this.attackCount = 0;
        this.selected.clear();
        this._applySortToHand();
        this.render();  // 핸드 렌더 (필드는 빈 상태)

        // 필드 카드 드로우 애니메이션 → 완료 시 실제 카드 렌더
        this.animManager.animateField(newFieldData, () => {
          this.fieldData = newFieldData;
          try { this.render(); } catch (e) { console.error('[animateField render]', e); }
        });

        if (drawnCards.length > 0) {
          // isDealing은 애니메이션이 끝날 때 해제
          // _animateDraw 내부 예외 시에도 isDealing이 잠기지 않도록 try-catch로 감쌈
          try {
            this._animateDraw(drawnCards, () => {
              this.isDealing = false;
              this._saveTurnState();
            });
          } catch (e) {
            console.error("[startTurn _animateDraw]", e);
            this.isDealing = false;
          }
        } else {
          this.isDealing = false;
          this._saveTurnState();
        }
      } catch (e) {
        console.error("[startTurn timer]", e);
        this.isDealing = false;
      }
    });
  }

  // ── 배틀 클리어 ──────────────────────────────────────────────────────────
  onBattleClear() {
    const modal = new ModalUI(this, { depth: 300, isDealing: true });

    this.debuffManager.clearAll();
    this.render();
    this.player.def = 0;
    this.bossHPBar?.destroy();
    this.bossHPBar = null;

    const next = roundManager.getNextStep(this.round, this.battleIndex);
    const nextType = next.isGameEnd ? null : roundManager.getRoundData(next.round, next.battleIndex)?.battleInfo?.type;

    const pw = 580, ph = 330;
    const { cx, cy, D, panelTop: pt } = modal.createBase(pw, ph, { closeOnDim: false, bgKey: "ui_battle_popup" });

    const titleText = next.isGameEnd ? "GAME CLEAR!" : (next.isNextRound ? "ROUND CLEAR!" : "BATTLE CLEAR!");
    const subText = `ROUND ${this.round}-${this.battleIndex + 1}  SCORE: ${this.player.score}`;
    const noteText = next.isGameEnd ? "게임 클리어!" : (nextType === 'market' ? "마켓으로..." : (next.isNextRound ? "다음 라운드로..." : "다음 전투로..."));

    modal.addObj(this.add.text(cx, pt + 70, titleText, TS.clearTitle).setOrigin(0.5).setDepth(D + 2));
    modal.addObj(this.add.text(cx, pt + 118, subText, TS.clearSub).setOrigin(0.5).setDepth(D + 2));
    modal.addObj(this.add.text(cx, pt + 158, noteText, TS.clearNote).setOrigin(0.5).setDepth(D + 2));

    const btnY = pt + ph - 66;
    const btn = this.add.image(cx, btnY, "ui_btn").setDisplaySize(180, 44).setDepth(D + 2).setInteractive();
    modal.addObj(btn);
    modal.addObj(this.add.text(cx, btnY, "CONTINUE", TS.menuBtn).setOrigin(0.5).setDepth(D + 3));

    btn.on("pointerover", () => btn.setTint(0xcccccc));
    btn.on("pointerout", () => btn.clearTint());
    btn.on("pointerdown", () => {
      this.deck.resetForNextBattle();
      this._battleItemEffects.forEach(id => revertItemEffect(this.player, id));
      this._battleItemEffects = [];

      if (next.isGameEnd) {
        deleteSave();
        this.scene.start("MainMenuScene");
      } else {
        writeSave(next.round, this.player.toData(), this.deck.getState(), { battleIndex: next.battleIndex });
        this.scene.start("GameScene", {
          round: next.round,
          battleIndex: next.battleIndex,
          player: this.player.toData(),
          deck: this.deck.getState(),
          battleLog: this.battleLogUI.logs,
        });
      }
      modal.close();
    });
  }

  // ── 레벨업 후 처리 ────────────────────────────────────────────────────────
  _checkLevelUpThenProceed() {
    const isAllDead = () => this.monsterManager.monsters.every(m => m.isDead);

    if (this._suitLevelUpCount > 0) {
      this._showLevelUpPopup(() => {
        if (isAllDead()) this.time.delayedCall(500, () => this.onBattleClear());
      });
    } else if (isAllDead()) {
      this.time.delayedCall(700, () => this.onBattleClear());
    }
  }

  // ── 레벨업 suit 선택 팝업 ─────────────────────────────────────────────────
  _showLevelUpPopup(onAllDone) {
    const modal = new ModalUI(this, { depth: 800, isDealing: true });

    const SUIT_SYMS = { S: '\u2660', H: '\u2665', C: '\u2663', D: '\u2666' };
    const SUIT_DESCS = { S: 'MON DEF\u2193', H: 'HP\u2191', C: 'MON ATK\u2193', D: 'MY DEF\u2191' };
    const SUIT_KEYS = ['S', 'H', 'C', 'D'];

    const pw = 500, ph = 320;
    const { cx, D, panelTop: pt } = modal.createBase(pw, ph, { closeOnDim: false, dimAlpha: 0.72, bgKey: "ui_battle_popup" });

    modal.addObj(this.add.text(cx, pt + 90, `LEVEL UP!  Lv${this.player.level}`, TS.popupTitle).setOrigin(0.5).setDepth(D + 2));

    const remTxt = this.add.text(cx, pt + 120, `SUIT 선택 (${this._suitLevelUpCount}회 남음)`, TS.popupContent).setOrigin(0.5).setDepth(D + 2);
    modal.addObj(remTxt);

    const btnY = pt + 190, btnW = 84, btnH = 68, btnGap = 90;
    const btnX0 = cx - btnGap * 1.5;

    SUIT_KEYS.forEach((suit, idx) => {
      const bx = btnX0 + idx * btnGap;
      const btnBg = this.add.rectangle(bx, btnY, btnW, btnH, 0xffffff, 0).setDepth(D + 2).setInteractive();

      const fontStyle = { fontFamily: TS.defaultFont, fontSize: '11px', color: suitColors[suit] };

      modal.addObj(btnBg);
      modal.addObj(this.add.text(bx, btnY - 12, SUIT_SYMS[suit], { fontFamily: 'Arial', fontSize: '24px', color: suitColors[suit] }).setOrigin(0.5).setDepth(D + 3));

      const lvTxt = this.add.text(bx, btnY + 10, `Lv${this.player.attrs[suit]}`, fontStyle).setOrigin(0.5).setDepth(D + 3);
      modal.addObj(lvTxt);
      modal.addObj(this.add.text(bx, btnY + 26, SUIT_DESCS[suit], fontStyle).setOrigin(0.5).setDepth(D + 3));

      btnBg.on('pointerdown', () => {
        if (this._suitLevelUpCount <= 0) return;
        this.player.attrs[suit]++;
        this._suitLevelUpCount--;
        this.addBattleLog(`${SUIT_SYMS[suit]} Lv${this.player.attrs[suit]}!`);
        lvTxt.setText(`Lv${this.player.attrs[suit]}`);
        remTxt.setText(`SUIT 선택 (${this._suitLevelUpCount}회 남음)`);
        this.refreshPlayerLevel();
        if (this._suitLevelUpCount <= 0) { modal.close(); onAllDone?.(); }
      });
      btnBg.on('pointerover', () => btnBg.setFillStyle(0xffffff, 0.05));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0xffffff, 0));
    });
  }

  // ── 게임 오버 ────────────────────────────────────────────────────────────
  showGameOver() {
    const modal = new ModalUI(this, { depth: 300, isDealing: true });
    deleteSave();

    const pw = 500, ph = 320;
    const { cx, cy, D, panelTop: pt } = modal.createBase(pw, ph, { closeOnDim: false, dimAlpha: 0.72, bgKey: "ui_battle_popup" });

    modal.addObj(this.add.text(cx, pt + 72, "GAME OVER", TS.gameOverTitle).setOrigin(0.5).setDepth(D + 2));
    modal.addObj(this.add.text(cx, pt + 148, "FINAL SCORE", TS.gameOverScoreLabel).setOrigin(0.5).setDepth(D + 2));
    modal.addObj(this.add.text(cx, pt + 182, `${this.player.score}`, TS.gameOverScore).setOrigin(0.5).setDepth(D + 2));

    const btnBg = this.add.image(cx, pt + ph - 90, "ui_btn").setDisplaySize(180, 44).setDepth(D + 3).setInteractive();
    modal.addObj(btnBg);
    modal.addObj(this.add.text(cx, pt + ph - 90, "MAIN MENU", TS.sortBtn).setOrigin(0.5).setDepth(D + 4));

    btnBg.on("pointerdown", () => this.scene.start("MainMenuScene"));
    btnBg.on("pointerover", () => btnBg.setTint(0xcccccc));
    btnBg.on("pointerout", () => btnBg.clearTint());
  }

  showMsg(text, dur = 2000) {
    this.msgTxt.setText(text);
    if (this._mt) this._mt.remove();
    this._mt = this.time.delayedCall(dur, () => this.msgTxt.setText(""));
  }

  // ── 인게임 옵션 오버레이 ─────────────────────────────────────────────────
  _showOptions() { this._optionUI.show(); }
  _closeOptions() { this._optionUI.close(); }
}
