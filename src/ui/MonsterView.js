import { TS } from "../textStyles.js";

export default class MonsterView {
  constructor(scene, mon, idx, x, y, onClick, imgScale = 1.0) {
    this.scene = scene;
    this.mon = mon;
    this.idx = idx;
    this.onClick = onClick;

    const imgW = Math.round(156 * imgScale);
    const imgH = Math.round(156 * imgScale);

    // ── 위치 기준 계산
    const MON_BOTTOM = 400; // battleScene 값 그대로 쓰거나 외부에서 넘겨도 좋음
    const BAR_H = 14;
    const STAT_H = 16;

    this.barY = MON_BOTTOM - STAT_H - 6 - BAR_H / 2;
    this.statY = MON_BOTTOM - STAT_H / 2;
    this.spriteY = this.barY - BAR_H / 2 - 8 - imgH / 2;

    this.imgW = imgW;
    this.imgH = imgH;
    this.BAR_H = BAR_H;

    // ── sprite
    this.sprite = scene.add.sprite(x, this.spriteY, `${mon.id}_idle`)
      .setDisplaySize(imgW, imgH)
      .setDepth(15);

    const idleKey = `${mon.id}_idle`;
    if (scene.anims.exists(idleKey)) {
      this.sprite.play(idleKey);
    }

    // ── HP 바 (Ornate Frame)
    const frameW = 110;
    const frameH = 28;
    this.barW = 84; 

    this.hpBarBg = scene.add.image(x, this.barY, "ui_hp_bar")
      .setDisplaySize(frameW, frameH)
      .setDepth(16);

    this.hpBar = scene.add.rectangle(x - this.barW / 2, this.barY, this.barW, 10, 0x44cc44)
      .setOrigin(0, 0.5)
      .setDepth(17);

    this.hpText = scene.add.text(x, this.barY, '', TS.monHpText)
      .setOrigin(0.5)
      .setDepth(18);

    // ── ATK / DEF
    this.atkIcon = scene.add.image(x - 30, this.statY, "ui_sword")
      .setDisplaySize(5, 14)
      .setDepth(16);

    this.atkText = scene.add.text(x - 26, this.statY, '',
      { ...TS.monStatNum, color: '#ffaaaa' })
      .setOrigin(0, 0.5)
      .setDepth(17);

    this.defIcon = scene.add.image(x + 6, this.statY, "ui_shield")
      .setDisplaySize(12, 12)
      .setDepth(16);

    this.defText = scene.add.text(x + 14, this.statY, '',
      { ...TS.monStatNum, color: '#aaaaff' })
      .setOrigin(0, 0.5)
      .setDepth(17);

    // ── ATTACK 표시
    this.attackText = scene.add.text(x, this.spriteY - imgH / 2 - 10, "ATTACK!", TS.monTarget)
      .setOrigin(0.5, 1)
      .setDepth(18)
      .setVisible(false);

    // ── 히트 영역
    const hitH = MON_BOTTOM - (this.spriteY - imgH / 2) + 10;
    const hitCY = this.spriteY - imgH / 2 + hitH / 2;

    this.hitArea = scene.add.rectangle(x, hitCY, imgW + 20, hitH, 0x000000, 0)
      .setDepth(19)
      .setInteractive();

    this.hitArea.on("pointerdown", () => {
      if (this.onClick) this.onClick(this.idx);
    });
  }

  update(mon, x, canBeTarget = false) {
    this.mon = mon;

    // ── 애니메이션 상태 전환
    const state = mon.isDead ? 'die' : (mon.state ?? 'idle');
    const animKey = `${mon.id}_${state}`;
    if (this.scene.anims.exists(animKey) && this.sprite.anims.currentAnim?.key !== animKey) {
      this.sprite.play(animKey);
    }

    // ── 위치 업데이트
    this.sprite.setX(x);
    this.hpBarBg.setX(x);
    this.hpBar.setX(x - this.barW / 2);
    this.hpText.setX(x);

    this.atkIcon.setX(x - 30);
    this.atkText.setX(x - 26);
    this.defIcon.setX(x + 6);
    this.defText.setX(x + 14);

    this.attackText.setX(x);
    this.hitArea.setX(x);

    // ── HP
    const hpRatio = Math.max(0, mon.hp / mon.maxHp);
    const hpColor =
      hpRatio > 0.5 ? 0x44cc44 :
      hpRatio > 0.25 ? 0xddaa00 :
      0xdd3333;

    this.hpBar.width = Math.max(1, this.barW * hpRatio);
    this.hpBar.fillColor = hpColor;

    this.hpText.setText(`${mon.hp}/${mon.maxHp}`);

    // ── ATK / DEF
    this.atkText.setText(mon.atk);
    this.defText.setText(mon.def);

    // ── ATTACK 표시
    if (canBeTarget) {
      this.attackText.setVisible(true);
      this.hitArea.setInteractive();
    } else {
      this.attackText.setVisible(false);
      this.hitArea.disableInteractive();
    }
  }

  // HP바 · ATK · DEF 수치만 갱신 (애니메이션 불간섭)
  updateStats(mon) {
    const hpRatio = Math.max(0, mon.hp / mon.maxHp);
    const hpColor =
      hpRatio > 0.5 ? 0x44cc44 :
      hpRatio > 0.25 ? 0xddaa00 :
      0xdd3333;
    this.hpBar.width = Math.max(1, this.barW * hpRatio);
    this.hpBar.fillColor = hpColor;
    this.hpText.setText(`${mon.hp}/${mon.maxHp}`);
    this.atkText.setText(mon.atk);
    this.defText.setText(mon.def);
  }

  hideStats() {
    [this.atkIcon, this.atkText, this.defIcon, this.defText].forEach(o => o?.setVisible(false));
  }

  hideHPBar() {
    [this.hpBarBg, this.hpBar, this.hpText].forEach(o => o?.setVisible(false));
  }

  destroy() {
    [
      this.sprite,
      this.hpBarBg, this.hpBar, this.hpText,
      this.atkIcon, this.atkText,
      this.defIcon, this.defText,
      this.attackText,
      this.hitArea
    ].forEach(obj => obj.destroy());
  }
}