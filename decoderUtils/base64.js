import { PoolInfoLayout } from "@raydium-io/raydium-sdk";

function decodeBase64(base64Data) {
  const decodedData = Buffer.from(base64Data, "base64");
  return PoolInfoLayout.decode(decodedData);
}

export { decodeBase64 };
