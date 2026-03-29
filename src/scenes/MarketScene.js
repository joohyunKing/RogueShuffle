import Phaser from "phaser";
import { GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W, SUITS, RANKS } from "../constants.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import DeckManager from "../manager/deckManager.js";
import itemData from '../data/item.json';
import relicData from '../data/relic.json';
import roundData from '../data/round.json';
import { PlayerUI } from '../ui/PlayerUI.js';
import { ItemUI } from '../ui/ItemUI.js';
import { loadOptions, saveOptionsByRegistry } from "../manager/optionManager.js";

const RARITY_WEIGHT = { common: 60, rare: 30, epic: 10 };
const RARITY_COLORS = {
  common: { bg: 0x1a3a22, border: 0x4a9a5a, label: '#aaffaa' },
  rare:   { bg: 0x1a2a4a, border: 0x4a6aaa, label: '#aaaaff' },
  epic:   { bg: 0x2a1a3a, border: 0x8a4aaa, label: '#cc88ff' },
};
const SUIT_CHARS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const CARD_OP_COST = 20;
const CARD_OP_MAX  = 2;

// 레이아웃 상수
const PW  = PLAYER_PANEL_W;
const IPW = ITEM_PANEL_W;
const IPX = GW - IPW;
const FAW = GW - PW - IPW;
const CX  = PW + FAW / 2;

// 유물 카드
const RELIC_W = 150, RELIC_H = 186, RELIC_GAP = 22;
const RELIC_SECTION_TOP = 58;
const RELIC_CARD_TOP    = 76;

// 아이템 카드
const ITEM_W = 110, ITEM_H = 90, ITEM_GAP_X = 18, ITEM_GAP_Y = 12;
const ITEM_COLS = 3;
const ITEM_SECTION_TOP = RELIC_CARD_TOP + RELIC_H + 14;  // ~276
const ITEM_CARD_TOP    = ITEM_SECTION_TOP + 18;           // ~294

// 카드 관리 섹션
const CARD_MGMT_TOP  = ITEM_CARD_TOP + 2 * ITEM_H + ITEM_GAP_Y + 10;  // ~496
const CARD_MGMT_H    = 62;

function pickWeighted(pool, n, weightFn) {
  const result = [];
  const avail  = [...pool];
  while (result.length < n && avail.length > 0) {
    const total = avail.reduce((s, r) => s + weightFn(r), 0);
    if (total <= 0) break;
    let rand = Math.random() * total;
    let idx  = avail.findIndex(r => (rand -= weightFn(r)) <= 0);
    if (idx < 0) idx = avail.length - 1;
    result.push(avail.splice(idx, 1)[0]);
  }
  return result;
}

export class MarketScene extends Phaser.Scene {
  constructor() { super("MarketScene"); }

  preload() {
    this.load.setBaseURL(import.meta.env.BASE_URL);
    const _round  = this.scene.settings.data?.round ?? 1;
    const _bgFile = roundData.rounds.find(r => r.round === _round)?.bg ?? "01_forest_night.jpg";
    const _bgKey  = `bg_${_round}`;
    if (!this.textures.exists(_bgKey))
      this.load.image(_bgKey, `assets/images/bg/${_bgFile}`);
    this._bgKey = _bgKey;
    itemData.items.forEach(item => {
      if (item.img && !this.textures.exists(`item_${item.id}`))
        this.load.image(`item_${item.id}`, `assets/images/item/${item.img}`);
    });
    relicData.relics.forEach(r => {
      if (r.img && !this.textures.exists(`relic_${r.id}`))
        this.load.image(`relic_${r.id}`, `assets/images/relic/${r.img}`);
    });
    if (!this.textures.exists("ui_option"))
      this.load.image("ui_option", "assets/images/ui/option_rembg.png");
  }

  create() {
    const opt = loadOptions();
    this.registry.set("bgmVolume", opt.bgmVolume);
    this.registry.set("sfxVolume", opt.sfxVolume);
    this.registry.set("lang",      opt.lang);

    const data     = this.scene.settings.data || {};
    this.round     = data.round  ?? 1;
    this.player    = new Player(data.player ?? {});
    this._deckData = data.deck ?? null;
    this._deck     = new DeckManager(this._deckData ?? {});

    // 상점 초기화 (씬 시작 시 1회)
    const ownedRelics = new Set(this.player.relics);
    const relicPool   = relicData.relics.filter(r => !ownedRelics.has(r.id));
    this._shopRelics  = pickWeighted(relicPool, 3, r => RARITY_WEIGHT[r.rarity] ?? 10)
      .map(r => ({ ...r, bought: false }));

    this._shopItems = pickWeighted(itemData.items, 6, r => RARITY_WEIGHT[r.rarity] ?? 30)
      .map(r => ({ ...r, bought: false }));

    this._deckOpsUsed      = 0;
    this._deckSelectedCard = null;
    this._tipObjs          = [];
    this._optOverlayObjs   = null;
    this._deckPopupObjs    = null;

    this._drawScene();
  }

  // ── 툴팁 ────────────────────────────────────────────────────────────────
  _clearTip() {
    this._tipObjs.forEach(o => { try { o?.destroy(); } catch(_) {} });
    this._tipObjs = [];
  }

  _showTip(nearX, nearY, title, desc, costLine, colorHex) {
    this._clearTip();
    const tw = 180, pad = 10, titleH = 18, lineH = 15;
    const descLines = Math.max(1, Math.ceil((desc?.length ?? 0) / 13));
    const th = pad * 2 + titleH + descLines * lineH + lineH + 8;
    const colorN = parseInt(colorHex.replace('#', ''), 16);

    let tx = nearX - tw - 8;
    if (tx < PW + 4) tx = nearX + 8;
    const ty = Math.max(60, Math.min(nearY - th / 2, GH - th - 10));

    const g = this.add.graphics().setDepth(300);
    g.fillStyle(0x0a1e12, 0.95);
    g.fillRoundedRect(tx, ty, tw, th, 6);
    g.lineStyle(1, colorN);
    g.strokeRoundedRect(tx, ty, tw, th, 6);
    this._tipObjs.push(g);

    this._tipObjs.push(
      this.add.text(tx + pad, ty + pad, title,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: colorHex })
        .setOrigin(0, 0).setDepth(301)
    );
    this._tipObjs.push(
      this.add.text(tx + pad, ty + pad + titleH, desc ?? '',
        { fontFamily: 'Arial', fontSize: '12px', color: '#aaccbb',
          wordWrap: { width: tw - pad * 2 } })
        .setOrigin(0, 0).setDepth(301)
    );
    this._tipObjs.push(
      this.add.text(tx + pad, ty + th - pad - 14, costLine,
        { fontFamily: 'Arial', fontSize: '12px', color: '#ffdd88' })
        .setOrigin(0, 0).setDepth(301)
    );
  }

  // ── 씬 전체 그리기 ──────────────────────────────────────────────────────
  _drawScene() {
    this.children.removeAll(true);
    this._tipObjs        = [];
    this._optOverlayObjs = null;
    this._deckPopupObjs  = null;

    // 배경
    const bgKey = this._bgKey ?? `bg_${this.round}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(GW / 2, GH, bgKey).setOrigin(0.5, 1).setDisplaySize(GW, GW).setDepth(-1);
    } else {
      this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0d2b18).setDepth(-1);
    }

    // 플레이어 패널
    this.playerUI = new PlayerUI(this, this.player, { round: this.round, showHandConfig: true });
    this.playerUI.create();

    // 헤더
    const hg = this.add.graphics().setDepth(1);
    hg.fillStyle(0x050e08, 0.88);
    hg.fillRect(PW, 0, FAW, 54);
    hg.lineStyle(1, 0x2a5a38);
    hg.strokeRect(PW, 0, FAW, 54);
    this.add.text(CX, 14, "MARKET",           TS.marketTitle).setOrigin(0.5, 0).setDepth(10);
    this.add.text(CX, 36, `ROUND ${this.round}`, TS.marketSub).setOrigin(0.5, 0).setDepth(10);

    // 옵션 버튼
    if (this.textures.exists("ui_option")) {
      const optImg = this.add.image(IPX - 58, 27, "ui_option")
        .setDisplaySize(90, 44).setDepth(10).setInteractive();
      optImg.on("pointerdown", () => this._showOptions());
      optImg.on("pointerover", () => optImg.setTint(0xaaddff));
      optImg.on("pointerout",  () => optImg.clearTint());
    }

    this._drawRelicSection();
    this._drawItemSection();
    this._drawCardMgmtSection();

    // CONTINUE 버튼
    const btnY = GH - 42;
    const btn  = this.add.rectangle(CX, btnY, 220, 50, 0x1a5533)
      .setDepth(10).setInteractive().setStrokeStyle(2, 0x44dd88);
    this.add.text(CX, btnY, "CONTINUE  ▶", TS.marketContinue).setOrigin(0.5).setDepth(11);
    btn.on("pointerdown", () => this._proceed());
    btn.on("pointerover",  () => btn.setFillStyle(0x2a7744));
    btn.on("pointerout",   () => btn.setFillStyle(0x1a5533));

    // 우측 아이템 패널
    const ig = this.add.graphics().setDepth(1);
    ig.fillStyle(0x080f14, 0.92);
    ig.fillRect(IPX, 0, IPW, GH);
    ig.lineStyle(1, 0x2a4a5a);
    ig.strokeRect(IPX, 0, IPW, GH);

    this.itemUI = new ItemUI(this, this.player, {
      panelX: IPX, panelW: IPW,
      startY: 10,
      draggable: false,
      depth: 10,
      onRelicRemove: (relicId) => {
        this.player.applyRelicOnRemove(relicId);
        this.player.relics = this.player.relics.filter(id => id !== relicId);
        this._drawScene();
      },
    });
    this.itemUI.create();
  }

  // ── 유물 섹션 ────────────────────────────────────────────────────────────
  _drawRelicSection() {
    const totalW   = this._shopRelics.length * RELIC_W + (this._shopRelics.length - 1) * RELIC_GAP;
    const gridLeft = PW + (FAW - totalW) / 2;
    const secH     = RELIC_CARD_TOP + RELIC_H - RELIC_SECTION_TOP + 10;

    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x050d08, 0.72);
    secG.fillRoundedRect(PW + 8, RELIC_SECTION_TOP, FAW - 16, secH, 6);
    secG.lineStyle(1, 0x1a3a24);
    secG.strokeRoundedRect(PW + 8, RELIC_SECTION_TOP, FAW - 16, secH, 6);
    this.add.text(CX, RELIC_SECTION_TOP + 8, "RELICS",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#44cc88' })
      .setOrigin(0.5, 0).setDepth(10);

    this._shopRelics.forEach((relic, i) => {
      const cx = gridLeft + i * (RELIC_W + RELIC_GAP) + RELIC_W / 2;
      const cy = RELIC_CARD_TOP + RELIC_H / 2;
      this._drawRelicCard(cx, cy, relic, i);
    });
  }

  _drawRelicCard(cx, cy, relic, idx) {
    const W = RELIC_W, H = RELIC_H;
    const rar    = RARITY_COLORS[relic.rarity] ?? RARITY_COLORS.common;
    const canBuy = !relic.bought && this.player.gold >= relic.price
                   && this.player.relics.length < 6;
    const alpha  = relic.bought ? 0.4 : 1;
    const top    = cy - H / 2;

    // 카드 배경
    const bg = this.add.graphics().setDepth(5);
    bg.fillStyle(relic.bought ? 0x1a1a1a : rar.bg, alpha);
    bg.fillRoundedRect(cx - W / 2, top, W, H, 6);
    bg.lineStyle(2, relic.bought ? 0x444444 : rar.border);
    bg.strokeRoundedRect(cx - W / 2, top, W, H, 6);

    // 레어도 레이블
    this.add.text(cx, top + 13, relic.rarity.toUpperCase(),
      { fontFamily: "'PressStart2P',Arial", fontSize: '8px',
        color: relic.bought ? '#555555' : rar.label })
      .setOrigin(0.5, 0).setDepth(6).setAlpha(alpha);

    // 이미지
    const imgKey = `relic_${relic.id}`;
    const imgY   = top + 28 + 36;  // label area + half image
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(66, 66).setDepth(6).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, imgY, 66, 66, rar.border, 0.2).setDepth(6).setAlpha(alpha);
      this.add.text(cx, imgY, '?',
        { fontFamily: 'Arial', fontSize: '24px', color: rar.label })
        .setOrigin(0.5).setDepth(7).setAlpha(alpha);
    }

    // 이름
    const nameY = top + 28 + 72 + 8;
    this.add.text(cx, nameY, relic.name,
      { fontFamily: "'PressStart2P',Arial", fontSize: '9px',
        color: relic.bought ? '#555555' : '#ffffff',
        wordWrap: { width: W - 14 }, align: 'center' })
      .setOrigin(0.5, 0).setDepth(6).setAlpha(alpha);

    // 가격
    const priceY = cy + H / 2 - 16;
    if (relic.bought) {
      this.add.text(cx, priceY, "SOLD",
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#555555' })
        .setOrigin(0.5).setDepth(6);
    } else {
      const costColor = this.player.gold >= relic.price ? '#ffdd44' : '#aa6644';
      this.add.text(cx, priceY, `${relic.price}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: costColor })
        .setOrigin(0.5).setDepth(6).setAlpha(alpha);
    }

    // 히트 영역
    const hit = this.add.rectangle(cx, cy, W, H, 0xffffff, 0).setDepth(8).setInteractive();
    hit.on('pointerover', () => {
      if (!relic.bought) hit.setFillStyle(0xffffff, 0.07);
      const costLine = relic.bought ? '구매 완료'
        : (canBuy ? `${relic.price}G — 클릭하여 구매` : `${relic.price}G — 골드 부족`);
      this._showTip(cx - W / 2, cy, relic.name, relic.description ?? '', costLine, rar.label);
    });
    hit.on('pointerout', () => {
      hit.setFillStyle(0xffffff, 0);
      this._clearTip();
    });
    if (canBuy) {
      hit.on('pointerdown', () => { this._clearTip(); this._buyRelic(idx); });
    }
  }

  _buyRelic(idx) {
    const relic = this._shopRelics[idx];
    if (relic.bought || this.player.gold < relic.price || this.player.relics.length >= 6) return;
    this.player.gold -= relic.price;
    relic.bought = true;
    this.player.tryAddRelic(relic.id);
    this._drawScene();
  }

  // ── 아이템 섹션 ──────────────────────────────────────────────────────────
  _drawItemSection() {
    const rows     = Math.ceil(this._shopItems.length / ITEM_COLS);
    const secH     = rows * ITEM_H + (rows - 1) * ITEM_GAP_Y + (ITEM_CARD_TOP - ITEM_SECTION_TOP) + 10;
    const totalW   = ITEM_COLS * ITEM_W + (ITEM_COLS - 1) * ITEM_GAP_X;
    const gridLeft = PW + (FAW - totalW) / 2;

    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x050d08, 0.72);
    secG.fillRoundedRect(PW + 8, ITEM_SECTION_TOP, FAW - 16, secH, 6);
    secG.lineStyle(1, 0x1a3a24);
    secG.strokeRoundedRect(PW + 8, ITEM_SECTION_TOP, FAW - 16, secH, 6);
    this.add.text(CX, ITEM_SECTION_TOP + 6, "ITEMS",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#44cc88' })
      .setOrigin(0.5, 0).setDepth(10);

    this._shopItems.forEach((item, i) => {
      const col = i % ITEM_COLS;
      const row = Math.floor(i / ITEM_COLS);
      const cx  = gridLeft + col * (ITEM_W + ITEM_GAP_X) + ITEM_W / 2;
      const cy  = ITEM_CARD_TOP + row * (ITEM_H + ITEM_GAP_Y) + ITEM_H / 2;
      this._drawItemCard(cx, cy, item, i);
    });
  }

  _drawItemCard(cx, cy, item, idx) {
    const W = ITEM_W, H = ITEM_H;
    const rar    = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.common;
    const canBuy = !item.bought && this.player.gold >= item.cost
                   && this.player.items.length < 6;
    const alpha  = item.bought ? 0.4 : 1;
    const IMG_SZ = 44;

    this.add.rectangle(cx, cy, W, H, item.bought ? 0x1a1a1a : rar.bg)
      .setStrokeStyle(2, item.bought ? 0x444444 : rar.border)
      .setDepth(5).setAlpha(alpha);

    const imgKey = `item_${item.id}`;
    const imgY   = cy - H / 2 + IMG_SZ / 2 + 7;
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(IMG_SZ, IMG_SZ).setDepth(6).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, imgY, IMG_SZ, IMG_SZ, rar.border, 0.2).setDepth(6).setAlpha(alpha);
      this.add.text(cx, imgY, '?',
        { fontFamily: 'Arial', fontSize: '16px', color: rar.label })
        .setOrigin(0.5).setDepth(7).setAlpha(alpha);
    }

    const priceY = cy + H / 2 - 13;
    if (item.bought) {
      this.add.text(cx, priceY, "SOLD", TS.itemBought).setOrigin(0.5).setDepth(6);
    } else {
      const costColor = this.player.gold >= item.cost ? '#ffdd44' : '#aa6644';
      this.add.text(cx, priceY, `${item.cost}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: costColor })
        .setOrigin(0.5).setDepth(6).setAlpha(alpha);
    }

    const hit = this.add.rectangle(cx, cy, W, H, 0xffffff, 0).setDepth(8).setInteractive();
    hit.on('pointerover', () => {
      if (!item.bought) hit.setFillStyle(0xffffff, 0.08);
      const costLine = item.bought ? '구매 완료'
        : (canBuy ? `${item.cost}G — 클릭하여 구매` : `${item.cost}G — 골드 부족`);
      this._showTip(cx - W / 2, cy, item.name, item.desc ?? '', costLine, rar.label);
    });
    hit.on('pointerout', () => {
      hit.setFillStyle(0xffffff, 0);
      this._clearTip();
    });
    if (canBuy) {
      hit.on('pointerdown', () => { this._clearTip(); this._buyItem(idx); });
    }
  }

  _buyItem(idx) {
    const item = this._shopItems[idx];
    if (item.bought || this.player.gold < item.cost || this.player.items.length >= 6) return;
    this.player.gold -= item.cost;
    item.bought = true;
    const uid = `${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.player.items.push({
      uid, id: item.id, name: item.name,
      desc: item.desc, rarity: item.rarity, img: item.img ?? null,
    });
    this._drawScene();
  }

  // ── 카드 관리 섹션 ────────────────────────────────────────────────────────
  _drawCardMgmtSection() {
    const secG = this.add.graphics().setDepth(2);
    secG.fillStyle(0x050d08, 0.72);
    secG.fillRoundedRect(PW + 8, CARD_MGMT_TOP, FAW - 16, CARD_MGMT_H, 6);
    secG.lineStyle(1, 0x1a3a24);
    secG.strokeRoundedRect(PW + 8, CARD_MGMT_TOP, FAW - 16, CARD_MGMT_H, 6);

    const btnY  = CARD_MGMT_TOP + CARD_MGMT_H / 2;
    const BTN_W = 188, BTN_H = 42;

    // 카드관리
    const mgmtX = CX - BTN_W / 2 - 12;
    const mgmt  = this.add.rectangle(mgmtX, btnY, BTN_W, BTN_H, 0x1a3a5a)
      .setDepth(10).setInteractive().setStrokeStyle(2, 0x4a8aaa);
    this.add.text(mgmtX, btnY, "카드관리",
      { fontFamily: "'PressStart2P',Arial", fontSize: '12px', color: '#88ccff' })
      .setOrigin(0.5).setDepth(11);
    mgmt.on("pointerdown", () => this._showDeckPopup());
    mgmt.on("pointerover",  () => mgmt.setFillStyle(0x2a5a7a));
    mgmt.on("pointerout",   () => mgmt.setFillStyle(0x1a3a5a));

    // 카드추가
    const opsLeft = CARD_OP_MAX - this._deckOpsUsed;
    const canAdd  = this.player.gold >= CARD_OP_COST && opsLeft > 0;
    const addX    = CX + BTN_W / 2 + 12;
    const addFill = canAdd ? 0x1a4a2a : 0x202020;
    const addBrd  = canAdd ? 0x4a9a5a : 0x444444;
    const addBtn  = this.add.rectangle(addX, btnY, BTN_W, BTN_H, addFill)
      .setDepth(10).setInteractive().setStrokeStyle(2, addBrd);
    this.add.text(addX, btnY, `카드추가  (${CARD_OP_COST}G)`,
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px',
        color: canAdd ? '#aaffaa' : '#555555' })
      .setOrigin(0.5).setDepth(11);
    if (canAdd) {
      addBtn.on("pointerdown", () => this._addCard());
      addBtn.on("pointerover",  () => addBtn.setFillStyle(0x2a6a3a));
      addBtn.on("pointerout",   () => addBtn.setFillStyle(0x1a4a2a));
    }
  }

  _addCard() {
    if (this.player.gold < CARD_OP_COST || this._deckOpsUsed >= CARD_OP_MAX) return;
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    this._deck.createCard(suit, rank, [{ type: 'add', value: 20 }], 'permanent', 'market', 'dummy');
    this.player.gold -= CARD_OP_COST;
    this._deckOpsUsed++;
    this._drawScene();
  }

  // ── 덱 팝업 ────────────────────────────────────────────────────────────────
  _showDeckPopup() {
    if (this._deckPopupObjs) return;
    const objs = this._deckPopupObjs = [];

    const pw = 580, ph = 590;
    const px = GW / 2, py = GH / 2 + 10;
    const pl = px - pw / 2, pt = py - ph / 2;

    // 딤
    const dim = this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.72)
      .setDepth(500).setInteractive();
    objs.push(dim);

    // 패널 배경
    const panG = this.add.graphics().setDepth(501);
    panG.fillStyle(0x0a1e12);
    panG.fillRoundedRect(pl, pt, pw, ph, 12);
    panG.lineStyle(2, 0x2d7a3a);
    panG.strokeRoundedRect(pl, pt, pw, ph, 12);
    objs.push(panG);

    // 제목
    objs.push(this.add.text(px, pt + 18, "카드 관리",
      { fontFamily: "'PressStart2P',Arial", fontSize: '14px', color: '#44ffaa' })
      .setOrigin(0.5, 0).setDepth(502));

    // 닫기 버튼
    const closeBtn = this.add.rectangle(pl + pw - 22, pt + 22, 32, 32, 0x3a1010)
      .setDepth(502).setInteractive().setStrokeStyle(1, 0xaa3333);
    const closeTxt = this.add.text(pl + pw - 22, pt + 22, "✕",
      { fontFamily: 'Arial', fontSize: '16px', color: '#ff8888' }).setOrigin(0.5).setDepth(503);
    closeBtn.on("pointerdown", () => this._closeDeckPopup());
    closeBtn.on("pointerover",  () => closeBtn.setFillStyle(0x6a2020));
    closeBtn.on("pointerout",   () => closeBtn.setFillStyle(0x3a1010));
    objs.push(closeBtn, closeTxt);

    // 카드 그리드
    const cards  = this._deck.cards.filter(c => c.duration === 'permanent');
    const MINI_W = 44, MINI_H = 60, MINI_GAP = 5;
    const COLS   = 10;
    const gridW  = COLS * MINI_W + (COLS - 1) * MINI_GAP;
    const gLeft  = pl + (pw - gridW) / 2;
    const gTop   = pt + 52;

    cards.forEach((card, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx  = gLeft + col * (MINI_W + MINI_GAP) + MINI_W / 2;
      const cy  = gTop  + row * (MINI_H + MINI_GAP) + MINI_H / 2;

      const isRed      = card.suit === 'H' || card.suit === 'D';
      const isSelected = this._deckSelectedCard?.uid === card.uid;
      const hasEnh     = (card.enhancements?.length ?? 0) > 0;
      const bgFill     = isRed ? 0x2a0808 : 0x08102a;
      const bord       = isSelected ? 0xffdd44 : (isRed ? 0x884444 : 0x446688);

      const bg = this.add.rectangle(cx, cy, MINI_W, MINI_H, bgFill)
        .setStrokeStyle(isSelected ? 3 : 1, bord).setDepth(504);
      objs.push(bg);

      if (hasEnh) {
        objs.push(this.add.circle(cx + MINI_W / 2 - 5, cy - MINI_H / 2 + 5, 4, 0xffdd44)
          .setDepth(505));
      }

      objs.push(
        this.add.text(cx, cy - 10, card.rank,
          { fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold',
            color: isRed ? '#ff9999' : '#cccccc' })
          .setOrigin(0.5).setDepth(505),
        this.add.text(cx, cy + 10, SUIT_CHARS[card.suit],
          { fontFamily: 'Arial', fontSize: '14px',
            color: isRed ? '#ff9999' : '#cccccc' })
          .setOrigin(0.5).setDepth(505)
      );

      const hit = this.add.rectangle(cx, cy, MINI_W, MINI_H, 0xffffff, 0)
        .setDepth(506).setInteractive();
      hit.on('pointerdown', () => {
        this._deckSelectedCard = (this._deckSelectedCard?.uid === card.uid) ? null : card;
        this._closeDeckPopup();
        this._showDeckPopup();
      });
      hit.on('pointerover', () => bg.setFillStyle(isRed ? 0x4a1818 : 0x18204a));
      hit.on('pointerout',  () => bg.setFillStyle(bgFill));
      objs.push(hit);
    });

    // ── 하단 액션 영역 ──────────────────────────────────────────────────────
    const actionTop = pt + ph - 128;
    const opsLeft   = CARD_OP_MAX - this._deckOpsUsed;
    const selCard   = this._deckSelectedCard;

    // 구분선
    const divG = this.add.graphics().setDepth(502);
    divG.lineStyle(1, 0x2a5a3a, 0.7);
    divG.lineBetween(pl + 20, actionTop, pl + pw - 20, actionTop);
    objs.push(divG);

    // 선택 카드 정보
    if (selCard) {
      const isRed    = selCard.suit === 'H' || selCard.suit === 'D';
      const enhBonus = (selCard.enhancements ?? [])
        .reduce((s, e) => s + (e.type === 'add' ? e.value : 0), 0);
      const dispScore = selCard.baseScore + enhBonus;
      const enhLabel  = enhBonus > 0 ? ` (+${enhBonus})` : '';
      objs.push(this.add.text(px, actionTop + 14,
        `선택: ${selCard.rank}${SUIT_CHARS[selCard.suit]}  기본점수: ${dispScore}${enhLabel}`,
        { fontFamily: 'Arial', fontSize: '14px', color: isRed ? '#ff9999' : '#aaccff' })
        .setOrigin(0.5, 0).setDepth(502));
    } else {
      objs.push(this.add.text(px, actionTop + 14, "카드를 선택하세요",
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: '#446655' })
        .setOrigin(0.5, 0).setDepth(502));
    }

    // 강화 버튼
    const canEnhance = !!selCard && this.player.gold >= CARD_OP_COST && opsLeft > 0;
    const enhX = px - 90;
    const btnY = actionTop + 64;
    const enhBtn = this.add.rectangle(enhX, btnY, 162, 42,
      canEnhance ? 0x1a3a5a : 0x1a1a1a)
      .setDepth(502).setStrokeStyle(2, canEnhance ? 0x4488cc : 0x333333).setInteractive();
    objs.push(enhBtn,
      this.add.text(enhX, btnY, `강화  (+20점)`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px',
          color: canEnhance ? '#88ccff' : '#444444' })
        .setOrigin(0.5).setDepth(503));
    if (canEnhance) {
      enhBtn.on('pointerdown', () => this._deckEnhance());
      enhBtn.on('pointerover',  () => enhBtn.setFillStyle(0x2a5a8a));
      enhBtn.on('pointerout',   () => enhBtn.setFillStyle(0x1a3a5a));
    }

    // 제거 버튼
    const canRemove = !!selCard && this.player.gold >= CARD_OP_COST && opsLeft > 0;
    const remX = px + 90;
    const remBtn = this.add.rectangle(remX, btnY, 162, 42,
      canRemove ? 0x3a1a1a : 0x1a1a1a)
      .setDepth(502).setStrokeStyle(2, canRemove ? 0xaa3333 : 0x333333).setInteractive();
    objs.push(remBtn,
      this.add.text(remX, btnY, "제거",
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px',
          color: canRemove ? '#ffaaaa' : '#444444' })
        .setOrigin(0.5).setDepth(503));
    if (canRemove) {
      remBtn.on('pointerdown', () => this._deckRemove());
      remBtn.on('pointerover',  () => remBtn.setFillStyle(0x5a2a2a));
      remBtn.on('pointerout',   () => remBtn.setFillStyle(0x3a1a1a));
    }

    // 비용 / 사용 횟수 (오른쪽 하단)
    objs.push(this.add.text(pl + pw - 14, pt + ph - 12,
      `비용: ${CARD_OP_COST}G  사용: ${this._deckOpsUsed} / ${CARD_OP_MAX}`,
      { fontFamily: 'Arial', fontSize: '13px', color: '#88aa77' })
      .setOrigin(1, 1).setDepth(502));

    // 현재 골드 (왼쪽 하단)
    const goldColor = this.player.gold >= CARD_OP_COST ? '#ffdd44' : '#aa6644';
    objs.push(this.add.text(pl + 14, pt + ph - 12,
      `골드: ${this.player.gold}G`,
      { fontFamily: 'Arial', fontSize: '13px', color: goldColor })
      .setOrigin(0, 1).setDepth(502));
  }

  _closeDeckPopup() {
    if (!this._deckPopupObjs) return;
    this._deckPopupObjs.forEach(o => { try { o?.destroy(); } catch (_) {} });
    this._deckPopupObjs = null;
  }

  _deckEnhance() {
    const card = this._deckSelectedCard;
    if (!card || this.player.gold < CARD_OP_COST || this._deckOpsUsed >= CARD_OP_MAX) return;
    card.enhancements = card.enhancements ?? [];
    card.enhancements.push({ type: 'add', value: 20 });
    this.player.gold -= CARD_OP_COST;
    this._deckOpsUsed++;
    this._deckSelectedCard = null;
    this._closeDeckPopup();
    this._drawScene();
    this._showDeckPopup();
  }

  _deckRemove() {
    const card = this._deckSelectedCard;
    if (!card || this.player.gold < CARD_OP_COST || this._deckOpsUsed >= CARD_OP_MAX) return;
    const rm = (arr) => arr.filter(c => c.uid !== card.uid);
    this._deck.cards     = rm(this._deck.cards);
    this._deck.deckPile  = rm(this._deck.deckPile);
    this._deck.hand      = rm(this._deck.hand);
    this._deck.field     = rm(this._deck.field);
    this._deck.dummyPile = rm(this._deck.dummyPile);
    this.player.gold    -= CARD_OP_COST;
    this._deckOpsUsed++;
    this._deckSelectedCard = null;
    this._closeDeckPopup();
    this._drawScene();
    this._showDeckPopup();
  }

  // ── 옵션 오버레이 ─────────────────────────────────────────────────────────
  _showOptions() {
    if (this._optOverlayObjs) return;
    const objs = this._optOverlayObjs = [];
    const cx = GW / 2, cy = GH / 2;
    const pw = 400, ph = 320;

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

    let bgm = this.registry.get("bgmVolume") ?? 7;
    const bgmY = cy - 60;
    objs.push(this.add.text(cx, bgmY - 28, "BGM", TS.optLabel).setOrigin(0.5).setDepth(602));
    const bgmMinus = this.add.rectangle(cx - 80, bgmY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(bgmMinus, this.add.text(cx - 80, bgmY, "-", TS.optBtn).setOrigin(0.5).setDepth(603));
    const bgmTxt = this.add.text(cx, bgmY, String(bgm), TS.optValue).setOrigin(0.5).setDepth(602);
    objs.push(bgmTxt);
    const bgmPlus = this.add.rectangle(cx + 80, bgmY, 44, 44, 0x335544).setDepth(602).setInteractive();
    objs.push(bgmPlus, this.add.text(cx + 80, bgmY, "+", TS.optBtn).setOrigin(0.5).setDepth(603));
    const bgmBarBg = this.add.rectangle(cx, bgmY + 28, 204, 7, 0x224433).setDepth(602);
    const bgmBar   = this.add.rectangle(cx - 102, bgmY + 28, bgm * 20.4, 7, 0x44dd88).setOrigin(0, 0.5).setDepth(603);
    objs.push(bgmBarBg, bgmBar);
    const updateBgm = (v) => {
      bgm = Phaser.Math.Clamp(v, 0, 10);
      this.registry.set("bgmVolume", bgm);
      bgmTxt.setText(String(bgm));
      bgmBar.setDisplaySize(Math.max(1, bgm * 20.4), 7);
      saveOptionsByRegistry(this.registry);
    };
    bgmMinus.on("pointerdown", () => updateBgm(bgm - 1));
    bgmPlus.on("pointerdown",  () => updateBgm(bgm + 1));
    bgmMinus.on("pointerover", () => bgmMinus.setFillStyle(0x447766));
    bgmMinus.on("pointerout",  () => bgmMinus.setFillStyle(0x335544));
    bgmPlus.on("pointerover",  () => bgmPlus.setFillStyle(0x447766));
    bgmPlus.on("pointerout",   () => bgmPlus.setFillStyle(0x335544));

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
    const sfxBar   = this.add.rectangle(cx - 102, sfxY + 28, sfx * 20.4, 7, 0x44dd88).setOrigin(0, 0.5).setDepth(603);
    objs.push(sfxBarBg, sfxBar);
    const updateSfx = (v) => {
      sfx = Phaser.Math.Clamp(v, 0, 10);
      this.registry.set("sfxVolume", sfx);
      sfxTxt.setText(String(sfx));
      sfxBar.setDisplaySize(Math.max(1, sfx * 20.4), 7);
      saveOptionsByRegistry(this.registry);
    };
    sfxMinus.on("pointerdown", () => updateSfx(sfx - 1));
    sfxPlus.on("pointerdown",  () => updateSfx(sfx + 1));
    sfxMinus.on("pointerover", () => sfxMinus.setFillStyle(0x447766));
    sfxMinus.on("pointerout",  () => sfxMinus.setFillStyle(0x335544));
    sfxPlus.on("pointerover",  () => sfxPlus.setFillStyle(0x447766));
    sfxPlus.on("pointerout",   () => sfxPlus.setFillStyle(0x335544));

    const exitBtn = this.add.rectangle(cx - 80, cy + ph / 2 - 44, 140, 46, 0x882211)
      .setDepth(602).setInteractive();
    objs.push(exitBtn, this.add.text(cx - 80, cy + ph / 2 - 44, "MAIN MENU", TS.menuBtn).setOrigin(0.5).setDepth(603));
    exitBtn.on("pointerdown", () => this.scene.start("MainMenuScene"));
    exitBtn.on("pointerover", () => exitBtn.setFillStyle(0xaa2222));
    exitBtn.on("pointerout",  () => exitBtn.setFillStyle(0x882211));

    const closeBtn = this.add.rectangle(cx + 80, cy + ph / 2 - 44, 140, 46, 0x335544)
      .setDepth(602).setInteractive();
    objs.push(closeBtn, this.add.text(cx + 80, cy + ph / 2 - 44, "CLOSE", TS.menuBtn).setOrigin(0.5).setDepth(603));
    closeBtn.on("pointerdown", () => this._closeOptions());
    closeBtn.on("pointerover", () => closeBtn.setFillStyle(0x447766));
    closeBtn.on("pointerout",  () => closeBtn.setFillStyle(0x335544));
  }

  _closeOptions() {
    if (!this._optOverlayObjs) return;
    this._optOverlayObjs.forEach(o => o.destroy());
    this._optOverlayObjs = null;
  }

  _proceed() {
    this.scene.start('GameScene', {
      round:       this.round,
      player:      this.player.toData(),
      deck:        this._deck.getState(),
      phase:       'battle',
      battleIndex: 0,
    });
  }
}
