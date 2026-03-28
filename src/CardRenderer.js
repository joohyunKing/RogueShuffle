/**
 * CardRenderer.js
 * Canvas2D API로 런타임 카드 텍스처를 생성합니다.
 */

import { CW, CH, SUITS, RANKS } from './constants.js';

const _base = import.meta.env.BASE_URL;
const SYM_URLS = {
  S: `${_base}assets/images/symbol/spade_symbol.png`,
  H: `${_base}assets/images/symbol/hearts_symbol.png`,
  D: `${_base}assets/images/symbol/diamonds_symbol.png`,
  C: `${_base}assets/images/symbol/clubs_symbol.png`,
};

// 숫자 카드 pip 배치 좌표 (카드 폭/높이 비율)
const LAYOUTS = {
  2:  [[.50,.27],[.50,.73]],
  3:  [[.50,.22],[.50,.50],[.50,.78]],
  4:  [[.32,.27],[.68,.27],[.32,.73],[.68,.73]],
  5:  [[.32,.22],[.68,.22],[.50,.50],[.32,.78],[.68,.78]],
  6:  [[.32,.22],[.68,.22],[.32,.50],[.68,.50],[.32,.78],[.68,.78]],
  7:  [[.32,.20],[.68,.20],[.50,.35],[.32,.52],[.68,.52],[.32,.72],[.68,.72]],
  8:  [[.32,.18],[.68,.18],[.32,.36],[.68,.36],[.32,.55],[.68,.55],[.32,.73],[.68,.73]],
  9:  [[.32,.17],[.68,.17],[.32,.33],[.68,.33],[.50,.50],[.32,.67],[.68,.67],[.32,.83],[.68,.83]],
  10: [[.32,.15],[.68,.15],[.50,.28],[.32,.40],[.68,.40],[.32,.60],[.68,.60],[.50,.72],[.32,.85],[.68,.85]],
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
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

export class CardRenderer {
  static preload(scene) {
    Object.entries(SYM_URLS).forEach(([suit, url]) => {
      scene.load.image(`sym_${suit}`, url);
    });
  }

  static createAll(scene) {
    SUITS.forEach(suit =>
      RANKS.forEach(rank => CardRenderer._make(scene, suit, rank))
    );
  }

  static _make(scene, suit, rank) {
    const key     = `${suit}${rank}`;
    const W = CW, H = CH;
    const isRed   = suit === 'H' || suit === 'D';
    const fgColor = isRed ? '#cc2222' : '#1a1a1a';
    const bdColor = isRed ? '#cc2222' : '#333333';
    const symSrc  = scene.textures.get(`sym_${suit}`).getSourceImage();

    const canvas  = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx     = canvas.getContext('2d');

    // ── 배경 ──────────────────────────────────────────────────────────────
    roundRectPath(ctx, 0, 0, W, H, 8);
    ctx.fillStyle = '#f8f4ee';
    ctx.fill();
    ctx.strokeStyle = bdColor;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const F = "11px 'PressStart2P', Arial";
    ctx.font         = F;
    ctx.fillStyle    = fgColor;
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
      const sz   = pipSize(pips.length);
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

      ctx.font         = `bold 38px 'PressStart2P', Arial`;
      ctx.fillStyle    = fgColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.fillText(rank, W / 2, H / 2);
      ctx.textAlign    = 'left';
    }

    if (!scene.textures.exists(key)) {
      scene.textures.addCanvas(key, canvas);
    }
  }
}
