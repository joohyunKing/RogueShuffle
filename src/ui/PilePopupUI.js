import {
  GW, GH,
  FIELD_CW, FIELD_CH,
  PLAYER_PANEL_W,
  BATTLE_LOG_H,
  SUITS,
} from "../constants.js";
import { CardRenderer } from "../CardRenderer.js";

/**
 * PilePopupUI — 덱/더미 카드 목록 팝업
 *
 * 사용:
 *   const pilePopup = new PilePopupUI(scene, onClose);
 *   pilePopup.show(pileData, "DECK");
 *   pilePopup.close();
 *   pilePopup.isOpen  // boolean
 */
export class PilePopupUI {
  /**
   * @param {Phaser.Scene} scene
   * @param {function} [onClose] - 팝업 닫힐 때 콜백 (예: _hideCardPreview)
   */
  constructor(scene, onClose) {
    this.scene = scene;
    this._onClose = onClose ?? null;
    this._objs = null;
  }

  get isOpen() { return this._objs !== null; }

  show(pileData, title) {
    if (this._objs) return;
    const { scene } = this;
    const objs = this._objs = [];

    const RANK_LIST = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const CW_ = FIELD_CW, CH_ = FIELD_CH;
    const GAP_X = CW_ + 4, ROW_H = CH_ + 16, LABEL_W = 26, PAD = 20;
    const panelW = GW - PLAYER_PANEL_W - PAD * 2;
    const panelCX = GW / 2;
    const panelX = panelCX - panelW / 2;

    const bySuit = { S: [], H: [], C: [], D: [] };
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

    const dim = scene.add.rectangle(GW / 2, GH / 2, GW, GH, 0x000000, 0.78)
      .setDepth(600).setInteractive();
    objs.push(dim);
    objs.push(
      scene.add.image(panelCX, panelTop + panelH / 2, 'ui_popup')
        .setDisplaySize(panelW, panelH)
        .setDepth(601)
    );
    objs.push(
      scene.add.text(panelCX, panelTop + titleH / 2,
        `${title}  (${pileData.length})`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: '#ccffcc' }
      ).setOrigin(0.5).setDepth(602)
    );

    const SUIT_SYMS = { S: '♠', H: '♥', C: '♣', D: '♦' };
    const SUIT_COLORS = { S: '#8888ff', H: '#ff6666', C: '#8888ff', D: '#ff6666' };
    const rowsY = panelTop + titleH;

    SUITS.forEach((suit, si) => {
      const cy = rowsY + si * ROW_H + CH_ / 2 + 8;
      const cards = bySuit[suit];
      objs.push(
        /*
        scene.add.text(panelX + LABEL_W / 2, cy, SUIT_SYMS[suit],
          { fontFamily: 'Arial', fontSize: '18px', color: SUIT_COLORS[suit] }
        ).setOrigin(0.5).setDepth(602)
        */
      );
      cards.forEach((card, ci) => {
        const cx = panelX + LABEL_W + 6 + ci * GAP_X + CW_ / 2;
        const { cardImg: img, sealImg } = CardRenderer.drawCard(scene, cx, cy, card, { width: CW_, height: CH_, depth: 602, objs });
        img.setInteractive();
        img.on('pointerover', () => {
          scene.tweens.add({ targets: img, displayWidth: CW_ * 1.5, displayHeight: CH_ * 1.5, duration: 100 });
          img.setDepth(650);
          sealImg?.setDepth(651);
          CardRenderer.showSealTooltip(scene, card, cx, cy, CH_, 700);
        });
        img.on('pointerout', () => {
          scene.tweens.add({ targets: img, displayWidth: CW_, displayHeight: CH_, duration: 100 });
          img.setDepth(602);
          sealImg?.setDepth(603);
          CardRenderer.hideSealTooltip();
        });
      });
    });

    const closeY = rowsY + SUITS.length * ROW_H + closeH / 2;
    const closeBg = scene.add.rectangle(panelCX, closeY, 130, 28, 0x1a3a22)
      .setDepth(602).setStrokeStyle(1, 0x4a9a5a);
    const closeTxt = scene.add.text(panelCX, closeY, 'CLOSE',
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#aaffaa' }
    ).setOrigin(0.5).setDepth(603).setInteractive();
    closeTxt.on('pointerdown', () => this.close());
    dim.on('pointerdown', () => this.close());
    objs.push(closeBg, closeTxt);
  }

  close() {
    if (!this._objs) return;
    this._onClose?.();
    this._objs.forEach(o => o.destroy());
    this._objs = null;
  }
}
