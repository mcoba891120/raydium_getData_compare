// csvWriterGrpc.js
import { subscribeToPoolGrpc } from "../connect_method/grpc.js";
import { decodeGrpcBinary } from "../decoder/grpc_binary.js";
import fs from "fs";

// 設定 gRPC 端點與 pool 地址
const endpoint =
  "https://gasmen-resuspending-oxiqryjjgk-dedicated-lb.helius-rpc.com:2053";
const poolAddress = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";

// 設定 CSV 檔案路徑
const csvFilePath = "./rawData/pool_data_grpc.csv";

// 檢查 CSV 檔案是否存在
const fileExists = fs.existsSync(csvFilePath);
// 建立寫入流 (append 模式)
const writeStream = fs.createWriteStream(csvFilePath, { flags: "a" });
// 如果檔案不存在，先寫入表頭
if (!fileExists) {
  writeStream.write("timestamp,data\n");
}

/**
 * 處理從 gRPC 訂閱回傳的資料並寫入 CSV
 * @param {Object} update - 包含 timestamp 與 data (data 為 account.account.data)
 */
function handleUpdate(update) {
  const { timestamp, data } = update;
  const decodedData = decodeGrpcBinary(data);
  //將bigint轉成string
  const sqrtPriceX64 = decodedData.sqrtPriceX64.toString();
  // 根據需要，你也可以在這裡對 data 進行轉換或解碼
  const csvLine = `${timestamp},${sqrtPriceX64},'grpc'\n`;
  writeStream.write(csvLine, (err) => {
    if (err) {
      console.error("寫入 CSV 時發生錯誤：", err);
    } else {
      //   console.log("資料已寫入 CSV：", csvLine);
    }
  });
}

// 啟動 gRPC 訂閱，並傳入 handleUpdate 作為 callback
subscribeToPoolGrpc(endpoint, poolAddress, handleUpdate).catch(console.error);
