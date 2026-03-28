import Phaser from "phaser";
import { GW, GH, PLAYER_PANEL_W, ITEM_PANEL_W } from "../constants.js";
import { TS } from "../textStyles.js";
import { Player } from "../manager/playerManager.js";
import itemData from '../data/item.json';
import { PlayerUI } from '../ui/PlayerUI.js';
import { ItemUI } from '../ui/ItemUI.js';

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

    // ── 플레이어 패널 (PlayerUI) ──────────────────────────────────────────
    this.playerUI = new PlayerUI(this, this.player, {
      round: this.round,
      showHandConfig: true,
    });
    this.playerUI.create();

    // ── 샵 영역 (플레이어 패널과 아이템 패널 사이) ─────────────────────────
    const PW   = PLAYER_PANEL_W;
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

    // ItemUI — 보유 아이템 2열 표시 (drag 없음)
    this.itemUI = new ItemUI(this, this.player, {
      panelX: IPX, panelW: IPW,
      startY: 76,
      cardW: 80, cardH: 116,
      draggable: false,
    });
    this.itemUI.create();
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
