import { postRequest } from "./http.js";
import { decodeBase64AndZstd } from "../decoder/base64+zstd.js";
import { SqrtPriceMath, PoolInfoLayout } from "@raydium-io/raydium-sdk";

/**
 * Get the price of a Raydium pool
 * @param {string} endpoint - The RPC endpoint with API key
 * @param {string} poolAddress - The pool account address
 * @param {number} tokenDecimalsA - Decimals of token A (e.g., 9 for SOL)
 * @param {number} tokenDecimalsB - Decimals of token B (e.g., 6 for USDC)
 * @returns {Promise<string>} The price as a string
 */
async function getPoolPrice(
  endpoint,
  poolAddress,
  tokenDecimalsA = 9,
  tokenDecimalsB = 6
) {
  try {
    // Get the account data with base64+zstd encoding
    const result = await postRequest(
      endpoint,
      "getAccountInfo",
      poolAddress,
      "base64+zstd"
    );

    // Decode the compressed data
    const decompressedBuffer = decodeBase64AndZstd(result.value.data);
    // Decode the pool info
    const poolInfo = PoolInfoLayout.decode(decompressedBuffer);
    // Calculate and return the price
    const price = SqrtPriceMath.sqrtPriceX64ToPrice(
      poolInfo.sqrtPriceX64,
      tokenDecimalsA,
      tokenDecimalsB
    ).toFixed(15);

    return price;
  } catch (error) {
    console.error("Error getting pool price:", error.message);
    throw error;
  }
}

// Example usage
async function main() {
  try {
    const endpoint =
      "https://gasmen-resuspending-oxiqryjjgk-dedicated.helius-rpc.com/?api-key=5a799373-aa54-455e-83c4-b1c5f16d9df3";
    const poolAddress = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";

    console.log(`Getting price for pool ${poolAddress}...`);
    const price = await getPoolPrice(endpoint, poolAddress);
    console.log(`Current price: ${price}`);
  } catch (error) {
    console.error("Error in main:", error.message);
  }
}

// Run the example if this file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  main();
}

export { getPoolPrice };
