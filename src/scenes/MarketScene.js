import Phaser from "phaser";
import { GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W, FIELD_CW, FIELD_CH } from "../constants.js";
import { TS } from "../textStyles.js";
import { Player, getRequiredExp } from "../manager/playerManager.js";
import itemData from '../data/item.json';

const RARITY_COLORS = {
  common: { bg: 0x1a3a22, border: 0x4a9a5a, label: '#aaffaa' },
  rare:   { bg: 0x1a2a4a, border: 0x4a6aaa, label: '#aaaaff' },
  epic:   { bg: 0x2a1a3a, border: 0x8a4aaa, label: '#cc88ff' },
};

export class MarketScene extends Phaser.Scene {
  constructor() { super("MarketScene"); }

  preload() {
    this.load.image("bg", "/assets/images/bg/old_stone_castle.jpg");
    itemData.items.forEach(item => {
      if (item.img && !this.textures.exists(`item_${item.id}`))
        this.load.image(`item_${item.id}`, `/assets/images/item/${item.img}`);
    });
  }

  create() {
    const data     = this.scene.settings.data || {};
    this.round     = data.round  ?? 1;
    this.player    = new Player(data.player ?? {});
    this._deckData = data.deck ?? null;  // BattleScene으로 그대로 전달

    // 이번 방문에 보여줄 아이템 (전체, 구매 여부 추적)
    this.shopItems = itemData.items.map(item => ({ ...item, bought: false }));

    this._drawScene();
  }

  _drawScene() {
    this.children.removeAll(true);

    // ── 배경 ──────────────────────────────────────────────────────────────
    if (this.textures.exists("bg")) {
      this.add.image(GW / 2, GH, "bg").setOrigin(0.5, 1).setDisplaySize(GW, GW).setDepth(-1);
    } else {
      this.add.rectangle(GW / 2, GH / 2, GW, GH, 0x0d2b18).setDepth(-1);
    }

    // ── 플레이어 패널 (좌측) ──────────────────────────────────────────────
    const PW = PLAYER_PANEL_W;
    const g  = this.add.graphics().setDepth(0);
    g.fillStyle(0x0a1810, 0.92);
    g.fillRect(0, 0, PW - 4, GH);
    g.lineStyle(1, 0x2a5a38);
    g.strokeRect(0, 0, PW - 4, GH);

    const px  = 10;
    const pcx = PW / 2 - 2;
    const p   = this.player;

    this.add.text(pcx, 14, p.job.toUpperCase(),
      { fontFamily: "'PressStart2P', Arial", fontSize: '9px', color: '#ffdd88' })
      .setOrigin(0.5, 0).setDepth(12);

    this._addLabel(px, 36, "ROUND", `${this.round}`);
    this._addLabel(px, 54, "GOLD",  `${p.gold}`, '#ffdd44');
    this._addLabel(px, 72, "LV",    String(p.level));

    // XP 바
    const req    = getRequiredExp(p.level);
    const xpFill = Math.max(1, Math.round((PW - 24) * Math.min(1, p.xp / req)));
    this.add.rectangle(px, 90, PW - 24, 5, 0x224433).setOrigin(0, 0.5).setDepth(12);
    this.add.rectangle(px, 90, xpFill, 5, 0x44ddaa).setOrigin(0, 0.5).setDepth(13);

    this.add.rectangle(pcx, 102, PW - 20, 1, 0x2a5a38).setDepth(12);

    // HP
    this.add.text(px, 110, "HP", TS.infoLabel).setDepth(12);
    this.add.text(px + 22, 110, `${p.hp}/${p.maxHp}`, TS.playerHp).setDepth(12);
    const barW   = PW - 24;
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    this.add.rectangle(px, 128, barW, 7, 0x2a3a2a).setOrigin(0, 0.5).setDepth(12);
    this.add.rectangle(px, 128, Math.max(1, barW * hpRatio), 7,
      hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xddaa00 : 0xdd3333)
      .setOrigin(0, 0.5).setDepth(13);

    this.add.text(px, 138, "DEF", TS.infoLabel).setDepth(12);
    this.add.text(px + 32, 138, `${p.def}`, TS.playerDef).setDepth(12);

    this.add.rectangle(pcx, 162, PW - 20, 1, 0x2a5a38).setDepth(12);

    // 슈트 레벨
    const SUIT_COLORS = { S: '#aaaaff', H: '#ff6666', D: '#ff9966', C: '#aaffaa' };
    const SUIT_SYMS   = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
    ['S','H','D','C'].forEach((suit, i) => {
      const sy = 172 + i * 28;
      this.add.text(px, sy, SUIT_SYMS[suit],
        { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] }).setDepth(12);
      this.add.text(px + 26, sy + 2, `Lv${p.attrs[suit]}`,
        { fontFamily: "'PressStart2P', Arial", fontSize: '11px', color: SUIT_COLORS[suit] }).setDepth(12);
    });

    // ── 샵 영역 (플레이어 패널과 아이템 패널 사이) ─────────────────────────
    const IPW  = ITEM_PANEL_W;
    const IPX  = GW - IPW;
    const FAW  = GW - PW - IPW;         // 샵 영역 폭 = 880
    const CX   = PW + FAW / 2;
    const cg   = this.add.graphics().setDepth(1);

    // 헤더 배경 (샵 영역만)
    cg.fillStyle(0x050e08, 0.88);
    cg.fillRect(PW, 0, FAW, 54);
    cg.lineStyle(1, 0x2a5a38);
    cg.strokeRect(PW, 0, FAW, 54);

    this.add.text(CX, 14, "MARKET", TS.marketTitle).setOrigin(0.5, 0).setDepth(10);
    this.add.text(CX, 36, `ROUND ${this.round} — 전투 전 아이템을 구매하세요`, TS.marketSub)
      .setOrigin(0.5, 0).setDepth(10);

    // ── 아이템 그리드 ─────────────────────────────────────────────────────
    const ITEM_W    = 150, ITEM_H = 165;
    const COLS      = 5;
    const GAP_X     = 12, GAP_Y = 12;
    const GRID_LEFT = PW + 24;
    const GRID_TOP  = 70;

    this.shopItems.forEach((item, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const ix  = GRID_LEFT + col * (ITEM_W + GAP_X) + ITEM_W / 2;
      const iy  = GRID_TOP  + row * (ITEM_H + GAP_Y) + ITEM_H / 2;
      this._drawItemCard(ix, iy, ITEM_W, ITEM_H, item, i);
    });

    // ── CONTINUE 버튼 ─────────────────────────────────────────────────────
    const btnY = GH - 46;
    const btn  = this.add.rectangle(CX, btnY, 220, 52, 0x1a5533)
      .setDepth(10).setInteractive()
      .setStrokeStyle(2, 0x44dd88);
    this.add.text(CX, btnY, "CONTINUE  ▶", TS.marketContinue).setOrigin(0.5).setDepth(11);
    btn.on("pointerdown", () => this._proceed());
    btn.on("pointerover", () => btn.setFillStyle(0x2a7744));
    btn.on("pointerout",  () => btn.setFillStyle(0x1a5533));

    // ── 우측 아이템 패널 (보유 아이템) ────────────────────────────────────
    const ig = this.add.graphics().setDepth(1);
    ig.fillStyle(0x080f14, 0.92);
    ig.fillRect(IPX, 0, IPW, GH);
    ig.lineStyle(1, 0x2a4a5a);
    ig.strokeRect(IPX, 0, IPW, GH);
    ig.lineStyle(1, 0x2a4a5a);
    ig.strokeRect(IPX, 0, IPW, 54);  // 헤더 구분

    const IPCX = IPX + IPW / 2;
    this.add.text(IPCX, 14, "ITEMS", TS.marketTitle)
      .setOrigin(0.5, 0).setDepth(10);
    this.add.text(IPCX, 36, "전투 중 drag to use", TS.marketSub)
      .setOrigin(0.5, 0).setDepth(10);

    this._drawOwnedItems(IPX, IPW);
  }

  _addLabel(x, y, label, value, valueColor = '#aaffcc') {
    this.add.text(x, y, label, TS.infoLabel).setDepth(12);
    this.add.text(PLAYER_PANEL_W - 14, y, value, {
      ...TS.levelValue, color: valueColor,
    }).setOrigin(1, 0).setDepth(12);
  }

  _drawItemCard(cx, cy, w, h, item, idx) {
    const rar    = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.common;
    const canBuy = !item.bought && this.player.gold >= item.cost;
    const alpha  = item.bought ? 0.45 : 1;

    // 카드 배경
    const bg = this.add.rectangle(cx, cy, w, h, rar.bg)
      .setDepth(5).setStrokeStyle(2, item.bought ? 0x444444 : rar.border).setAlpha(alpha);

    // ── 상단: name 띠 (높이 18px) ───────────────────────────────────────
    const nameY = cy - h / 2 + 9;
    this.add.rectangle(cx, nameY, w, 18, rar.border, 0.55).setDepth(6).setAlpha(alpha);
    this.add.text(cx, nameY, item.name,
      { ...TS.itemName, color: rar.label }).setOrigin(0.5).setDepth(7).setAlpha(alpha);

    // ── 중간: 이미지 (60×60) ────────────────────────────────────────────
    const imgKey = `item_${item.id}`;
    const imgY   = cy - h / 2 + 18 + 38;  // name띠 아래 여백 8px + 이미지 반(30)
    if (this.textures.exists(imgKey)) {
      this.add.image(cx, imgY, imgKey)
        .setDisplaySize(64, 64).setDepth(7).setAlpha(alpha);
    } else {
      // 이미지 없으면 rarity 색 사각형 플레이스홀더
      this.add.rectangle(cx, imgY, 64, 64, rar.border, 0.25)
        .setStrokeStyle(1, rar.border).setDepth(7).setAlpha(alpha);
      this.add.text(cx, imgY, '?', { fontFamily: 'Arial', fontSize: '24px', color: rar.label })
        .setOrigin(0.5).setDepth(8).setAlpha(alpha);
    }

    // ── desc ───────────────────────────────────────────────────────────
    const descY = imgY + 38;
    this.add.text(cx, descY, item.desc,
      { ...TS.itemDesc, wordWrap: { width: w - 12 } })
      .setOrigin(0.5, 0).setDepth(7).setAlpha(alpha);

    // ── 하단: 코스트 / BUY 버튼 ─────────────────────────────────────────
    if (item.bought) {
      this.add.text(cx, cy + h / 2 - 12, "구매 완료", TS.itemBought).setOrigin(0.5, 1).setDepth(7);
    } else {
      const costStyle = this.player.gold >= item.cost ? TS.itemCost : TS.itemCostNA;
      this.add.text(cx, cy + h / 2 - 30, `${item.cost}G`, costStyle).setOrigin(0.5).setDepth(7);
      if (canBuy) {
        const buyBtn = this.add.rectangle(cx, cy + h / 2 - 12, w - 16, 20, 0x2a6644)
          .setDepth(7).setInteractive().setStrokeStyle(1, 0x44dd88);
        this.add.text(cx, cy + h / 2 - 12, "BUY", TS.itemBuy).setOrigin(0.5).setDepth(8);
        buyBtn.on("pointerdown", () => this._buyItem(idx));
        buyBtn.on("pointerover", () => buyBtn.setFillStyle(0x3a8855));
        buyBtn.on("pointerout",  () => buyBtn.setFillStyle(0x2a6644));
      }
    }
  }

  _drawOwnedItems(IPX, IPW) {
    const items = this.player.items ?? [];
    const IPCX  = IPX + IPW / 2;

    if (items.length === 0) {
      this.add.text(IPCX, 80, "없음", TS.infoLabel).setOrigin(0.5, 0).setDepth(10);
      return;
    }

    const RARITY_BG  = { common: 0x1a3a22, rare: 0x1a2a4a, epic: 0x2a1a3a };
    const RARITY_BRD = { common: 0x4a9a5a, rare: 0x4a6aaa, epic: 0x8a4aaa };
    const RARITY_LBL = { common: '#aaffaa', rare: '#aaaaff', epic: '#cc88ff' };

    const C_W  = FIELD_CW, C_H = FIELD_CH;
    const GAP  = 8;
    const PAD  = Math.floor((IPW - C_W * 2 - GAP) / 2);
    const startY = 62;

    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx  = IPX + PAD + col * (C_W + GAP) + C_W / 2;
      const cy  = startY + row * (C_H + GAP) + C_H / 2;

      const bg_col  = RARITY_BG[item.rarity]  ?? RARITY_BG.common;
      const brd_col = RARITY_BRD[item.rarity] ?? RARITY_BRD.common;
      const lbl_col = RARITY_LBL[item.rarity] ?? RARITY_LBL.common;

      // 카드 배경 (hover/drag 히트 영역)
      const bg = this.add.rectangle(cx, cy, C_W, C_H, bg_col)
        .setDepth(9).setStrokeStyle(1, brd_col).setInteractive();

      // name 띠
      this.add.rectangle(cx, cy - C_H / 2 + 6, C_W, 12, brd_col, 0.45).setDepth(10);
      this.add.text(cx, cy - C_H / 2 + 6, item.name,
        { fontFamily: "'PressStart2P',Arial", fontSize: '5px', color: lbl_col })
        .setOrigin(0.5).setDepth(11);

      // 이미지
      const imgKey = `item_${item.id}`;
      const imgY   = cy - C_H / 2 + 12 + 20;
      if (item.img && this.textures.exists(imgKey)) {
        this.add.image(cx, imgY, imgKey).setDisplaySize(36, 36).setDepth(10);
      } else {
        this.add.rectangle(cx, imgY, 36, 36, brd_col, 0.2).setStrokeStyle(1, brd_col).setDepth(10);
        this.add.text(cx, imgY, '?', { fontFamily: 'Arial', fontSize: '14px', color: lbl_col })
          .setOrigin(0.5).setDepth(11);
      }

      // desc
      this.add.text(cx, cy + C_H / 2 - 20, item.desc,
        { fontFamily: "'PressStart2P',Arial", fontSize: '5px', color: '#cccccc',
          wordWrap: { width: C_W - 8 } })
        .setOrigin(0.5, 0).setDepth(10);

      // hover 확대 (field 카드 방식)
      bg.on("pointerover", () => {
        this.tweens.add({ targets: bg, displayWidth: C_W * 1.4, displayHeight: C_H * 1.4, y: cy - 10, duration: 100 });
        bg.setDepth(20);
      });
      bg.on("pointerout", () => {
        this.tweens.add({ targets: bg, displayWidth: C_W, displayHeight: C_H, y: cy, duration: 100 });
        bg.setDepth(9);
      });
    });
  }

  _buyItem(idx) {
    const item = this.shopItems[idx];
    if (item.bought || this.player.gold < item.cost) return;

    this.player.gold -= item.cost;
    item.bought = true;
    const uid = `${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.player.items.push({ uid, id: item.id, name: item.name, desc: item.desc, rarity: item.rarity, img: item.img ?? null });

    // 효과는 전투 중 drag-to-use 시 적용
    this._drawScene();
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
