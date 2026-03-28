import Phaser from "phaser";
import { MainMenuScene } from "./scenes/MainMenuScene.js";
import { OptionsScene  } from "./scenes/OptionsScene.js";
import { GameScene     } from "./scenes/GameScene.js";
import { BattleScene   } from "./scenes/BattleScene.js";
import { MarketScene   } from "./scenes/MarketScene.js";
import { GW, GH } from "./constants.js";
// PressStart2P 폰트를 브라우저에 등록 후 Phaser 게임 시작
const font = new FontFace("PressStart2P", `url(${import.meta.env.BASE_URL}assets/fonts/PressStart2P-Regular.ttf)`);
font.load().then(loaded => {
  document.fonts.add(loaded);
  new Phaser.Game({
    type:            Phaser.AUTO,
    width:           GW,
    height:          GH,
    backgroundColor: "#0d2b18",
    parent:          "app",
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    dom: { createContainer: true },
    scene: [MainMenuScene, OptionsScene, GameScene, BattleScene, MarketScene],
  });
});
