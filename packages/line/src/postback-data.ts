// ボタンを押したときにbotへ届く合図（ポストバックのdata）。
// ボタンに表示する文字とは別なので、ボタンの文字やデザインを変えても、ここは変えなくてよい。
export const POSTBACK_DATA = {
  simulateDryingPlan: "simulate-drying-plan",
  leaveHouse: "leave-house",
  arriveHouse: "arrive-house",
  askLaundryPhoto: "ask-laundry-photo",
  askLaundryPosition: "ask-laundry-position",
  laundryPositionLeft: "laundry-position-left",
  laundryPositionCenter: "laundry-position-center",
  laundryPositionRight: "laundry-position-right",
  askRegion: "ask-region",
  switchToOutingTab: "switch-to-outing-tab",
  switchToLaundryTab: "switch-to-laundry-tab",
} as const;
