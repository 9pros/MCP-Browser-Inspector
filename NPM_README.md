# MCP Browser Inspector

A Model Context Protocol (MCP) tool for inspecting and modifying web elements with responsive testing capabilities.

## Features

- **Element Selection**: Easily select and inspect any element on a webpage
- **Responsive Testing**: Test your website at different device resolutions
- **Element Information**: View detailed information about selected elements (HTML, CSS)
- **Modification Requests**: Submit requests to modify selected elements
- **Toggle Mode**: Switch between browsing and selection modes

## Installation

```bash
# Install globally
npm install -g mcp-browser-inspector

# Or install locally
npm install mcp-browser-inspector
```

## Usage with Claude

Add to your MCP settings file:

```json
{
  "mcpServers": {
    "browser-inspector": {
      "command": "node",
      "args": ["/path/to/node_modules/mcp-browser-inspector/build/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Then in your conversation with Claude:

```
Use the browser-inspector MCP tool to launch a browser at http://example.com
```

## Documentation

For full documentation, visit the [GitHub repository](https://github.com/yourusername/mcp-browser-inspector).

## License

MIT
