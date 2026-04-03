import { GW, MONSTER_AREA_TOP, MONSTER_AREA_H, PLAYER_PANEL_W, ITEM_PANEL_W } from '../constants.js';

const BAR_Y  = MONSTER_AREA_TOP + MONSTER_AREA_H + 6;  // 몬스터 영역 바로 아래
const BAR_H  = 18;
const BAR_W  = GW - PLAYER_PANEL_W - ITEM_PANEL_W - 40; // 필드 폭 -여백
const BAR_X  = PLAYER_PANEL_W + 20;

export class BossHPBarUI {
  constructor(scene, boss) {
    this.scene = scene;
    this.boss  = boss;

    const g = scene.add.graphics().setDepth(20);
    g.fillStyle(0x1a0000, 1);
    g.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 4);
    this._bg = g;

    // 채움 바
    this._fill = scene.add.graphics().setDepth(21);

    // 페이즈 구분선 & 레이블
    this._phaseObjs = [];
    this._drawPhaseMarkers(boss);

    // HP 텍스트
    this._hpText = scene.add.text(BAR_X + BAR_W / 2, BAR_Y + BAR_H / 2, '',
      { fontFamily: "'PressStart2P',Arial", fontSize: '8px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(23);

    // 보스 이름
    this._nameText = scene.add.text(BAR_X, BAR_Y - 14, boss.name,
      { fontFamily: "'PressStart2P',Arial", fontSize: '9px', color: '#ff8888', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0, 1)
      .setDepth(23);

    // 페이즈 레이블
    this._phaseLabel = scene.add.text(BAR_X + BAR_W, BAR_Y - 14, '',
      { fontFamily: "'PressStart2P',Arial", fontSize: '8px', color: '#ffcc44', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(1, 1)
      .setDepth(23);

    this.update(boss, null);
  }

  _drawPhaseMarkers(boss) {
    this._phaseObjs.forEach(o => o.destroy());
    this._phaseObjs = [];

    const phases = [...boss.phases].sort((a, b) => b.hpThreshold - a.hpThreshold);

    phases.forEach(p => {
      if (p.hpThreshold <= 0 || p.hpThreshold >= 1) return;
      const mx = BAR_X + BAR_W * p.hpThreshold;

      const line = this.scene.add.graphics().setDepth(22);
      line.fillStyle(0xffcc44, 0.9);
      line.fillRect(mx - 1, BAR_Y, 2, BAR_H);
      this._phaseObjs.push(line);
    });
  }

  update(boss, bossManager) {
    const ratio = Math.max(0, boss.hp / boss.maxHp);

    // 색상: 빨강 → 주황 → 녹색
    const color =
      ratio > 0.5 ? 0xcc2222 :
      ratio > 0.25 ? 0xdd6611 :
      0xaa1111;

    this._fill.clear();
    this._fill.fillStyle(color, 1);
    this._fill.fillRoundedRect(BAR_X, BAR_Y, Math.max(4, BAR_W * ratio), BAR_H, 4);

    this._hpText.setText(`${boss.hp} / ${boss.maxHp}`);

    if (bossManager) {
      const phase = bossManager.getCurrentPhase(boss);
      this._phaseLabel.setText(phase?.label ?? '');
    }
  }

  destroy() {
    [this._bg, this._fill, this._hpText, this._nameText, this._phaseLabel]
      .forEach(o => o?.destroy());
    this._phaseObjs.forEach(o => o.destroy());
  }
}
