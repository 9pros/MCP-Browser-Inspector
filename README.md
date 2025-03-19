# MCP Browser Inspector

A Model Context Protocol (MCP) tool for inspecting and modifying web elements with responsive testing capabilities and interactive messaging.

## Features

- **Floating UI**: Convenient floating icon in the bottom-right corner that stays visible on all pages
- **Interactive Toolbar**: Expandable toolbar with action buttons for element selection and resolution changes
- **Element Selection**: Easily select and inspect any element on a webpage with visual highlighting
- **Visual Feedback**: Elements highlight in red when hovering and turn green when selected
- **Message Communication**: Send messages about selected elements through an interactive dialog
- **Responsive Testing**: Test your website at different device resolutions with a fully resizable browser
- **Element Information**: View detailed information about selected elements (HTML, CSS) and associated messages
- **Modification Requests**: Submit requests to modify selected elements in real-time
- **Toggle Mode**: Switch between browsing and selection modes with clear visual indicators

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
