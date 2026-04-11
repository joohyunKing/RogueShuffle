/**
 * RelicPickPopup
 *
 * relic을 추가하려 할 때 이미 6개를 소유한 경우 표시되는 팝업.
 * 기존 relic 중 하나를 버리거나, 새 relic을 버릴 수 있음.
 *
 * showRelicPickPopup(scene, player, newRelicId, onDone)
 *   onDone(keptRelicId | null) — 제거된 relic id (null이면 새 relic 버림)
 */

import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";
import { relicMap as RELIC_MAP, maxRelicCount } from "../manager/relicManager.js";

const RARITY_C = { common: 0x4a9a5a, rare: 0x4a6aaa, epic: 0x8a4aaa };
const RARITY_TX = { common: '#aaffaa', rare: '#aaaaff', epic: '#cc88ff' };

export function showRelicPickPopup(scene, player, newRelicId, onDone) {
  const newRelic = RELIC_MAP[newRelicId];
  if (!newRelic) { onDone?.(null); return; }

  // 6개 미만이면 그냥 추가
  if (player.relics.length < maxRelicCount) {
    player.relics.push(newRelicId);
    onDone?.(newRelicId);
    return;
  }

  const objs = [];
  const D = 500;
  const cx = GW / 2, cy = GH / 2;
  const pw = 560, ph = 460;

  // dim
  const dim = scene.add.rectangle(cx, cy, GW, GH, 0x000000, 0.75).setDepth(D).setInteractive();
  objs.push(dim);

  // panel
  if (scene.textures.exists("ui_frame")) {
    const bg = scene.add.nineslice(cx, cy, "ui_frame", 0, pw, ph, 8, 8, 8, 8)
      .setOrigin(0.5).setDepth(D + 1);
    objs.push(bg);
  } else {
    const panelG = scene.add.graphics({ lineStyle: { width: 4, color: 0x44dd88 } }).setDepth(D + 1);
    panelG.fillStyle(0x0a1e12, 0.95);
    panelG.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    panelG.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    objs.push(panelG);
  }

  objs.push(
    scene.add.text(cx, cy - ph / 2 + 32, "RELIC FULL!", TS.clearTitle).setOrigin(0.5).setDepth(D + 2)
  );
  objs.push(
    scene.add.text(cx, cy - ph / 2 + 64, "버릴 relic을 선택하세요 (새 relic은 맨 앞에 표시)",
      { fontFamily: 'Arial', fontSize: '13px', color: '#ccbbaa', wordWrap: { width: pw - 40 } })
      .setOrigin(0.5, 0).setDepth(D + 2)
  );

  // 선택 가능한 relic 목록 = 새 relic + 기존 6개
  const candidates = [newRelicId, ...player.relics];
  const SZ = 56, IMG = 44, COLS = 4, GAPX = 10, GAPY = 10;
  const gridW = COLS * SZ + (COLS - 1) * GAPX;
  const gridX0 = cx - gridW / 2;
  const gridY0 = cy - ph / 2 + 100;

  function _destroy() {
    objs.forEach(o => { try { o?.destroy(); } catch (_) { } });
  }

  candidates.forEach((relicId, i) => {
    const relic = RELIC_MAP[relicId];
    if (!relic) return;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const rx = gridX0 + col * (SZ + GAPX) + SZ / 2;
    const ry = gridY0 + row * (SZ + GAPY) + SZ / 2;
    const borderC = RARITY_C[relic.rarity] ?? RARITY_C.common;
    const tipC = RARITY_TX[relic.rarity] ?? RARITY_TX.common;
    const isNew = (i === 0);

    // 배경 (새 relic은 빨간 테두리)
    const bg = scene.add.rectangle(rx, ry, SZ, SZ, isNew ? 0x2a0a0a : 0x0a1a0e)
      .setDepth(D + 2)
      .setStrokeStyle(2, isNew ? 0xff4444 : borderC);
    objs.push(bg);

    // "NEW" 라벨
    if (isNew) {
      objs.push(
        scene.add.text(rx, ry - SZ / 2 - 8, "NEW",
          { fontFamily: "'PressStart2P',Arial", fontSize: '8px', color: '#ff8888' })
          .setOrigin(0.5, 1).setDepth(D + 3)
      );
    }

    // 이미지
    const imgKey = `relic_${relic.id}`;
    if (scene.textures.exists(imgKey)) {
      objs.push(scene.add.image(rx, ry, imgKey).setDisplaySize(IMG, IMG).setDepth(D + 3));
    } else {
      objs.push(scene.add.rectangle(rx, ry, IMG, IMG, borderC, 0.2).setDepth(D + 3));
      objs.push(
        scene.add.text(rx, ry, '?', { fontFamily: 'Arial', fontSize: '16px', color: tipC })
          .setOrigin(0.5).setDepth(D + 4)
      );
    }

    // 이름
    objs.push(
      scene.add.text(rx, ry + SZ / 2 + 2, relic.name,
        {
          fontFamily: 'Arial', fontSize: '11px', color: tipC,
          wordWrap: { width: SZ + GAPX }
        })
        .setOrigin(0.5, 0).setDepth(D + 3)
    );

    // hit area
    const hit = scene.add.rectangle(rx, ry, SZ, SZ, 0xffffff, 0).setDepth(D + 4).setInteractive();
    objs.push(hit);
    hit.on('pointerover', () => hit.setFillStyle(0xff4444, 0.2));
    hit.on('pointerout', () => hit.setFillStyle(0xffffff, 0));
    hit.on('pointerdown', () => {
      _destroy();
      if (isNew) {
        // 새 relic 버림 → 기존 유지
        onDone?.(null);
      } else {
        // 기존 relic 제거 → 새 relic 추가
        player.relics = player.relics.filter(id => id !== relicId);
        player.relics.push(newRelicId);
        onDone?.(relicId);
      }
    });
  });

  // 취소 (= 새 relic 버림)
  const cancelBtn = scene.add.rectangle(cx, cy + ph / 2 - 32, 180, 40, 0x444444)
    .setDepth(D + 2).setInteractive();
  objs.push(cancelBtn,
    scene.add.text(cx, cy + ph / 2 - 32, "새 relic 버리기",
      { fontFamily: 'Arial', fontSize: '13px', color: '#aaaaaa' })
      .setOrigin(0.5).setDepth(D + 3)
  );
  cancelBtn.on('pointerdown', () => { _destroy(); onDone?.(null); });
  cancelBtn.on('pointerover', () => cancelBtn.setFillStyle(0x666666));
  cancelBtn.on('pointerout', () => cancelBtn.setFillStyle(0x444444));
}
