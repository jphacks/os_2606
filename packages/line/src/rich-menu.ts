import type { LineBotClient, messagingApi } from "@line/bot-sdk";
import { POSTBACK_DATA } from "./postback-data.js";

// リッチメニューの画像の大きさ（px）。画像もこの大きさで作る。
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 843;
// 上のタブ部分の高さ
const TAB_HEIGHT = 200;

// タブを切り替えるときに使う名前（エイリアス）
const ALIAS = {
  home: "tab-home",
  settings: "tab-settings",
} as const;

// 上のタブ。左半分が「ホーム」、右半分が「詳細設定」。
const tabAreas: messagingApi.RichMenuArea[] = [
  {
    bounds: { x: 0, y: 0, width: 1250, height: TAB_HEIGHT },
    action: {
      type: "richmenuswitch",
      richMenuAliasId: ALIAS.home,
      data: POSTBACK_DATA.switchToHomeTab,
    },
  },
  {
    bounds: { x: 1250, y: 0, width: 1250, height: TAB_HEIGHT },
    action: {
      type: "richmenuswitch",
      richMenuAliasId: ALIAS.settings,
      data: POSTBACK_DATA.switchToSettingsTab,
    },
  },
];

// タブの下に並ぶボタン1つ分。押してもメニューは開いたままにする。
function buttonArea(
  x: number,
  width: number,
  label: string,
  data: string,
): messagingApi.RichMenuArea {
  return {
    bounds: { x, y: TAB_HEIGHT, width, height: RICH_MENU_HEIGHT - TAB_HEIGHT },
    action: { type: "postback", label, data, inputOption: "openRichMenu" },
  };
}

// タブ「ホーム」：いってきます／もうすぐ帰る／洗濯を干した
export const homeRichMenu: messagingApi.RichMenuRequest = {
  size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
  selected: true,
  name: "ホーム",
  chatBarText: "メニュー",
  areas: [
    ...tabAreas,
    buttonArea(0, 833, "いってきます", POSTBACK_DATA.leaveHouse),
    buttonArea(833, 834, "もうすぐ帰る", POSTBACK_DATA.arriveHouse),
    buttonArea(1667, 833, "洗濯を干した", POSTBACK_DATA.hangLaundry),
  ],
};

// タブ「詳細設定」：住んでいる地域／いつもの室温
export const settingsRichMenu: messagingApi.RichMenuRequest = {
  size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
  selected: true,
  name: "詳細設定",
  chatBarText: "メニュー",
  areas: [
    ...tabAreas,
    buttonArea(0, 1250, "住んでいる地域", POSTBACK_DATA.askRegion),
    buttonArea(1250, 1250, "いつもの室温", POSTBACK_DATA.askComfortTemperature),
  ],
};

// 2枚のリッチメニューをLINEに登録し、「ホーム」を最初に表示するメニューにする。
// このチャネルのリッチメニューはこの処理だけで管理する前提で、
// 前に登録したもの（名前を変える前の古いメニューも含む）はすべて消してから作り直す。
export async function setupRichMenus(
  client: LineBotClient,
  images: { home: Blob; settings: Blob },
): Promise<void> {
  const { aliases } = await client.getRichMenuAliasList();
  for (const alias of aliases) {
    await client.deleteRichMenuAlias(alias.richMenuAliasId);
  }
  const { richmenus } = await client.getRichMenuList();
  for (const menu of richmenus) {
    await client.deleteRichMenu(menu.richMenuId);
  }

  const { richMenuId: homeId } = await client.createRichMenu(homeRichMenu);
  await client.setRichMenuImage(homeId, images.home);
  const { richMenuId: settingsId } =
    await client.createRichMenu(settingsRichMenu);
  await client.setRichMenuImage(settingsId, images.settings);

  await client.createRichMenuAlias({
    richMenuAliasId: ALIAS.home,
    richMenuId: homeId,
  });
  await client.createRichMenuAlias({
    richMenuAliasId: ALIAS.settings,
    richMenuId: settingsId,
  });
  await client.setDefaultRichMenu(homeId);
}
