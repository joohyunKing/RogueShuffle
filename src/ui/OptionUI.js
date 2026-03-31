import Phaser from "phaser";
import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";
import { saveOptionsByRegistry } from "../manager/optionManager.js";

/**
 * OptionUI — 인게임 옵션 오버레이 (BGM/SFX 볼륨, MAIN MENU, CLOSE)
 *
 * opts:
 *   onMainMenu {function}  MAIN MENU 버튼 클릭 시 콜백 (씬 전환 등)
 *   onOpen     {function}  오버레이 열릴 때 콜백 (예: isDealing = true)
 *   onClose    {function}  오버레이 닫힐 때 콜백 (예: isDealing = false)
 *   depth      {number}    기본 depth (기본 600)
 */
export class OptionUI {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts  = {
      onMainMenu: null,
      onOpen:     null,
      onClose:    null,
      depth:      600,
      ...opts,
    };
    this._objs = null;
  }

  get isOpen() { return !!this._objs; }

  show() {
    if (this._objs) return;
    this.opts.onOpen?.();

    const { scene } = this;
    const D  = this.opts.depth;
    const objs = this._objs = [];
    const cx = GW / 2, cy = GH / 2;
    const pw = 400, ph = 360;

    // 딤
    const dim = scene.add.rectangle(cx, cy, GW, GH, 0x000000, 0.65)
      .setDepth(D).setInteractive();
    objs.push(dim);

    // 패널
    const panelG = scene.add.graphics().setDepth(D + 1);
    panelG.fillStyle(0x0d2b18);
    panelG.fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    panelG.lineStyle(2, 0x2d7a3a);
    panelG.strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 16);
    objs.push(panelG);

    objs.push(
      scene.add.text(cx, cy - ph / 2 + 44, "OPTIONS", TS.optTitle)
        .setOrigin(0.5).setDepth(D + 2)
    );

    // ── BGM ──────────────────────────────────────────────────────────────
    let bgm = scene.registry.get("bgmVolume") ?? 7;
    const bgmY = cy - 70;
    objs.push(
      scene.add.text(cx, bgmY - 28, "BGM", TS.optLabel).setOrigin(0.5).setDepth(D + 2)
    );
    const bgmMinus = scene.add.rectangle(cx - 80, bgmY, 44, 44, 0x335544)
      .setDepth(D + 2).setInteractive();
    objs.push(bgmMinus,
      scene.add.text(cx - 80, bgmY, "-", TS.optBtn).setOrigin(0.5).setDepth(D + 3));
    const bgmTxt = scene.add.text(cx, bgmY, String(bgm), TS.optValue)
      .setOrigin(0.5).setDepth(D + 2);
    objs.push(bgmTxt);
    const bgmPlus = scene.add.rectangle(cx + 80, bgmY, 44, 44, 0x335544)
      .setDepth(D + 2).setInteractive();
    objs.push(bgmPlus,
      scene.add.text(cx + 80, bgmY, "+", TS.optBtn).setOrigin(0.5).setDepth(D + 3));
    const bgmBarBg = scene.add.rectangle(cx, bgmY + 28, 204, 7, 0x224433).setDepth(D + 2);
    const bgmBar   = scene.add.rectangle(cx - 102, bgmY + 28, bgm * 20.4, 7, 0x44dd88)
      .setOrigin(0, 0.5).setDepth(D + 3);
    objs.push(bgmBarBg, bgmBar);

    const updateBgm = (v) => {
      bgm = Phaser.Math.Clamp(v, 0, 10);
      scene.registry.set("bgmVolume", bgm);
      bgmTxt.setText(String(bgm));
      bgmBar.setDisplaySize(Math.max(1, bgm * 20.4), 7);
      saveOptionsByRegistry(scene.registry);
    };
    bgmMinus.on("pointerdown", () => updateBgm(bgm - 1));
    bgmPlus.on("pointerdown",  () => updateBgm(bgm + 1));
    bgmMinus.on("pointerover", () => bgmMinus.setFillStyle(0x447766));
    bgmMinus.on("pointerout",  () => bgmMinus.setFillStyle(0x335544));
    bgmPlus.on("pointerover",  () => bgmPlus.setFillStyle(0x447766));
    bgmPlus.on("pointerout",   () => bgmPlus.setFillStyle(0x335544));

    // ── SFX ──────────────────────────────────────────────────────────────
    let sfx = scene.registry.get("sfxVolume") ?? 7;
    const sfxY = cy + 50;
    objs.push(
      scene.add.text(cx, sfxY - 28, "SFX", TS.optLabel).setOrigin(0.5).setDepth(D + 2)
    );
    const sfxMinus = scene.add.rectangle(cx - 80, sfxY, 44, 44, 0x335544)
      .setDepth(D + 2).setInteractive();
    objs.push(sfxMinus,
      scene.add.text(cx - 80, sfxY, "-", TS.optBtn).setOrigin(0.5).setDepth(D + 3));
    const sfxTxt = scene.add.text(cx, sfxY, String(sfx), TS.optValue)
      .setOrigin(0.5).setDepth(D + 2);
    objs.push(sfxTxt);
    const sfxPlus = scene.add.rectangle(cx + 80, sfxY, 44, 44, 0x335544)
      .setDepth(D + 2).setInteractive();
    objs.push(sfxPlus,
      scene.add.text(cx + 80, sfxY, "+", TS.optBtn).setOrigin(0.5).setDepth(D + 3));
    const sfxBarBg = scene.add.rectangle(cx, sfxY + 28, 204, 7, 0x224433).setDepth(D + 2);
    const sfxBar   = scene.add.rectangle(cx - 102, sfxY + 28, sfx * 20.4, 7, 0x44dd88)
      .setOrigin(0, 0.5).setDepth(D + 3);
    objs.push(sfxBarBg, sfxBar);

    const updateSfx = (v) => {
      sfx = Phaser.Math.Clamp(v, 0, 10);
      scene.registry.set("sfxVolume", sfx);
      sfxTxt.setText(String(sfx));
      sfxBar.setDisplaySize(Math.max(1, sfx * 20.4), 7);
      saveOptionsByRegistry(scene.registry);
    };
    sfxMinus.on("pointerdown", () => updateSfx(sfx - 1));
    sfxPlus.on("pointerdown",  () => updateSfx(sfx + 1));
    sfxMinus.on("pointerover", () => sfxMinus.setFillStyle(0x447766));
    sfxMinus.on("pointerout",  () => sfxMinus.setFillStyle(0x335544));
    sfxPlus.on("pointerover",  () => sfxPlus.setFillStyle(0x447766));
    sfxPlus.on("pointerout",   () => sfxPlus.setFillStyle(0x335544));

    // ── 버튼 ─────────────────────────────────────────────────────────────
    const btnY = cy + ph / 2 - 48;

    const exitBtn = scene.add.rectangle(cx - 80, btnY, 140, 48, 0x882211)
      .setDepth(D + 2).setInteractive();
    objs.push(exitBtn,
      scene.add.text(cx - 80, btnY, "MAIN MENU", TS.menuBtn).setOrigin(0.5).setDepth(D + 3));
    exitBtn.on("pointerdown", () => {
      this.opts.onMainMenu?.();
    });
    exitBtn.on("pointerover", () => exitBtn.setFillStyle(0xaa2222));
    exitBtn.on("pointerout",  () => exitBtn.setFillStyle(0x882211));

    const closeBtn = scene.add.rectangle(cx + 80, btnY, 140, 48, 0x335544)
      .setDepth(D + 2).setInteractive();
    objs.push(closeBtn,
      scene.add.text(cx + 80, btnY, "CLOSE", TS.menuBtn).setOrigin(0.5).setDepth(D + 3));
    closeBtn.on("pointerdown", () => this.close());
    closeBtn.on("pointerover", () => closeBtn.setFillStyle(0x447766));
    closeBtn.on("pointerout",  () => closeBtn.setFillStyle(0x335544));
  }

  close() {
    if (!this._objs) return;
    this._objs.forEach(o => { try { o?.destroy(); } catch(_) {} });
    this._objs = null;
    this.opts.onClose?.();
  }
}
