import Phaser from "phaser";
import { GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W } from "../constants.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import itemData from '../data/item.json';
import relicData from '../data/relic.json';
import roundData from '../data/round.json';
import { PlayerUI } from '../ui/PlayerUI.js';
import { ItemUI } from '../ui/ItemUI.js';
import { loadOptions, saveOptionsByRegistry } from "../manager/optionManager.js";

const RARITY_COLORS = {
  common: { bg: 0x1a3a22, border: 0x4a9a5a, label: '#aaffaa' },
  rare:   { bg: 0x1a2a4a, border: 0x4a6aaa, label: '#aaaaff' },
  epic:   { bg: 0x2a1a3a, border: 0x8a4aaa, label: '#cc88ff' },
};

// 아이템 카드 크기
const CARD_SZ  = 84;   // 카드 폭 = 높이 (정사각형 base)
const CARD_H   = 104;  // 이미지(68) + 가격 영역(36)
const CARD_IMG = 60;
const CARD_COLS = 5;
const CARD_GAPX = 14;
const CARD_GAPY = 14;

export class MarketScene extends Phaser.Scene {
  constructor() { super("MarketScene"); }

  preload() {
    this.load.setBaseURL(import.meta.env.BASE_URL);
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

    this.shopItems = itemData.items.map(item => ({ ...item, bought: false }));
    this._tipObjs  = [];

    this._drawScene();
  }

  // ── 툴팁 ────────────────────────────────────────────────────────────────
  _clearTip() {
    this._tipObjs.forEach(o => { try { o?.destroy(); } catch(_) {} });
    this._tipObjs = [];
  }

  _showTip(nearX, nearY, title, desc, costLine, colorHex) {
    this._clearTip();
    const tw = 180, pad = 10, titleH = 18, lineH = 16;
    const lines = Math.max(1, Math.ceil(desc.length / 14)) + 1; // +1 for cost
    const th = pad * 2 + titleH + lines * lineH + 20;
    const colorN = parseInt(colorHex.replace('#',''), 16);

    // 위치: 카드 왼쪽 우선, 화면 밖이면 오른쪽
    let tx = nearX - tw - 8;
    if (tx < PLAYER_PANEL_W + 4) tx = nearX + CARD_SZ / 2 + 8;
    const ty = Math.max(60, Math.min(nearY - th / 2, GH - th - 10));

    const g = this.add.graphics().setDepth(200);
    g.fillStyle(0x0a1e12, 0.95);
    g.fillRoundedRect(tx, ty, tw, th, 6);
    g.lineStyle(1, colorN);
    g.strokeRoundedRect(tx, ty, tw, th, 6);
    this._tipObjs.push(g);

    this._tipObjs.push(
      this.add.text(tx + pad, ty + pad, title,
        { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: colorHex })
        .setOrigin(0, 0).setDepth(201)
    );
    this._tipObjs.push(
      this.add.text(tx + pad, ty + pad + titleH, desc,
        { fontFamily: 'Arial', fontSize: '13px', color: '#aaccbb',
          wordWrap: { width: tw - pad * 2 } })
        .setOrigin(0, 0).setDepth(201)
    );
    this._tipObjs.push(
      this.add.text(tx + pad, ty + th - pad - 14, costLine,
        { fontFamily: 'Arial', fontSize: '13px', color: '#ffdd88' })
        .setOrigin(0, 0).setDepth(201)
    );
  }

  // ── 씬 그리기 ──────────────────────────────────────────────────────────
  _drawScene() {
    this.children.removeAll(true);
    this._tipObjs = [];
    this._optOverlayObjs = null;

    const bgKey = this._bgKey ?? `bg_${this.round}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(GW / 2, GH, bgKey).setOrigin(0.5, 1).setDisplaySize(GW, GW).setDepth(-1);
    } else {
      this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0d2b18).setDepth(-1);
    }

    // ── 플레이어 패널 ───────────────────────────────────────────────────
    this.playerUI = new PlayerUI(this, this.player, {
      round: this.round,
      showHandConfig: true,
    });
    this.playerUI.create();

    const PW  = PLAYER_PANEL_W;
    const IPW = ITEM_PANEL_W;
    const IPX = GW - IPW;
    const FAW = GW - PW - IPW;
    const CX  = PW + FAW / 2;

    // ── 헤더 ──────────────────────────────────────────────────────────
    const cg = this.add.graphics().setDepth(1);
    cg.fillStyle(0x050e08, 0.88);
    cg.fillRect(PW, 0, FAW, 54);
    cg.lineStyle(1, 0x2a5a38);
    cg.strokeRect(PW, 0, FAW, 54);

    this.add.text(CX, 14, "MARKET", TS.marketTitle).setOrigin(0.5, 0).setDepth(10);
    this.add.text(CX, 36, `ROUND ${this.round}`, TS.marketSub).setOrigin(0.5, 0).setDepth(10);

    // ── 옵션 버튼 ─────────────────────────────────────────────────────
    if (this.textures.exists("ui_option")) {
      const optImg = this.add.image(IPX - 58, 27, "ui_option")
        .setDisplaySize(90, 44).setDepth(10).setInteractive();
      optImg.on("pointerdown", () => this._showOptions());
      optImg.on("pointerover", () => optImg.setTint(0xaaddff));
      optImg.on("pointerout",  () => optImg.clearTint());
    }

    // ── 아이템 그리드 ─────────────────────────────────────────────────
    const gridW    = CARD_COLS * CARD_SZ + (CARD_COLS - 1) * CARD_GAPX;
    const gridLeft = PW + (FAW - gridW) / 2;
    const gridTop  = 68;

    this.shopItems.forEach((item, i) => {
      const col = i % CARD_COLS;
      const row = Math.floor(i / CARD_COLS);
      const cx  = gridLeft + col * (CARD_SZ + CARD_GAPX) + CARD_SZ / 2;
      const cy  = gridTop  + row * (CARD_H  + CARD_GAPY) + CARD_H  / 2;
      this._drawItemCard(cx, cy, item, i);
    });

    // ── CONTINUE 버튼 ─────────────────────────────────────────────────
    const btnY = GH - 46;
    const btn  = this.add.rectangle(CX, btnY, 220, 52, 0x1a5533)
      .setDepth(10).setInteractive().setStrokeStyle(2, 0x44dd88);
    this.add.text(CX, btnY, "CONTINUE  ▶", TS.marketContinue).setOrigin(0.5).setDepth(11);
    btn.on("pointerdown", () => this._proceed());
    btn.on("pointerover", () => btn.setFillStyle(0x2a7744));
    btn.on("pointerout",  () => btn.setFillStyle(0x1a5533));

    // ── 우측 아이템 패널 ───────────────────────────────────────────────
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
        this.player.relics = this.player.relics.filter(id => id !== relicId);
        this._drawScene();
      },
    });
    this.itemUI.create();
  }

  // ── 아이템 카드 (compact: 이미지 + 가격) ─────────────────────────────
  _drawItemCard(cx, cy, item, idx) {
    const rar    = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.common;
    const canBuy = !item.bought && this.player.gold >= item.cost
                   && this.player.items.length < 6;
    const alpha  = item.bought ? 0.4 : 1;

    // 배경
    this.add.rectangle(cx, cy, CARD_SZ, CARD_H, item.bought ? 0x1a1a1a : rar.bg)
      .setStrokeStyle(2, item.bought ? 0x444444 : rar.border)
      .setDepth(5).setAlpha(alpha);

    // 이미지
    const imgKey = `item_${item.id}`;
    const imgY   = cy - CARD_H / 2 + CARD_IMG / 2 + 6;
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(CARD_IMG, CARD_IMG).setDepth(6).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, imgY, CARD_IMG, CARD_IMG, rar.border, 0.2)
        .setDepth(6).setAlpha(alpha);
      this.add.text(cx, imgY, '?',
        { fontFamily: 'Arial', fontSize: '20px', color: rar.label })
        .setOrigin(0.5).setDepth(7).setAlpha(alpha);
    }

    // 가격 / 구매완료 표시
    const priceY = cy + CARD_H / 2 - 18;
    if (item.bought) {
      this.add.text(cx, priceY, "SOLD", TS.itemBought).setOrigin(0.5).setDepth(6);
    } else {
      const costColor = this.player.gold >= item.cost ? '#ffdd44' : '#aa6644';
      this.add.text(cx, priceY, `${item.cost}G`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: costColor })
        .setOrigin(0.5).setDepth(6).setAlpha(alpha);
    }

    // hit area (hover + click)
    const hit = this.add.rectangle(cx, cy, CARD_SZ, CARD_H, 0xffffff, 0)
      .setDepth(8).setInteractive();

    hit.on('pointerover', () => {
      if (!item.bought) hit.setFillStyle(0xffffff, 0.08);
      const costLine = item.bought
        ? '구매 완료'
        : (canBuy ? `${item.cost}G — 클릭하여 구매` : `${item.cost}G — 골드 부족`);
      this._showTip(cx - CARD_SZ / 2, cy, item.name, item.desc ?? '', costLine, rar.label);
    });
    hit.on('pointerout', () => {
      hit.setFillStyle(0xffffff, 0);
      this._clearTip();
    });
    if (canBuy) {
      hit.on('pointerdown', () => {
        this._clearTip();
        this._buyItem(idx);
      });
    }
  }

  _buyItem(idx) {
    const item = this.shopItems[idx];
    if (item.bought || this.player.gold < item.cost) return;
    if (this.player.items.length >= 6) return;

    this.player.gold -= item.cost;
    item.bought = true;
    const uid = `${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.player.items.push({
      uid, id: item.id, name: item.name,
      desc: item.desc, rarity: item.rarity, img: item.img ?? null,
    });
    this._drawScene();
  }

  // ── 옵션 오버레이 (BattleScene과 동일 구조) ───────────────────────────
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
    panelG.fillRoundedRect(cx - pw/2, cy - ph/2, pw, ph, 16);
    panelG.lineStyle(2, 0x2d7a3a);
    panelG.strokeRoundedRect(cx - pw/2, cy - ph/2, pw, ph, 16);
    objs.push(panelG);

    objs.push(this.add.text(cx, cy - ph/2 + 44, "OPTIONS", TS.optTitle).setOrigin(0.5).setDepth(602));

    // BGM
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

    // SFX
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

    // MAIN MENU 버튼
    const exitBtn = this.add.rectangle(cx - 80, cy + ph/2 - 44, 140, 46, 0x882211)
      .setDepth(602).setInteractive();
    objs.push(exitBtn, this.add.text(cx - 80, cy + ph/2 - 44, "MAIN MENU", TS.menuBtn).setOrigin(0.5).setDepth(603));
    exitBtn.on("pointerdown", () => this.scene.start("MainMenuScene"));
    exitBtn.on("pointerover", () => exitBtn.setFillStyle(0xaa2222));
    exitBtn.on("pointerout",  () => exitBtn.setFillStyle(0x882211));

    // CLOSE 버튼
    const closeBtn = this.add.rectangle(cx + 80, cy + ph/2 - 44, 140, 46, 0x335544)
      .setDepth(602).setInteractive();
    objs.push(closeBtn, this.add.text(cx + 80, cy + ph/2 - 44, "CLOSE", TS.menuBtn).setOrigin(0.5).setDepth(603));
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
      deck:        this._deckData,
      phase:       'battle',
      battleIndex: 0,
    });
  }
}
