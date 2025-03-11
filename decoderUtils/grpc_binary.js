import { PoolInfoLayout } from "@raydium-io/raydium-sdk";
function decodeGrpcBinary(data) {
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const poolInfo = PoolInfoLayout.decode(dataBuffer);
  return poolInfo;
}

export { decodeGrpcBinary };
