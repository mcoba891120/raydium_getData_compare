import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import csv from "csv-parser";
import { PoolInfoLayout, SqrtPriceMath } from "@raydium-io/raydium-sdk";
import * as fzstd from "fzstd";
import config from "./config.js";
// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===== Decoder Utility Functions =====

// Base64 decoder
function decodeBase64(base64Data) {
  const decodedData = Buffer.from(base64Data, "base64");
  return PoolInfoLayout.decode(decodedData);
}

// Base64+zstd decoder
function decodeBase64AndZstd(base64Data) {
  try {
    // Handle both array and string formats
    const dataString = Array.isArray(base64Data) ? base64Data[0] : base64Data;

    // Decode base64 to buffer
    const decodedData = Buffer.from(dataString, "base64");

    // Decompress using fzstd
    const decompressedBuffer = fzstd.decompress(decodedData);

    // Return the buffer for further processing
    return PoolInfoLayout.decode(decompressedBuffer);
  } catch (error) {
    console.error("Error decoding base64+zstd data:", error);
    throw error;
  }
}

// GRPC binary decoder
function decodeGrpcBinary(data) {
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const poolInfo = PoolInfoLayout.decode(dataBuffer);
  return poolInfo;
}

// ===== CSV Decoder Functions =====

/**
 * 處理單一 CSV 檔案，讀取後根據 encoding 解碼並取出 sqrtPriceX64，
 * 最後將結果寫入新的 CSV 檔案中。
 * @param {string} inputCsvFilePath - 輸入 CSV 檔案路徑
 * @param {string} outputCsvFilePath - 輸出 CSV 檔案路徑
 * @returns {Promise<void>}
 */
function processFile(inputCsvFilePath, outputCsvFilePath) {
  return new Promise((resolve, reject) => {
    // 建立寫入流，寫入表頭
    const writeStream = fs.createWriteStream(outputCsvFilePath, { flags: "w" });
    writeStream.write("timestamp,encoding,decodedData\n");

    fs.createReadStream(inputCsvFilePath)
      .pipe(csv())
      .on("data", (row) => {
        // 讀取 CSV 中的欄位：timestamp, data, encoding
        const { timestamp, data, encoding } = row;
        let decodedData;
        let finalEncoding = encoding;

        // 根據 encoding 決定使用哪個解碼函式
        switch (encoding) {
          case "base64+zstd":
            decodedData = decodeBase64AndZstd(data);
            break;
          case "base64":
            console.log(data);
            decodedData = decodeBase64(data);
            break;
          case "grpc":
          case "jsonParsed":
            // 將 grpc 也以 base64 解碼，並統一標記為 jsonParsed
            decodedData = decodeBase64(data);
            finalEncoding = "jsonParsed";
            break;
          default:
            console.warn("Unknown encoding:", encoding);
            decodedData = data;
        }

        // 若解碼後為物件且有 sqrtPriceX64 屬性，取出並轉成字串
        if (
          decodedData &&
          typeof decodedData === "object" &&
          decodedData.sqrtPriceX64 !== undefined
        ) {
          decodedData = decodedData.sqrtPriceX64.toString();
        } else if (typeof decodedData === "object") {
          // 否則若是物件則轉為 JSON 字串
          try {
            decodedData = JSON.stringify(decodedData);
          } catch (error) {
            decodedData = String(decodedData);
          }
        }

        // 為避免 CSV 中逗號影響格式，將 decodedData 用雙引號包住
        const line = `${timestamp},${finalEncoding},"${decodedData}"\n`;
        writeStream.write(line);
      })
      .on("end", () => {
        console.log(`Finished processing ${inputCsvFilePath}`);
        writeStream.end();
        resolve();
      })
      .on("error", (err) => {
        console.error("Error processing file:", inputCsvFilePath, err);
        reject(err);
      });
  });
}

/**
 * 處理二進位檔案，解析後轉換為 CSV 格式
 * @param {string} inputBinFilePath - 輸入二進位檔案路徑
 * @param {string} outputCsvFilePath - 輸出 CSV 檔案路徑
 * @returns {Promise<void>}
 */
function processBinaryFile(inputBinFilePath, outputCsvFilePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(inputBinFilePath, (err, buffer) => {
      if (err) {
        console.error("讀取 bin 檔案時發生錯誤：", err);
        reject(err);
        return;
      }

      let offset = 0;
      const lines = [];

      // 依照格式解析 buffer 中的每一筆資料
      while (offset < buffer.length) {
        // 每筆資料至少需要 8 (timestamp) + 4 (data 長度) = 12 bytes
        if (offset + 12 > buffer.length) {
          console.warn("在 offset", offset, "資料不足，結束解析。");
          break;
        }

        // 讀取 8 bytes 的 timestamp（little-endian）
        const timestampBig = buffer.readBigUInt64LE(offset);
        const timestamp = Number(timestampBig); // 這裡假設 timestamp 不超過 Number.MAX_SAFE_INTEGER
        offset += 8;

        // 讀取 4 bytes 的 data 長度
        const dataLength = buffer.readUInt32LE(offset);
        offset += 4;

        if (offset + dataLength > buffer.length) {
          console.warn("在 offset", offset, "資料不完整，結束解析。");
          break;
        }

        // 讀取 data 的 Buffer
        const dataBuffer = buffer.slice(offset, offset + dataLength);
        offset += dataLength;

        // 使用 decodeGrpcBinary 進行解碼，並取得 sqrtPriceX64
        let decoded;
        try {
          decoded = decodeGrpcBinary(dataBuffer);
        } catch (e) {
          console.error("解碼資料發生錯誤，timestamp:", timestamp, e);
          decoded = null;
        }
        let sqrtPriceX64 = "";
        if (
          decoded &&
          typeof decoded === "object" &&
          decoded.sqrtPriceX64 !== undefined
        ) {
          sqrtPriceX64 = decoded.sqrtPriceX64.toString();
        } else {
          sqrtPriceX64 = "decode_error";
        }

        // 組成 CSV 格式的行 (以雙引號包住 decodedData 以防止特殊符號影響)
        const csvLine = `${timestamp},grpc,"${sqrtPriceX64}"\n`;
        lines.push(csvLine);
      }

      // 寫入 CSV 檔案：先寫入表頭，再寫入每一行資料
      const header = "timestamp,encoding,decodedData\n";
      fs.writeFile(outputCsvFilePath, header + lines.join(""), (err) => {
        if (err) {
          console.error("寫入 CSV 檔案時發生錯誤：", err);
          reject(err);
        } else {
          console.log(
            "已成功將 GRPC 二進位資料處理後存入：",
            outputCsvFilePath
          );
          resolve();
        }
      });
    });
  });
}

// ===== Script Runner Functions =====

// 函式：執行單一腳本並處理輸出
function runScript(scriptPath) {
  const scriptName = path.basename(scriptPath, ".js");
  const logFile = path.join(LOG_DIR, `${scriptName}_${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  console.log(`Starting ${scriptName}...`);

  // 寫入啟動時間到 log
  const timestamp = new Date().toISOString();
  logStream.write(`=== ${scriptName} started at ${timestamp} ===\n\n`);

  // 使用 spawn 執行腳本
  const child = spawn("node", [scriptPath], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  // 處理 stdout
  child.stdout.on("data", (data) => {
    const output = data.toString();
    console.log(`[${scriptName}] ${output}`);
    logStream.write(output);
  });

  // 處理 stderr
  child.stderr.on("data", (data) => {
    const output = data.toString();
    console.error(`[${scriptName} ERROR] ${output}`);
    logStream.write(`ERROR: ${output}`);
  });

  // 當子程序結束時，寫入 log 並關閉 logStream
  child.on("close", (code) => {
    const exitMessage = `\n=== ${scriptName} exited with code ${code} at ${new Date().toISOString()} ===\n`;
    console.log(exitMessage);
    logStream.write(exitMessage);
    logStream.end();
  });

  return child;
}

// 主函式：執行所有腳本並設定執行秒數
function runAllScripts() {
  console.log("Starting all timeAnalysis scripts...");

  const ANALYSIS_FILES = [
    path.join(__dirname, "getData", "http_multiEncoding.js"),
    path.join(__dirname, "getData", "wss_multiEncoding.js"),
    path.join(__dirname, "getData", "grpc_main_bin.js"),
  ];

  const children = ANALYSIS_FILES.map((file) => {
    return runScript(file);
  });

  // 設定一個 timer，到指定秒數後終止所有子程序
  setTimeout(() => {
    console.log(
      `Execution time of ${EXECUTION_SECONDS} seconds reached. Shutting down all child processes...`
    );
    children.forEach((child) => {
      child.kill("SIGINT");
    });

    // 給予子程序一點時間來清理後，再退出主程序
    setTimeout(() => {
      console.log("All processes terminated. Exiting.");
      process.exit(0);
    }, 1000);
  }, EXECUTION_SECONDS * 1000);

  // 同時處理手動中斷 (Ctrl+C) 的情況
  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT. Shutting down all child processes...");
    children.forEach((child) => {
      child.kill("SIGINT");
    });

    setTimeout(() => {
      console.log("All processes terminated. Exiting.");
      process.exit(0);
    }, 1000);
  });

  console.log(
    `All ${children.length} scripts started. They will run for ${EXECUTION_SECONDS} seconds. Press Ctrl+C to stop earlier.`
  );
}

// ===== Main Execution =====

// 設定參數
const LOG_DIR = path.join(__dirname, "logs");
const EXECUTION_SECONDS = config.settings.executionSeconds || 60;
const OUTPUT_FOLDER = path.join(__dirname, "processed_data");
const INPUT_FILES = {
  http: path.join(__dirname, "rawData", "pool_data_http.csv"),
  wss: path.join(__dirname, "rawData", "pool_data_wss.csv"),
  grpc: path.join(__dirname, "rawData", "pool_data_grpc.bin"),
};
const OUTPUT_FILES = {
  http: path.join(OUTPUT_FOLDER, "processed_pool_data_http.csv"),
  wss: path.join(OUTPUT_FOLDER, "processed_pool_data_wss.csv"),
  grpc: path.join(OUTPUT_FOLDER, "processed_pool_data_grpc.csv"),
};

// 確保必要的目錄存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_FOLDER)) {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
}

// 提供命令行參數來選擇執行模式
const args = process.argv.slice(2);
const mode = args[0] || "all";

switch (mode) {
  case "run":
    // 執行所有資料收集腳本
    runAllScripts();
    break;

  case "decode":
    // 處理所有 CSV 和二進位檔案
    Promise.all([
      processFile(INPUT_FILES.http, OUTPUT_FILES.http),
      processFile(INPUT_FILES.wss, OUTPUT_FILES.wss),
      processBinaryFile(INPUT_FILES.grpc, OUTPUT_FILES.grpc),
    ])
      .then(() => {
        console.log("All files processed successfully.");
      })
      .catch((err) => {
        console.error("Error processing files:", err);
      });
    break;

  case "decode-csv":
    // 只處理 CSV 檔案
    Promise.all([
      processFile(INPUT_FILES.http, OUTPUT_FILES.http),
      processFile(INPUT_FILES.wss, OUTPUT_FILES.wss),
    ])
      .then(() => {
        console.log("CSV files processed successfully.");
      })
      .catch((err) => {
        console.error("Error processing CSV files:", err);
      });
    break;

  case "decode-bin":
    // 只處理二進位檔案
    processBinaryFile(INPUT_FILES.grpc, OUTPUT_FILES.grpc)
      .then(() => {
        console.log("Binary file processed successfully.");
      })
      .catch((err) => {
        console.error("Error processing binary file:", err);
      });
    break;

  case "all":
  default:
    console.log("=== Combined Decoder Tool ===");
    console.log("Usage: node combined_decoder.js [mode]");
    console.log("Modes:");
    console.log("  run         - Run all data collection scripts");
    console.log("  decode      - Process all data files (CSV and binary)");
    console.log("  decode-csv  - Process only CSV files");
    console.log("  decode-bin  - Process only binary file");
    console.log("  all         - Show this help message");
    console.log("\nExample: node combined_decoder.js decode");
    break;
}
