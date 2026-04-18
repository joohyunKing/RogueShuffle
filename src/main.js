import Phaser from "phaser";
import { MainMenuScene } from "./scenes/MainMenuScene.js";
import { PreloadScene } from "./scenes/PreloadScene.js";
import { OptionsScene  } from "./scenes/OptionsScene.js";
import { GameScene     } from "./scenes/GameScene.js";
import { BattleScene   } from "./scenes/BattleScene.js";
import { MarketScene   } from "./scenes/MarketScene.js";
import { GW, GH } from "./constants.js";
// 폰트를 브라우저에 등록 후 Phaser 게임 시작
const font1 = new FontFace("PressStart2P", `url(${import.meta.env.BASE_URL}assets/fonts/PressStart2P-Regular.ttf)`);
const font2 = new FontFace("NeoDGM", `url(${import.meta.env.BASE_URL}assets/fonts/neodgm.ttf)`);
Promise.all([font1.load(), font2.load()]).then(([loaded1, loaded2]) => {
  document.fonts.add(loaded1);
  document.fonts.add(loaded2);
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
    scene: [MainMenuScene, PreloadScene, OptionsScene, GameScene, BattleScene, MarketScene],
  });
});
