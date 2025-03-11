import { subscribeToPoolGrpc } from "../connect_method/grpc.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import config from "../config.js";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 設定 gRPC 端點與 pool 地址
const endpoint = config.grpc.endpoint;
const authToken = config.grpc.authToken;
const poolAddress = config.poolAddress;

// 設定輸出 .bin 檔案路徑
const binFilePath = path.join(__dirname, "..", "rawData", "pool_data_grpc.bin");

// 建立寫入流 (append 模式)
const writeStream = fs.createWriteStream(binFilePath, { flags: "a" });

/**
 * 處理從 gRPC 訂閱回傳的資料，並以二進位格式寫入檔案
 * 資料格式：
 *   [8 bytes timestamp][4 bytes data length][data bytes]
 * @param {Object} update - 包含 timestamp 與 data (data 為原始資料，可能是 Buffer 或 base64 字串)
 */
function handleUpdate(update) {
  const { timestamp, data } = update;
  // 如果 data 不是 Buffer，假設它是 base64 編碼的字串，轉換成 Buffer
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "base64");

  // 建立 8 bytes Buffer 來存 timestamp
  const timestampBuffer = Buffer.alloc(8);
  // 將 timestamp 轉換成 BigInt 並以 little-endian 寫入（注意：timestamp 必須是數字）
  timestampBuffer.writeBigUInt64LE(BigInt(timestamp));

  // 建立 4 bytes Buffer 來存 data 的長度
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(dataBuffer.length);

  // 寫入檔案：timestamp、資料長度、以及資料本身
  writeStream.write(timestampBuffer);
  writeStream.write(lengthBuffer);
  writeStream.write(dataBuffer);
}

// 啟動 gRPC 訂閱，並傳入 handleUpdate 作為 callback
subscribeToPoolGrpc(endpoint, poolAddress, authToken, handleUpdate).catch(
  console.error
);
