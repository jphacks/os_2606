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
  startDrying: vi.fn(async () => ({ estimatedDryingHours: 1 })),
  leaveHouse: vi.fn(async () => ({ estimatedDryingHours: 1 })),
  arriveHouse: vi.fn(async () => undefined),
  hangLaundryEvidence: vi.fn(async () => ({ estimatedDryingHours: 1 })),
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

function createClient() {
  return {
    getRichMenuAliasList: vi.fn(async () => ({
      aliases: [
        { richMenuAliasId: "tab-outing", richMenuId: "old-1" },
        { richMenuAliasId: "other-team-alias", richMenuId: "other" },
      ],
    })),
    updateRichMenuAlias: vi.fn(async () => ({})),
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
}

test("2枚を登録して表示先を切り替えた後に古いメニューを削除する", async () => {
  const client = createClient();
  const images = { outing: new Blob(["a"]), laundry: new Blob(["b"]) };

  await setupRichMenus(client as unknown as LineBotClient, images);

  expect(client.updateRichMenuAlias).toHaveBeenCalledExactlyOnceWith(
    "tab-outing",
    { richMenuId: "new-outing" },
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
  expect(client.deleteRichMenu.mock.invocationCallOrder[0]).toBeGreaterThan(
    client.setDefaultRichMenu.mock.invocationCallOrder[0]!,
  );
});

test("初回は両方のタブを新規登録する", async () => {
  const client = createClient();
  client.getRichMenuAliasList.mockResolvedValueOnce({ aliases: [] });
  client.getRichMenuList.mockResolvedValueOnce({ richmenus: [] });

  await setupRichMenus(client as unknown as LineBotClient, {
    outing: new Blob(["a"]),
    laundry: new Blob(["b"]),
  });

  expect(client.createRichMenuAlias.mock.calls).toEqual([
    [{ richMenuAliasId: "tab-outing", richMenuId: "new-outing" }],
    [{ richMenuAliasId: "tab-laundry", richMenuId: "new-laundry" }],
  ]);
  expect(client.updateRichMenuAlias).not.toHaveBeenCalled();
  expect(client.deleteRichMenu).not.toHaveBeenCalled();
  expect(client.setDefaultRichMenu).toHaveBeenCalledExactlyOnceWith("new-outing");
});

test.each(["setRichMenuImage", "setDefaultRichMenu"] as const)(
  "%sに失敗しても既存メニューを削除しない",
  async (method) => {
    const client = createClient();
    client[method].mockRejectedValueOnce(new Error("LINE API error"));

    await expect(
      setupRichMenus(client as unknown as LineBotClient, {
        outing: new Blob(["a"]),
        laundry: new Blob(["b"]),
      }),
    ).rejects.toThrow("LINE API error");

    expect(client.deleteRichMenu).not.toHaveBeenCalled();
    if (method === "setRichMenuImage") {
      expect(client.updateRichMenuAlias).not.toHaveBeenCalled();
      expect(client.createRichMenuAlias).not.toHaveBeenCalled();
      expect(client.setDefaultRichMenu).not.toHaveBeenCalled();
    }
  },
);
