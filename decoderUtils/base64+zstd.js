//decode base64 and zstd
import * as fzstd from "fzstd";
import { PoolInfoLayout } from "@raydium-io/raydium-sdk";

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

export { decodeBase64AndZstd };
