import Phaser from "phaser";

import { GW, GH } from "../constants.js";
import roundData from '../data/round.json';
import itemData from '../data/item.json';
import relicData from "../data/relic.json";
import debuffData from '../data/debuff.json';
import monsterJson from '../data/monsters.json';
import bossJson from '../data/boss.json';

export class PreloadScene extends Phaser.Scene {
  constructor() { super("PreloadScene"); }

  // ── preload ──────────────────────────────────────────────────────────────
  preload() {
    this.load.setBaseURL(import.meta.env.BASE_URL);

    const loadingText = this.add.text(GW / 2, GH / 2, 'Loading', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    const persentText = this.add.text(GW / 2, GH / 2 + 40, '0%', { fontSize: '20px', color: '#aaaaaa' }).setOrigin(0.5);

    let dots = 0;

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        dots = (dots + 1) % 4;
        loadingText.setText('Loading' + '.'.repeat(dots));
      }
    });

    this.load.on('progress', (value) => {
      persentText.setText(Math.floor(value * 100) + '%');
    });

    this.load.on('complete', () => {
      persentText.setText('Ready!');
    });

    //card back images
    this.load.image("card_back", "assets/images/ui/card_back.png");
    this.load.image("card_front_pixel", "assets/images/card_front_pixel.png");
    this.load.image("card_back_deck", "assets/images/ui/deck_rembg.png");
    this.load.image("card_back_dummy", "assets/images/ui/dummy_rembg.png");

    //background
    roundData.rounds.forEach(round => {
      if (round.bg && !this.textures.exists(`bg_${round.round}`))
        this.load.image(`bg_${round.round}`, `assets/images/bg/${round.bg}`);
    });


    //items images
    itemData.items.forEach(item => {
      if (item.img && !this.textures.exists(`item_${item.id}`))
        this.load.image(`item_${item.id}`, `assets/images/item/${item.img}`);
    });

    //relics images
    relicData.relics.forEach(r => {
      if (r.img && !this.textures.exists(`relic_${r.id}`))
        this.load.image(`relic_${r.id}`, `assets/images/relic/${r.img}`);
    });

    //debuffs images
    debuffData.debuffs.forEach(d => {
      if (d.img && !this.textures.exists(`relic_${d.id}`))
        this.load.image(`debuff_${d.id}`, `assets/images/debuff/${d.img}`);
    });

    //monster
    monsterJson.monsters.forEach(monster => {
      if (monster.img && !this.textures.exists(`mon_${monster.id}`)) {
        this.load.image(`mon_${monster.id}`, `assets/images/monster/${monster.img}`);
      }
      // sprite 스프라이트시트 preload 일단 제외
      // Object.entries(monster.sprite ?? {}).forEach(([action, fileName]) => {
      //   const key = `${monster.id}_${action}`;
      //   this.load.spritesheet(key, `assets/images/monster/${fileName}`, {
      //     frameWidth: 384, frameHeight: 384
      //   });
      // });
    });

    //boss
    bossJson.bosses.forEach(boss => {
      if (boss.img && !this.textures.exists(`mon_${boss.id}`)) {
        this.load.image(`mon_${boss.id}`, `assets/images/monster/${boss.img}`);
      }
      // sprite 스프라이트시트 preload 일단 제외
      // Object.entries(boss.sprite ?? {}).forEach(([action, fileName]) => {
      //   const key = `${boss.id}_${action}`;
      //   if (!this.textures.exists(key))
      //     this.load.spritesheet(key, `assets/images/monster/${fileName}`, {
      //       frameWidth: 384, frameHeight: 384
      //     });
      // });
    });

    //sfx
    this.load.audio("sfx_shuffle", "assets/audio/sfx/card-shuffle.ogg");
    this.load.audio("sfx_fan", "assets/audio/sfx/card-fan-1.ogg");
    this.load.audio("sfx_slide", "assets/audio/sfx/card-slide-5.ogg");
    this.load.audio("sfx_place", "assets/audio/sfx/card-place-1.ogg");
    this.load.audio("sfx_chop", "assets/audio/sfx/chop.ogg");
    this.load.audio("sfx_knifeSlice", "assets/audio/sfx/knifeSlice.ogg");
    this.load.audio("sfx_orb", "assets/audio/sfx/monster_orb.wav");
    this.load.audio("sfx_lightning", "assets/audio/sfx/sfx_lightning.wav");
    this.load.audio("sfx_explosion", "assets/audio/sfx/sfx_explosion.wav");

    this.load.image("ui_deck", "assets/images/ui/deck.png");
    this.load.image("ui_dummy", "assets/images/ui/dummy.png");
    this.load.image("ui_option", "assets/images/ui/btn_gear_pixel.png");
    this.load.image("ui_btn_long", "assets/images/ui/btn_long_pixel.png");
    this.load.image("ui_btn_iron", "assets/images/ui/btn_iron.png");
    this.load.image("ui_frame", "assets/images/ui/panel_frame_pixel.png");
    this.load.image("ui_panel_parchment", "assets/images/ui/parchment_v.png");
    this.load.image("ui_panel_stone", "assets/images/ui/panel_stone.png");
    this.load.image("ui_divider_iron", "assets/images/ui/divider_iron.png");
    this.load.image("ui_card_front", "assets/images/ui/card_front.png");
    this.load.image("ui_panel_item", "assets/images/ui/itemUi.png");
    this.load.image("ui_field_hand", "assets/images/ui/field_hand.png");
    this.load.image("ui_hp_bar", "assets/images/ui/hp_bar.png");
    this.load.image("ui_sword", "assets/images/ui/sword.png");
    this.load.image("ui_shield", "assets/images/ui/shield.png");
    this.load.spritesheet("ui_fireball", "assets/images/ui/fireball_frame.png", { frameWidth: 325, frameHeight: 358 });


    // 임시 몬스터 샘플 이미지 (tween 애니메이션용)
    this.load.image('mon_sample', 'assets/images/monster/mon_sample.png');

    //this.load.images();
  }

  create() {
    // sprite animation 등록 일단 제외
    // monsterJson.monsters.forEach(monster => {
    //   Object.keys(monster.sprite ?? {}).forEach(action => {
    //     const key = `${monster.id}_${action}`;
    //     if (this.anims.exists(key)) return;
    //     const validFrames = this._countValidFrames(this.textures, key);
    //     this.anims.create({
    //       key,
    //       frames: this.anims.generateFrameNumbers(key, { start: 0, end: validFrames - 1 }),
    //       frameRate: 6,
    //       repeat: action === 'idle' ? -1 : 0
    //     });
    //   });
    // });


    // 보스 애니메이션 등록 일단 제외
    // bossJson.bosses.forEach(boss => {
    //   Object.keys(boss.sprite ?? {}).forEach(action => {
    //     const key = `${boss.id}_${action}`;
    //     if (this.anims.exists(key)) return;
    //     const validFrames = this._countValidFrames(this.textures, key);
    //     this.anims.create({
    //       key,
    //       frames: this.anims.generateFrameNumbers(key, { start: 0, end: validFrames - 1 }),
    //       frameRate: 6,
    //       repeat: action === 'idle' ? -1 : 0
    //     });
    //   });
    // });

    const data = this.scene.settings.data || {};
    this.time.delayedCall(500, () => {
      this.scene.start("GameScene", data);
    });
  }

  // ── 스프라이트시트 유효 프레임 수 감지 ─────────────────────────────────────
  _countValidFrames(textures, texKey) {

    const tex = textures.get(texKey);
    const total = tex.frameTotal - 1;
    const srcImg = tex.getSourceImage();
    const FW = 384, FH = 384, COLS = 3;

    const cvs = document.createElement('canvas');
    cvs.width = FW; cvs.height = FH;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < total; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      ctx.clearRect(0, 0, FW, FH);
      ctx.drawImage(srcImg, col * FW, row * FH, FW, FH, 0, 0, FW, FH);
      const data = ctx.getImageData(0, 0, FW, FH).data;
      const step = Math.floor(FW / 10);
      let hasPixel = false;
      outer: for (let py = step >> 1; py < FH; py += step) {
        for (let px = step >> 1; px < FW; px += step) {
          if (data[(py * FW + px) * 4 + 3] > 10) { hasPixel = true; break outer; }
        }
      }
      if (!hasPixel) return i;
    }
    return total;
  }

}
