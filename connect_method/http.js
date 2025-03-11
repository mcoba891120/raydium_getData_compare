// Using node-fetch for Node.js environments
import fetch from "node-fetch";

/**
 * Simple function to post a JSON-RPC request to a Solana endpoint and return the data
 * @param {string} endpoint - The JSON-RPC endpoint URL (with optional api-key)
 * @param {string} method - The RPC method name
 * @param {string} publicKey - The account's public key
 * @param {string} encoding - The encoding format (e.g., 'base64', 'base58', 'base64+zstd')
 * @returns {Promise<Object>} The RPC response data
 */
async function postRequest(endpoint, method, publicKey, encoding = "base64") {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: method,
        params: [publicKey, { encoding: encoding }],
      }),
    });

    const data = await response.json();
    const timestamp = Date.now();
    // Check for errors in the response
    if (data.error) {
      throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
    }

    // Return the result
    return { data: data.result.value.data, timestamp: timestamp };
  } catch (error) {
    console.error(`Error in RPC call to ${method}:`, error.message);
    throw error;
  }
}

export { postRequest };
