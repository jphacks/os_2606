// ボタンを押したときにbotへ届く合図（ポストバックのdata）。
// ボタンに表示する文字とは別なので、ボタンの文字やデザインを変えても、ここは変えなくてよい。
export const POSTBACK_DATA = {
  leaveHouse: "leave-house",
  arriveHouse: "arrive-house",
  hangLaundry: "hang-laundry",
  laundryPositionLeft: "laundry-position-left",
  laundryPositionCenter: "laundry-position-center",
  laundryPositionRight: "laundry-position-right",
  askRegion: "ask-region",
  askComfortTemperature: "ask-comfort-temperature",
  switchToHomeTab: "switch-to-home-tab",
  switchToSettingsTab: "switch-to-settings-tab",
} as const;

// 選んだ値を一緒に送る合図。「名前:値」の形で送る（例: "comfort-temperature:24"）。
export const POSTBACK_PREFIX = {
  regionArea: "region-area:",
  region: "region:",
  comfortTemperature: "comfort-temperature:",
} as const;
