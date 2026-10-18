import type { CoreApi } from "@os/api";
import { beforeEach, expect, test, vi } from "vitest";
import { handleImage, handlePostback, handleText } from "./command.js";
import { POSTBACK_DATA } from "./postback-data.js";

const core = {
  leaveHouse: vi.fn(async () => {}),
  arriveHouse: vi.fn(async () => {}),
  hangLaundryEvidence: vi.fn(async () => {}),
  laundryPositionFromAC: vi.fn(async () => {}),
  setUpHouseConfig: vi.fn(async () => {}),
} satisfies CoreApi;

beforeEach(() => {
  vi.clearAllMocks();
});

test("「いってきます」ボタンでleaveHouseを呼ぶ", async () => {
  const messages = await handlePostback(POSTBACK_DATA.leaveHouse, core);
  expect(core.leaveHouse).toHaveBeenCalledOnce();
  expect(messages).toEqual([
    { type: "text", text: "いってらっしゃい！\n洗濯物の乾燥を始めます。" },
  ]);
});

test("「ただいま」ボタンでarriveHouseを呼ぶ", async () => {
  const messages = await handlePostback(POSTBACK_DATA.arriveHouse, core);
  expect(core.arriveHouse).toHaveBeenCalledOnce();
  expect(messages).toEqual([{ type: "text", text: "おかえりなさい！" }]);
});

test("「位置を設定」ボタンでは位置を選ぶカードを返し、まだCoreApiは呼ばない", async () => {
  const messages = await handlePostback(POSTBACK_DATA.askLaundryPosition, core);
  expect(messages).toHaveLength(1);
  expect(messages[0]?.type).toBe("flex");
  expect(core.laundryPositionFromAC).not.toHaveBeenCalled();
});

test.each([
  [POSTBACK_DATA.laundryPositionLeft, "left"],
  [POSTBACK_DATA.laundryPositionCenter, "center"],
  [POSTBACK_DATA.laundryPositionRight, "right"],
] as const)(
  "カードの %s で洗濯物の位置を %s にする",
  async (data, position) => {
    await handlePostback(data, core);
    expect(core.laundryPositionFromAC).toHaveBeenCalledExactlyOnceWith(
      position,
    );
  },
);

test("「写真を送る」ボタンではカメラと写真フォルダのボタンを返す", async () => {
  const [message] = await handlePostback(POSTBACK_DATA.askLaundryPhoto, core);
  expect(message?.quickReply?.items?.map((item) => item.action?.type)).toEqual([
    "camera",
    "cameraRoll",
  ]);
});

test.each([
  POSTBACK_DATA.switchToOutingTab,
  POSTBACK_DATA.switchToLaundryTab,
  "unknown",
])("タブの切り替えや知らない合図（%s）には返信しない", async (data) => {
  expect(await handlePostback(data, core)).toEqual([]);
  for (const method of Object.values(core)) {
    expect(method).not.toHaveBeenCalled();
  }
});

test("文字を打たれてもCoreApiは呼ばず、メニューを案内する", () => {
  expect(handleText()).toEqual([
    { type: "text", text: "画面下のメニューから選んでください。" },
  ]);
});

test("写真を受け取るとhangLaundryEvidenceに渡す", async () => {
  const image = { data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
  await handleImage(image, core);
  expect(core.hangLaundryEvidence).toHaveBeenCalledExactlyOnceWith(image);
});
