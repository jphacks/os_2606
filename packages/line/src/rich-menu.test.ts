import type { LineBotClient, messagingApi } from "@line/bot-sdk";
import type { CoreApi } from "@os/api";
import { expect, test, vi } from "vitest";
import { handlePostback } from "./command.js";
import {
  laundryRichMenu,
  outingRichMenu,
  RICH_MENU_HEIGHT,
  RICH_MENU_WIDTH,
  setupRichMenus,
} from "./rich-menu.js";

const core = {
  leaveHouse: vi.fn(async () => {}),
  arriveHouse: vi.fn(async () => {}),
  hangLaundryEvidence: vi.fn(async () => {}),
  laundryPositionFromAC: vi.fn(async () => {}),
  setUpHouseConfig: vi.fn(async () => {}),
} satisfies CoreApi;

const menus = [outingRichMenu, laundryRichMenu];

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

test("前に登録したものを消してから2枚を登録し、「おでかけ」を最初に表示する", async () => {
  const client = {
    getRichMenuAliasList: vi.fn(async () => ({
      aliases: [
        { richMenuAliasId: "tab-outing", richMenuId: "old-1" },
        { richMenuAliasId: "other-team-alias", richMenuId: "other" },
      ],
    })),
    deleteRichMenuAlias: vi.fn(async () => ({})),
    getRichMenuList: vi.fn(async () => ({
      richmenus: [
        { richMenuId: "old-1", name: "おでかけ" },
        { richMenuId: "other", name: "別のメニュー" },
      ],
    })),
    deleteRichMenu: vi.fn(async () => ({})),
    createRichMenu: vi
      .fn()
      .mockResolvedValueOnce({ richMenuId: "new-outing" })
      .mockResolvedValueOnce({ richMenuId: "new-laundry" }),
    setRichMenuImage: vi.fn(async () => ({})),
    createRichMenuAlias: vi.fn(async () => ({})),
    setDefaultRichMenu: vi.fn(async () => ({})),
  };
  const images = { outing: new Blob(["a"]), laundry: new Blob(["b"]) };

  await setupRichMenus(client as unknown as LineBotClient, images);

  expect(client.deleteRichMenuAlias).toHaveBeenCalledExactlyOnceWith(
    "tab-outing",
  );
  expect(client.deleteRichMenu).toHaveBeenCalledExactlyOnceWith("old-1");
  expect(client.setRichMenuImage).toHaveBeenCalledWith(
    "new-outing",
    images.outing,
  );
  expect(client.setRichMenuImage).toHaveBeenCalledWith(
    "new-laundry",
    images.laundry,
  );
  expect(client.createRichMenuAlias).toHaveBeenCalledWith({
    richMenuAliasId: "tab-laundry",
    richMenuId: "new-laundry",
  });
  expect(client.setDefaultRichMenu).toHaveBeenCalledExactlyOnceWith(
    "new-outing",
  );
});
