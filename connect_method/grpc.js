import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import * as bs58 from "bs58";
import { PoolInfoLayout, SqrtPriceMath } from "@raydium-io/raydium-sdk";
import { decodeBase58 } from "../decoderUtils/base58.js";

// GrpcStreamManager class for handling gRPC connections
class GrpcStreamManager {
  constructor(endpoint, authToken, accountUpdateCallback) {
    this.client = new Client(endpoint, authToken, {
      "grpc.max_receive_message_length": 64 * 1024 * 1024,
    });
    this.accountUpdateCallback = accountUpdateCallback;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectInterval = 5000; // 5 seconds
    this.subscriptions = new Map(); // Map to track subscriptions
    this.pingInterval = null;
  }

  async connect(subscribeRequest) {
    try {
      this.stream = await this.client.subscribe();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log("Connected to gRPC stream");

      // Set up stream handlers
      this.stream.on("data", this.handleData.bind(this));
      this.stream.on("error", this.handleError.bind(this));
      this.stream.on("end", () => this.handleDisconnect(subscribeRequest));
      this.stream.on("close", () => this.handleDisconnect(subscribeRequest));

      // Send initial subscription request
      await this.write(subscribeRequest);
      console.log("Subscription request sent");

      // Start keep-alive ping
      this.startPing();
    } catch (error) {
      console.error("Connection error:", error);
      await this.reconnect(subscribeRequest);
    }
  }

  async write(req) {
    return new Promise((resolve, reject) => {
      this.stream.write(req, (err) => (err ? reject(err) : resolve()));
    });
  }

  async reconnect(subscribeRequest) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnection attempt ${this.reconnectAttempts}...`);

    // Clear any existing ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Wait before reconnecting
    await new Promise((resolve) => setTimeout(resolve, this.reconnectInterval));

    // Try to connect again
    await this.connect(subscribeRequest);
  }

  startPing() {
    // Clear any existing ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Send a ping every 30 seconds to keep the connection alive
    this.pingInterval = setInterval(async () => {
      if (this.isConnected) {
        try {
          await this.write({ ping: {} });
        } catch (error) {
          console.error("Ping error:", error);
        }
      }
    }, 30000);
  }

  handleData(data) {
    try {
      if (data.account) {
        const timestamp = Date.now();
        const accountInfo = data.account.account;
        // 取出我們所需要的資料：data.account.account.data
        const accountData = accountInfo.data;
        // 呼叫全域更新 callback，僅傳入 timestamp 與 accountData
        if (this.accountUpdateCallback) {
          this.accountUpdateCallback({ timestamp, data: accountData });
        }

        // 如果有針對特定 pubkey 設定的 callback，也一併呼叫
        const callback = this.subscriptions.get(accountInfo.pubkey);
        if (callback) {
          callback({ timestamp, data: accountData });
        }
      }
    } catch (error) {
      console.error("Error handling data:", error);
    }
  }

  handleError(error) {
    console.error("Stream error:", error);
  }

  handleDisconnect(subscribeRequest) {
    console.log("Disconnected from gRPC stream");
    this.isConnected = false;
    this.reconnect(subscribeRequest);
  }

  addSubscription(accountAddress, callback) {
    this.subscriptions.set(accountAddress, callback);
    return () => this.subscriptions.delete(accountAddress);
  }
}

/**
 * Subscribe to a Raydium pool's updates via gRPC
 * @param {string} endpoint - The gRPC endpoint with API key
 * @param {string} poolAddress - The pool account address to subscribe to
 * @param {string} authToken - The authentication token for the gRPC service
 * @param {function} updateCallback - Callback function for updates
 * @returns {Promise<void>}
 */
async function subscribeToPoolGrpc(
  endpoint,
  poolAddress,
  authToken,
  updateCallback
) {
  const manager = new GrpcStreamManager(endpoint, authToken, updateCallback);

  // Create subscription request for the pool account
  const subscribeRequest = {
    accounts: {
      accountSubscribe: {
        account: [poolAddress],
        owner: [],
        filters: [],
      },
    },
    accountsDataSlice: [],
    commitment: CommitmentLevel.FINALIZED,
    slots: {},
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
  };
  await manager.connect(subscribeRequest);
}

/**
 * Process and decode account data from gRPC response
//  * @param {Buffer} data - The binary data buffer from account.data
//  * @param {number} tokenDecimalsA - Decimals of token A (e.g., 9 for SOL)
//  * @param {number} tokenDecimalsB - Decimals of token B (e.g., 6 for USDC)
//  * @returns {Object} Decoded pool info and calculated price
//  */
// function processAccountData(data, tokenDecimalsA = 9, tokenDecimalsB = 6) {
//   try {
//     // Ensure we have a Buffer
//     const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

//     // Decode the pool info using Raydium SDK
//     const poolInfo = PoolInfoLayout.decode(dataBuffer);

//     // Calculate the price
//     const price = SqrtPriceMath.sqrtPriceX64ToPrice(
//       poolInfo.sqrtPriceX64,
//       tokenDecimalsA,
//       tokenDecimalsB
//     ).toFixed(15);

//     return {
//       poolInfo,
//       price,
//       timestamp: new Date().toISOString(),
//     };
//   } catch (error) {
//     console.error("Error decoding account data:", error);
//     throw error;
//   }
// }
export { subscribeToPoolGrpc };
// Example usage:
// subscribeToPoolGrpc(
//   "https://gasmen-resuspending-oxiqryjjgk-dedicated-lb.helius-rpc.com:2053",
//   "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj"
// ).catch(console.error);
