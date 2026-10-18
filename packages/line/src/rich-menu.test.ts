import type { LineBotClient, messagingApi } from "@line/bot-sdk";
import type { CoreApi } from "@os/api";
import { expect, test, vi } from "vitest";
import { handlePostback } from "./command.js";
import {
  homeRichMenu,
  RICH_MENU_HEIGHT,
  RICH_MENU_WIDTH,
  settingsRichMenu,
  setupRichMenus,
} from "./rich-menu.js";

const core = {
  leaveHouse: vi.fn(async () => {}),
  arriveHouse: vi.fn(async () => {}),
  hangLaundryEvidence: vi.fn(async () => {}),
  laundryPositionFromAC: vi.fn(async () => {}),
  setUpHouseConfig: vi.fn(async () => {}),
  setComfortTemperature: vi.fn(async () => {}),
} satisfies CoreApi;

const menus = [homeRichMenu, settingsRichMenu];

test.each(menus)("「$name」のボタンは画像の範囲に収まっている", (menu) => {
  for (const { bounds } of menu.areas ?? []) {
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
      RICH_MENU_WIDTH,
    );
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      RICH_MENU_HEIGHT,
    );
  }
});

test.each(menus)(
  "「$name」のボタンにはすべて返信が用意されている",
  async (menu) => {
    const postbacks = (menu.areas ?? [])
      .map((area) => area.action)
      .filter(
        (action): action is messagingApi.PostbackAction =>
          action?.type === "postback",
      );
    expect(postbacks.length).toBeGreaterThan(0);
    for (const action of postbacks) {
      expect(await handlePostback(action.data ?? "", core)).not.toEqual([]);
    }
  },
);

test("レビューで挙がったボタンがすべてある", () => {
  const labels = (menu: messagingApi.RichMenuRequest) =>
    (menu.areas ?? []).map((area) => area.action?.label);
  expect(labels(homeRichMenu)).toEqual(
    expect.arrayContaining(["いってきます", "もうすぐ帰る", "洗濯を干した"]),
  );
  expect(labels(settingsRichMenu)).toEqual(
    expect.arrayContaining(["住んでいる地域", "いつもの室温"]),
  );
});

test("前に登録したものをすべて消してから2枚を登録し、「ホーム」を最初に表示する", async () => {
  const client = {
    getRichMenuAliasList: vi.fn(async () => ({
      aliases: [{ richMenuAliasId: "tab-outing", richMenuId: "old-1" }],
    })),
    deleteRichMenuAlias: vi.fn(async () => ({})),
    getRichMenuList: vi.fn(async () => ({
      richmenus: [
        { richMenuId: "old-1", name: "おでかけ" },
        { richMenuId: "old-2", name: "洗濯物" },
      ],
    })),
    deleteRichMenu: vi.fn(async () => ({})),
    createRichMenu: vi
      .fn()
      .mockResolvedValueOnce({ richMenuId: "new-home" })
      .mockResolvedValueOnce({ richMenuId: "new-settings" }),
    setRichMenuImage: vi.fn(async () => ({})),
    createRichMenuAlias: vi.fn(async () => ({})),
    setDefaultRichMenu: vi.fn(async () => ({})),
  };
  const images = { home: new Blob(["a"]), settings: new Blob(["b"]) };

  await setupRichMenus(client as unknown as LineBotClient, images);

  expect(client.deleteRichMenuAlias).toHaveBeenCalledExactlyOnceWith(
    "tab-outing",
  );
  expect(client.deleteRichMenu.mock.calls).toEqual([["old-1"], ["old-2"]]);
  expect(client.setRichMenuImage).toHaveBeenCalledWith("new-home", images.home);
  expect(client.setRichMenuImage).toHaveBeenCalledWith(
    "new-settings",
    images.settings,
  );
  expect(client.createRichMenuAlias).toHaveBeenCalledWith({
    richMenuAliasId: "tab-settings",
    richMenuId: "new-settings",
  });
  expect(client.setDefaultRichMenu).toHaveBeenCalledExactlyOnceWith("new-home");
});
