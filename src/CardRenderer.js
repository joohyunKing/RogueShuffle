/**
 * CardRenderer.js
 * Canvas2D API로 런타임 카드 텍스처를 생성합니다.
 */

import { CW, CH, SUITS, RANKS } from './constants.js';
import { sealMap, sealList } from './manager/sealManager.js';
import { TooltipUI } from './ui/TooltipUI.js';

const SYM_URLS = {
  S: 'assets/images/symbol/spade_symbol.png',
  H: 'assets/images/symbol/hearts_symbol.png',
  C: 'assets/images/symbol/clubs_symbol.png',
  D: 'assets/images/symbol/diamonds_symbol.png',
};

// 숫자 카드 pip 배치 좌표 (카드 폭/높이 비율)
const LAYOUTS = {
  2: [[.50, .27], [.50, .73]],
  3: [[.50, .22], [.50, .50], [.50, .78]],
  4: [[.32, .27], [.68, .27], [.32, .73], [.68, .73]],
  5: [[.32, .22], [.68, .22], [.50, .50], [.32, .78], [.68, .78]],
  6: [[.32, .22], [.68, .22], [.32, .50], [.68, .50], [.32, .78], [.68, .78]],
  7: [[.32, .20], [.68, .20], [.50, .35], [.32, .52], [.68, .52], [.32, .72], [.68, .72]],
  8: [[.32, .18], [.68, .18], [.32, .36], [.68, .36], [.32, .55], [.68, .55], [.32, .73], [.68, .73]],
  9: [[.32, .17], [.68, .17], [.32, .33], [.68, .33], [.50, .50], [.32, .67], [.68, .67], [.32, .83], [.68, .83]],
  10: [[.32, .15], [.68, .15], [.50, .28], [.32, .40], [.68, .40], [.32, .60], [.68, .60], [.50, .72], [.32, .85], [.68, .85]],
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawPip(ctx, symSrc, cx, cy, size, flip) {
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.rotate(Math.PI);
  ctx.drawImage(symSrc, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function pipSize(count) {
  if (count <= 2) return 28;
  if (count <= 4) return 24;
  if (count <= 7) return 20;
  return 16;
}

const SUIT_SYMS_FB = { S: '♠', H: '♥', D: '♦', C: '♣' };

// ── 씰 툴팁 관리 ─────────────────────────────────────────────────────────────
const SUIT_COLS = { S: '#aaaaff', H: '#ff6666', D: '#ff6666', C: '#aaaaff' };

let _sealTooltip = null;

export class CardRenderer {
  /**
   * 카드 하나를 씬에 그립니다.
   *  - card.enhancements 가 있으면 우상단에 노란 점 표시
   *  - disabled=true 이면 `${card.key}_disabled` 텍스처 사용
   *  - objs 배열이 주어지면 생성된 모든 오브젝트를 push
   *  - 텍스처가 없으면 색상 사각형 + 문자로 폴백
   *
   * @param {Phaser.Scene} scene
   * @param {number} x         카드 중심 X
   * @param {number} y         카드 중심 Y
   * @param {object} card      { key, suit, rank?, enhancements? }
   * @param {{ width:number, height:number, depth?:number, disabled?:boolean, objs?:Array }} opts
   * @returns {{ cardImg: Phaser.GameObjects.Image|Text, sealImg: Phaser.GameObjects.Image|null }}
   */
  static drawCard(scene, x, y, card, { width, height, depth = 0, disabled = false, objs = null } = {}) {
    const disKey = `${card.key}_disabled`;
    const texKey = disabled && scene.textures.exists(disKey) ? disKey : card.key;

    let cardImg;
    if (scene.textures.exists(texKey)) {
      cardImg = scene.add.image(x, y, texKey)
        .setDisplaySize(width, height).setDepth(depth);
    } else {
      // 폴백: 텍스처 없는 경우 색상 사각형 + 문자
      const isRed = card.suit === 'H' || card.suit === 'D';
      const bg = scene.add.graphics().setDepth(depth);
      bg.fillStyle(isRed ? 0x2a0808 : 0x08102a);
      bg.fillRect(x - width / 2, y - height / 2, width, height);
      objs?.push(bg);
      cardImg = scene.add.text(x, y,
        `${card.rank ?? card.key?.slice(1)}\n${SUIT_SYMS_FB[card.suit] ?? ''}`,
        {
          fontFamily: 'Arial',
          fontSize: `${Math.round(width * 0.22)}px`,
          fontStyle: 'bold',
          color: isRed ? '#ff9999' : '#aaaaff',
          align: 'center',
        }
      ).setOrigin(0.5).setDepth(depth + 1);
    }
    objs?.push(cardImg);

    // 강화(씰) 표시 — 우상단에 씰 이미지
    let sealImg = null;
    const enh = card.enhancements?.[0];
    if (enh) {
      const sealKey = `seal_${enh.type}`;
      if (scene.textures.exists(sealKey)) {
        const sz = Math.round(Math.min(width, height) * 0.3);
        sealImg = scene.add.image(
          x + width / 2 - sz / 2 - 1,
          y - height / 2 + sz / 2 + 1,
          sealKey
        ).setDisplaySize(sz, sz).setDepth(depth + 2);
        objs?.push(sealImg);
      }
    }

    return { cardImg, sealImg };
  }

  /**
   * 씰 툴팁을 카드 위(공간 부족 시 아래)에 표시합니다.
   * @param {Phaser.Scene} scene
   * @param {object} card        카드 데이터 { suit, rank, enhancements }
   * @param {number} cardX       카드 중심 X
   * @param {number} cardY       카드 중심 Y
   * @param {number} cardH       카드 표시 높이 (위치 계산용)
   * @param {number} [depth=900]
   */
  static showSealTooltip(scene, card, cardX, cardY, cardH, depth = 900) {
    CardRenderer.hideSealTooltip();
    const enh = card.enhancements?.[0];
    const info = sealMap[enh?.type];
    if (!info) return;

    const sym        = SUIT_SYMS_FB[card.suit] ?? '';
    const suitColor  = SUIT_COLS[card.suit] ?? '#ffffff';
    const borderHex  = info.border ?? '#ffffff';
    const TIP_W      = 190;
    const TIP_H_EST  = 100; // 높이 추정값 (위/아래 위치 결정용)

    let top = cardY - cardH / 2 - TIP_H_EST - 8;
    if (top < 4) top = cardY + cardH / 2 + 8;
    const left = cardX - TIP_W / 2;

    _sealTooltip = new TooltipUI(scene, {
      titleMsg:      info.name,
      contentMsg:    info.desc,
      titleMsgColor: suitColor,
      tooltipW:      TIP_W,
      left,
      top,
      depth,
    });
    _sealTooltip.show();
  }

  /** 씰 툴팁을 제거합니다. */
  static hideSealTooltip() {
    _sealTooltip?.hide();
    _sealTooltip = null;
  }

  static preload(scene) {
    Object.entries(SYM_URLS).forEach(([suit, url]) => {
      scene.load.image(`sym_${suit}`, url);
    });
    sealList.forEach(s => {
      scene.load.image(`seal_${s.id}`, `assets/images/symbol/${s.img}`);
    });
  }

  static createAll(scene) {
    SUITS.forEach(suit =>
      RANKS.forEach(rank => {
        CardRenderer._make(scene, suit, rank);
        CardRenderer._makeDisabled(scene, suit, rank);
      })
    );
  }

  static _makeDisabled(scene, suit, rank) {
    const key = `${suit}${rank}_disabled`;
    if (scene.textures.exists(key)) return;

    const normalKey = `${suit}${rank}`;
    if (!scene.textures.exists(normalKey)) CardRenderer._make(scene, suit, rank);

    const W = CW, H = CH;
    const normalSrc = scene.textures.get(normalKey).getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.filter = 'grayscale(1) brightness(0.80)';
    ctx.drawImage(normalSrc, 0, 0, W, H);

    scene.textures.addCanvas(key, canvas);
  }

  static _make(scene, suit, rank) {
    const key = `${suit}${rank}`;
    const W = CW, H = CH;
    const isRed = suit === 'H' || suit === 'D';
    const fgColor = isRed ? '#cc2222' : '#1a1a1a';
    const bdColor = isRed ? '#cc2222' : '#333333';
    const symSrc = scene.textures.get(`sym_${suit}`).getSourceImage();

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── 배경 ──────────────────────────────────────────────────────────────
    roundRectPath(ctx, 0, 0, W, H, 8);
    ctx.fillStyle = '#f8f4ee';
    ctx.fill();
    ctx.strokeStyle = bdColor;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const F = "11px 'PressStart2P', Arial";
    ctx.font = F;
    ctx.fillStyle = fgColor;
    ctx.textBaseline = 'top';

    // ── 좌상단 — rank + 작은 심볼 ──────────────────────────────────────
    ctx.fillText(rank, 5, 4);
    ctx.drawImage(symSrc, 5, 22, 14, 14);

    // ── 우하단 — rank (반전) ────────────────────────────────────────────
    ctx.save();
    ctx.translate(W, H);
    ctx.rotate(Math.PI);
    ctx.textBaseline = 'top';
    ctx.fillText(rank, 5, 4);
    ctx.drawImage(symSrc, 5, 22, 14, 14);
    ctx.restore();

    const valNum = rank === 'A' ? 1
      : rank === 'J' ? 11
        : rank === 'Q' ? 12
          : rank === 'K' ? 13
            : parseInt(rank);

    if (rank === 'A') {
      // ── 에이스 — 중앙 심볼 크게 ──────────────────────────────────────
      const sz = 50;
      ctx.drawImage(symSrc, W / 2 - sz / 2, H / 2 - sz / 2, sz, sz);

    } else if (LAYOUTS[valNum]) {
      // ── 숫자 카드 — pip 배치 ──────────────────────────────────────────
      const pips = LAYOUTS[valNum];
      const sz = pipSize(pips.length);
      pips.forEach(([fx, fy]) => {
        drawPip(ctx, symSrc, fx * W, fy * H, sz, fy > 0.5);
      });

    } else {
      // ── J / Q / K — face card (이미지 추가 예정) ──────────────────────
      const faceColors = { J: '#1144aa', Q: '#aa1144', K: '#774400' };
      const bgCol = faceColors[rank] ?? '#334455';
      roundRectPath(ctx, 12, 36, W - 24, H - 72, 6);
      ctx.fillStyle = bgCol;
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.font = `bold 38px 'PressStart2P', Arial`;
      ctx.fillStyle = fgColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(rank, W / 2, H / 2);
      ctx.textAlign = 'left';
    }

    if (!scene.textures.exists(key)) {
      scene.textures.addCanvas(key, canvas);
    }
  }
}
