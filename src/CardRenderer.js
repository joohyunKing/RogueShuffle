/**
 * CardRenderer.js
 * Canvas2D API로 런타임 카드 텍스처를 생성합니다.
 */

import { CW, CH, SUITS, RANKS } from './constants.js';
import { sealMap, sealList } from './manager/sealManager.js';
import { TooltipUI } from './ui/TooltipUI.js';
import { getLang, getSealName, getSealDesc } from './service/langService.js';

const SYM_URLS = {
  S: 'assets/images/symbol/spade_symbol.png',
  H: 'assets/images/symbol/hearts_symbol.png',
  C: 'assets/images/symbol/clubs_symbol.png',
  D: 'assets/images/symbol/diamonds_symbol.png',
  B: 'assets/images/symbol/skull_symbol.png',
};

// 숫자 카드 pip 배치 좌표 (카드 폭/높이 비율)
const LAYOUTS = {
  2: [[.50, .27], [.50, .73]],
  3: [[.50, .26], [.50, .50], [.50, .74]],
  4: [[.38, .27], [.62, .27], [.38, .73], [.62, .73]],
  5: [[.38, .26], [.62, .26], [.50, .50], [.38, .74], [.62, .74]],
  6: [[.38, .26], [.62, .26], [.38, .50], [.62, .50], [.38, .74], [.62, .74]],
  7: [[.38, .24], [.62, .24], [.50, .38], [.38, .54], [.62, .54], [.38, .76], [.62, .76]],
  8: [[.38, .24], [.62, .24], [.38, .40], [.62, .40], [.38, .60], [.62, .60], [.38, .76], [.62, .76]],
  9: [[.38, .22], [.62, .22], [.38, .38], [.62, .38], [.50, .50], [.38, .62], [.62, .62], [.38, .78], [.62, .78]],
  10: [[.38, .20], [.62, .20], [.50, .33], [.38, .44], [.62, .44], [.38, .56], [.62, .56], [.50, .67], [.38, .80], [.62, .80]],
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
  if (count <= 2) return 24;
  if (count <= 4) return 20;
  if (count <= 7) return 16;
  return 14;
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
    const baseKey = card.key;

    // sym 이미지가 로드된 슈트면 텍스처 자동 생성 (B 슈트 등 커스텀 카드 지원)
    if (!scene.textures.exists(baseKey) && scene.textures.exists(`sym_${card.suit}`)) {
      CardRenderer._make(scene, card.suit, card.rank);
    }
    if (disabled && !scene.textures.exists(disKey) && scene.textures.exists(baseKey)) {
      CardRenderer._makeDisabled(scene, card.suit, card.rank);
    }

    const texKey = disabled && scene.textures.exists(disKey) ? disKey : baseKey;

    let cardImg;
    if (scene.textures.exists(texKey)) {
      cardImg = scene.add.image(x, y, texKey)
        .setDisplaySize(width, height).setDepth(depth);
    } else {
      // 폴백: 텍스처 없는 경우 색상 사각형 + 문자
      const isRed = card.suit === 'H' || card.suit === 'D';
      const isBomb = card.suit === 'B';
      const bg = scene.add.graphics().setDepth(depth);
      bg.fillStyle(isBomb ? 0x2a0000 : isRed ? 0x2a0808 : 0x08102a);
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
        const offX = Math.round(width * 0.16);
        const offY = Math.round(height * 0.14);
        sealImg = scene.add.image(
          x + width / 2 - sz / 2 - offX,
          y - height / 2 + sz / 2 + offY,
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

    const lang = getLang(scene);
    const sealName = getSealName(lang, enh.type, info.name);
    const sealDesc = getSealDesc(lang, enh.type, info.desc);

    const suitColor  = SUIT_COLS[card.suit] ?? '#ffffff';
    const TIP_W      = 220;
    const TIP_H_EST  = 100; // 높이 추정값 (위/아래 위치 결정용)

    let top = cardY - cardH / 2 - TIP_H_EST - 8;
    if (top < 4) top = cardY + cardH / 2 + 8;
    const left = cardX - TIP_W / 2;

    _sealTooltip = new TooltipUI(scene, {
      titleMsg:      sealName,
      contentMsg:    sealDesc,
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

  /**
   * 콤보(족보)에 포함된 카드에 불꽃 파티클 및 흔들림 효과를 적용합니다.
   * 점수에 따라 불꽃의 색상이 변화합니다.
   */
  static applyComboEffect(scene, img, cardW, cardH, sel, score) {
    const targets = [img];
    const sealImg = img.getData('sealImg');
    if (sealImg) targets.push(sealImg);

    // 1. 기본 흔들림 효과 (카드 + 씰 동기화)
    const baseCardX = img.x;
    const baseSealX = sealImg ? sealImg.x : 0;

    const shakeTween = scene.tweens.add({
      targets: targets,
      x: (target) => target === img ? baseCardX + 2 : baseSealX + 2,
      angle: { from: -1, to: 1 },
      duration: 55, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // 2. 점수에 따른 색상 결정
    let tints = [0xffeebb, 0xffcc44, 0xff8800, 0xff4400]; // 기본 (주황/노랑)
    if (score > 50000) {
      tints = [0xffffff, 0x00ffff, 0x0088ff, 0x0000ff]; // 초고점 (푸른 불꽃/화이트)
    } else if (score > 10000) {
      tints = [0xffaaff, 0xff00ff, 0xaa00ff, 0x4400aa]; // 고점 (보라/자주)
    } else if (score > 3000) {
      tints = [0xccffcc, 0x44ff44, 0x008800, 0x004400]; // 상급 (초록)
    }

    // 3. 픽셀 텍스처 생성 (메모리 관리: 한 번만 생성)
    if (!scene.textures.exists('pixel_flare')) {
      const g = scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 4, 4);
      g.generateTexture('pixel_flare', 4, 4);
      g.destroy();
    }

    // 4. 파티클 에미터 생성
    const emitter = scene.add.particles(0, 0, 'pixel_flare', {
      speedY: { min: -40, max: -90 },
      speedX: { min: -20, max: 20 },
      scale: { start: 1, end: 0.1 },
      alpha: { start: 0.9, end: 0 },
      tint: tints,
      blendMode: 'ADD',
      lifespan: { min: 600, max: 1000 },
      frequency: score > 10000 ? 12 : 20, // 고점일수록 더 빽빽하게
      emitZone: { 
        type: 'random', 
        source: new Phaser.Geom.Rectangle(-cardW / 2 + 5, -cardH / 2, cardW - 10, cardH * 0.2) 
      }
    });
    
    emitter.setDepth(sel ? 33 : 31);
    emitter.startFollow(img);
    
    // scene.cardObjs가 관리 리스트라면 추가 (BattleScene 전용)
    if (scene.cardObjs) scene.cardObjs.push(emitter);

    img.on('destroy', () => {
      try { emitter.destroy(); } catch (e) { }
      shakeTween.stop();
    });

    return emitter;
  }

  /**
   * 카드의 마우스 오버/아웃 호버 연출을 설정합니다.
   * 필드와 핸드 양쪽의 중복된 연출 로직을 통합합니다.
   */
  static addHoverEffect(scene, img, sealImg, cardW, cardH, baseOffset = 0) {
    const hoverW = Math.round(cardW * 1.35);
    const hoverH = Math.round(cardH * 1.35);
    const baseDepth = img.depth;
    const baseY = img.y;

    img.on("pointerover", () => {
      // 드래그 중이거나 씬이 정지 상태면 스킵 (필요시 scene.isDragging 체크)
      if (scene.isDragging) return;

      scene.tweens.add({ 
        targets: img, 
        displayWidth: hoverW, 
        displayHeight: hoverH, 
        y: baseY - 10, 
        duration: 100 
      });
      img.setDepth(baseDepth + 10);

      if (sealImg?.active) {
        const hSz = Math.round(Math.min(hoverW, hoverH) * 0.3);
        const offX = Math.round(hoverW * 0.16);
        const offY = Math.round(hoverH * 0.14);
        scene.tweens.add({ 
          targets: sealImg, 
          displayWidth: hSz, 
          displayHeight: hSz, 
          x: img.x + hoverW / 2 - hSz / 2 - offX, 
          y: (baseY - 10) - hoverH / 2 + hSz / 2 + offY, 
          duration: 100 
        });
        sealImg.setDepth(baseDepth + 12);
      }
      
      // 툴팁 표시 여부는 호출부에서 card 데이터를 알고 있을 때만 처리하거나 
      // 이 메서드 인자로 card를 넘겨받아 여기서 처리 가능
    });

    img.on("pointerout", () => {
      if (scene.isDragging) return;

      scene.tweens.add({ 
        targets: img, 
        displayWidth: cardW, 
        displayHeight: cardH, 
        y: baseY, 
        duration: 100 
      });
      img.setDepth(baseDepth);

      if (sealImg?.active) {
        const oSz = Math.round(Math.min(cardW, cardH) * 0.3);
        const oOffX = Math.round(cardW * 0.16);
        const oOffY = Math.round(cardH * 0.14);
        scene.tweens.add({ 
          targets: sealImg, 
          displayWidth: oSz, 
          displayHeight: oSz, 
          x: img.x + cardW / 2 - oSz / 2 - oOffX, 
          y: baseY - cardH / 2 + oSz / 2 + oOffY, 
          duration: 100 
        });
        sealImg.setDepth(baseDepth + 2);
      }
    });
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
    const isBomb = suit === 'B';
    const fgColor = isBomb ? '#8b0000' : isRed ? '#cc2222' : '#1a1a1a';
    const bdColor = isBomb ? '#8b0000' : isRed ? '#cc2222' : '#333333';
    const symSrc = scene.textures.get(`sym_${suit}`).getSourceImage();

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── 배경 ──────────────────────────────────────────────────────────────
    const frontSrc = scene.textures.get('ui_card_front').getSourceImage();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frontSrc, 0, 0, W, H);

    const F = "11px 'PressStart2P', Arial";
    ctx.font = F;
    ctx.fillStyle = fgColor;
    ctx.textBaseline = 'top';

    // ── 좌상단 — rank + 작은 심볼 ──────────────────────────────────────
    ctx.fillText(rank, 16, 15);
    ctx.drawImage(symSrc, 14, 28, 16, 16);

    // ── 우하단 — rank (반전) ────────────────────────────────────────────
    ctx.save();
    ctx.translate(W, H);
    ctx.rotate(Math.PI);
    ctx.textBaseline = 'top';
    ctx.fillText(rank, 16, 15);
    ctx.drawImage(symSrc, 14, 28, 16, 16);
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
      const offX = 22;
      const offY = 48;
      roundRectPath(ctx, offX, offY, W - offX * 2, H - offY * 2, 6);
      ctx.fillStyle = bgCol;
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;

      const fontSize = rank.length > 2 ? 28 : 38;
      ctx.font = `bold ${fontSize}px 'PressStart2P', Arial`;
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
