import type { CoreApi } from "@os/api";

// 本物のCoreApiができるまでの仮実装。呼ばれたことをログに出すだけ。
export const mockCore: CoreApi = {
  async startDrying() {
    console.log("[core] startDrying");
    return { estimatedDryingHours: Infinity };
  },
  async leaveHouse() {
    console.log("[core] leaveHouse");
    return { estimatedDryingHours: Infinity };
  },
  async arriveHouse() {
    console.log("[core] arriveHouse");
    return undefined;
  },
  async hangLaundryEvidence(image) {
    console.log(
      "[core] hangLaundryEvidence",
      image.mimeType,
      image.data.byteLength,
    );
    return { estimatedDryingHours: Infinity };
  },
  async laundryPositionFromAC(position) {
    console.log("[core] laundryPositionFromAC", position);
  },
  async setUpHouseConfig(region) {
    console.log("[core] setUpHouseConfig", region);
  },
};
