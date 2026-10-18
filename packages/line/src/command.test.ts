import type { CoreApi } from "@os/api";
import { beforeEach, expect, test, vi } from "vitest";
import { handleImage, handlePostback, handleText } from "./command.js";
import { POSTBACK_DATA, POSTBACK_PREFIX } from "./postback-data.js";
import { AREAS } from "./regions.js";

const core = {
  leaveHouse: vi.fn(async () => {}),
  arriveHouse: vi.fn(async () => {}),
  hangLaundryEvidence: vi.fn(async () => {}),
  laundryPositionFromAC: vi.fn(async () => {}),
  setUpHouseConfig: vi.fn(async () => {}),
  setComfortTemperature: vi.fn(async () => {}),
} satisfies CoreApi;

beforeEach(() => {
  vi.clearAllMocks();
});

function expectNoCoreCalls(): void {
  for (const method of Object.values(core)) {
    expect(method).not.toHaveBeenCalled();
  }
}

test("「いってきます」ボタンでleaveHouseを呼ぶ", async () => {
  const messages = await handlePostback(POSTBACK_DATA.leaveHouse, core);
  expect(core.leaveHouse).toHaveBeenCalledOnce();
  expect(messages).toEqual([
    { type: "text", text: "いってらっしゃい！\n洗濯物の乾燥を始めます。" },
  ]);
});

test("「もうすぐ帰る」ボタンでarriveHouseを呼ぶ", async () => {
  const messages = await handlePostback(POSTBACK_DATA.arriveHouse, core);
  expect(core.arriveHouse).toHaveBeenCalledOnce();
  expect(messages).toEqual([
    {
      type: "text",
      text: "お帰りの準備をします。\n気をつけて帰ってきてください。",
    },
  ]);
});

test("「洗濯を干した」ボタンではカメラと写真フォルダのボタンを返す", async () => {
  const [message] = await handlePostback(POSTBACK_DATA.hangLaundry, core);
  expect(message?.quickReply?.items?.map((item) => item.action?.type)).toEqual([
    "camera",
    "cameraRoll",
  ]);
  expectNoCoreCalls();
});

test("写真を受け取るとhangLaundryEvidenceに渡し、続けて位置を選ぶカードを返す", async () => {
  const image = { data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
  const messages = await handleImage(image, core);
  expect(core.hangLaundryEvidence).toHaveBeenCalledExactlyOnceWith(image);
  expect(messages.map((message) => message.type)).toEqual(["text", "flex"]);
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

test("「住んでいる地域」では地方、地方を選ぶとその都道府県を選択肢にする", async () => {
  const [areaMessage] = await handlePostback(POSTBACK_DATA.askRegion, core);
  expect(areaMessage?.quickReply?.items).toHaveLength(AREAS.length);

  const [prefectureMessage] = await handlePostback(
    `${POSTBACK_PREFIX.regionArea}kanto`,
    core,
  );
  const labels = prefectureMessage?.quickReply?.items?.map(
    (item) => item.action?.label,
  );
  expect(labels).toContain("東京都");
  expect(labels).not.toContain("大阪府");
  expectNoCoreCalls();
});

test("都道府県を選ぶとsetUpHouseConfigに渡す", async () => {
  const messages = await handlePostback(
    `${POSTBACK_PREFIX.region}東京都`,
    core,
  );
  expect(core.setUpHouseConfig).toHaveBeenCalledExactlyOnceWith("東京都");
  expect(messages).toEqual([
    { type: "text", text: "住んでいる地域を東京都にしました。" },
  ]);
});

test("都道府県は47あり、どの地方もクイックリプライの上限13個以内", () => {
  expect(AREAS.flatMap((area) => area.prefectures)).toHaveLength(47);
  for (const area of AREAS) {
    expect(area.prefectures.length).toBeLessThanOrEqual(13);
  }
});

test("「いつもの室温」では16〜28℃を選択肢にする", async () => {
  const [message] = await handlePostback(
    POSTBACK_DATA.askComfortTemperature,
    core,
  );
  const labels = message?.quickReply?.items?.map((item) => item.action?.label);
  expect(labels).toHaveLength(13);
  expect(labels?.[0]).toBe("16℃");
  expect(labels?.at(-1)).toBe("28℃");
});

test("室温を選ぶとsetComfortTemperatureに渡す", async () => {
  const messages = await handlePostback(
    `${POSTBACK_PREFIX.comfortTemperature}24`,
    core,
  );
  expect(core.setComfortTemperature).toHaveBeenCalledExactlyOnceWith(24);
  expect(messages).toEqual([
    { type: "text", text: "いつもの室温を24℃にしました。" },
  ]);
});

test.each([
  POSTBACK_DATA.switchToHomeTab,
  POSTBACK_DATA.switchToSettingsTab,
  "unknown",
  `${POSTBACK_PREFIX.regionArea}unknown`,
  `${POSTBACK_PREFIX.region}東京`,
  `${POSTBACK_PREFIX.comfortTemperature}15`,
  `${POSTBACK_PREFIX.comfortTemperature}29`,
  `${POSTBACK_PREFIX.comfortTemperature}24.5`,
  `${POSTBACK_PREFIX.comfortTemperature}abc`,
])(
  "タブの切り替えや想定外の合図（%s）には返信せず、CoreApiも呼ばない",
  async (data) => {
    expect(await handlePostback(data, core)).toEqual([]);
    expectNoCoreCalls();
  },
);

test("文字を打たれてもCoreApiは呼ばず、メニューを案内する", () => {
  expect(handleText()).toEqual([
    { type: "text", text: "画面下のメニューから選んでください。" },
  ]);
});
