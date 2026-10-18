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

// タブ「洗濯物」：写真を送る／位置を設定／地域を設定／6時間の運転計画
export const laundryRichMenu: messagingApi.RichMenuRequest = {
  size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
  selected: true,
  name: "洗濯物",
  chatBarText: "メニュー",
  areas: [
    ...tabAreas,
    buttonArea(0, 625, "写真を送る", POSTBACK_DATA.askLaundryPhoto),
    buttonArea(625, 625, "位置を設定", POSTBACK_DATA.askLaundryPosition),
    buttonArea(1250, 625, "地域を設定", POSTBACK_DATA.askRegion),
    buttonArea(1875, 625, "6時間の運転計画", POSTBACK_DATA.simulateDryingPlan),
  ],
};

// 2枚のリッチメニューをLINEに登録し、「おでかけ」を最初に表示するメニューにする。
// 新しい画像と表示先を登録してから、前に登録したメニューを削除する。
export async function setupRichMenus(
  client: LineBotClient,
  images: { outing: Blob; laundry: Blob },
): Promise<void> {
  const { aliases } = await client.getRichMenuAliasList();
  const { richmenus } = await client.getRichMenuList();

  const { richMenuId: outingId } = await client.createRichMenu(outingRichMenu);
  await client.setRichMenuImage(outingId, images.outing);
  const { richMenuId: laundryId } =
    await client.createRichMenu(laundryRichMenu);
  await client.setRichMenuImage(laundryId, images.laundry);

  for (const [richMenuAliasId, richMenuId] of [
    [ALIAS.outing, outingId],
    [ALIAS.laundry, laundryId],
  ] as const) {
    if (aliases.some((alias) => alias.richMenuAliasId === richMenuAliasId)) {
      await client.updateRichMenuAlias(richMenuAliasId, { richMenuId });
    } else {
      await client.createRichMenuAlias({ richMenuAliasId, richMenuId });
    }
  }
  await client.setDefaultRichMenu(outingId);

  const names = [outingRichMenu.name, laundryRichMenu.name];
  for (const menu of richmenus) {
    if (names.includes(menu.name)) {
      await client.deleteRichMenu(menu.richMenuId);
    }
  }
}
