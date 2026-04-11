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
import { getHandName } from "../service/langService.js";
import { relicMap as _relicMap } from "../manager/relicManager.js";
import { sealMap, getSealTypes } from '../manager/sealManager.js';

import { writeSave, deleteSave } from "../save.js";
import { CardRenderer } from "../CardRenderer.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import effectManager from '../manager/effectManager.js';
import DeckManager from '../manager/deckManager.js';
import { applyItemEffect, revertItemEffect, itemMap, getAllItems, maxItemCount } from '../manager/itemManager.js';
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

// ─── 씬 ──────────────────────────────────────────────────────────────────────
export class BattleScene extends Phaser.Scene {
  constructor() { super("BattleScene"); }

  // ── preload ──────────────────────────────────────────────────────────────
  preload() {
    CardRenderer.preload(this);
    this.deck = new DeckManager();
    this.effects = new effectManager(this);
  }

  _sfx(key) {
    const sfxVol = (this.registry.get("sfxVolume") ?? 7) / 10;
    this.sound.play(key, { volume: sfxVol * 0.6 });
  }

  // ── create ───────────────────────────────────────────────────────────────
  create() {
    const data = this.scene.settings.data || {};

    this.round = data.round ?? 1;
    this.battleIndex = data.battleIndex ?? 0;
    this.normalCount = data.normalCount ?? 3;

    this.player = new Player(data.player ?? {});
    this.deck = new DeckManager(data.deck ?? {}, this.player);

    // 덱 상태는 있지만 hand/field가 비어있으면 초기 배치 (배틀 간 리셋 후)
    if (this.deck.deckPile.length > 0 && this.deck.hand.length === 0) {
      this.deck.draw(this.player.handSize);
    }
    if (this.deck.deckPile.length > 0 && this.deck.field.length === 0) {
      this.deck.startTurn(this.player.fieldSize);
    }

    this.handData = this.deck.hand;
    const slotPos0 = this.calcFieldPositions(this.player.fieldSize);
    this.fieldData = this.deck.field.map((c, i) => ({ ...c, slotX: slotPos0[i].x }));
    this.deckData = this.deck.deckPile;
    this.dummyData = this.deck.dummyPile;

    this._refreshContext();

    this.selected = new Set();
    this.cardObjs = [];
    this._debuffObjs = [];
    this._debuffTipObjs = [];
    this.debuffManager = new DebuffManager(this);
    this.monsterManager = new MonsterManager(this);
    this.animObjs = [];
    this._optionUI = new OptionUI(this, {
      onOpen: () => { this.isDealing = true; },
      onClose: () => { this.isDealing = false; },
      onMainMenu: () => {
        writeSave(this.round, this.player.toData(), this.deck.getState(), { battleIndex: this.battleIndex });
        this.scene.start("MainMenuScene");
      },
    });
    this.isDragging = false;
    this.isDealing = true;
    this.fieldPickCount = 0;
    this.attackCount = 0;
    this.sortMode = null;
    this.sortAsc = true;
    this._fullBattleLog = data.battleLog ?? [];
    this._suitLevelUpCount = 0;
    this._battleItemEffects = []; // 배틀 한정 아이템 효과 기록 (종료 시 되돌리기)
    this._pilePopup = new PilePopupUI(this, () => this._hideCardPreview());
    this._cardPreviewObjs = null;

    CardRenderer.createAll(this);

    // isBoss는 createUI() 내부에서 사용되므로 반드시 먼저 설정
    const roundData = roundManager.getRoundData(this.round, this.battleIndex);
    this.isBoss = roundData.isBoss ?? false;
    this.battleType = roundData.battleInfo?.type ?? 'normal';
    // elite 배율 (보스·소환 몬스터는 MonsterView 생성 시 개별 지정)
    this.monsterImgScale = this.battleType === 'elite' ? 1.4 : 1.0;

    this.drawBg();
    this.createUI();
    this.createSortButton();
    this.setupDrag();
    this.startDealAnimation();

    //monster

    this.monsterObjs = [];
    this._monsterSprites = [];
    this.monsters = data.monsters
      ? data.monsters
      : spawnManager.generate(roundData);

    // 👉 manager에 주입
    this.monsterManager.setMonsters(this.monsters);

    const positions = this.monsterManager.calcMonsterPositions(this.monsterManager.monsters.length);

    this.monsterViews = this.monsterManager.monsters.map((mon, idx) => {
      const { x, y } = positions[idx];
      const scale = mon.isBoss ? 1.8 : mon.isSummoned ? 1.0 : this.monsterImgScale;

      return new MonsterView(this, mon, idx, x, y, (i) => {
        if (!this.isDealing) this.monsterManager.attackMonster(i);
      }, scale);
    });

    this._monsterSprites = this.monsterViews.map(v => v.sprite);

    // 보스 전용 초기화
    this.bossManager = null;
    this.bossHPBar = null;
    if (this.isBoss && this.monsters.length > 0) {
      this.bossManager = new BossManager(this);
      this.bossHPBar = new BossHPBarUI(this, this.monsters[0], this.bossManager);
      this.monsterViews[0].hideHPBar();
      this.monsterViews[0].hideStats();
    }

  }

  // ── 배경 & 패널 ──────────────────────────────────────────────────────────
  drawBg() {
    const PW = PLAYER_PANEL_W;
    const IPW = ITEM_PANEL_W;
    const IPX = GW - IPW;            // 아이템 패널 시작 x
    const FAW = GW - PW - IPW;       // 필드 영역 폭 = 880
    const CX = PW + 10;
    const FAW_ = FAW - 20;            // 패널 내부 폭

    const bgKey = this._bgKey ?? `bg_${this.round}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(GW / 2, GH / 3, bgKey)
        .setOrigin(0.5, 0.5).setDisplaySize(GH * 1.5, GH * 1.5).setDepth(-1);

      /*
      원본
    this.add.image(GW / 2, GH / 2, bgKey)
      .setOrigin(0.5, 0.5).setDisplaySize(GW, GH).setDepth(-1);
      */
    }

    const g = this.add.graphics().setDepth(0);

    // 배틀 로그 헤더 — 몬스터 영역과 동일한 x/width, 하단 radius만 0
    g.fillStyle(0x050e08, 0.88);
    g.fillRoundedRect(CX, 0, FAW_, BATTLE_LOG_H, { tl: 0, tr: 0, bl: 10, br: 10 });
    g.lineStyle(1, 0x4a7055);
    g.strokeRoundedRect(CX, 0, FAW_, BATTLE_LOG_H, { tl: 0, tr: 0, bl: 10, br: 10 });

    // 몬스터 영역 (필드 영역만)
    g.fillStyle(0x000000, 0.30);
    g.fillRoundedRect(CX, MONSTER_AREA_TOP, FAW_, MONSTER_AREA_H, 10);
    g.lineStyle(1, 0x4a7055, 1);
    g.strokeRoundedRect(CX, MONSTER_AREA_TOP, FAW_, MONSTER_AREA_H, 10);

    // 필드 패널 (필드 영역만)
    const fpY = FIELD_Y - FIELD_CH / 2 - 18;
    g.fillStyle(0x050e08, 0.88);
    //g.fillStyle(0x0d3318, 0.82);
    g.fillRoundedRect(CX, fpY, FAW_, FIELD_CH + 36, 12);
    g.lineStyle(1, 0x4a7055, 1);
    g.strokeRoundedRect(CX, fpY, FAW_, FIELD_CH + 36, 12);

    // 핸드 패널 (필드 영역만)
    const hpY = HAND_Y - CH / 2 - 18;
    g.fillStyle(0x050e08, 0.88);
    //g.fillStyle(0x0d3318, 0.82);
    g.fillRoundedRect(CX, hpY, FAW_, CH + 36, 12);
    g.lineStyle(1, 0x4a7055, 1);
    g.strokeRoundedRect(CX, hpY, FAW_, CH + 36, 12);

    // 아이템 패널
    g.fillStyle(0x080f14, 0.92);
    g.fillRect(IPX, 0, IPW, GH);
    g.lineStyle(1, 0x2a4a5a);
    g.strokeRect(IPX, 0, IPW, GH);
    g.lineStyle(1, 0x2a4a5a);
    g.strokeRect(IPX, BATTLE_LOG_H, IPW, 38);  // 아이템 패널 헤더 구분선
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
      onRelicRemove: (relicId) => {
        this.player.applyRelicOnRemove(relicId);
        this.player.relics = this.player.relics.filter(id => id !== relicId);
        this.itemUI.refresh();
        this.playerUI?.refresh();
        this.playerUI?.refreshHandConfig();
      },
    });
    this.itemUI.create();

    // ── 파일 hover 툴팁 ──────────────────────────────────────────────────
    this._tooltipBg = this.add.rectangle(0, 0, 70, 26, 0x000000, 0.85).setDepth(200).setVisible(false);
    this._tooltipTxt = this.add.text(0, 0, "", { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(201).setVisible(false);

    // ── FIELD / HAND 카운트 (각 패널 우측 하단) ─────────────────────────
    const cornerX = GW - ITEM_PANEL_W - 16;
    //const cornerStyle = { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#556655' };
    this._fieldCountCornerTxt = this.add.text(cornerX, FIELD_Y + FIELD_CH / 2 + 10, "", TS.handRank).setOrigin(1, 1).setDepth(15);
    this._handCountCornerTxt = this.add.text(cornerX, HAND_Y + CH / 2 + 10, "", TS.handRank).setOrigin(1, 1).setDepth(15);

    // ── 메시지 텍스트 ──────────────────────────────────────────────────────
    this.msgTxt = this.add.text(faCX, BATTLE_LOG_H + 8, "", TS.msg).setOrigin(0.5, 0).setDepth(100);

    // ── 핸드 이름 ──────────────────────────────
    const handTextY = MONSTER_AREA_TOP + MONSTER_AREA_H + 8;
    this._handText = this.add.text(faCX, handTextY, "",
      { fontFamily: "'PressStart2P', Arial", fontSize: '11px', color: '#888888' })
      .setOrigin(0, 0.5).setDepth(31).setVisible(false);

    // ── DEBUG: 점수 프리뷰 (몬스터 영역 우측 하단) ────────────────────────
    this.previewScoreTxt = DEBUG_MODE
      ? this.add.text(PW + FAW - 8, MONSTER_AREA_TOP + MONSTER_AREA_H - 8, "",
        { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#ffdd44' })
        .setOrigin(1, 1).setDepth(50)
      : null;

    // ── OPT 버튼 — 아이템 패널 상단 ─────────────────────────────────────
    const optImg = this.add.image(IPCX, 30, "ui_option")
      .setDisplaySize(100, 50).setDepth(60).setInteractive();
    optImg.on("pointerdown", () => this._showOptions());
    optImg.on("pointerover", () => optImg.setTint(0xaaddff));
    optImg.on("pointerout", () => optImg.clearTint());

    // ── TURN END 버튼 — 아이템 패널 하단 ────────────────────────────────
    const turnBtnX = IPCX;
    const turnBtnY = HAND_Y + CH / 2 - 15;
    this.turnEndBtn = this.add.image(turnBtnX, turnBtnY, "ui_end_turn")
      .setDisplaySize(100, 50).setDepth(60).setInteractive();
    this.turnEndBtn.on("pointerdown", () => { if (!this.isDealing) this.onTurnEnd(); });
    this.turnEndBtn.on("pointerover", () => this.turnEndBtn.setTint(0xffdd88));
    this.turnEndBtn.on("pointerout", () => this.turnEndBtn.clearTint());

    this._attackTxt = this.add.text(turnBtnX, turnBtnY - 40, "", TS.infoLabel)
      .setOrigin(0.5, 1).setDepth(61);

    this.refreshPlayerStats();
  }

  // ── 정렬 버튼 ────────────────────────────────────────────────────────────
  createSortButton() {
    const sortCH = 50;
    const sortBottom = HAND_Y + CH / 2;
    const sortY = sortBottom - sortCH / 2; // HAND_Y - CH / 2 - 14;
    const sortCX = PLAYER_PANEL_W / 2; // PLAYER_PANEL_W + (GW - PLAYER_PANEL_W - ITEM_PANEL_W) / 2;
    this.sortBg = this.add.image(sortCX, sortY, "ui_sort")
      .setDisplaySize(100, sortCH).setDepth(60).setInteractive();
    this.sortBg.on("pointerdown", () => {
      if (this.isDealing) return;
      this.sortBy(this.sortMode === "suit" ? "rank" : "suit");
    });
    this.sortBg.on("pointerover", () => this.sortBg.setTint(0xaaffcc));
    this.sortBg.on("pointerout", () => this.refreshSortBtns());
  }

  refreshSortBtns() {
    if (this.sortMode) this.sortBg?.setTint(0x88ffaa);
    else this.sortBg?.clearTint();
  }

  // ── 딜링 애니메이션 ──────────────────────────────────────────────────────
  startDealAnimation() {
    this._sfx("sfx_shuffle");
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;

    for (let i = Math.min(8, 51); i >= 0; i--) {
      this.animObjs.push(
        //this.add.image(deckX - i * 2, deckY - i * 2, "card_back").setDisplaySize(CW, CH).setDepth(i)
        this.add.image(deckX - i * 2, deckY - i * 2, "card_back").setDisplaySize(FIELD_CW, FIELD_CH).setDepth(i)
      );
    }

    const handPos = this.calcHandPositions(this.player.handSize);
    let delay = 300;

    this.handData.forEach((card, i) => {
      this.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, handPos[i].x, handPos[i].y));
      delay += DEAL_DELAY;
    });
    this.fieldData.forEach(card => {
      this.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y));
      delay += DEAL_DELAY;
    });

    this.time.delayedCall(delay + 550, () => {
      this.animObjs.forEach(o => o.destroy());
      this.animObjs = [];
      this.isDealing = false;
      this._applySortToHand();
      this.render();
      this._saveTurnState();
    });
  }

  flyCard(cardData, fromX, fromY, toX, toY) {
    let card_width = (toY === FIELD_Y) ? FIELD_CW : CW;
    let card_height = (toY === FIELD_Y) ? FIELD_CH : CH;


    const img = this.add.image(fromX, fromY, "card_back").setDisplaySize(card_width, card_height).setDepth(200);
    this.animObjs.push(img);
    this.tweens.add({
      targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
      onComplete: () => {
        this.tweens.add({
          targets: img, displayWidth: 1, duration: 70, ease: "Linear",
          onComplete: () => {
            img.setTexture(cardData.key);
            img.setDisplaySize(1, card_height);
            this.tweens.add({ targets: img, displayWidth: card_width, duration: 70, ease: "Linear" });
          },
        });
      },
    });
  }

  // ── 위치 계산 ────────────────────────────────────────────────────────────
  calcFieldPositions(count) {
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;   // 880
    const gap = 14;
    const areaW = FAW - 140;               // deck/dummy 파일 공간 제외: 740
    const totalW = count * FIELD_CW + (count - 1) * gap;
    const x0 = PW + 40 + FIELD_CW / 2 + (areaW - totalW) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (FIELD_CW + gap), y: FIELD_Y }));
  }

  calcHandPositions(count) {
    if (count === 0) return [];
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;   // 880
    const gap = 10;
    const areaW = FAW - 85;               // 795
    const baseW = Math.round(CW * 0.95);
    const scale = count >= 9 ? Math.max(0.65, 8 / count) : 1;
    const cardW = Math.round(baseW * scale);
    const spacing = count === 1 ? 0 : Math.min(cardW + gap, (areaW - cardW) / (count - 1));
    const x0 = PW + 40 + cardW / 2 + (areaW - (cardW + spacing * (count - 1))) / 2;
    return Array.from({ length: count }, (_, i) => ({ x: x0 + i * spacing, y: HAND_Y }));
  }

  // ── 드래그 ───────────────────────────────────────────────────────────────
  setupDrag() {
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
    const item = this.player.items[idx];
    if (!item) { obj?.destroy(); return; }

    const def = itemMap[item.id];
    const eff = def?.effect;

    // copy_hand_card: 선택된 카드 1장을 복사해 핸드에 추가
    if (eff?.type === 'copy_hand_card') {
      const selectedIdxs = [...this.selected];
      if (selectedIdxs.length !== 1) {
        obj?.destroy();
        this.render();
        return;
      }
      const src = this.handData[selectedIdxs[0]];
      const copy = {
        ...src,
        uid: crypto.randomUUID(),
        enhancements: src.enhancements ? src.enhancements.map(e => ({ ...e })) : [],
      };
      this.handData.push(copy);
      this.selected.clear();
      this.addBattleLog(`[${item.name}] ${src.key} 복사!`);
      this.player.items.splice(idx, 1);
      obj?.destroy();
      this.render();
      return;
    }

    // seal_hand_card: 선택된 카드 1장에 씰 랜덤 강화
    if (eff?.type === 'seal_hand_card') {
      const selectedIdxs = [...this.selected];
      if (selectedIdxs.length !== 1) {
        obj?.destroy();
        this.render();
        return;
      }
      const card = this.handData[selectedIdxs[0]];
      if ((card.enhancements?.length ?? 0) > 0) {
        // 이미 씰이 있는 카드 — 사용 취소
        obj?.destroy();
        this.render();
        return;
      }
      const types = getSealTypes();
      const type = types[Math.floor(Math.random() * types.length)];
      card.enhancements = [{ type }];
      this.selected.clear();
      this.addBattleLog(`[${item.name}] ${card.key} → ${type} 씰 강화!`);
      this.player.items.splice(idx, 1);
      obj?.destroy();
      this.render();
      return;
    }

    // remove_hand_cards: 선택된 카드를 최대 maxCards장 제거
    if (eff?.type === 'remove_hand_cards') {
      const maxCards = eff.maxCards ?? 2;
      const selectedIdxs = [...this.selected];
      if (selectedIdxs.length === 0 || selectedIdxs.length > maxCards) {
        obj?.destroy();
        this.render();
        return;
      }
      // 내림차순 정렬 후 제거 (앞 인덱스가 밀리지 않도록)
      selectedIdxs.sort((a, b) => b - a).forEach(i => {
        const removed = this.handData.splice(i, 1)[0];
        if (removed) this.deck.dummyPile.push(removed);
      });
      this.selected.clear();
      this.addBattleLog(`[${item.name}] 카드 ${selectedIdxs.length}장 제거`);
      this.player.items.splice(idx, 1);
      obj?.destroy();
      this.render();
      return;
    }

    const msg = applyItemEffect(this.player, item.id, item.name);
    if (msg) this.addBattleLog(msg);

    // 배틀 한정 효과는 종료 시 되돌리기 위해 기록
    if (def?.scope === 'battle') {
      this._battleItemEffects.push(item.id);
    }

    this.player.items.splice(idx, 1);
    obj?.destroy();
    this.render();
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
    this.cardObjs.forEach(o => o.destroy());
    this.cardObjs = [];
    this.handCardObjs = [];

    this.monsterObjs.forEach(o => o.destroy());
    this.monsterObjs = [];

    this.renderDeckPile();
    this.renderDummyPile();
    this.renderField();
    this.renderHand();
    this.renderMonsters();
    this.renderDebuffIcons();
    this.itemUI.refresh();
    this.updatePreview();
    this.refreshSortBtns();
    this.refreshPlayerStats();
    this.refreshAttackCount();
    this.refreshBattleLog();
  }

  renderDeckPile() {
    const x = PLAYER_PANEL_W + 100, y = FIELD_Y;
    const count = this.deckData.length;

    const pile = this.textures.exists("card_back_deck")
      ? this.add.image(x, y, "card_back_deck").setDisplaySize(PILE_CW, PILE_CH).setDepth(10)
      : this.add.rectangle(x, y, FIELD_CW, FIELD_CH, 0x223344).setDepth(10);
    this.cardObjs.push(pile);

    const hit = this.add.rectangle(x, y, FIELD_CW + 10, FIELD_CH + 10, 0xffffff, 0)
      .setDepth(12).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`DECK: ${count}`);
      this._tooltipBg.setPosition(x, y - FIELD_CH / 2 - 18);
      this._tooltipTxt.setPosition(x, y - FIELD_CH / 2 - 18);
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

    const pile = this.textures.exists("card_back_dummy")
      ? this.add.image(x, y, "card_back_dummy").setDisplaySize(PILE_CW, PILE_CH).setDepth(10)
      : this.add.rectangle(x, y, FIELD_CW, FIELD_CH, 0x332211).setDepth(10);
    this.cardObjs.push(pile);

    const hit = this.add.rectangle(x, y, FIELD_CW + 10, FIELD_CH + 10, 0xffffff, 0)
      .setDepth(12).setInteractive();
    hit.on("pointerover", () => {
      this._tooltipTxt.setText(`DUMMY: ${count}`);
      this._tooltipBg.setPosition(x, y - FIELD_CH / 2 - 18);
      this._tooltipTxt.setPosition(x, y - FIELD_CH / 2 - 18);
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
            this.tweens.add({ targets: img, displayWidth: FIELD_CW * 1.4, displayHeight: FIELD_CH * 1.4, y: FIELD_Y - 10, duration: 100 });
            img.setDepth(20);
            sealImg?.setVisible(false);
            CardRenderer.showSealTooltip(this, card, x, FIELD_Y, FIELD_CH);
          }
        });
        img.on("pointerout", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: FIELD_CW, displayHeight: FIELD_CH, y: FIELD_Y, duration: 100 });
            img.setDepth(10);
            sealImg?.setVisible(true);
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
    // 기본 크기: CW * 0.95, 9장 이상이면 추가 축소
    const baseW = Math.round(CW * 0.95);
    const baseH = Math.round(CH * 0.95);
    const scale = count >= 9 ? Math.max(0.65, 8 / count) : 1;
    const cardW = Math.round(baseW * scale);
    const cardH = Math.round(baseH * scale);
    const hoverW = Math.round(cardW * 1.35);
    const hoverH = Math.round(cardH * 1.35);

    this.handData.forEach((card, i) => {
      const sel = this.selected.has(i);
      const inCombo = sel && hasValidCombo && comboCardSet.has(card);
      const x = positions[i].x;
      const selOffset = Math.round(22 * scale);
      const y = sel ? HAND_Y - selOffset : HAND_Y;

      const isDisabled = this._isCardDisabled(card);
      const { cardImg: img, sealImg } = CardRenderer.drawCard(this, x, y, card, { width: cardW, height: cardH, depth: sel ? 32 : 30, disabled: isDisabled, objs: this.cardObjs });
      img.setInteractive();

      if (canPick) {
        img.on("pointerdown", () => { if (!this.isDragging && !this.isDealing) this.toggleHand(i); });
        img.on("pointerover", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: hoverW, displayHeight: hoverH, y: y - 8, duration: 100 });
            img.setDepth(40);
            sealImg?.setVisible(false);
            CardRenderer.showSealTooltip(this, card, x, y, cardH);
          }
        });
        img.on("pointerout", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: cardW, displayHeight: cardH, y, duration: 100 });
            img.setDepth(sel ? 32 : 30);
            sealImg?.setVisible(true);
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
    // 보스 패시브 (player_turn 트리거) 갱신
    if (this.isBoss && this.bossManager && this.monsters.length > 0) {
      this.bossManager.activatePassive(this.monsters[0], 'player_turn');
    }

    const mons = this.monsterManager.monsters;
    const positions = this.monsterManager.calcMonsterPositions(mons.length);

    const _combo = this._getSelectedCombo();
    const hasCombo = _combo.score > 0
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
    const selectedCards = [...this.selected].map(i => this.handData[i]);
    return (this.player.relics ?? []).filter(id => {
      const relic = _relicMap[id];
      if (!relic) return false;
      const SCORE_SCOPES = new Set(['card', 'hand', 'final']);
      return relic.effects.some(eff => {
        if (!SCORE_SCOPES.has(eff.scope)) return false;
        const cond = eff.condition;
        if (!cond) return true;
        if (cond.handRank != null && cond.handRank !== rank) return false;
        if (cond.deckCountGte && deckCount < cond.deckCountGte) return false;
        if (cond.suit || cond.rank) {
          if (!selectedCards.some(c =>
            (!cond.suit || c.suit === cond.suit) &&
            (!cond.rank || c.rank === cond.rank)
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
        : this.add.text(x, iconY, def.name[0], { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#cc88ff' }).setOrigin(0.5).setDepth(21);
      this._debuffObjs.push(icon);

      // 남은 턴 / B 표시
      const durLabel = active.turnsLeft > 0 ? `${active.turnsLeft}` : 'B';
      const dur = this.add.text(x + SIZE / 2 - 1, iconY + SIZE / 2 - 1, durLabel,
        { fontFamily: "'PressStart2P', Arial", fontSize: '7px', color: '#ffff44' })
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
        ? { fontFamily: "'PressStart2P', Arial", fontSize: '10px', color }
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
    context.dummyCount = this.dummyData?.length ?? 0;
    context.handConfig = this.player.getEffectiveHandConfig();
    context.relics = this.player.relics ?? [];
    context.enabledHands = this.player.getEnabledHands();
    context.suitAliases = this.player.getEffectiveSuitAliases();
    context.atk = this.player.atk;
    context.hp = this.player.hp;
    context.maxHp = this.player.maxHp;
    context.handUseCounts = this.player.handUseCounts ?? {};
  }

  // ── 디버프 카드 여부 ─────────────────────────────────────────────────────
  _isCardDisabled(card) {
    const dm = this.debuffManager;
    return dm.disabledCardUids.has(card.uid)
      || dm.disabledRanks.has(card.rank)
      || dm.disabledSuits.has(card.suit);
  }

  // ── 씰 효과 적용 (공격에 사용된 카드 기준) ───────────────────────────────
  _applySealEffects(cards) {
    let goldGained = 0;

    for (const card of cards) {
      for (const enh of (card.enhancements ?? [])) {
        if (enh.type === 'gold') {
          goldGained += sealMap['gold']?.goldBonus ?? 5;
        } else if (enh.type === 'green') {
          if (this.player.items.length < maxItemCount) {
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
        }
      }
    }

    if (goldGained > 0) {
      this.player.gold += goldGained;
      this.addBattleLog(`[씰] +${goldGained}G 획득!`);
    }
  }

  // ── 족보 계산 헬퍼 ───────────────────────────────────────────────────────
  _getSelectedCombo() {
    if (this.selected.size === 0) return { score: 0, handName: "" };
    const activeCards = [...this.selected]
      .map(i => this.handData[i])
      .filter(c => !this._isCardDisabled(c));
    if (activeCards.length === 0) return { score: 0, handName: "" };
    context.handRemainingCount = this.handData.length - activeCards.length;
    return calculateScore(activeCards, context);
  }

  updatePreview() {
    this._refreshContext();
    const { score: cardScore, rank } = this._getSelectedCombo();
    const score = cardScore > 0 ? Math.floor(cardScore) : 0;

    const handRankSealed = rank != null && this.debuffManager.disabledHandRanks.has(rank);

    if (score > 0) {
      const lang = this.registry?.get('lang') ?? 'ko';
      const key = HAND_DATA[rank]?.key ?? '';
      const name = getHandName(lang, key);

      if (handRankSealed) {
        this._handText
          .setText(`${name} [봉인]`)
          .setColor('#ff6666')
          .setVisible(true);
        this.playerUI?.highlightHand(null);
        this.itemUI?.rattleRelics([]);
      } else {
        this._handText
          .setText(name)
          .setColor('#ccddcc')
          .setVisible(true);
        this.playerUI?.highlightHand(rank);
        this.itemUI?.rattleRelics(this._getApplicableRelicIds(rank));
      }
    } else {
      this._handText.setVisible(false);

      this.playerUI?.highlightHand(null);
      this.itemUI?.rattleRelics([]);
    }

    // DEBUG 점수 표시
    this.previewScoreTxt?.setText(score > 0 ? `score: ${score}` : '');
  }

  refreshAttackCount() {
    const used = this.attackCount;
    const max = this.player.attacksPerTurn;
    this._attackTxt.setText(`ATK ${used}/${max}`);
    this._attackTxt.setColor(used >= max ? '#ff6666' : '#aaffcc');
  }

  refreshPlayerStats() {
    const p = this.player;
    this.playerUI.refresh();
    this.playerUI.setDeckCounts({
      deck: this.deckData?.length ?? 0,
      dummy: this.dummyData?.length ?? 0,
    });
    this._fieldCountCornerTxt?.setText(`${this.fieldData?.length ?? 0}/${p.fieldSize}`);
    this._handCountCornerTxt?.setText(`${this.handData?.length ?? 0}/${p.handSizeLimit}`);
  }

  refreshPlayerLevel() {
    this.playerUI.refreshLevel();
  }

  addBattleLog(text) {
    this.battleLogUI.addLog(text);
  }

  refreshBattleLog() {
    this.battleLogUI.refresh();
  }


  toggleHand(i) {
    if (this.selected.has(i)) {
      this.selected.delete(i);
    } else {
      if (this.selected.size >= 5) return;
      this.selected.add(i);
    }
    this._sfx("sfx_place");
    this.render();
  }

  _flyToDummy(fromX, fromY, key = "card_back") {
    this._sfx("sfx_fan");
    const img = this.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.tweens.add({
      targets: img, x: GW - ITEM_PANEL_W - 40, y: FIELD_Y,
      displayWidth: CW * 0.3, displayHeight: CH * 0.3, alpha: 0,
      duration: 380, ease: "Power2.In",
      onComplete: () => img.destroy(),
    });
  }

  /**
   * 공격 점수 계산 애니메이션.
   * @param {ReturnType<getScoreDetails>} details
   * @param {{fromX,fromY,key,scoringDetail}[]} cardFlyInfo - 왼쪽→오른쪽 순 (원래 위치에서 pulse)
   * @param {function} onCardsConsumed - 카드 펄스 완료 후 호출 (핸드 제거 + render)
   * @param {function} onComplete
   */
  playAttackAnimation(details, cardFlyInfo, onCardsConsumed, onComplete) {
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;
    const cX = PW + FAW / 2;
    const scoreY = MONSTER_AREA_TOP + 14;

    const tmpObjs = [];
    let currentScore = 0;

    // ── 점수 텍스트 ────────────────────────────────────────────────────────
    const scoreTxt = this.add.text(cX, scoreY, '0', {
      fontFamily: "'PressStart2P', Arial",
      fontSize: '30px', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(400);
    tmpObjs.push(scoreTxt);

    // ── 구슬 던지기 (source → scoreTxt) ──────────────────────────────────
    const orbTargetX = cX;
    const orbTargetY = scoreY + 15;

    // orb는 fire-and-forget — 발사 후 독립 실행, next()는 countUp이 담당
    const throwOrb = (fromX, fromY, color) => {
      const orb = this.add.circle(fromX, fromY, 10, color, 1.0).setDepth(420);
      const glow = this.add.circle(fromX, fromY, 18, color, 0.35).setDepth(419);
      tmpObjs.push(orb, glow);

      const cpX = (fromX + orbTargetX) / 2;
      const cpY = Math.min(fromY, orbTargetY) - 60;
      const t = { v: 0 };

      this.tweens.add({
        targets: t, v: 1, duration: 220, ease: 'Sine.easeIn',
        onUpdate: () => {
          const s = t.v, r = 1 - s;
          const x = r * r * fromX + 2 * r * s * cpX + s * s * orbTargetX;
          const y = r * r * fromY + 2 * r * s * cpY + s * s * orbTargetY;
          orb.setPosition(x, y);
          glow.setPosition(x, y);
        },
        onComplete: () => {
          this.tweens.add({
            targets: [orb, glow],
            scaleX: 3.5, scaleY: 3.5, alpha: 0,
            duration: 130, ease: 'Sine.easeOut',
          });
        },
      });
    };

    // orb 발사 후 이 딜레이 뒤에 countUp 시작 (orb 비행 중 겹침)
    const ORB_LAG = 100;

    // 렐릭 위치 헬퍼
    const relicPos = (relicId) => {
      const r = this.itemUI?._relicObjs?.[relicId];
      return r ? { x: r.baseCX, y: r.baseCY } : { x: GW - ITEM_PANEL_W / 2, y: 200 };
    };

    // ── 카운팅 업 ─────────────────────────────────────────────────────────
    const countUp = (target, duration, onDone) => {
      this._sfx("sfx_orb"); // 점수 튕길 때 소리 재생
      const tweenObj = { val: currentScore };
      this.tweens.killTweensOf(scoreTxt);
      scoreTxt.y = scoreY;
      this.tweens.add({
        targets: scoreTxt,
        y: scoreY - 12,
        duration: Math.min(140, duration * 0.4),
        yoyo: true, ease: 'Sine.easeOut',
      });
      this.tweens.add({
        targets: tweenObj, val: target, duration, ease: 'Circular.In',
        onUpdate: () => { scoreTxt.setText(String(Math.floor(tweenObj.val))); },
        onComplete: () => {
          currentScore = target;
          scoreTxt.setText(String(Math.floor(target)));
          onDone?.();
        },
      });
    };

    // ── 단계 큐 ───────────────────────────────────────────────────────────
    const queue = [];

    // 1. ATK 적용
    if (details.atk > 0) {
      queue.push(next => {
        this.playerUI?.pulseAtk();
        const atk = this.playerUI?.playerAtkTxt;
        throwOrb(atk ? atk.x : PW * 0.75, atk ? atk.y : 168, 0xff8833);
        this.time.delayedCall(ORB_LAG, () => countUp(currentScore + details.atk, 200, next));
      });
    }

    // 카드 펄스 fire-and-forget (큐를 블로킹하지 않음)
    const pulseCard = (obj) => {
      if (!obj?.active) return;
      this.tweens.killTweensOf(obj);
      const bx = obj.scaleX, by = obj.scaleY;
      this.tweens.add({
        targets: obj,
        scaleX: bx * 1.1, scaleY: by * 1.1,
        duration: 160, yoyo: true, ease: 'Sine.easeInOut',
        onComplete: () => { try { obj.setScale(bx, by); } catch (_) { } },
      });
    };

    // 2. 각 카드 — 펄스와 orb 동시 시작, countUp 완료가 next() 담당
    cardFlyInfo.forEach((info) => {
      if (info.scoringDetail) {
        const cd = info.scoringDetail;
        queue.push(next => {
          pulseCard(info.obj);
          throwOrb(info.fromX, info.fromY, 0xffdd44);
          this.time.delayedCall(ORB_LAG, () => countUp(currentScore + cd.baseScore, 200, next));
        });

        cd.cardRelicDeltas.forEach(({ relicId, delta }) => {
          queue.push(next => {
            this.itemUI?.pulseRelic(relicId);
            const rp = relicPos(relicId);
            throwOrb(rp.x, rp.y, 0xcc88ff);
            this.time.delayedCall(ORB_LAG, () => countUp(currentScore + delta, 240, next));
          });
        });
      } else {
        // 점수 없는 카드는 펄스만 fire-and-forget, 즉시 next
        queue.push(next => { pulseCard(info.obj); next(); });
      }
    });

    // 카드 펄스 완료 후 핸드에서 제거
    if (cardFlyInfo.length > 0) {
      queue.push(next => { onCardsConsumed?.(); next(); });
    }

    // 3. 족보 배수 적용 — multi > 1 이거나 hand row 표시용으로 항상 pulse
    queue.push(next => {
      this.playerUI?.pulseHandRow(details.handRank);
      if (details.multi !== 1) {
        const rankRow = this.playerUI?._handConfigRows?.[details.handRank];
        throwOrb(rankRow?.multiTxt?.x ?? PW / 2, rankRow?.multiTxt?.y ?? 400, 0x44eeff);
        this.time.delayedCall(ORB_LAG, () => {
          countUp(currentScore * details.multi, 420, next);
        });
      } else {
        this.time.delayedCall(120, next);
      }
    });

    // 4. hand scope 렐릭
    details.handRelicDeltas.forEach(({ relicId, delta }) => {
      queue.push(next => {
        this.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        throwOrb(rp.x, rp.y, 0xcc88ff);
        this.time.delayedCall(ORB_LAG, () => countUp(currentScore + delta, 240, next));
      });
    });

    // 5. final scope 렐릭
    details.finalRelicDeltas.forEach(({ relicId, delta }) => {
      queue.push(next => {
        this.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        throwOrb(rp.x, rp.y, 0xee66ff);
        this.time.delayedCall(ORB_LAG, () => countUp(currentScore + delta, 240, next));
      });
    });

    // 6. 최종 점수 강조 후 페이드아웃
    queue.push(next => {
      this._sfx("sfx_chop"); // 최종 점수 산출 시 강조되는 타격음
      this.tweens.add({
        targets: scoreTxt,
        scaleX: { from: 1, to: 1.45 }, scaleY: { from: 1, to: 1.45 },
        duration: 200, yoyo: true, ease: 'Back.easeOut',
      });
      this.time.delayedCall(420, next);
    });

    queue.push(next => {
      this.tweens.add({
        targets: tmpObjs, alpha: 0, duration: 180,
        onComplete: () => {
          tmpObjs.forEach(o => { try { o?.destroy(); } catch (_) { } });
          tmpObjs.length = 0;
          next();
        },
      });
    });

    // ── 큐 실행 ──────────────────────────────────────────────────────────
    const runNext = () => {
      if (queue.length === 0) { onComplete?.(); return; }
      queue.shift()(runNext);
    };
    runNext();
  }

  _applySortToHand() {
    if (this.sortMode === null) { this.sortMode = "rank"; this.sortAsc = true; }
    this.doSorting(this.sortMode);
  }

  sortBy(mode) {
    this.sortMode === mode
      ? (this.sortAsc = !this.sortAsc)
      : (this.sortMode = mode, this.sortAsc = true);
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
      this.deck.endTurn();
      this.dummyData = this.deck.dummyPile;

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
  }

  // ── 턴 시작 ──────────────────────────────────────────────────────────────
  startTurn() {
    this.time.delayedCall(420, () => {
      try {
        const slotPos = this.calcFieldPositions(this.player.fieldSize);
        const draw = Math.min(this.player.fieldSize, this.deckData.length);
        const newCards = Array.from({ length: draw }, () => this.deckData.pop());
        this.deck.field = newCards;
        this.fieldData = newCards.map((c, k) => ({ ...c, slotX: slotPos[k].x }));

        this.debuffManager.tick();
        this.fieldPickCount = 0;
        this.attackCount = 0;
        this.selected.clear();
        this._applySortToHand();
        this.render();
        this._saveTurnState();
      } catch (e) {
        console.error("[startTurn timer]", e);
      } finally {
        this.isDealing = false;
      }
    });
  }

  // ── 배틀 클리어 ──────────────────────────────────────────────────────────
  onBattleClear() {
    this.isDealing = true;
    this.debuffManager.clearAll();
    this.render();
    this.player.def = 0;
    this.bossHPBar?.destroy();
    this.bossHPBar = null;

    const next = roundManager.getNextStep(this.round, this.battleIndex);
    const nextType = next.isGameEnd
      ? null
      : roundManager.getRoundData(next.round, next.battleIndex)?.battleInfo?.type;

    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, 0, GW, GH);
    const pw = 480, ph = 280, px = GW / 2 - 240, py = GH / 2 - 140;
    g.fillStyle(0x0a2a10, 1);
    g.fillRoundedRect(px, py, pw, ph, 20);
    g.lineStyle(3, 0x44dd88);
    g.strokeRoundedRect(px, py, pw, ph, 20);

    const titleText = next.isGameEnd ? "GAME CLEAR!" : (next.isNextRound ? "ROUND CLEAR!" : "BATTLE CLEAR!");
    const subText = `ROUND ${this.round}-${this.battleIndex + 1}  SCORE: ${this.player.score}`;
    const noteText = next.isGameEnd ? "게임 클리어!" :
      nextType === 'market' ? "마켓으로..." :
        next.isNextRound ? "다음 라운드로..." :
          "다음 전투로...";

    this.add.text(GW / 2, py + 60, titleText, TS.clearTitle).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 118, subText, TS.clearSub).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 158, noteText, TS.clearNote).setOrigin(0.5).setDepth(301);

    const btn = this.add.rectangle(GW / 2, py + ph - 46, 180, 44, 0x1e4e99)
      .setDepth(302).setInteractive();
    this.add.text(GW / 2, py + ph - 46, "CONTINUE", TS.overlayBtn)
      .setOrigin(0.5).setDepth(303);
    btn.on("pointerover", () => btn.setFillStyle(0x2d66cc));
    btn.on("pointerout", () => btn.setFillStyle(0x1e4e99));
    btn.on("pointerdown", () => {
      this.deck.resetForNextBattle();

      // 배틀 한정 아이템 효과 되돌리기 (toData() 전에 수행)
      this._battleItemEffects.forEach(id => revertItemEffect(this.player, id));
      this._battleItemEffects = [];

      if (next.isGameEnd) {
        deleteSave();
        this.scene.start("MainMenuScene");
        return;
      }

      // GameScene(roundManager)이 마켓/전투 판단을 담당
      writeSave(next.round, this.player.toData(), this.deck.getState(), { battleIndex: next.battleIndex });
      this.scene.start("GameScene", {
        round: next.round,
        battleIndex: next.battleIndex,
        player: this.player.toData(),
        deck: this.deck.getState(),
        battleLog: this.battleLogUI.logs,
      });
    });
  }

  // ── 레벨업 후 처리 ────────────────────────────────────────────────────────
  _checkLevelUpThenProceed() {
    const isAllDead = () => this.monsterManager.monsters.every(m => m.isDead);

    if (this._suitLevelUpCount > 0) {
      this.isDealing = true;
      this._showLevelUpPopup(() => {
        this.isDealing = false;
        if (isAllDead()) this.time.delayedCall(500, () => this.onBattleClear());
      });
    } else if (isAllDead()) {
      this.time.delayedCall(700, () => this.onBattleClear());
    }
  }

  // ── 레벨업 suit 선택 팝업 ─────────────────────────────────────────────────
  _showLevelUpPopup(onAllDone) {
    const SUIT_COLORS = { S: '#aaaaff', H: '#ff6666', D: '#ff9966', C: '#aaffaa' };
    const SUIT_SYMS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
    const SUIT_DESCS = { S: 'MON DEF\u2193', H: 'HP\u2191', D: 'MY DEF\u2191', C: 'MON ATK\u2193' };
    const SUIT_KEYS = ['S', 'H', 'D', 'C'];

    const objs = [];
    const destroy = () => objs.forEach(o => o?.destroy());
    const cx = GW / 2, cy = GH / 2;
    const pw = 460, ph = 310;
    const px = cx - pw / 2, py = cy - ph / 2;

    const dim = this.add.rectangle(cx, cy, GW, GH, 0x000000, 0.72).setDepth(800).setInteractive();
    objs.push(dim);

    const pg = this.add.graphics().setDepth(801);
    pg.fillStyle(0x082012);
    pg.fillRoundedRect(px, py, pw, ph, 16);
    pg.lineStyle(3, 0x44dd88);
    pg.strokeRoundedRect(px, py, pw, ph, 16);
    objs.push(pg);

    objs.push(this.add.text(cx, py + 38,
      `LEVEL UP!  Lv${this.player.level}`,
      { fontFamily: "'PressStart2P', Arial", fontSize: '14px', color: '#ffdd44' })
      .setOrigin(0.5).setDepth(802));

    const remTxt = this.add.text(cx, py + 72,
      `SUIT 선택 (${this._suitLevelUpCount}회 남음)`,
      { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#aaffcc' })
      .setOrigin(0.5).setDepth(802);
    objs.push(remTxt);

    const btnY = py + 160, btnW = 84, btnH = 68, btnGap = 100;
    const btnX0 = cx - btnGap * 1.5;

    SUIT_KEYS.forEach((suit, idx) => {
      const bx = btnX0 + idx * btnGap;
      const btnBg = this.add.rectangle(bx, btnY, btnW, btnH, 0x1a4a2a).setDepth(802).setInteractive();
      const symTxt = this.add.text(bx, btnY - 12, SUIT_SYMS[suit],
        { fontFamily: 'Arial', fontSize: '24px', color: SUIT_COLORS[suit] }).setOrigin(0.5).setDepth(803);
      const lvTxt = this.add.text(bx, btnY + 10, `Lv${this.player.attrs[suit]}`,
        { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: SUIT_COLORS[suit] }).setOrigin(0.5).setDepth(803);
      const descTxt = this.add.text(bx, btnY + 26, SUIT_DESCS[suit],
        { fontFamily: "'PressStart2P', Arial", fontSize: '7px', color: '#88aa88' }).setOrigin(0.5).setDepth(803);

      btnBg.on('pointerdown', () => {
        if (this._suitLevelUpCount <= 0) return;
        this.player.attrs[suit]++;
        this._suitLevelUpCount--;
        this.addBattleLog(`${SUIT_SYMS[suit]} Lv${this.player.attrs[suit]}!`);
        lvTxt.setText(`Lv${this.player.attrs[suit]}`);
        remTxt.setText(`SUIT 선택 (${this._suitLevelUpCount}회 남음)`);
        this.refreshPlayerLevel();
        if (this._suitLevelUpCount <= 0) { destroy(); onAllDone?.(); }
      });
      btnBg.on('pointerover', () => btnBg.setFillStyle(0x2a6644));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x1a4a2a));
      objs.push(btnBg, symTxt, lvTxt, descTxt);
    });
  }

  // ── 카드 확대 미리보기 ────────────────────────────────────────────────────
  _showCardPreview(key, srcX, srcY, depth = 500) {
    this._hideCardPreview();
    const PW = PLAYER_PANEL_W;
    const PW_ = CW * 1.7, PH_ = CH * 1.7;
    let px = srcX;
    let py = srcY - FIELD_CH / 2 - PH_ / 2 - 10;
    px = Phaser.Math.Clamp(px, PW + PW_ / 2 + 6, GW - PW_ / 2 - 6);
    py = Phaser.Math.Clamp(py, PH_ / 2 + 6, GH - PH_ / 2 - 6);
    this._cardPreviewObjs = [
      this.add.rectangle(px, py, PW_ + 10, PH_ + 10, 0x000000, 0.75).setDepth(depth),
      this.add.image(px, py, key).setDisplaySize(PW_, PH_).setDepth(depth + 1),
    ];
  }

  _hideCardPreview() {
    if (!this._cardPreviewObjs) return;
    this._cardPreviewObjs.forEach(o => o?.destroy());
    this._cardPreviewObjs = null;
  }

  // ── 턴 시작 세이브 ────────────────────────────────────────────────────────
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

  // 덱/더미 팝업은 PilePopupUI 위임

  // ── 게임 오버 ────────────────────────────────────────────────────────────
  showGameOver() {
    this.isDealing = true;
    deleteSave();

    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GW, GH);
    const pw = 500, ph = 320, px = GW / 2 - 250, py = GH / 2 - 160;
    g.fillStyle(0x0d2b18, 1);
    g.fillRoundedRect(px, py, pw, ph, 20);
    g.lineStyle(3, 0xcc2200);
    g.strokeRoundedRect(px, py, pw, ph, 20);

    this.add.text(GW / 2, py + 72, "GAME OVER", TS.gameOverTitle).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 148, "FINAL SCORE", TS.gameOverScoreLabel).setOrigin(0.5).setDepth(301);
    this.add.text(GW / 2, py + 182, `${this.player.score}`, TS.gameOverScore).setOrigin(0.5).setDepth(301);

    const btnBg = this.add.rectangle(GW / 2, py + ph - 50, 220, 54, 0x1e4e99).setDepth(302).setInteractive();
    this.add.text(GW / 2, py + ph - 50, "MAIN MENU", TS.overlayBtn).setOrigin(0.5).setDepth(303);
    btnBg.on("pointerdown", () => this.scene.start("MainMenuScene"));
    btnBg.on("pointerover", () => btnBg.setFillStyle(0x2d66cc));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0x1e4e99));
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
