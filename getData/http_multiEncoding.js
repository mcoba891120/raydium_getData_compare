import { postRequest } from "../connect_method/http.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import config from "../config.js";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const endpoint = config.http.endpoint;
const apiKey = config.http.apiKey;
const poolAddress = config.poolAddress;
const csvFilePath = path.join(__dirname, "..", "rawData", "pool_data_http.csv");

// 如果 CSV 檔案不存在，先寫入表頭
if (!fs.existsSync(csvFilePath)) {
  fs.writeFileSync(csvFilePath, "timestamp,data,encoding\n");
}

async function main() {
  try {
    // 同時發送三個請求
    const [result_base64_zstd, result_base64, result_jsonParsed] =
      await Promise.all([
        postRequest(
          `${endpoint}?api-key=${apiKey}`,
          "getAccountInfo",
          poolAddress,
          "base64+zstd"
        ),
        postRequest(
          `${endpoint}?api-key=${apiKey}`,
          "getAccountInfo",
          poolAddress,
          "base64"
        ),
        postRequest(
          `${endpoint}?api-key=${apiKey}`,
          "getAccountInfo",
          poolAddress,
          "jsonParsed"
        ),
      ]);

    // 準備所有 CSV 行
    const csvLines = [
      `${result_base64_zstd.timestamp},${result_base64_zstd.data[0]},base64+zstd\n`,
      `${result_base64.timestamp},${result_base64.data[0]},base64\n`,
      `${result_jsonParsed.timestamp},${result_jsonParsed.data[0]},jsonParsed\n`,
    ];

    // 使用 Promise.all 同時寫入所有行
    await Promise.all(
      csvLines.map((line) => {
        return new Promise((resolve, reject) => {
          fs.appendFile(csvFilePath, line, (err) => {
            if (err) {
              console.error("寫入 CSV 時發生錯誤：", err);
              reject(err);
            } else {
              //   console.log("資料已寫入 CSV：", line);
              resolve();
            }
          });
        });
      })
    );
  } catch (error) {
    console.error("Error in main:", error);
  }
}

// 透過遞迴與 setTimeout 確保 main 每 200 毫秒執行一次，並避免 overlapping
async function run() {
  await main();
  setTimeout(run, 200);
}

run();
