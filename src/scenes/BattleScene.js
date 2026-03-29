import Phaser from "phaser";
import { calculateScore } from "../service/scoreService.js";
import roundData from "../data/round.json";
import {
  GW, GH, CW, CH, FIELD_CW, FIELD_CH, PILE_CW, PILE_CH,
  SUITS, RANKS, SUIT_ORDER,
  PLAYER_PANEL_W, ITEM_PANEL_W,
  BATTLE_LOG_H, MONSTER_AREA_TOP, MONSTER_AREA_H, MONSTER_IMG_Y,
  FIELD_Y, HAND_Y, HAND_TOP, DEAL_DELAY,
  HAND_DATA, HAND_RANK, DEBUG_MODE,
  context
} from "../constants.js";
import langData from "../data/lang.json";
import relicData from "../data/relic.json";

const _relicMap = Object.fromEntries(relicData.relics.map(r => [r.id, r]));

import { spawnMonsters, MONSTER_LIST } from "../service/monsterService.js";
import { writeSave, deleteSave } from "../save.js";
import { CardRenderer } from "../CardRenderer.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import { saveOptionsByRegistry } from "../manager/optionManager.js";
import effectManager from '../manager/effectManager.js';
import DeckManager from '../manager/deckManager.js';
import itemData from '../data/item.json';
import { DebuffManager, debuffData, debuffMap as _debuffMap } from '../manager/debuffManager.js';
import { MonsterManager } from '../manager/monsterManager.js';
import { PlayerUI } from '../ui/PlayerUI.js';
import { BattleLogUI } from '../ui/BattleLogUI.js';
import { ItemUI } from '../ui/ItemUI.js';

// ─── 파이어볼 랭크별 스타일 ──────────────────────────────────────────────────
const FIREBALL_STYLES = {
  0:  { size: 48, tint: 0xffffff, textColor: '#ccddcc' },
  1:  { size: 52, tint: 0xffffff, textColor: '#ffee88' },
  2:  { size: 56, tint: 0xffffff, textColor: '#ffdd66' },
  3:  { size: 60, tint: 0xffffff, textColor: '#ffcc55' },
  4:  { size: 64, tint: 0xffcc00, textColor: '#ffdd44' },
  5:  { size: 66, tint: 0xffcc00, textColor: '#eedd44' },
  6:  { size: 70, tint: 0xffcc00, textColor: '#ffee66' },
  7:  { size: 76, tint: 0xff8800, textColor: '#ffaa44' },
  8:  { size: 82, tint: 0xff4400, textColor: '#ff8833' },
  9:  { size: 90, tint: 0xff2200, textColor: '#ffcc44' },
  10: { size: 96, tint: 0xff1100, textColor: '#ffcc44' },
  11: { size: 100, tint: 0xff0000, textColor: '#ffcc44' },
};

// ─── 씬 ──────────────────────────────────────────────────────────────────────
export class BattleScene extends Phaser.Scene {
  constructor() { super("BattleScene"); }

  // ── preload ──────────────────────────────────────────────────────────────
  preload() {
    this.load.setBaseURL(import.meta.env.BASE_URL);
    //this.load.image("card_back", "/_card_back.png");
    this.load.image("card_back", "assets/images/ui/card_back.png");
    if (!this.textures.exists("card_back_deck"))
      this.load.image("card_back_deck", "assets/images/ui/deck_rembg.png");
    if (!this.textures.exists("card_back_dummy"))
      this.load.image("card_back_dummy", "assets/images/ui/dummy_rembg.png");
    const _round = this.scene.settings.data?.round ?? 1;
    const _bgFile = roundData.rounds.find(r => r.round === _round)?.bg ?? "01_forest_night.jpg";
    const _bgKey  = `bg_${_round}`;
    if (!this.textures.exists(_bgKey))
      this.load.image(_bgKey, `assets/images/bg/${_bgFile}`);
    this._bgKey = _bgKey;
    itemData.items.forEach(item => {
      if (item.img && !this.textures.exists(`item_${item.id}`))
        this.load.image(`item_${item.id}`, `assets/images/item/${item.img}`);
    });
    CardRenderer.preload(this);
    this.load.audio("sfx_shuffle", "assets/audio/sfx/card-shuffle.ogg");
    this.load.audio("sfx_fan", "assets/audio/sfx/card-fan-1.ogg");
    this.load.audio("sfx_slide", "assets/audio/sfx/card-slide-5.ogg");
    this.load.audio("sfx_place", "assets/audio/sfx/card-place-1.ogg");
    this.load.audio("sfx_chop", "assets/audio/sfx/chop.ogg");
    this.load.audio("sfx_knifeSlice", "assets/audio/sfx/knifeSlice.ogg");
    if (!this.textures.exists("ui_deck")) this.load.image("ui_deck", "assets/images/ui/deck.png");
    if (!this.textures.exists("ui_dummy")) this.load.image("ui_dummy", "assets/images/ui/dummy.png");
    if (!this.textures.exists("ui_option")) this.load.image("ui_option", "assets/images/ui/option_rembg.png");
    if (!this.textures.exists("ui_end_turn")) this.load.image("ui_end_turn", "assets/images/ui/end_turn_rembg.png");
    if (!this.textures.exists("ui_sort"))   this.load.image("ui_sort",   "assets/images/ui/SuitRank_rembg.png");
    if (!this.textures.exists("ui_sword"))    this.load.image("ui_sword",    "assets/images/ui/sword.png");
    if (!this.textures.exists("ui_shield"))   this.load.image("ui_shield",   "assets/images/ui/shield.png");
    if (!this.textures.exists("ui_fireball")) this.load.spritesheet("ui_fireball", "assets/images/ui/fireball_frame.png", { frameWidth: 325, frameHeight: 358 });

    relicData.relics.forEach(r => {
      if (r.img && !this.textures.exists(`relic_${r.id}`))
        this.load.image(`relic_${r.id}`, `assets/images/relic/${r.img}`);
    });
    debuffData.debuffs.forEach(d => {
      if (d.img && !this.textures.exists(`debuff_${d.id}`))
        this.load.image(`debuff_${d.id}`, `assets/images/debuff/${d.img}`);
    });

    // 몬스터 PNG 스프라이트시트 (frameWidth:384 frameHeight:384, 3col 고정)
    MONSTER_LIST.forEach(m => {
      if (!m.sprite) return;
      for (const [state, url] of Object.entries(m.sprite)) {
        const key = `mon_${m.id}_${state}`;
        if (!this.textures.exists(key)) {
          this.load.spritesheet(key, url, { frameWidth: 384, frameHeight: 384 });
        }
      }
    });

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
    this.isBoss = data.isBoss ?? false;
    this.battleIndex = data.battleIndex ?? 0;
    this.normalCount = data.normalCount ?? 3;
    this.monsterTier = data.monsterTier ?? [0];
    this.totalCost = data.totalCost ?? 3;

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
    this.monsterObjs = [];
    this._monsterSprites = [];
    this._debuffObjs    = [];
    this._debuffTipObjs = [];
    this.debuffManager  = new DebuffManager(this);
    this.monsterManager = new MonsterManager(this);
    this.animObjs = [];
    this._optOverlayObjs = null;
    this.isDragging = false;
    this.isDealing = true;
    this.fieldPickCount = 0;
    this.attackCount = 0;
    this.sortMode = null;
    this.sortAsc = true;
    this._fullBattleLog = data.battleLog ?? [];
    this._suitLevelUpCount = 0;
    this._pilePopupObjs = null;
    this._cardPreviewObjs = null;

    // 세이브에서 몬스터 복원, 없으면 새로 스폰
    this.monsters = data.monsters
      ? data.monsters
      : spawnMonsters(this.monsterTier, this.totalCost);

    CardRenderer.createAll(this);

    // 몬스터 PNG 애니메이션 등록
    const ANIM_CFGS = {
      idle: { frameRate: 8, repeat: -1 },
      attack: { frameRate: 10, repeat: 0 },
      damaged: { frameRate: 10, repeat: 0 },
      die: { frameRate: 8, repeat: 0 },
      skill: { frameRate: 10, repeat: 0 },
    };
    MONSTER_LIST.forEach(m => {
      if (!m.sprite) return;
      for (const [state, cfg] of Object.entries(ANIM_CFGS)) {
        if (!m.sprite[state]) continue;
        const texKey = `mon_${m.id}_${state}`;
        const animKey = `${texKey}_anim`;
        if (!this.textures.exists(texKey) || this.anims.exists(animKey)) continue;
        const validFrames = this.monsterManager._countValidFrames(texKey);
        if (validFrames === 0) continue;
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(texKey, { start: 0, end: validFrames - 1 }),
          frameRate: cfg.frameRate,
          repeat: cfg.repeat,
        });
      }
    });

    // 파이어볼 애니메이션 등록 (1회)
    if (!this.anims.exists('fireball_loop')) {
      this.anims.create({
        key: 'fireball_loop',
        frames: this.anims.generateFrameNumbers('ui_fireball', { start: 0, end: 8 }),
        frameRate: 12,
        repeat: -1,
      });
    }

    this.drawBg();
    this.createUI();
    this.createSortButton();
    this.setupDrag();
    this.startDealAnimation();
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
    const PW   = PLAYER_PANEL_W;
    const IPW  = ITEM_PANEL_W;
    const IPX  = GW - IPW;
    const IPCX = IPX + IPW / 2;
    const FAW  = GW - PW - IPW;
    const faCX = PW + FAW / 2;

    // ── 플레이어 패널 (PlayerUI) ─────────────────────────────────────────
    const battleLabel = this.isBoss ? 'BOSS' : `${this.battleIndex + 1}`;
    this.playerUI = new PlayerUI(this, this.player, {
      round: this.round,
      battleLabel,
      showAtk: true,
      showDeckCounts: true,
      showTooltips: true,
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
    const cornerX    = GW - ITEM_PANEL_W - 16;
    //const cornerStyle = { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#556655' };
    this._fieldCountCornerTxt = this.add.text(cornerX, FIELD_Y + FIELD_CH / 2 + 10, "", TS.handRank).setOrigin(1, 1).setDepth(15);
    this._handCountCornerTxt  = this.add.text(cornerX, HAND_Y + CH / 2 + 10, "", TS.handRank).setOrigin(1, 1).setDepth(15);

    // ── 메시지 텍스트 ──────────────────────────────────────────────────────
    this.msgTxt = this.add.text(faCX, BATTLE_LOG_H + 8, "", TS.msg).setOrigin(0.5, 0).setDepth(100);

    // ── 콤보 공격 버튼 → 파이어볼 스프라이트 ──────────────────────────────
    const comboBtnY = MONSTER_AREA_TOP + MONSTER_AREA_H + 8;
    this._comboBtnSprite = this.add.sprite(faCX, comboBtnY, 'ui_fireball')
      .setDisplaySize(60, Math.round(60 * 358 / 325))
      .setDepth(30).setVisible(false)
      .setInteractive({ draggable: true });
    this._comboBtnSprite.setData("comboBtn", true);
    this._comboBtnSprite.setData("origX", faCX);
    this._comboBtnSprite.setData("origY", comboBtnY);
    this._comboBtnSprite.play('fireball_loop');

    this._comboBtnText = this.add.text(faCX + 55, comboBtnY, "",
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
    optImg.on("pointerout",  () => optImg.clearTint());

    // ── TURN END 버튼 — 아이템 패널 하단 ────────────────────────────────
    const turnBtnX      = IPCX;
    const turnBtnY      = HAND_Y + CH / 2 - 15;
    this.turnEndBtn = this.add.image(turnBtnX, turnBtnY, "ui_end_turn")
      .setDisplaySize(100, 50).setDepth(60).setInteractive();
    this.turnEndBtn.on("pointerdown", () => { if (!this.isDealing) this.onTurnEnd(); });
    this.turnEndBtn.on("pointerover", () => this.turnEndBtn.setTint(0xffdd88));
    this.turnEndBtn.on("pointerout",  () => this.turnEndBtn.clearTint());

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
    this.sortBg.on("pointerout",  () => this.refreshSortBtns());
  }

  refreshSortBtns() {
    if (this.sortMode) this.sortBg?.setTint(0x88ffaa);
    else               this.sortBg?.clearTint();
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
    this.input.on("dragstart", (pointer, obj) => {
      if (this.isDealing) return;
      this._sfx("sfx_slide");
      this.isDragging = true;
      obj.setDepth(200);
      if (obj.getData("comboBtn")) {
        this._comboBtnText.setDepth(201);
        this.tweens.killTweensOf(obj);  // pulse 중단
      } else if (obj.getData("itemIndex") !== undefined) {
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
      obj.x = dragX; obj.y = dragY;
      if (obj.getData("comboBtn")) {
        this._comboBtnText.x = dragX + 55;
        this._comboBtnText.y = dragY;
      }
    });
    this.input.on("dragend", (pointer, obj) => {
      this.isDragging = false;

      // ── 콤보 버튼 drag ────────────────────────────────────────────────
      if (obj.getData("comboBtn")) {
        obj.setDepth(30);
        this._comboBtnText.setDepth(31);
        const origX = obj.getData("origX");
        const origY = obj.getData("origY");

        const inMonsterArea = pointer.y >= MONSTER_AREA_TOP
                           && pointer.y <= MONSTER_AREA_TOP + MONSTER_AREA_H;

        if (!this.isDealing && inMonsterArea) {
          const positions = this.monsterManager.calcMonsterPositions(this.monsters.length);
          const monIdx = positions.reduce((best, _, i) =>
            Math.abs(pointer.x - positions[i].x) < Math.abs(pointer.x - positions[best].x) ? i : best
          , 0);

          obj.x = origX; obj.y = origY;
          this._comboBtnText.x = origX + 55; this._comboBtnText.y = origY;

          if (!this.monsters[monIdx]?.isDead) {
            this.monsterManager.attackMonster(monIdx);
          }
        } else {
          // 스냅백
          this.tweens.add({
            targets: obj,
            x: origX, y: origY,
            duration: 220, ease: 'Back.Out',
            onUpdate: () => {
              this._comboBtnText.x = obj.x + 55;
              this._comboBtnText.y = obj.y;
            },
          });
        }
        return;
      }

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

    const itemDef = itemData.items.find(d => d.id === item.id);
    const eff = itemDef?.effect;
    if (eff) {
      switch (eff.type) {
        case 'heal':
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + eff.value);
          this.addBattleLog(`[${item.name}] HP +${eff.value}`);
          break;
        case 'maxHp':
          this.player.maxHp += eff.value;
          //this.player.hp += eff.value;  //최대 체력만 올린다
          this.addBattleLog(`[${item.name}] 최대 HP +${eff.value}`);
          break;
        case 'def':
          this.player.def += eff.value;
          this.addBattleLog(`[${item.name}] DEF +${eff.value}`);
          break;
        case 'attacksPerTurn':
          this.player.attacksPerTurn += eff.value;
          this.addBattleLog(`[${item.name}] 공격횟수 +${eff.value}`);
          break;
        case 'handSize':
          this.player.handSize += eff.value;
          this.player.handSizeLimit += eff.value;
          this.addBattleLog(`[${item.name}] 핸드 크기 +${eff.value}`);
          break;
        case 'fieldSize':
          this.player.fieldSize += eff.value;
          this.player.fieldSizeLimit += eff.value;
          this.addBattleLog(`[${item.name}] 필드 크기 +${eff.value}`);
          break;
        case 'attr':
          this.player.attrs[eff.suit] += eff.value;
          this.addBattleLog(`[${item.name}] ${eff.suit} 적응 +${eff.value}`);
          break;
      }
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
    this.monsterObjs.forEach(o => o.destroy());
    this.monsterObjs = [];
    this._monsterSprites.forEach(s => s?.destroy());
    this._monsterSprites = [];

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
    hit.on("pointerdown", () => { if (!this._pilePopupObjs) this._showPilePopup(this.deckData, "DECK"); });
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
    hit.on("pointerdown", () => { if (!this._pilePopupObjs) this._showPilePopup(this.dummyData, "DUMMY CARDS"); });
    this.cardObjs.push(hit);
  }

  renderField() {
    // 공격 횟수 소진 또는 필드픽 한도 도달 시 비활성화
    const canPick = this.fieldPickCount < this.player.fieldSize
      && this.attackCount < this.player.attacksPerTurn;

    this.fieldData.forEach((card, i) => {
      const x = card.slotX;
      const img = this.add.image(x, FIELD_Y, card.key).setDisplaySize(FIELD_CW, FIELD_CH).setDepth(10);

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
          }
        });
        img.on("pointerout", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: FIELD_CW, displayHeight: FIELD_CH, y: FIELD_Y, duration: 100 });
            img.setDepth(10);
          }
        });
      } else {
        img.on("pointerdown", () => {
          this.addBattleLog(`이번 턴 공격 횟수 초과! (${this.player.attacksPerTurn}회)`);
        });
        img.setAlpha(0.45);
      }
      this.cardObjs.push(img);
    });
  }

  renderHand() {
    if (this.handData.length === 0) return;

    // 공격 횟수 소진 또는 필드픽 한도 도달 시 비활성화
    const canPick = this.fieldPickCount < this.player.fieldSize
      && this.attackCount < this.player.attacksPerTurn;


    const positions = this.calcHandPositions(this.handData.length);
    const combo = this._getSelectedCombo();
    const comboCardSet = new Set(combo.cards ?? []);
    const hasValidCombo = (combo.rank ?? 0);

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

      const isDisabled = this.debuffManager.disabledCardUids.has(card.uid);
      const img = this.add.image(x, y, card.key)
        .setDisplaySize(cardW, cardH).setDepth(sel ? 32 : 30).setInteractive()
        .setAlpha(isDisabled ? 0.35 : 1);

      if (isDisabled) {
        this.add.text(x, y, '✕', { fontFamily: 'Arial', fontSize: `${Math.round(cardW * 0.6)}px`, color: '#ff4444' })
          .setOrigin(0.5).setDepth(33);
      }

      if (canPick && !isDisabled) {

        img.on("pointerdown", () => { if (!this.isDragging && !this.isDealing) this.toggleHand(i); });
        img.on("pointerover", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: hoverW, displayHeight: hoverH, y: y - 8, duration: 100 });
            img.setDepth(40);
          }
        });
        img.on("pointerout", () => {
          if (!this.isDragging) {
            this.tweens.add({ targets: img, displayWidth: cardW, displayHeight: cardH, y, duration: 100 });
            img.setDepth(sel ? 32 : 30);
          }
        });
      } else {
        img.on("pointerdown", () => {
          if (isDisabled) this.addBattleLog(`디버프로 사용 불가 카드입니다!`);
          else this.addBattleLog(`이번 턴 공격 횟수 초과! (${this.player.attacksPerTurn}회)`);
        });
      }

      this.cardObjs.push(img);

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
    const positions = this.monsterManager.calcMonsterPositions(this.monsters.length);
    const hasCombo = this._getSelectedCombo().score > 0
      && this.attackCount < this.player.attacksPerTurn;
    const imgW = 156, imgH = 156;

    // 하단 기준 레이아웃
    const MON_BOTTOM = MONSTER_AREA_TOP + MONSTER_AREA_H - 4;  // 400
    const BAR_H = 10;
    const STAT_H = 14;
    const barY = MON_BOTTOM - STAT_H - 6 - BAR_H / 2;    // bar 중심
    const statY = MON_BOTTOM - STAT_H / 2;                 // ATK/DEF 중심
    const spriteY = barY - BAR_H / 2 - 8 - imgH / 2;        // 스프라이트 중심

    this.monsters.forEach((mon, idx) => {
      const x = positions[idx].x;
      let monObj;
      const mobId = mon.mob.id;

      if (mon.isDead) {
        const dieTexKey = `mon_${mobId}_die`;
        const dieAnimKey = `${dieTexKey}_anim`;
        if (this.textures.exists(dieTexKey)) {
          monObj = this.add.sprite(x, spriteY, dieTexKey)
            .setDisplaySize(imgW, imgH).setDepth(15).setAlpha(0.7);
          if (!mon.deathAnimDone) {
            if (this.anims.exists(dieAnimKey)) {
              monObj.play(dieAnimKey);
              monObj.once('animationcomplete', () => { mon.deathAnimDone = true; });
            }
            this.time.delayedCall(1500, () => { mon.deathAnimDone = true; });
          } else {
            const lastFrame = this.monsterManager._countValidFrames(dieTexKey) - 1;
            monObj.setFrame(Math.max(0, lastFrame));
          }
        }
      } else {
        const idleTexKey = `mon_${mobId}_idle`;
        const idleAnimKey = `${idleTexKey}_anim`;
        if (this.textures.exists(idleTexKey)) {
          monObj = this.add.sprite(x, spriteY, idleTexKey)
            .setDisplaySize(imgW, imgH).setDepth(15);
          if (this.anims.exists(idleAnimKey)) monObj.play(idleAnimKey);
        }
      }

      if (!monObj) {
        monObj = this.add.rectangle(
          x, spriteY, imgW, imgH,
          [0x886622, 0x226688, 0x662288, 0x228866][idx % 4]
        ).setDepth(15);
      }
      this._monsterSprites[idx] = monObj;

      /*
      if (mon.isDead) {
        this.monsterObjs.push(
          this.add.rectangle(x, spriteY, imgW + 4, imgH + 4, 0x000000, 0.45).setDepth(16),
          this.add.text(x, spriteY, "X", TS.monDead).setOrigin(0.5).setDepth(17)
        );
        return;
      }
      */

      // ── HP 바 (텍스트 포함) ──────────────────────────────────────────────
      const barW = 88;
      const hpRatio = Math.max(0, mon.hp / mon.maxHp);
      const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xddaa00 : 0xdd3333;
      this.monsterObjs.push(
        this.add.rectangle(x, barY, barW, BAR_H, 0x1a1a1a).setDepth(16),
        this.add.rectangle(x - barW / 2, barY, Math.max(1, barW * hpRatio), BAR_H, hpColor)
          .setOrigin(0, 0.5).setDepth(17),
        this.add.text(x, barY, `${mon.hp}/${mon.maxHp}`,
          {
            fontFamily: "'PressStart2P',Arial", fontSize: '7px', color: '#ffffff',
            stroke: '#000000', strokeThickness: 2
          })
          .setOrigin(0.5).setDepth(18)
      );

      // ── ATK / DEF (아이콘 + 수치) ────────────────────────────────────────
      // sword.png: 320×912 → 비율 유지 시 height 14 → width ≈ 5px (세로형 이미지)
      const statNumSty = { fontFamily: "'PressStart2P',Arial", fontSize: '8px', stroke: '#000000', strokeThickness: 2 };
      this.monsterObjs.push(
        this.add.image(x - 30, statY, "ui_sword" ).setDisplaySize(5, 14).setDepth(16),
        this.add.text( x - 26, statY, `${mon.atk}`, { ...statNumSty, color: '#ffaaaa' }).setOrigin(0, 0.5).setDepth(17),
        this.add.image(x +  6, statY, "ui_shield").setDisplaySize(12, 12).setDepth(16),
        this.add.text( x + 14, statY, `${mon.def}`, { ...statNumSty, color: '#aaaaff' }).setOrigin(0, 0.5).setDepth(17)
      );

      // ── ATTACK 힌트 + 히트 영역 ──────────────────────────────────────────
      if (hasCombo) {
        this.monsterObjs.push(
          this.add.text(x, spriteY - imgH / 2 - 10, "ATTACK!", TS.monTarget)
            .setOrigin(0.5, 1).setDepth(18)
        );
        const hitH = MON_BOTTOM - (spriteY - imgH / 2) + 10;
        const hitCY = spriteY - imgH / 2 + hitH / 2;
        const hit = this.add.rectangle(x, hitCY, imgW + 20, hitH, 0x000000, 0)
          .setDepth(19).setInteractive();
        hit.on("pointerdown", () => { if (!this.isDealing) this.monsterManager.attackMonster(idx); });
        this.monsterObjs.push(hit);
      }
    });
  }

  // ── 아이템 패널 렌더 ─────────────────────────────────────────────────────
  // ── 현재 선택에서 효과 받는 relic id 목록 ──────────────────────────────
  _getApplicableRelicIds(rank) {
    const deckCount     = this.deckData?.length ?? 0;
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

    const SIZE   = 28;
    const GAP    = 34;
    const startX = PLAYER_PANEL_W + 10 + SIZE / 2;
    const iconY  = MONSTER_AREA_TOP + 8 + SIZE / 2;

    this.debuffManager.activeDebuffs.forEach((active, idx) => {
      const def = _debuffMap[active.id];
      if (!def) return;
      const x = startX + idx * GAP;

      // 배경
      const bg = this.add.rectangle(x, iconY, SIZE, SIZE, 0x1a0a2e, 0.88)
        .setDepth(20).setStrokeStyle(1, 0xaa44ff);
      this._debuffObjs.push(bg);

      // 아이콘 이미지 or 텍스트 폴백
      const imgKey = `debuff_${active.id}`;
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
    const color  = TIER_COLORS[def.tier] ?? '#44cc88';
    const colorN = parseInt(color.replace('#', ''), 16);
    const lines  = [def.name, def.description, durStr];
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
    context.deckCount    = this.deckData?.length ?? 0;
    context.dummyCount   = this.dummyData?.length ?? 0;
    context.handConfig   = this.player.getEffectiveHandConfig();
    context.relics       = this.player.relics ?? [];
    context.enabledHands = this.player.getEnabledHands();
    context.suitAliases  = this.player.getEffectiveSuitAliases();
    context.atk          = this.player.atk;
  }

  // ── 족보 계산 헬퍼 ───────────────────────────────────────────────────────
  _getSelectedCombo() {
    if (this.selected.size === 0) return { score: 0, handName: "" };
    return calculateScore([...this.selected].map(i => this.handData[i]), context);
  }

  updatePreview() {
    this._refreshContext();
    const { score: cardScore, rank } = this._getSelectedCombo();
    const score = cardScore > 0 ? Math.floor(cardScore) : 0;

    if (score > 0) {
      const lang = this.registry?.get('lang') ?? 'ko';
      const key  = HAND_DATA[rank]?.key ?? '';
      const name = langData[lang]?.hand?.[key]?.name ?? key;
      const fb   = FIREBALL_STYLES[rank] ?? FIREBALL_STYLES[0];
      const fbH  = Math.round(fb.size * 358 / 325);

      this.tweens.killTweensOf(this._comboBtnSprite);
      this._comboBtnPulsing = false;

      this._comboBtnSprite
        .setDisplaySize(fb.size, fbH)
        .setTint(fb.tint)
        .setVisible(true);
      this._comboBtnText
        .setText(name)
        .setColor(fb.textColor)
        .setVisible(true);

      // 고랭크 pulse (rank 7+)
      if (rank >= 7) {
        this._comboBtnPulsing = true;
        const sx = this._comboBtnSprite.scaleX;
        const sy = this._comboBtnSprite.scaleY;
        this.tweens.add({
          targets: this._comboBtnSprite,
          scaleX: { from: sx, to: sx * 1.15 },
          scaleY: { from: sy, to: sy * 1.15 },
          duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }

      // PlayerUI hand 반짝 + ItemUI relic 달그락
      this.playerUI?.highlightHand(rank);
      this.itemUI?.rattleRelics(this._getApplicableRelicIds(rank));
    } else {
      this.tweens.killTweensOf(this._comboBtnSprite);
      this._comboBtnSprite.setVisible(false);
      this._comboBtnText.setVisible(false);
      this._comboBtnPulsing = false;

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
      deck:  this.deckData?.length  ?? 0,
      dummy: this.dummyData?.length ?? 0,
    });
    this._fieldCountCornerTxt?.setText(`${this.fieldData?.length ?? 0}/${p.fieldSize}`);
    this._handCountCornerTxt?.setText(`${this.handData?.length  ?? 0}/${p.handSizeLimit}`);
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
    this._sfx("sfx_place");
    this.selected.has(i) ? this.selected.delete(i) : this.selected.add(i);
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

  _throwCardAtMonster(fromX, fromY, key, monX) {
    this._sfx("sfx_fan");
    const img = this.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.tweens.add({
      targets: img, x: monX, y: MONSTER_IMG_Y,
      displayWidth: CW * 0.5, displayHeight: CH * 0.5,
      duration: 280, ease: "Power2.In",
      onComplete: () => {
        this.tweens.add({
          targets: img, x: GW - ITEM_PANEL_W - 40, y: FIELD_Y,
          displayWidth: CW * 0.15, displayHeight: CH * 0.15, alpha: 0,
          duration: 220, ease: "Power2.In",
          onComplete: () => img.destroy(),
        });
      },
    });
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
    const alive = this.monsters.filter(m => !m.isDead);
    const ATK_GAP = 650;

    alive.forEach((m, localIdx) => {
      const globalIdx = this.monsters.indexOf(m);
      this.time.delayedCall(localIdx * ATK_GAP, () => {
        const useSkill = m.mob.skill && Math.random() < (DEBUG_MODE?3:1) / 3;
        if (useSkill) {
          this.monsterManager._useMonsterSkill(globalIdx, m);
        } else {
          const dmg = Math.max(0, m.atk - this.player.def);
          this.player.hp = Math.max(0, this.player.hp - dmg);
          this.addBattleLog(`${m.mob.name}의 공격! ${dmg} 데미지!`);
          this.monsterManager._showMonsterAttack(globalIdx, dmg);
        }
        this.refreshPlayerStats();
        this.refreshBattleLog();
      });
    });

    this.time.delayedCall(alive.length * ATK_GAP + 300, () => {
      try { this.render(); } catch (e) { console.error("[onTurnEnd render]", e); }
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
    });
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
    this.player.def = 0;

    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, 0, GW, GH);
    const pw = 480, ph = 280, px = GW / 2 - 240, py = GH / 2 - 140;
    g.fillStyle(0x0a2a10, 1);
    g.fillRoundedRect(px, py, pw, ph, 20);
    g.lineStyle(3, 0x44dd88);
    g.strokeRoundedRect(px, py, pw, ph, 20);

    const titleText = this.isBoss ? "ROUND CLEAR!" : "BATTLE CLEAR!";
    const subText = this.isBoss
      ? `ROUND ${this.round} 완료  SCORE: ${this.player.score}`
      : `${this.round}-${this.battleIndex + 1}  SCORE: ${this.player.score}`;
    const noteText = this.isBoss ? "다음 라운드로..." : "다음 전투로...";

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
      // 모든 카드를 deck으로 모아 셔플 (permanent만 유지)
      this.deck.resetForNextBattle();

      if (this.isBoss) {
        writeSave(this.round + 1, this.player.toData(), this.deck.getState());
        this.scene.start("GameScene", {
          round: this.round + 1,
          player: this.player.toData(),
          deck: this.deck.getState(),
          battleLog: this.battleLogUI.logs,
        });
      } else {
        this.scene.start("GameScene", {
          round: this.round,
          player: this.player.toData(),
          deck: this.deck.getState(),
          phase: 'battle',
          battleIndex: this.battleIndex + 1,
          battleLog: this.battleLogUI.logs,
        });
      }
    });
  }

  // ── 레벨업 후 처리 ────────────────────────────────────────────────────────
  _checkLevelUpThenProceed() {
    const allDead = this.monsters.every(m => m.isDead);
    if (this._suitLevelUpCount > 0) {
      this.isDealing = true;
      this._showLevelUpPopup(() => {
        this.isDealing = false;
        if (allDead) this.time.delayedCall(500, () => this.onBattleClear());
      });
    } else if (allDead) {
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
      monsters: this.monsters,
    });
  }

  // ── 덱/더미 카드 목록 팝업 ────────────────────────────────────────────────
  _showPilePopup(pileData, title) {
    if (this._pilePopupObjs) return;
    const objs = this._pilePopupObjs = [];

    const RANK_LIST = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const CW_ = FIELD_CW, CH_ = FIELD_CH;
    const GAP_X = CW_ + 4, ROW_H = CH_ + 16, LABEL_W = 26, PAD = 20;
    const panelX = PLAYER_PANEL_W + PAD;
    const panelW = GW - PLAYER_PANEL_W - PAD * 2;

    const bySuit = { S: [], H: [], D: [], C: [] };
    for (const card of pileData) {
      const s = card.key[0];
      if (bySuit[s]) bySuit[s].push(card);
    }
    SUITS.forEach(s =>
      bySuit[s].sort((a, b) =>
        RANK_LIST.indexOf(a.key.slice(1)) - RANK_LIST.indexOf(b.key.slice(1))
      )
    );

    const titleH = 38, closeH = 40;
    const panelH = titleH + SUITS.length * ROW_H + closeH;
    const panelTop = Math.max(BATTLE_LOG_H + 6, (GH - panelH) / 2);
    const panelCX = panelX + panelW / 2;

    const dim = this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.78)
      .setDepth(600).setInteractive();
    objs.push(dim);
    objs.push(
      this.add.rectangle(panelCX, panelTop + panelH / 2, panelW, panelH, 0x0a1e12, 0.97)
        .setDepth(601).setStrokeStyle(1, 0x3a7a4a)
    );
    objs.push(
      this.add.text(panelCX, panelTop + titleH / 2,
        `${title}  (${pileData.length})`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: '#ccffcc' }
      ).setOrigin(0.5).setDepth(602)
    );

    const SUIT_SYMS = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const SUIT_COLORS = { S: '#8888ff', H: '#ff6666', D: '#ff6666', C: '#8888ff' };
    const rowsY = panelTop + titleH;

    SUITS.forEach((suit, si) => {
      const cy = rowsY + si * ROW_H + CH_ / 2 + 8;
      const cards = bySuit[suit];
      objs.push(
        this.add.text(panelX + LABEL_W / 2, cy, SUIT_SYMS[suit],
          { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] }
        ).setOrigin(0.5).setDepth(602)
      );
      cards.forEach((card, ci) => {
        const cx = panelX + LABEL_W + 6 + ci * GAP_X + CW_ / 2;
        const img = this.add.image(cx, cy, card.key)
          .setDisplaySize(CW_, CH_).setDepth(602).setInteractive();
        img.on('pointerover', () => {
          this.tweens.add({ targets: img, displayWidth: CW_ * 1.5, displayHeight: CH_ * 1.5, duration: 100 });
          img.setDepth(650);
        });
        img.on('pointerout', () => {
          this.tweens.add({ targets: img, displayWidth: CW_, displayHeight: CH_, duration: 100 });
          img.setDepth(602);
        });
        objs.push(img);
      });
    });

    const closeY = rowsY + SUITS.length * ROW_H + closeH / 2;
    const closeBg = this.add.rectangle(panelCX, closeY, 130, 28, 0x1a3a22)
      .setDepth(602).setStrokeStyle(1, 0x4a9a5a);
    const closeTxt = this.add.text(panelCX, closeY, 'CLOSE',
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#aaffaa' }
    ).setOrigin(0.5).setDepth(603).setInteractive();
    closeTxt.on('pointerdown', () => this._closePilePopup());
    dim.on('pointerdown', () => this._closePilePopup());
    objs.push(closeBg, closeTxt);
  }

  _closePilePopup() {
    if (!this._pilePopupObjs) return;
    this._hideCardPreview();
    this._pilePopupObjs.forEach(o => o.destroy());
    this._pilePopupObjs = null;
  }

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
  _showOptions() {
    if (this._optOverlayObjs) return;
    this.isDealing = true;

    const objs = this._optOverlayObjs = [];
    const cx = GW / 2, cy = GH / 2;
    const pw = 400, ph = 360;

    const dim = this.add.rectangle(cx, cy, GW, GH, 0x000000, 0.65)
      .setDepth(600).setInteractive();
    objs.push(dim);

    const panelG = this.add.graphics().setDepth(601);
    panelG.fillStyle(0x0d2b18);
    panelG.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    panelG.lineStyle(2, 0x2d7a3a);
    panelG.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    objs.push(panelG);

    objs.push(this.add.text(cx, cy - ph / 2 + 44, "OPTIONS", TS.optTitle).setOrigin(0.5).setDepth(602));

    // BGM 볼륨
    let bgm = this.registry.get("bgmVolume") ?? 7;
    const bgmY = cy - 70;
    objs.push(this.add.text(cx, bgmY - 28, "BGM", TS.optLabel).setOrigin(0.5).setDepth(602));

    const bgmMinus = this.add.rectangle(cx - 80, bgmY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(bgmMinus, this.add.text(cx - 80, bgmY, "-", TS.optBtn).setOrigin(0.5).setDepth(603));
    const bgmTxt = this.add.text(cx, bgmY, String(bgm), TS.optValue).setOrigin(0.5).setDepth(602);
    objs.push(bgmTxt);
    const bgmPlus = this.add.rectangle(cx + 80, bgmY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(bgmPlus, this.add.text(cx + 80, bgmY, "+", TS.optBtn).setOrigin(0.5).setDepth(603));
    const bgmBarBg = this.add.rectangle(cx, bgmY + 28, 204, 7, 0x224433).setDepth(602);
    const bgmBar = this.add.rectangle(cx - 102, bgmY + 28, bgm * 20.4, 7, 0x44dd88).setOrigin(0, 0.5).setDepth(603);
    objs.push(bgmBarBg, bgmBar);
    const updateBgm = (v) => {
      bgm = Phaser.Math.Clamp(v, 0, 10);
      this.registry.set("bgmVolume", bgm);
      bgmTxt.setText(String(bgm));
      bgmBar.setDisplaySize(Math.max(1, bgm * 20.4), 7);
      saveOptionsByRegistry(this.registry);
    };
    bgmMinus.on("pointerdown", () => updateBgm(bgm - 1));
    bgmPlus.on("pointerdown", () => updateBgm(bgm + 1));
    bgmMinus.on("pointerover", () => bgmMinus.setFillStyle(0x447766));
    bgmMinus.on("pointerout", () => bgmMinus.setFillStyle(0x335544));
    bgmPlus.on("pointerover", () => bgmPlus.setFillStyle(0x447766));
    bgmPlus.on("pointerout", () => bgmPlus.setFillStyle(0x335544));

    // SFX 볼륨
    let sfx = this.registry.get("sfxVolume") ?? 7;
    const sfxY = cy + 50;
    objs.push(this.add.text(cx, sfxY - 28, "SFX", TS.optLabel).setOrigin(0.5).setDepth(602));

    const sfxMinus = this.add.rectangle(cx - 80, sfxY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(sfxMinus, this.add.text(cx - 80, sfxY, "-", TS.optBtn).setOrigin(0.5).setDepth(603));
    const sfxTxt = this.add.text(cx, sfxY, String(sfx), TS.optValue).setOrigin(0.5).setDepth(602);
    objs.push(sfxTxt);
    const sfxPlus = this.add.rectangle(cx + 80, sfxY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(sfxPlus, this.add.text(cx + 80, sfxY, "+", TS.optBtn).setOrigin(0.5).setDepth(603));
    const sfxBarBg = this.add.rectangle(cx, sfxY + 28, 204, 7, 0x224433).setDepth(602);
    const sfxBar = this.add.rectangle(cx - 102, sfxY + 28, sfx * 20.4, 7, 0x44dd88).setOrigin(0, 0.5).setDepth(603);
    objs.push(sfxBarBg, sfxBar);
    const updateSfx = (v) => {
      sfx = Phaser.Math.Clamp(v, 0, 10);
      this.registry.set("sfxVolume", sfx);
      sfxTxt.setText(String(sfx));
      sfxBar.setDisplaySize(Math.max(1, sfx * 20.4), 7);
      saveOptionsByRegistry(this.registry);
    };
    sfxMinus.on("pointerdown", () => updateSfx(sfx - 1));
    sfxPlus.on("pointerdown", () => updateSfx(sfx + 1));
    sfxMinus.on("pointerover", () => sfxMinus.setFillStyle(0x447766));
    sfxMinus.on("pointerout", () => sfxMinus.setFillStyle(0x335544));
    sfxPlus.on("pointerover", () => sfxPlus.setFillStyle(0x447766));
    sfxPlus.on("pointerout", () => sfxPlus.setFillStyle(0x335544));

    // MAIN MENU 버튼
    const exitBtn = this.add.rectangle(cx - 80, cy + ph / 2 - 48, 140, 48, 0x882211)
      .setDepth(602).setInteractive();
    objs.push(exitBtn, this.add.text(cx - 80, cy + ph / 2 - 48, "MAIN MENU", TS.menuBtn).setOrigin(0.5).setDepth(603));
    exitBtn.on("pointerdown", () => {
      writeSave(this.round, this.player.toData(), this.deck.getState());
      this.scene.start("MainMenuScene");
    });
    exitBtn.on("pointerover", () => exitBtn.setFillStyle(0xaa2222));
    exitBtn.on("pointerout", () => exitBtn.setFillStyle(0x882211));

    // CLOSE 버튼
    const closeBtn = this.add.rectangle(cx + 80, cy + ph / 2 - 48, 140, 48, 0x335544)
      .setDepth(602).setInteractive();
    objs.push(closeBtn, this.add.text(cx + 80, cy + ph / 2 - 48, "CLOSE", TS.menuBtn).setOrigin(0.5).setDepth(603));
    closeBtn.on("pointerdown", () => this._closeOptions());
    closeBtn.on("pointerover", () => closeBtn.setFillStyle(0x447766));
    closeBtn.on("pointerout", () => closeBtn.setFillStyle(0x335544));
  }

  _closeOptions() {
    if (!this._optOverlayObjs) return;
    this._optOverlayObjs.forEach(o => o.destroy());
    this._optOverlayObjs = null;
    this.isDealing = false;
  }
}
