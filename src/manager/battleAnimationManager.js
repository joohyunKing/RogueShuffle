import { 
  GW, GH, CW, CH, FIELD_CW, FIELD_CH, 
  PLAYER_PANEL_W, ITEM_PANEL_W, 
  FIELD_Y, HAND_Y, DEAL_DELAY, ANIM_SPEED 
} from "../constants.js";

/**
 * BattleAnimationManager - 전투 중의 복잡한 애니메이션을 담당
 */
export class BattleAnimationManager {
  constructor(scene) {
    this.scene = scene;
    this.animObjs = [];
    this._isAnimatingDraw = false;
  }

  /**
   * 덱 비주얼 스택 생성
   */
  createDeckStack() {
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    for (let i = Math.min(8, 51); i >= 0; i--) {
      this.animObjs.push(
        this.scene.add.image(deckX - i * 2, deckY - i * 2, "card_back")
          .setDisplaySize(FIELD_CW, FIELD_CH).setDepth(i)
      );
    }
  }

  /**
   * 카드를 특정 위치로 날려 보내는 기본 애니메이션
   */
  flyCard(cardData, fromX, fromY, toX, toY, options = {}) {
    let cardWidth = (toY === FIELD_Y) ? FIELD_CW : CW;
    let cardHeight = (toY === FIELD_Y) ? FIELD_CH : CH;

    // 약간 축소된 크기로 시작
    cardWidth = cardWidth * 0.85;
    cardHeight = cardHeight * 0.85;

    const img = this.scene.add.image(fromX, fromY, "card_back")
      .setDisplaySize(cardWidth, cardHeight).setDepth(200);
    this.animObjs.push(img);

    this.scene.tweens.add({
      targets: img, x: toX, y: toY, duration: 320, ease: "Power2.Out",
      onComplete: () => {
        this.scene.tweens.add({
          targets: img, displayWidth: 1, duration: 70, ease: "Linear",
          onComplete: () => {
            img.setTexture(cardData.key);
            img.setDisplaySize(1, cardHeight);
            this.scene.tweens.add({ 
              targets: img, displayWidth: cardWidth, duration: 70, ease: "Linear",
              onComplete: () => options.onComplete?.(img)
            });
          },
        });
      },
    });
  }

  /**
   * 핸드로 카드 배분
   */
  dealToHand(startDelay, handData) {
    const handPos = this.scene.calcHandPositions(handData.length);
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let delay = startDelay;

    handData.forEach((card, i) => {
      this.scene.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, handPos[i].x, handPos[i].y));
      delay += DEAL_DELAY;
    });
    return delay;
  }

  /**
   * 필드로 카드 배분
   */
  dealToField(startDelay, fieldData) {
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let delay = startDelay;

    fieldData.forEach(card => {
      this.scene.time.delayedCall(delay, () => this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y));
      delay += DEAL_DELAY;
    });
    return delay;
  }

  /**
   * 초기 배분 애니메이션 통합
   */
  startDealAnimation(handData, fieldData, onComplete) {
    this.scene._sfx("sfx_shuffle");
    this.createDeckStack();

    let delay = 300;
    delay = this.dealToHand(delay, handData);
    delay = this.dealToField(delay, fieldData);

    this.scene.time.delayedCall(delay + 550, () => {
      this.clearAnimObjs();
      onComplete?.();
    });
  }

  /**
   * 공격 애니메이션 (점수 카운팅 + orb)
   */
  playAttackAnimation(details, cardFlyInfo, onCardsConsumed, onComplete) {
    const PW = PLAYER_PANEL_W;
    const FAW = GW - PW - ITEM_PANEL_W;
    const cX = PW + FAW / 2;
    const scoreY = 80 + 14; // MONSTER_AREA_TOP = 80

    const tmpObjs = [];
    let currentBase = 0;
    let currentMulti = 0;
    let currentTimes = 1;
    let isMerged = false;
    let currentScore = 0;

    const getScoreStr = () => {
      if (isMerged) return String(Math.floor(currentScore));
      return `${Math.floor(currentBase)} X ${parseFloat(currentMulti.toFixed(1))}`;
    };

    const scoreTxt = this.scene.add.text(cX, scoreY, getScoreStr(), {
      fontFamily: "'PressStart2P', Arial",
      fontSize: '30px', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(400);
    tmpObjs.push(scoreTxt);

    const orbTargetX = cX;
    const orbTargetY = scoreY + 15;

    const throwOrb = (fromX, fromY, color) => {
      const orb = this.scene.add.circle(fromX, fromY, 10, color, 1.0).setDepth(420);
      const glow = this.scene.add.circle(fromX, fromY, 18, color, 0.35).setDepth(419);
      tmpObjs.push(orb, glow);

      const cpX = (fromX + orbTargetX) / 2;
      const cpY = Math.min(fromY, orbTargetY) - 60;
      const t = { v: 0 };

      this.scene.tweens.add({
        targets: t, v: 1, duration: ANIM_SPEED.orbFlight, ease: 'Sine.easeIn',
        onUpdate: () => {
          const s = t.v, r = 1 - s;
          const x = r * r * fromX + 2 * r * s * cpX + s * s * orbTargetX;
          const y = r * r * fromY + 2 * r * s * cpY + s * s * orbTargetY;
          orb.setPosition(x, y);
          glow.setPosition(x, y);
        },
        onComplete: () => {
          this.scene.tweens.add({
            targets: [orb, glow],
            scaleX: 3.5, scaleY: 3.5, alpha: 0,
            duration: ANIM_SPEED.orbFade, ease: 'Sine.easeOut',
          });
        },
      });
    };

    const getCountUpTweenObj = () => {
      this.scene._sfx("sfx_orb");
      this.scene.tweens.killTweensOf(scoreTxt);
      scoreTxt.y = scoreY;
      this.scene.tweens.add({
        targets: scoreTxt, y: scoreY - 12,
        duration: 56, // 140 * 0.4
        yoyo: true, ease: 'Sine.easeOut',
      });
      return { base: currentBase, multi: currentMulti, score: currentScore };
    };

    const countUpBase = (targetBase, duration, onDone) => {
      const tweenObj = getCountUpTweenObj();
      this.scene.tweens.add({
        targets: tweenObj, base: targetBase, duration, ease: 'Circular.In',
        onUpdate: () => { currentBase = tweenObj.base; scoreTxt.setText(getScoreStr()); },
        onComplete: () => { currentBase = targetBase; scoreTxt.setText(getScoreStr()); onDone?.(); },
      });
    };

    const countUpMulti = (targetMulti, duration, onDone) => {
      const tweenObj = getCountUpTweenObj();
      this.scene.tweens.add({
        targets: tweenObj, multi: targetMulti, duration, ease: 'Circular.In',
        onUpdate: () => { currentMulti = tweenObj.multi; scoreTxt.setText(getScoreStr()); },
        onComplete: () => { currentMulti = targetMulti; scoreTxt.setText(getScoreStr()); onDone?.(); },
      });
    };

    const countUpScore = (targetScore, duration, onDone) => {
      const tweenObj = getCountUpTweenObj();
      this.scene.tweens.add({
        targets: tweenObj, score: targetScore, duration, ease: 'Circular.In',
        onUpdate: () => { currentScore = tweenObj.score; scoreTxt.setText(getScoreStr()); },
        onComplete: () => { currentScore = targetScore; scoreTxt.setText(getScoreStr()); onDone?.(); },
      });
    };

    const relicPos = (relicId) => {
      const r = this.scene.itemUI?._relicObjs?.[relicId];
      return r ? { x: r.baseCX, y: r.baseCY } : { x: GW - ITEM_PANEL_W / 2, y: 200 };
    };

    const queue = [];

    // 1. Hand Rank Multi
    queue.push(next => {
      this.scene.playerUI?.pulseHandRow(details.handRank);
      if (details.baseHandMulti > 0) {
        const rankRow = this.scene.playerUI?._handConfigRows?.[details.handRank];
        throwOrb(rankRow?.multiTxt?.x ?? PW / 2, rankRow?.multiTxt?.y ?? 400, 0x44eeff);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpMulti(details.baseHandMulti, ANIM_SPEED.countUp, next));
      } else {
        next();
      }
    });

    // 2. ATK Base
    if (details.atk > 0) {
      queue.push(next => {
        this.scene.playerUI?.pulseAtk();
        const atkText = this.scene.playerUI?.playerAtkTxt;
        throwOrb(atkText ? atkText.x : PW * 0.75, atkText ? atkText.y : 168, 0xff8833);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpBase(currentBase + details.atk, ANIM_SPEED.countUp, next));
      });
    }

    const pulseCard = (obj) => {
      if (!obj?.active) return;
      this.scene.tweens.killTweensOf(obj);
      const bx = obj.scaleX, by = obj.scaleY;
      this.scene.tweens.add({
        targets: obj, scaleX: bx * 1.1, scaleY: by * 1.1,
        duration: ANIM_SPEED.pulseCard, yoyo: true, ease: 'Sine.easeInOut',
        onComplete: () => { try { obj.setScale(bx, by); } catch (_) { } },
      });
    };

    // 3. Cards Base + Plus Multi
    cardFlyInfo.forEach((info) => {
      if (info.scoringDetail) {
        const cd = info.scoringDetail;
        queue.push(next => {
          pulseCard(info.obj);
          throwOrb(info.fromX, info.fromY, 0xffdd44);
          this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpBase(currentBase + cd.deltaBase, ANIM_SPEED.countUp, next));
        });

        cd.cardRelicDeltas.forEach(({ relicId, type, delta }) => {
          queue.push(next => {
            this.scene.itemUI?.pulseRelic(relicId);
            const rp = relicPos(relicId);
            const isBase = type === 'base';
            throwOrb(rp.x, rp.y, isBase ? 0xcc88ff : 0x44eeff);
            this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
              if (isBase) countUpBase(currentBase + delta, ANIM_SPEED.countUp, next);
              else countUpMulti(currentMulti + delta, ANIM_SPEED.countUp, next);
            });
          });
        });
      } else {
        queue.push(next => { pulseCard(info.obj); next(); });
      }
    });

    if (cardFlyInfo.length > 0) {
      queue.push(next => { onCardsConsumed?.(); next(); });
    }

    // 4. Hand Relic DB (base + plus_multi)
    details.handRelicDeltas.forEach(({ relicId, type, delta }) => {
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        const isBase = type === 'base';
        throwOrb(rp.x, rp.y, isBase ? 0xcc88ff : 0x44eeff);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          if (isBase) countUpBase(currentBase + delta, ANIM_SPEED.countUp, next);
          else countUpMulti(currentMulti + delta, ANIM_SPEED.countUp, next);
        });
      });
    });

    // 5. Final Relic Base
    details.finalRelicDeltas.forEach(({ relicId, type, delta }) => {
      if (type !== 'base') return;
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        throwOrb(rp.x, rp.y, 0xee66ff);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => countUpBase(currentBase + delta, ANIM_SPEED.countUp, next));
      });
    });

    // 6. MERGE Base X Multi
    queue.push(next => {
      isMerged = true;
      currentScore = currentBase * currentMulti;
      scoreTxt.setText(getScoreStr());
      
      this.scene._sfx("sfx_chop");
      this.scene.tweens.add({
        targets: scoreTxt, scaleX: { from: 1, to: 1.5 }, scaleY: { from: 1, to: 1.5 },
        duration: ANIM_SPEED.mergeScale, yoyo: true, ease: 'Back.easeOut',
      });
      this.scene.time.delayedCall(ANIM_SPEED.mergeDelay, next);
    });

    // 7. Final Relic Times Multi
    details.finalRelicDeltas.forEach(({ relicId, type, delta }) => {
      if (type !== 'times_multi') return;
      queue.push(next => {
        this.scene.itemUI?.pulseRelic(relicId);
        const rp = relicPos(relicId);
        throwOrb(rp.x, rp.y, 0xff0044);
        this.scene.time.delayedCall(ANIM_SPEED.queueDelay, () => {
          currentTimes += delta;
          const targetScore = currentBase * currentMulti * currentTimes;
          countUpScore(targetScore, ANIM_SPEED.countUp, next);
        });
      });
    });

    // 8. End
    queue.push(next => {
      this.scene._sfx("sfx_chop");
      this.scene.tweens.add({
        targets: scoreTxt, scaleX: { from: 1, to: 1.45 }, scaleY: { from: 1, to: 1.45 },
        duration: ANIM_SPEED.mergeScale * 0.7, yoyo: true, ease: 'Back.easeOut',
      });
      this.scene.time.delayedCall(ANIM_SPEED.mergeDelay, next);
    });

    queue.push(next => {
      this.scene.tweens.add({
        targets: tmpObjs, alpha: 0, duration: 180,
        onComplete: () => {
          tmpObjs.forEach(o => { try { o?.destroy(); } catch (_) { } });
          tmpObjs.length = 0;
          next();
        },
      });
    });

    const runNext = () => {
      if (queue.length === 0) { onComplete?.(); return; }
      queue.shift()(runNext);
    };
    runNext();
  }

  animateDraw(cards, handData, onComplete) {
    if (!cards?.length) { onComplete?.(); return; }
    const deckX  = PLAYER_PANEL_W + 50;
    const deckY  = FIELD_Y;
    const baseLen = handData.length;
    const allPos  = this.scene.calcHandPositions(baseLen + cards.length);

    let delay    = 0;
    let completed = 0;

    cards.forEach((card, ci) => {
      const pos = allPos[baseLen + ci];
      this.scene.time.delayedCall(delay, () => {
        this.scene._sfx('sfx_slide');
        this.flyCard(card, deckX, deckY, pos?.x ?? GW / 2, HAND_Y, {
            onComplete: (img) => {
                img.destroy();
                handData.push(card);
                this.scene.render();
                completed++;
                if (completed >= cards.length) {
                    onComplete?.();
                }
            }
        });
      });
      delay += DEAL_DELAY;
    });
  }

  animateField(fieldCards, onComplete) {
    if (!fieldCards?.length) { onComplete?.(); return; }
    const deckX = PLAYER_PANEL_W + 50, deckY = FIELD_Y;
    let completed = 0;

    fieldCards.forEach((card, i) => {
      this.scene.time.delayedCall(i * DEAL_DELAY, () => {
        this.scene._sfx('sfx_slide');
        this.flyCard(card, deckX, deckY, card.slotX, FIELD_Y, {
          onComplete: (img) => {
            img.destroy();
            completed++;
            if (completed === fieldCards.length) onComplete?.();
          }
        });
      });
    });
  }

  flyToDummy(fromX, fromY, key = "card_back") {
    this.scene._sfx("sfx_fan");
    const img = this.scene.add.image(fromX, fromY, key).setDisplaySize(CW, CH).setDepth(200);
    this.scene.tweens.add({
      targets: img, x: GW - ITEM_PANEL_W - 40, y: FIELD_Y,
      displayWidth: CW * 0.3, displayHeight: CH * 0.3, alpha: 0,
      duration: 380, ease: "Power2.In",
      onComplete: () => img.destroy(),
    });
  }

  clearAnimObjs() {
    this.animObjs.forEach(o => o.destroy());
    this.animObjs = [];
  }
}
