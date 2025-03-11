import { subscribeToPool } from "../connect_method/websocket.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import config from "../config.js";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 設定 WebSocket 端點與 pool 地址
const endpoint = config.websocket.endpoint;
const apiKey = config.websocket.apiKey;
const poolAddress = config.poolAddress;

// 設定 CSV 檔案路徑
const csvFilePath = path.join(__dirname, "..", "rawData", "pool_data_wss.csv");

// 檢查 CSV 檔案是否存在
const fileExists = fs.existsSync(csvFilePath);

// 建立寫入流，使用 'a' 模式（append）
const writeStream = fs.createWriteStream(csvFilePath, { flags: "a" });

// 如果檔案不存在，先寫入表頭
if (!fileExists) {
  writeStream.write("timestamp,data,encoding\n");
}

/**
 * 處理收到的資料，並寫入 CSV
 * @param {Object} update - 更新資料，包含 data 與 timestamp
 * @param {string} encoding - 資料使用的 encoding 類型
 */
function handleUpdate(encoding) {
  return (update) => {
    const { data, timestamp } = update;
    // 這裡可以依需要對 data 進一步處理，例如解碼或轉換
    const csvLine = `${timestamp},${data[0]},${encoding}\n`;
    writeStream.write(csvLine, (err) => {
      if (err) {
        console.error("寫入 CSV 時發生錯誤：", err);
      } else {
        // console.log("資料已寫入 CSV：", csvLine);
      }
    });
  };
}

// 設定 WebSocket 連接
const wsBase64 = subscribeToPool(
  `${endpoint}?api-key=${apiKey}`,
  poolAddress,
  "base64",
  handleUpdate("base64")
);

const wsBase64Zstd = subscribeToPool(
  `${endpoint}?api-key=${apiKey}`,
  poolAddress,
  "base64+zstd",
  handleUpdate("base64+zstd")
);

const wsJsonParsed = subscribeToPool(
  `${endpoint}?api-key=${apiKey}`,
  poolAddress,
  "jsonParsed",
  handleUpdate("jsonParsed")
);

// 同時訂閱不同 encoding 的資料
async function main() {
  await Promise.all([wsBase64, wsBase64Zstd, wsJsonParsed]);
}

main().catch(console.error);
