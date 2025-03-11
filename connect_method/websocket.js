import WebSocket from "ws";
import { PoolInfoLayout, SqrtPriceMath } from "@raydium-io/raydium-sdk";

/**
 * Subscribe to a Raydium pool's updates via WebSocket
 * @param {string} endpoint - The WebSocket endpoint with API key
 * @param {string} poolAddress - The pool account address to subscribe to
 * * @param {string} encoding - 編碼格式
 * @param {function} onUpdate - 資料更新時的 callback
 * @returns {WebSocket} The WebSocket connection object
 */
function subscribeToPool(endpoint, poolAddress, encoding = "base64", onUpdate) {
  // Create WebSocket connection
  const ws = new WebSocket(endpoint);

  // Function to send subscription request
  function sendSubscriptionRequest(ws) {
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "accountSubscribe",
      params: [
        poolAddress,
        {
          encoding: encoding,
        },
      ],
    };
    ws.send(JSON.stringify(request));
  }

  // Keep connection alive with ping
  function startPing(ws) {
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        console.log("Ping sent");
      }
    }, 30000);
  }

  // WebSocket event handlers
  ws.on("open", function open() {
    console.log("WebSocket connection established");
    sendSubscriptionRequest(ws);
    startPing(ws);
  });

  ws.on("message", function incoming(data) {
    try {
      const timestamp = Date.now();
      const message = JSON.parse(data.toString("utf8"));

      // Handle subscription response
      if (message.result !== undefined) {
        console.log("Subscription ID:", message.result);
        return;
      }
      if (
        typeof onUpdate === "function" &&
        message.params?.result?.value?.data
      ) {
        onUpdate({
          data: message.params.result.value.data,
          timestamp: timestamp,
        });
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });

  ws.on("close", function close() {
    console.log("WebSocket connection closed");
  });

  return ws;
}

// Example usage
async function main() {
  const endpoint =
    "wss://gasmen-resuspending-oxiqryjjgk-dedicated.helius-rpc.com?api-key=5a799373-aa54-455e-83c4-b1c5f16d9df3";
  const poolAddress = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";

  console.log(`Subscribing to pool ${poolAddress}...`);
  const ws = subscribeToPool(endpoint, poolAddress, "base64+zstd");
}

// Run example if file is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  main();
}

export { subscribeToPool };
