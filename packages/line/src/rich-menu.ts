import type { LineBotClient, messagingApi } from "@line/bot-sdk";
import { POSTBACK_DATA } from "./postback-data.js";

// リッチメニューの画像の大きさ（px）。画像もこの大きさで作る。
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 843;
// 上のタブ部分の高さ
const TAB_HEIGHT = 200;

// タブを切り替えるときに使う名前（エイリアス）
const ALIAS = {
  outing: "tab-outing",
  laundry: "tab-laundry",
} as const;

// 上のタブ。左半分が「おでかけ」、右半分が「洗濯物」。
const tabAreas: messagingApi.RichMenuArea[] = [
  {
    bounds: { x: 0, y: 0, width: 1250, height: TAB_HEIGHT },
    action: {
      type: "richmenuswitch",
      richMenuAliasId: ALIAS.outing,
      data: POSTBACK_DATA.switchToOutingTab,
    },
  },
  {
    bounds: { x: 1250, y: 0, width: 1250, height: TAB_HEIGHT },
    action: {
      type: "richmenuswitch",
      richMenuAliasId: ALIAS.laundry,
      data: POSTBACK_DATA.switchToLaundryTab,
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

// タブ「おでかけ」：いってきます／ただいま
export const outingRichMenu: messagingApi.RichMenuRequest = {
  size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
  selected: true,
  name: "おでかけ",
  chatBarText: "メニュー",
  areas: [
    ...tabAreas,
    buttonArea(0, 1250, "いってきます", POSTBACK_DATA.leaveHouse),
    buttonArea(1250, 1250, "ただいま", POSTBACK_DATA.arriveHouse),
  ],
};

// タブ「洗濯物」：写真を送る／位置を設定／地域を設定
export const laundryRichMenu: messagingApi.RichMenuRequest = {
  size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
  selected: true,
  name: "洗濯物",
  chatBarText: "メニュー",
  areas: [
    ...tabAreas,
    buttonArea(0, 833, "写真を送る", POSTBACK_DATA.askLaundryPhoto),
    buttonArea(833, 834, "位置を設定", POSTBACK_DATA.askLaundryPosition),
    buttonArea(1667, 833, "地域を設定", POSTBACK_DATA.askRegion),
  ],
};

// 2枚のリッチメニューをLINEに登録し、「おでかけ」を最初に表示するメニューにする。
// 何度実行してもよいように、前に登録したものは消してから作り直す。
export async function setupRichMenus(
  client: LineBotClient,
  images: { outing: Blob; laundry: Blob },
): Promise<void> {
  const aliasIds: string[] = Object.values(ALIAS);
  const { aliases } = await client.getRichMenuAliasList();
  for (const alias of aliases) {
    if (aliasIds.includes(alias.richMenuAliasId)) {
      await client.deleteRichMenuAlias(alias.richMenuAliasId);
    }
  }
  const names = [outingRichMenu.name, laundryRichMenu.name];
  const { richmenus } = await client.getRichMenuList();
  for (const menu of richmenus) {
    if (names.includes(menu.name)) {
      await client.deleteRichMenu(menu.richMenuId);
    }
  }

  const { richMenuId: outingId } = await client.createRichMenu(outingRichMenu);
  await client.setRichMenuImage(outingId, images.outing);
  const { richMenuId: laundryId } =
    await client.createRichMenu(laundryRichMenu);
  await client.setRichMenuImage(laundryId, images.laundry);

  await client.createRichMenuAlias({
    richMenuAliasId: ALIAS.outing,
    richMenuId: outingId,
  });
  await client.createRichMenuAlias({
    richMenuAliasId: ALIAS.laundry,
    richMenuId: laundryId,
  });
  await client.setDefaultRichMenu(outingId);
}
