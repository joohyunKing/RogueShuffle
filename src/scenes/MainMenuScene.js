import Phaser from "phaser";
import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";
import { hasSave, loadSave, deleteSave } from "../save.js";
import { loadOptions } from "../manager/optionManager.js";

export class MainMenuScene extends Phaser.Scene {
  constructor() { super("MainMenuScene"); }

  preload() {
    //ui
    this.load.image("logo_bg", "assets/images/ui/logo_bg.png");
    this.load.image("logo_new", "assets/images/ui/logo_new.png");
    this.load.image("logo_continue", "assets/images/ui/logo_continue.png");
    this.load.image("logo_options", "assets/images/ui/logo_options.png");

  }

  create() {
    this._checkOption();
    this._drawBg();
    this._drawTitle();
    this._createButtons();
  }

  _checkOption() {
    const options = loadOptions();
    this.registry.set("bgmVolume", options.bgmVolume);
    this.registry.set("sfxVolume", options.sfxVolume);
    this.registry.set("lang", options.lang);
  }

  _drawBg() {
    this.add.image(GW / 2, GH / 2, "logo_bg")
      .setDisplaySize(GW, GH).setDepth(-1);
  }

  _drawTitle() {
    // 배경 이미지에 타이틀이 포함되어 있을 경우를 위해 텍스트는 임시 주석 처리하거나 제거 가능
    // this.add.text(GW / 2, 210, "ROGUE SHUFFLE", TS.menuTitle).setOrigin(0.5);
    // this.add.text(GW / 2, 300, "트럼프 카드 로그라이크 게임", TS.menuSub).setOrigin(0.5);
  }
  _createButtons() {
    const cx = GW / 2;
    const saveExists = hasSave();

    let newBg, contBg, optBg;  // const 대신 let으로 변경

    if (saveExists) {
      // ── NEW GAME ──────────────────────────────────────────────────────
      newBg = this.add.image(cx, 410, "logo_new").setDisplaySize(280, 60).setInteractive();

      // ── CONTINUE ──────────────────────────────────────────────────────
      contBg = this.add.image(cx, 480, "logo_continue").setDisplaySize(280, 60).setInteractive();

      // ── OPTIONS ───────────────────────────────────────────────────────
      optBg = this.add.image(cx, 550, "logo_options").setDisplaySize(280, 60).setInteractive();
    } else {
      // ── NEW GAME ──────────────────────────────────────────────────────
      newBg = this.add.image(cx, 430, "logo_new").setDisplaySize(280, 65).setInteractive();

      // ── OPTIONS ───────────────────────────────────────────────────────
      optBg = this.add.image(cx, 510, "logo_options").setDisplaySize(280, 60).setInteractive();
    }

    // ── New event ───────────────────────────────────────────────────────
    newBg.on("pointerdown", () => { deleteSave(); this.scene.start("PreloadScene", {}); });
    newBg.on("pointerover", () => newBg.setTint(0xcccccc));
    newBg.on("pointerout", () => newBg.clearTint());

    // ── Continue event ───────────────────────────────────────────────────────
    if (contBg) {  // saveExists가 false일 때 선언되지 않음
      contBg.on("pointerdown", () => {
        const save = loadSave();
        if (!save) { this.scene.start("PreloadScene", {}); return; }

        this.scene.start("PreloadScene", save);
      });
      contBg.on("pointerover", () => contBg.setTint(0xcccccc));
      contBg.on("pointerout", () => contBg.clearTint());
    }

    // ── OPTIONS event ───────────────────────────────────────────────────────
    optBg.on("pointerdown", () => this.scene.start("OptionsScene"));
    optBg.on("pointerover", () => optBg.setTint(0xcccccc));
    optBg.on("pointerout", () => optBg.clearTint());

    // ── 버전 ────────────────────────────────────────────────────────────
    this.add.text(GW - 20, GH - 12, "v0.1.1", TS.version).setOrigin(1, 1);
  }

}
