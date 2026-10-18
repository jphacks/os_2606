import type { CoreApi } from "@os/api";

// 本物のCoreApiができるまでの仮実装。呼ばれたことをログに出すだけ。
export const mockCore: CoreApi = {
  async leaveHouse() {
    console.log("[core] leaveHouse");
  },
  async arriveHouse() {
    console.log("[core] arriveHouse");
  },
  async hangLaundryEvidence(image) {
    console.log(
      "[core] hangLaundryEvidence",
      image.mimeType,
      image.data.byteLength,
    );
  },
  async laundryPositionFromAC(position) {
    console.log("[core] laundryPositionFromAC", position);
  },
  async setUpHouseConfig(region) {
    console.log("[core] setUpHouseConfig", region);
  },
};
