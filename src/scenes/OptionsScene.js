import Phaser from "phaser";
import { GW, GH } from "../constants.js";
import { TS } from "../textStyles.js";

const PANEL_W = 560;
const PANEL_H = 460;
const PANEL_X = GW / 2 - PANEL_W / 2;
const PANEL_Y = 160;

export class OptionsScene extends Phaser.Scene {
  constructor() { super("OptionsScene"); }

  create() {
    if (this.registry.get("volume") == null) this.registry.set("volume", 7);
    if (this.registry.get("lang")   == null) this.registry.set("lang",   "ko");

    this._volume = this.registry.get("volume");
    this._lang   = this.registry.get("lang");

    this._drawBg();
    this._createVolumeRow();
    this._createLangRow();
    this._createBackButton();
  }

  _drawBg() {
    const g = this.add.graphics();
    g.fillStyle(0x0d2b18);
    g.fillRect(0, 0, GW, GH);
    g.fillStyle(0x1a472a);
    g.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);
    g.lineStyle(2, 0x2d7a3a);
    g.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);

    this.add.text(GW / 2, PANEL_Y + 52, "OPTIONS", TS.optTitle).setOrigin(0.5);
  }

  _createVolumeRow() {
    const rowY = PANEL_Y + 160;
    this.add.text(GW / 2, rowY - 40, "VOLUME", TS.optLabel).setOrigin(0.5);

    const minusBg = this.add.rectangle(GW / 2 - 90, rowY, 50, 50, 0x335544).setInteractive();
    this.add.text(GW / 2 - 90, rowY, "-", TS.optBtn).setOrigin(0.5);

    this._volTxt = this.add.text(GW / 2, rowY, String(this._volume), TS.optValue).setOrigin(0.5);

    const plusBg = this.add.rectangle(GW / 2 + 90, rowY, 50, 50, 0x335544).setInteractive();
    this.add.text(GW / 2 + 90, rowY, "+", TS.optBtn).setOrigin(0.5);

    this._volBarBg = this.add.rectangle(GW / 2, rowY + 40, 200, 8, 0x224433);
    this._volBar   = this.add.rectangle(GW / 2 - 100, rowY + 40, this._volume * 20, 8, 0x44dd88).setOrigin(0, 0.5);
    this._updateVolBar();

    minusBg.on("pointerdown", () => this._changeVolume(-1));
    plusBg.on("pointerdown",  () => this._changeVolume(+1));
    minusBg.on("pointerover", () => minusBg.setFillStyle(0x447766));
    minusBg.on("pointerout",  () => minusBg.setFillStyle(0x335544));
    plusBg.on("pointerover",  () => plusBg.setFillStyle(0x447766));
    plusBg.on("pointerout",   () => plusBg.setFillStyle(0x335544));
  }

  _changeVolume(delta) {
    this._volume = Phaser.Math.Clamp(this._volume + delta, 0, 10);
    this.registry.set("volume", this._volume);
    this.sound.volume = this._volume / 10;
    this._volTxt.setText(String(this._volume));
    this._updateVolBar();
  }

  _updateVolBar() {
    this._volBar.setDisplaySize(Math.max(this._volume * 20, 1), 8);
  }

  _createLangRow() {
    const rowY = PANEL_Y + 300;
    this.add.text(GW / 2, rowY - 40, "LANGUAGE", TS.optLabel).setOrigin(0.5);

    this._koBg = this.add.rectangle(GW / 2 - 70, rowY, 120, 50, 0x335544).setInteractive();
    this._koTxt = this.add.text(GW / 2 - 70, rowY, "한국어", TS.optLangBtn).setOrigin(0.5);

    this._enBg = this.add.rectangle(GW / 2 + 70, rowY, 120, 50, 0x335544).setInteractive();
    this._enTxt = this.add.text(GW / 2 + 70, rowY, "English", TS.optLangBtn).setOrigin(0.5);

    this._refreshLangBtns();

    this._koBg.on("pointerdown", () => this._setLang("ko"));
    this._enBg.on("pointerdown", () => this._setLang("en"));
    this._koBg.on("pointerover", () => { if (this._lang !== "ko") this._koBg.setFillStyle(0x447766); });
    this._koBg.on("pointerout",  () => this._refreshLangBtns());
    this._enBg.on("pointerover", () => { if (this._lang !== "en") this._enBg.setFillStyle(0x447766); });
    this._enBg.on("pointerout",  () => this._refreshLangBtns());
  }

  _setLang(lang) {
    this._lang = lang;
    this.registry.set("lang", lang);
    this._refreshLangBtns();
  }

  _refreshLangBtns() {
    this._koBg.setFillStyle(this._lang === "ko" ? 0x227744 : 0x335544);
    this._enBg.setFillStyle(this._lang === "en" ? 0x227744 : 0x335544);
  }

  _createBackButton() {
    const backBg = this.add.rectangle(GW / 2, PANEL_Y + PANEL_H - 48, 200, 54, 0x1e4e99).setInteractive();
    this.add.text(GW / 2, PANEL_Y + PANEL_H - 48, "BACK", TS.optBackBtn).setOrigin(0.5);
    backBg.on("pointerdown", () => this.scene.start("MainMenuScene"));
    backBg.on("pointerover",  () => backBg.setFillStyle(0x2d66cc));
    backBg.on("pointerout",   () => backBg.setFillStyle(0x1e4e99));
  }
}
