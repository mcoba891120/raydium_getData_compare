# Raydium Pool Data Decoder

This project provides tools for collecting, decoding, and analyzing Raydium pool data from various sources (HTTP, WebSocket, and gRPC). It supports multiple encoding formats and provides utilities for processing and comparing the data.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Usage](#usage)
  - [Data Collection](#data-collection)
  - [Data Decoding](#data-decoding)
  - [Combined Tool](#combined-tool)
- [Supported Encodings](#supported-encodings)
- [File Formats](#file-formats)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd raydium_getData_Compare
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up configuration:
   ```bash
   cp config.example.js config.js
   ```
   Then edit `config.js` with your API keys and endpoints.

## Configuration

The project uses a configuration file (`config.js`) to store all endpoints and authentication tokens. This file is not committed to the repository for security reasons.

1. Copy the example configuration file:

   ```bash
   cp config.example.js config.js
   ```

2. Edit the `config.js` file with your actual credentials:

   ```javascript
   export default {
     // HTTP endpoint configuration
     http: {
       endpoint: "https://your-http-endpoint.com/api",
       apiKey: "your-http-api-key-here",
     },

     // WebSocket endpoint configuration
     websocket: {
       endpoint: "wss://your-websocket-endpoint.com",
       apiKey: "your-websocket-api-key-here",
     },

     // gRPC endpoint configuration
     grpc: {
       endpoint: "https://your-grpc-endpoint.com:2053",
       authToken: "your-grpc-auth-token-here",
     },

     // Pool address to monitor
     poolAddress: "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj",

     // Execution settings
     settings: {
       executionSeconds: 60,
     },
   };
   ```

3. Make sure `config.js` is in your `.gitignore` file to prevent accidentally committing your secrets.

## Project Structure

The project is organized into several directories:

- `connect_method/`: Contains modules for different connection methods (HTTP, WebSocket, gRPC)
- `decoderUtils/`: Contains utility functions for decoding data in various formats
- `getData/`: Contains scripts for collecting data from different sources
- `rawData/`: Stores the raw collected data
- `processed_data/`: Stores the processed and decoded data
- `logs/`: Contains log files from data collection runs

Key files:

- `combined_decoder.js`: A combined tool that integrates data collection and decoding

## Usage

### Data Collection

To collect data from all sources (HTTP, WebSocket, gRPC) for a specified duration:

```bash
node combined_decoder.js run
```

This will run all data collection scripts for 60 seconds (default) and save the results in the `rawData/` directory.

### Data Decoding

To decode the collected data:

```bash
# Decode all data files (CSV and binary)
node combined_decoder.js decode

# Decode only CSV files (HTTP and WebSocket data)
node combined_decoder.js decode-csv

# Decode only binary files (gRPC data)
node combined_decoder.js decode-bin
```

The decoded data will be saved in the `processed_data/` directory.

### Combined Tool

The `combined_decoder.js` file provides a unified interface for all functionality:

```bash
# Show help information
node combined_decoder.js

# Run all data collection scripts
node combined_decoder.js run

# Process all data files
node combined_decoder.js decode

# Process only CSV files
node combined_decoder.js decode-csv

# Process only binary files
node combined_decoder.js decode-bin
```

## Supported Encodings

The decoder supports the following encoding formats:

- `base64`: Standard base64 encoding
- `base64+zstd`: Base64 encoding with zstd compression
- `grpc`: Binary data from gRPC
- `jsonParsed`: JSON parsed data

## File Formats

### Input Files

- HTTP and WebSocket data: CSV files with columns `timestamp`, `data`, and `encoding`
- gRPC data: Binary file with format `[8 bytes timestamp][4 bytes data length][data bytes]`

### Output Files

All decoded data is saved as CSV files with columns `timestamp`, `encoding`, and `decodedData`.

## Troubleshooting

### Common Issues

1. **Missing dependencies**:

   ```bash
   npm install
   ```

### Debugging

For more detailed logs during data collection, check the log files in the `logs/` directory.

---

## Advanced Usage

### Customizing Data Collection

You can modify the data collection parameters by editing the following variables in `combined_decoder.js`:

- `EXECUTION_SECONDS`: Duration for which data collection scripts run (default: 60 seconds)
- `INPUT_FILES` and `OUTPUT_FILES`: Paths for input and output files

### Adding New Decoders

To add support for a new encoding format:

1. Create a new decoder function in the `decoderUtils/` directory
2. Import the function in `combined_decoder.js`
3. Add a new case in the `switch` statement in the `processFile` function

---

For more information or to report issues, please contact the repository maintainer.
