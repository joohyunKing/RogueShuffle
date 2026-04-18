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
import { ModalUI } from "./ModalUI.js";

/**
 * PilePopupUI — 덱/더미 카드 목록 팝업
 */
export class PilePopupUI extends ModalUI {
  constructor(scene, onClose) {
    super(scene, {
        depth: 600,
        onClose
    });
  }

  show(pileData, title) {
    if (this.isOpen) return;

    const { scene } = this;
    const RANK_LIST = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const CW_ = FIELD_CW, CH_ = FIELD_CH;
    const GAP_X = CW_ + 4, ROW_H = CH_ + 16, LABEL_W = 26, PAD = 20;

    const panelW = GW - PLAYER_PANEL_W - PAD * 2;
    // 슈트별 카드 분류 및 정렬
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

    // 슈트별 필요 행 수 계산
    const cardAreaW = panelW - LABEL_W - 6;
    const maxPerRow = Math.max(1, Math.floor(cardAreaW / GAP_X));
    const suitRows = {};
    SUITS.forEach(s => {
      suitRows[s] = Math.max(1, Math.ceil(bySuit[s].length / maxPerRow));
    });
    const totalRows = SUITS.reduce((sum, s) => sum + suitRows[s], 0);

    const titleH = 38, closeH = 40;
    const panelH = titleH + totalRows * ROW_H + closeH;
    const panelTop = Math.max(BATTLE_LOG_H + 6, (GH - panelH) / 2);
    const panelY = panelTop + panelH / 2;

    const { cx, D } = this.createBase(panelW, panelH, {
        panelY,
        dimAlpha: 0.78,
        bgKey: "ui_popup",
    });

    const panelX = cx - panelW / 2;

    // 제목
    this.addObj(
      scene.add.text(cx, panelTop + titleH / 2,
        `${title}  (${pileData.length})`,
        { fontFamily: "'PressStart2P',Arial", fontSize: '11px', color: '#ccffcc' }
      ).setOrigin(0.5).setDepth(D + 2)
    );

    // 슈트별 카드 렌더
    let rowOffset = 0;
    SUITS.forEach((suit) => {
      const cards = bySuit[suit];
      const numRows = suitRows[suit];

      for (let row = 0; row < numRows; row++) {
        const rowCards = cards.slice(row * maxPerRow, (row + 1) * maxPerRow);
        const cy = panelTop + titleH + (rowOffset + row) * ROW_H + CH_ / 2 + 8;

        rowCards.forEach((card, ci) => {
          const x = panelX + LABEL_W + 6 + ci * GAP_X + CW_ / 2;
          const { cardImg: img, sealImg } = CardRenderer.drawCard(scene, x, cy, card, { width: CW_, height: CH_, depth: D + 2, objs: this._objs });
          
          img.setInteractive();
          img.on('pointerover', () => {
            scene.tweens.add({ targets: img, displayWidth: CW_ * 1.5, displayHeight: CH_ * 1.5, duration: 100 });
            img.setDepth(D + 50);
            sealImg?.setDepth(D + 51);
            CardRenderer.showSealTooltip(scene, card, x, cy, CH_, D + 100);
          });
          img.on('pointerout', () => {
            scene.tweens.add({ targets: img, displayWidth: CW_, displayHeight: CH_, duration: 100 });
            img.setDepth(D + 2);
            sealImg?.setDepth(D + 3);
            CardRenderer.hideSealTooltip();
          });
        });
      }
      rowOffset += numRows;
    });

    // 닫기 버튼
    const closeY = panelTop + panelH - closeH / 2;
    const closeBg = scene.add.rectangle(cx, closeY, 130, 28, 0x1a3a22)
      .setDepth(D + 2).setStrokeStyle(1, 0x4a9a5a);
    this.addObj(closeBg);

    const closeTxt = scene.add.text(cx, closeY, 'CLOSE',
      { fontFamily: "'PressStart2P',Arial", fontSize: '10px', color: '#aaffaa' }
    ).setOrigin(0.5).setDepth(D + 3).setInteractive();
    this.addObj(closeTxt);

    closeTxt.on('pointerdown', () => this.close());
  }
}

