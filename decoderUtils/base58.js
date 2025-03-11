// Base58 decoder
import * as bs58 from "bs58";

export function decodeBase58(data) {
  return bs58.default.decode(data);
}
