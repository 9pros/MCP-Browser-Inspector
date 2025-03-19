# Browser Inspector MCP Tool

A Model Context Protocol (MCP) tool for inspecting and modifying web elements with responsive testing capabilities.

## Features

- **Element Selection**: Easily select and inspect any element on a webpage
- **Responsive Testing**: Test your website at different device resolutions
- **Element Information**: View detailed information about selected elements (HTML, CSS)
- **Modification Requests**: Submit requests to modify selected elements
- **Toggle Mode**: Switch between browsing and selection modes

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/browser-inspector.git
   cd browser-inspector
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Add to MCP settings:
   
   Add the following to your MCP settings file (located at `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` for Cursor, or `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude desktop app):

   ```json
   {
     "mcpServers": {
       "browser-inspector": {
         "command": "node",
         "args": ["/path/to/browser-inspector/build/index.js"],
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

   Replace `/path/to/browser-inspector` with the actual path to your installation.

## Usage

Once installed and configured, you can use the browser inspector in your conversations with Claude:

1. Launch a browser with the URL you want to inspect:
   ```
   Use the browser-inspector MCP tool to launch a browser at http://example.com
   ```

2. Enable inspection mode:
   ```
   Use the browser-inspector MCP tool to enable inspection mode
   ```

3. In the browser window:
   - Click the "Select Element" button in the bottom left to toggle selection mode
   - Use the device selector in the top right to test different screen sizes
   - When selection mode is ON, hover over elements to see information
   - Click once to select an element, click again to open the modification dialog
   - Submit modification requests to Claude

## Development

### Project Structure

- `src/index.ts`: Main server implementation
- `build/`: Compiled JavaScript files

### Building

```bash
npm run build
```

### Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgements

- [Model Context Protocol](https://github.com/modelcontextprotocol/mcp)
- [Puppeteer](https://pptr.dev/)
