import Phaser from "phaser";
import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";
import { hasSave, loadSave, deleteSave } from "../save.js";

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
    const cx         = GW / 2;
    const saveExists = hasSave();

    if (saveExists) {
      // ── NEW GAME ──────────────────────────────────────────────────────
      const newBg = this.add.rectangle(cx, 380, 280, 56, 0x22aa44).setInteractive();
      this.add.text(cx, 380, "NEW GAME", TS.menuPlayBtn).setOrigin(0.5);
      newBg.on("pointerdown", () => { deleteSave(); this.scene.start("GameScene", {}); });
      newBg.on("pointerover",  () => newBg.setFillStyle(0x33cc55));
      newBg.on("pointerout",   () => newBg.setFillStyle(0x22aa44));

      // ── CONTINUE ──────────────────────────────────────────────────────
      const contBg = this.add.rectangle(cx, 454, 280, 56, 0x1a8833).setInteractive();
      this.add.text(cx, 454, "CONTINUE", TS.menuPlayBtn).setOrigin(0.5);
      contBg.on("pointerdown", () => {
        const save = loadSave();
        this.scene.start("GameScene", save ?? {});
      });
      contBg.on("pointerover",  () => contBg.setFillStyle(0x2dbb55));
      contBg.on("pointerout",   () => contBg.setFillStyle(0x1a8833));

      // ── OPTIONS ───────────────────────────────────────────────────────
      const optBg = this.add.rectangle(cx, 530, 280, 48, 0x335544).setInteractive();
      this.add.text(cx, 530, "OPTIONS", TS.menuOptBtn).setOrigin(0.5);
      optBg.on("pointerdown", () => this.scene.start("OptionsScene"));
      optBg.on("pointerover",  () => optBg.setFillStyle(0x447766));
      optBg.on("pointerout",   () => optBg.setFillStyle(0x335544));

    } else {
      // ── NEW GAME ──────────────────────────────────────────────────────
      const newBg = this.add.rectangle(cx, 420, 280, 64, 0x22aa44).setInteractive();
      this.add.text(cx, 420, "NEW GAME", TS.menuPlayBtn).setOrigin(0.5);
      newBg.on("pointerdown", () => this.scene.start("GameScene", {}));
      newBg.on("pointerover",  () => newBg.setFillStyle(0x33cc55));
      newBg.on("pointerout",   () => newBg.setFillStyle(0x22aa44));

      // ── OPTIONS ───────────────────────────────────────────────────────
      const optBg = this.add.rectangle(cx, 510, 280, 56, 0x335544).setInteractive();
      this.add.text(cx, 510, "OPTIONS", TS.menuOptBtn).setOrigin(0.5);
      optBg.on("pointerdown", () => this.scene.start("OptionsScene"));
      optBg.on("pointerover",  () => optBg.setFillStyle(0x447766));
      optBg.on("pointerout",   () => optBg.setFillStyle(0x335544));
    }

    // ── 버전 ────────────────────────────────────────────────────────────
    this.add.text(GW - 20, GH - 12, "v0.1.0", TS.version).setOrigin(1, 1);
  }
}
