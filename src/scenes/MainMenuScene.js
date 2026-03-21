import Phaser from "phaser";
import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";

export class MainMenuScene extends Phaser.Scene {
  constructor() { super("MainMenuScene"); }

  create() {
    this._drawBg();
    this._drawTitle();
    this._createButtons();
  }

  _drawBg() {
    const g = this.add.graphics();
    g.fillStyle(0x0d2b18);
    g.fillRect(0, 0, GW, GH);
    g.fillStyle(0x1a472a);
    g.fillRoundedRect(GW / 2 - 420, 80, 840, 580, 24);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(GW / 2 - 420, 80, 840, 580, 24);
  }

  _drawTitle() {
    this.add.text(GW / 2, 210, "ROGUE SHUFFLE", TS.menuTitle).setOrigin(0.5);
    this.add.text(GW / 2, 300, "트럼프 카드 로그라이크 게임", TS.menuSub).setOrigin(0.5);
  }

  _createButtons() {
    // ── PLAY ──────────────────────────────────────────────────────────────
    const playBg = this.add.rectangle(GW / 2, 410, 280, 64, 0x22aa44).setInteractive();
    this.add.text(GW / 2, 410, "PLAY", TS.menuPlayBtn).setOrigin(0.5);
    playBg.on("pointerdown", () => this.scene.start("GameScene"));
    playBg.on("pointerover",  () => playBg.setFillStyle(0x33cc55));
    playBg.on("pointerout",   () => playBg.setFillStyle(0x22aa44));

    // ── OPTIONS ───────────────────────────────────────────────────────────
    const optBg = this.add.rectangle(GW / 2, 500, 280, 56, 0x335544).setInteractive();
    this.add.text(GW / 2, 500, "OPTIONS", TS.menuOptBtn).setOrigin(0.5);
    optBg.on("pointerdown", () => this.scene.start("OptionsScene"));
    optBg.on("pointerover",  () => optBg.setFillStyle(0x447766));
    optBg.on("pointerout",   () => optBg.setFillStyle(0x335544));

    // ── 버전 ──────────────────────────────────────────────────────────────
    this.add.text(GW - 20, GH - 12, "v0.1.0", TS.version).setOrigin(1, 1);
  }
}
