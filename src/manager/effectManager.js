export default class effectManager {
    constructor(scene) {
        this.scene = scene;
    }

    // ⚔️ 단일 공격 (slash 느낌)
    hitSlash(monster) {
        const { x, y } = monster;

        // 칼 궤적
        const g = this.scene.add.graphics()
            .setDepth(9999)
            .setBlendMode(Phaser.BlendModes.ADD);

        g.lineStyle(6, 0xffffff, 1);
        g.beginPath();
        g.moveTo(x - 40, y - 60);
        g.lineTo(x + 40, y + 60);
        g.strokePath();

        this.scene.tweens.add({
            targets: g,
            alpha: { from: 0, to: 1 },
            duration: 50,
            yoyo: true,
            hold: 50,
            onComplete: () => g.destroy()
        });

        // 피격 반응
        this._hitReaction(monster, 0xffaaaa);
        this.scene.cameras.main.shake(120, 0.01);
    }

    // ⚡ 번개 공격
    hitLightning(monster) {
        const { x, y } = monster;

        const g = this.scene.add.graphics()
            .setDepth(9999)
            .setBlendMode(Phaser.BlendModes.ADD);

        g.lineStyle(4, 0x99ccff, 1);

        let cx = x;
        let cy = y - 120;

        g.beginPath();
        g.moveTo(cx, cy);

        for (let i = 0; i < 6; i++) {
            cx += Phaser.Math.Between(-10, 10);
            cy += 25;
            g.lineTo(cx, cy);
        }

        g.strokePath();

        this.scene.tweens.add({
            targets: g,
            alpha: { from: 0, to: 1 },
            duration: 80,
            yoyo: true,
            repeat: 1,
            onComplete: () => g.destroy()
        });

        this.scene.cameras.main.flash(120, 200, 200, 255);

        this._hitReaction(monster, 0xaaaaff);
    }

    // 💣 폭발 (AOE)
    hitExplosion(centerX, centerY, monsters) {
        // 💥 폭발 코어
        const core = this.scene.add.circle(centerX, centerY, 20, 0xffaa00, 1)
            .setDepth(9999)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.scene.tweens.add({
            targets: core,
            scale: 4,
            alpha: 0,
            duration: 300,
            ease: 'Cubic.easeOut',
            onComplete: () => core.destroy()
        });

        // 🌊 충격파 링
        const ring = this.scene.add.circle(centerX, centerY, 10)
            .setStrokeStyle(4, 0xffffff)
            .setDepth(9999)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.scene.tweens.add({
            targets: ring,
            scale: 6,
            alpha: 0,
            duration: 400,
            ease: 'Expo.easeOut',
            onComplete: () => ring.destroy()
        });

        // ✨ 파편
        for (let i = 0; i < 8; i++) {
            const dot = this.scene.add.circle(centerX, centerY, 3, 0xffcc00)
                .setDepth(9999);

            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);

            this.scene.tweens.add({
                targets: dot,
                x: centerX + Math.cos(angle) * 80,
                y: centerY + Math.sin(angle) * 80,
                alpha: 0,
                duration: 400,
                onComplete: () => dot.destroy()
            });
        }

        // 📸 카메라 효과
        this.scene.cameras.main.shake(200, 0.02);
        this.scene.cameras.main.flash(150, 255, 200, 100);

        // 🧟 몬스터 반응
        monsters.forEach(monster => {
            const angle = Phaser.Math.Angle.Between(centerX, centerY, monster.x, monster.y);

            this.scene.tweens.add({
                targets: monster,
                x: monster.x + Math.cos(angle) * 30,
                y: monster.y + Math.sin(angle) * 30,
                duration: 150,
                yoyo: true,
                ease: 'Quad.easeOut'
            });

            this._hitReaction(monster, 0xff8844);
        });

        /*
        // 🛑 히트 스톱
        this.scene.time.delayedCall(0, () => {
          this.scene.scene.pause();
          this.scene.time.delayedCall(60, () => {
            this.scene.scene.resume();
          });
        });
        */
    }

    // 🔧 공통 피격 반응
    _hitReaction(monster, color) {
        try {
            monster.setTint(color);
        } catch(ex) {
            console.log(monster);
            //console.log(ex);
        }

        this.scene.tweens.add({
            targets: monster,
            scale: 1.1,
            duration: 80,
            yoyo: true
        });

        this.scene.time.delayedCall(120, () => {
            try {
                monster.clearTint();
            } catch(ex) {}
        });
    }
}