import fs from "fs";
import path from "path";
import csv from "csv-parser";

// ──────────────────────────────
// 工具函式：標準化 data 欄位
// 移除前後空白與可能的引號，若內容為純數字則轉成 BigInt 再轉回字串
function normalizeData(data) {
  if (!data) return "";
  let d = data.trim();
  if (
    (d.startsWith('"') && d.endsWith('"')) ||
    (d.startsWith("'") && d.endsWith("'"))
  ) {
    d = d.slice(1, -1).trim();
  }
  // 如果是純數字，轉成 BigInt 再轉成字串
  if (/^\d+(\.\d+)?$/.test(d)) {
    try {
      // 如果有小數點，轉成 Number 再轉字串；否則轉 BigInt
      return d.includes(".") ? Number(d).toString() : BigInt(d).toString();
    } catch (e) {
      return d;
    }
  }
  return d;
}

// ──────────────────────────────
// 工具函式：讀取 CSV 並附加來源標籤，同時標準化 data 欄位
function readCSV(filePath, source) {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const rawData = row.decodedData ? row.decodedData : row.data;
        records.push({
          timestamp: Number(row.timestamp),
          encoding: row.encoding ? row.encoding.trim() : "unknown",
          data: normalizeData(rawData),
          source, // http, wss, grpc
        });
      })
      .on("end", () => resolve(records))
      .on("error", reject);
  });
}

// ──────────────────────────────
// 工具函式：去重複，保留 timestamp 較早者
function deduplicate(records) {
  const map = new Map();
  for (const rec of records) {
    const key = `${rec.encoding}:${rec.data}`;
    if (!map.has(key) || map.get(key).timestamp > rec.timestamp) {
      map.set(key, rec);
    }
  }
  return Array.from(map.values());
}

// ──────────────────────────────
// 工具函式：計算中位數
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ──────────────────────────────
// 工具函式：計算標準差
function stdDev(arr) {
  const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
  const squareDiffs = arr.map((val) => Math.pow(val - mean, 2));
  const avgSquareDiff =
    squareDiffs.reduce((sum, val) => sum + val, 0) / arr.length;
  return Math.sqrt(avgSquareDiff);
}

// ──────────────────────────────
// 工具函式：計算百分位數
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];

  const sorted = [...arr].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower];

  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// ──────────────────────────────
// 主程式
async function main() {
  // 檔案路徑設定
  const httpFile = "./processed_data/processed_pool_data_http.csv";
  const wssFile = "./processed_data/processed_pool_data_wss.csv";
  // GRPC 改為從 processed_data 讀取
  const grpcFile = "./processed_data/processed_pool_data_grpc.csv";

  // 同時讀取三個檔案，並標記來源
  const [httpRecordsRaw, wssRecords, grpcRecords] = await Promise.all([
    readCSV(httpFile, "http"),
    readCSV(wssFile, "wss"),
    readCSV(grpcFile, "grpc"),
  ]);

  // HTTP 資料依據 (encoding+data) 去重（保留 timestamp 較早者）
  const httpRecords = deduplicate(httpRecordsRaw);

  // 合併所有資料
  const allRecords = [...httpRecords, ...wssRecords, ...grpcRecords];

  // 依據 normalized data 欄位分組
  const groups = new Map();
  for (const rec of allRecords) {
    const key = rec.data; // 這裡使用標準化後的 data
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(rec);
  }

  // 修改：不再要求三種來源都必須存在，而是分別統計每種來源的最早記錄
  const earliestBySource = new Map(); // key 為 source:encoding，value 為 { count, diffs: [] }

  // 對每個數據值，找出每種來源的最早記錄
  for (const [dataVal, recs] of groups.entries()) {
    // 按來源分組
    const bySource = new Map();
    for (const rec of recs) {
      if (!bySource.has(rec.source)) {
        bySource.set(rec.source, []);
      }
      bySource.get(rec.source).push(rec);
    }

    // 對每種來源，找出最早的記錄
    const earliestRecs = [];
    for (const [source, sourceRecs] of bySource.entries()) {
      if (sourceRecs.length > 0) {
        const earliest = sourceRecs.reduce(
          (min, rec) => (rec.timestamp < min.timestamp ? rec : min),
          sourceRecs[0]
        );
        earliestRecs.push(earliest);
      }
    }

    // 如果有多於一種來源，計算時間差
    if (earliestRecs.length > 1) {
      // 按時間戳排序
      earliestRecs.sort((a, b) => a.timestamp - b.timestamp);
      const earliest = earliestRecs[0];

      // 記錄最早記錄的來源和編碼
      const key = `${earliest.source}:${earliest.encoding}`;
      if (!earliestBySource.has(key)) {
        earliestBySource.set(key, { count: 0, diffs: [] });
      }

      // 增加計數
      const entry = earliestBySource.get(key);
      entry.count++;

      // 如果有第二早的記錄，計算時間差
      if (earliestRecs.length > 1) {
        const second = earliestRecs[1];
        entry.diffs.push(second.timestamp - earliest.timestamp);
      }
    }
  }

  // 輸出統計結果
  console.log("【各來源最早記錄類型+encoding 統計】");
  let totalCount = 0;
  let maxCount = 0;
  let maxKey = "";

  for (const [key, { count, diffs }] of earliestBySource.entries()) {
    totalCount += count;
    if (count > maxCount) {
      maxCount = count;
      maxKey = key;
    }

    console.log(`類型+encoding: ${key}`);
    console.log(`  頻率: ${count}`);

    if (diffs.length > 0) {
      const max = Math.max(...diffs);
      const min = Math.min(...diffs);
      const avg = diffs.reduce((sum, val) => sum + val, 0) / diffs.length;
      const med = median(diffs);
      const std = stdDev(diffs);
      console.log(
        `  時間差 - 最大: ${max}, 最小: ${min}, 平均: ${avg.toFixed(
          2
        )}, 中位數: ${med}, 標準差: ${std.toFixed(2)}`
      );
    }
  }

  console.log(`共有 ${totalCount} 筆共同 data 資料參與比對`);
  if (maxKey) {
    const percentage = ((maxCount / totalCount) * 100).toFixed(2);
    console.log(
      `第一名類型 "${maxKey}" 佔比: ${percentage}% (即 ${maxCount} 筆)`
    );
  }

  // 收集所有時間差進行整體分析
  const allDiffs = [];
  for (const { diffs } of earliestBySource.values()) {
    allDiffs.push(...diffs);
  }

  if (allDiffs.length > 0) {
    console.log("\n【全體時間差分佈分析】");
    const max = Math.max(...allDiffs);
    const min = Math.min(...allDiffs);
    const avg = allDiffs.reduce((sum, val) => sum + val, 0) / allDiffs.length;
    const med = median(allDiffs);
    const std = stdDev(allDiffs);
    console.log(
      `全體時間差 - 最大: ${max}, 最小: ${min}, 平均: ${avg.toFixed(
        2
      )}, 中位數: ${med}, 標準差: ${std.toFixed(2)}`
    );

    const p75 = percentile(allDiffs, 0.75);
    const p50 = percentile(allDiffs, 0.5);
    const p25 = percentile(allDiffs, 0.25);
    console.log(
      `75th 百分位數: ${p75.toFixed(2)}, 50th (中位數): ${p50.toFixed(
        2
      )}, 25th 百分位數: ${p25.toFixed(2)}`
    );

    // 計算各區間的比例
    const ranges = [
      { min: p75, max: max, count: 0 },
      { min: p50, max: p75, count: 0 },
      { min: p25, max: p50, count: 0 },
      { min: min, max: p25, count: 0 },
    ];

    for (const diff of allDiffs) {
      for (const range of ranges) {
        if (diff >= range.min && diff < range.max) {
          range.count++;
          break;
        }
      }
    }

    console.log("各區間比例：");
    for (const range of ranges) {
      const percentage = ((range.count / allDiffs.length) * 100).toFixed(2);
      console.log(
        `  區間 [${range.min.toFixed(2)} ~ ${range.max}]: ${percentage}%`
      );
    }
  }
}

// 運行主程式
main().catch(console.error);
