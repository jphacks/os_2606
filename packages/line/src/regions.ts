// 住んでいる地域の選択肢。地方を選んでから都道府県を選ぶ。
// LINEのクイックリプライは1回に13個までなので、どの地方も13県以下にしている。
export const AREAS = [
  {
    id: "hokkaido-tohoku",
    name: "北海道・東北",
    prefectures: [
      "北海道",
      "青森県",
      "岩手県",
      "宮城県",
      "秋田県",
      "山形県",
      "福島県",
    ],
  },
  {
    id: "kanto",
    name: "関東",
    prefectures: [
      "茨城県",
      "栃木県",
      "群馬県",
      "埼玉県",
      "千葉県",
      "東京都",
      "神奈川県",
    ],
  },
  {
    id: "chubu",
    name: "中部",
    prefectures: [
      "新潟県",
      "富山県",
      "石川県",
      "福井県",
      "山梨県",
      "長野県",
      "岐阜県",
      "静岡県",
      "愛知県",
    ],
  },
  {
    id: "kinki",
    name: "近畿",
    prefectures: [
      "三重県",
      "滋賀県",
      "京都府",
      "大阪府",
      "兵庫県",
      "奈良県",
      "和歌山県",
    ],
  },
  {
    id: "chugoku-shikoku",
    name: "中国・四国",
    prefectures: [
      "鳥取県",
      "島根県",
      "岡山県",
      "広島県",
      "山口県",
      "徳島県",
      "香川県",
      "愛媛県",
      "高知県",
    ],
  },
  {
    id: "kyushu-okinawa",
    name: "九州・沖縄",
    prefectures: [
      "福岡県",
      "佐賀県",
      "長崎県",
      "熊本県",
      "大分県",
      "宮崎県",
      "鹿児島県",
      "沖縄県",
    ],
  },
] as const;

export type Area = (typeof AREAS)[number];

export function findArea(id: string): Area | undefined {
  return AREAS.find((area) => area.id === id);
}

export function isPrefecture(name: string): boolean {
  return AREAS.some((area) =>
    area.prefectures.some((prefecture) => prefecture === name),
  );
}
