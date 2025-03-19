#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer from 'puppeteer';

// Browser state
let browser: puppeteer.Browser | null = null;
let page: puppeteer.Page | null = null;
let elementInfo: { selector: string; html: string; css: string } | null = null;

class BrowserInspectorServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'browser-inspector',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.closeBrowser();
      await this.server.close();
      process.exit(0);
    });
  }

  private async closeBrowser() {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
      elementInfo = null;
    }
  }

  private async closeBrowserTool() {
    try {
      await this.closeBrowser();
      return {
        content: [
          {
            type: 'text',
            text: 'Browser closed successfully.',
          },
        ],
      };
    } catch (error) {
      console.error('Error closing browser:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error closing browser: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async getElementInfo() {
    try {
      if (!browser || !page) {
        return {
          content: [
            {
              type: 'text',
              text: 'Browser is not launched. Please launch the browser first.',
            },
          ],
          isError: true,
        };
      }

      // Get the selected element info and message
      const result = await page.evaluate(() => {
        return {
          selectedElement: (window as any).selectedElement,
          message: (window as any).selectedElementMessage || ''
        };
      });

      if (!result.selectedElement) {
        return {
          content: [
            {
              type: 'text',
              text: 'No element selected. Please use the inspect_element tool and click on an element first.',
            },
          ],
          isError: true,
        };
      }

      const selectedElement = result.selectedElement;
      const message = result.message;

      // Store element info for later use
      elementInfo = {
        selector: selectedElement.selector,
        html: selectedElement.html,
        css: JSON.stringify(selectedElement.css, null, 2)
      };

      // Take a screenshot
      const screenshot = await page.screenshot({ encoding: 'base64' });

      // Prepare response content
      const content = [
        {
          type: 'text',
          text: `Selected element: ${selectedElement.selector}`,
        },
        {
          type: 'text',
          text: `HTML: ${selectedElement.html.substring(0, 500)}${selectedElement.html.length > 500 ? '...' : ''}`,
        },
        {
          type: 'text',
          text: 'CSS (computed styles):',
        },
        {
          type: 'code',
          language: 'json',
          text: JSON.stringify(selectedElement.css, null, 2),
        },
        {
          type: 'image',
          data: screenshot,
          mimeType: 'image/png',
        }
      ];

      // Add message if provided
      if (message) {
        content.unshift({
          type: 'text',
          text: `Message from user: ${message}`,
        });
      }

      return { content };
    } catch (error) {
      console.error('Error getting element info:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting element info: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async modifyElement(args: any) {
    try {
      if (!browser || !page) {
        return {
          content: [
            {
              type: 'text',
              text: 'Browser is not launched. Please launch the browser first.',
            },
          ],
          isError: true,
        };
      }

      if (!elementInfo) {
        return {
          content: [
            {
              type: 'text',
              text: 'No element selected. Please use the inspect_element tool and click on an element first.',
            },
          ],
          isError: true,
        };
      }

      const { selector } = elementInfo;
      const { css, html } = args;

      // Apply modifications
      if (css) {
        await page.evaluate((data) => {
          const element = document.querySelector(data.selector);
          if (element) {
            Object.entries(data.css).forEach(([property, value]) => {
              (element as HTMLElement).style[property as any] = value as string;
            });
          }
        }, { selector, css });
      }

      if (html) {
        await page.evaluate((data) => {
          const element = document.querySelector(data.selector);
          if (element) {
            element.outerHTML = data.html;
          }
        }, { selector, html });
      }

      // Take a screenshot
      const screenshot = await page.screenshot({ encoding: 'base64' });

      return {
        content: [
          {
            type: 'text',
            text: `Element ${selector} modified successfully.`,
          },
          {
            type: 'image',
            data: screenshot,
            mimeType: 'image/png',
          },
        ],
      };
    } catch (error) {
      console.error('Error modifying element:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error modifying element: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'launch_browser',
          description: 'Launch a browser and navigate to a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to navigate to',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'inspect_element',
          description: 'Enable element inspection mode in the browser',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_element_info',
          description: 'Get information about the currently selected element',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'modify_element',
          description: 'Modify the currently selected element',
          inputSchema: {
            type: 'object',
            properties: {
              css: {
                type: 'object',
                description: 'CSS properties to modify',
                additionalProperties: {
                  type: 'string',
                },
              },
              html: {
                type: 'string',
                description: 'New HTML content for the element',
              },
            },
          },
        },
        {
          name: 'close_browser',
          description: 'Close the browser',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'launch_browser':
          return this.launchBrowser(request.params.arguments);
        case 'inspect_element':
          return this.inspectElement();
        case 'get_element_info':
          return this.getElementInfo();
        case 'modify_element':
          return this.modifyElement(request.params.arguments);
        case 'close_browser':
          return this.closeBrowserTool();
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async launchBrowser(args: any) {
    try {
      if (browser) {
        await this.closeBrowser();
      }

      if (!args.url) {
        return {
          content: [
            {
              type: 'text',
              text: 'URL is required',
            },
          ],
          isError: true,
        };
      }

      browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null, // Allow viewport to be fully resizable
        args: ['--window-size=1280,800', '--start-maximized'],
      });

      page = await browser.newPage();
      await page.goto(args.url);

      // Take a screenshot
      const screenshot = await page.screenshot({ encoding: 'base64' });

      return {
        content: [
          {
            type: 'text',
            text: `Browser launched and navigated to ${args.url}`,
          },
          {
            type: 'image',
            data: screenshot,
            mimeType: 'image/png',
          },
        ],
      };
    } catch (error) {
      console.error('Error launching browser:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error launching browser: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async inspectElement() {
    try {
      if (!browser || !page) {
        return {
          content: [
            {
              type: 'text',
              text: 'Browser is not launched. Please launch the browser first.',
            },
          ],
          isError: true,
        };
      }

      // Inject element selection script with floating icon and toolbar
      await page.evaluate(() => {
        // Implementation of the element selection UI with floating icon
        // This includes the toolbar with "Select Element" and "Change Resolution" buttons
        // And the resolution picker popup
        
        // Create floating icon
        const floatingIcon = document.createElement('div');
        floatingIcon.id = 'mcp-floating-icon';
        floatingIcon.style.position = 'fixed';
        floatingIcon.style.bottom = '10px';
        floatingIcon.style.right = '10px';
        floatingIcon.style.width = '50px';
        floatingIcon.style.height = '50px';
        floatingIcon.style.borderRadius = '50%';
        floatingIcon.style.backgroundColor = '#007bff';
        floatingIcon.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        floatingIcon.style.cursor = 'pointer';
        floatingIcon.style.zIndex = '2147483647'; // Maximum z-index to ensure visibility
        floatingIcon.style.display = 'flex';
        floatingIcon.style.alignItems = 'center';
        floatingIcon.style.justifyContent = 'center';
        floatingIcon.style.transition = 'all 0.3s ease';
        floatingIcon.style.transform = 'scale(0.9)'; // Slightly smaller to ensure it fits
        
        // Add SVG icon inside the floating button
        floatingIcon.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 8l4 4-4 4"></path>
            <path d="M3 12h18"></path>
          </svg>
        `;
        document.body.appendChild(floatingIcon);
        
        // Create toolbar (initially hidden)
        const toolbar = document.createElement('div');
        toolbar.id = 'mcp-toolbar';
        toolbar.style.position = 'fixed';
        toolbar.style.bottom = '20px';
        toolbar.style.right = '80px';
        toolbar.style.backgroundColor = 'white';
        toolbar.style.borderRadius = '8px';
        toolbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        toolbar.style.padding = '10px';
        toolbar.style.display = 'none';
        toolbar.style.zIndex = '10002';
        
        // Add buttons to toolbar
        const selectElementButton = document.createElement('button');
        selectElementButton.id = 'mcp-select-element-btn';
        selectElementButton.innerHTML = 'Select Element';
        selectElementButton.style.backgroundColor = '#007bff';
        selectElementButton.style.color = 'white';
        selectElementButton.style.border = 'none';
        selectElementButton.style.borderRadius = '5px';
        selectElementButton.style.padding = '8px 12px';
        selectElementButton.style.marginRight = '10px';
        selectElementButton.style.cursor = 'pointer';
        
        const changeResolutionButton = document.createElement('button');
        changeResolutionButton.id = 'mcp-change-resolution-btn';
        changeResolutionButton.innerHTML = 'Change Resolution';
        changeResolutionButton.style.backgroundColor = '#6c757d';
        changeResolutionButton.style.color = 'white';
        changeResolutionButton.style.border = 'none';
        changeResolutionButton.style.borderRadius = '5px';
        changeResolutionButton.style.padding = '8px 12px';
        changeResolutionButton.style.cursor = 'pointer';
        
        toolbar.appendChild(selectElementButton);
        toolbar.appendChild(changeResolutionButton);
        document.body.appendChild(toolbar);
        
        // Create resolution picker (initially hidden)
        const resolutionPicker = document.createElement('div');
        resolutionPicker.id = 'mcp-resolution-picker';
        resolutionPicker.style.position = 'fixed';
        resolutionPicker.style.bottom = '80px';
        resolutionPicker.style.right = '80px';
        resolutionPicker.style.backgroundColor = 'white';
        resolutionPicker.style.borderRadius = '8px';
        resolutionPicker.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        resolutionPicker.style.padding = '15px';
        resolutionPicker.style.display = 'none';
        resolutionPicker.style.zIndex = '10004';
        resolutionPicker.style.width = '300px';
        
        // Add close button to resolution picker
        const closeButton = document.createElement('div');
        closeButton.id = 'mcp-close-resolution';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '10px';
        closeButton.style.right = '10px';
        closeButton.style.cursor = 'pointer';
        closeButton.innerHTML = '✕';
        resolutionPicker.appendChild(closeButton);
        
        // Add device options to resolution picker
        // ... (implementation details)
        
        document.body.appendChild(resolutionPicker);
        
        // Add event listeners for the floating icon, toolbar, and resolution picker
        let isToolbarVisible = false;
        let isResolutionPickerVisible = false;
        let isSelectionModeActive = false;
        
        // Toggle toolbar when floating icon is clicked
        floatingIcon.addEventListener('click', () => {
          isToolbarVisible = !isToolbarVisible;
          toolbar.style.display = isToolbarVisible ? 'block' : 'none';
        });
        
        // Toggle resolution picker when change resolution button is clicked
        changeResolutionButton.addEventListener('click', () => {
          isResolutionPickerVisible = !isResolutionPickerVisible;
          resolutionPicker.style.display = isResolutionPickerVisible ? 'block' : 'none';
        });
        
        // Close resolution picker when close button is clicked
        closeButton.addEventListener('click', () => {
          isResolutionPickerVisible = false;
          resolutionPicker.style.display = 'none';
        });
        
        // Toggle selection mode when select element button is clicked
        selectElementButton.addEventListener('click', () => {
          isSelectionModeActive = !isSelectionModeActive;
          
          if (isSelectionModeActive) {
            // Change floating icon to red X
            floatingIcon.style.backgroundColor = '#dc3545';
            floatingIcon.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            `;
            
            // Hide toolbar
            isToolbarVisible = false;
            toolbar.style.display = 'none';
            
            // Add element selection functionality
            const highlightElement = (element: Element) => {
              // Remove previous highlight
              const prevHighlight = document.querySelector('.mcp-element-highlight');
              if (prevHighlight) {
                document.body.removeChild(prevHighlight);
              }
              
              // Get element position and dimensions
              const rect = element.getBoundingClientRect();
              
              // Create highlight overlay
              const highlight = document.createElement('div');
              highlight.className = 'mcp-element-highlight';
              highlight.style.position = 'fixed';
              highlight.style.top = rect.top + 'px';
              highlight.style.left = rect.left + 'px';
              highlight.style.width = rect.width + 'px';
              highlight.style.height = rect.height + 'px';
              highlight.style.border = '2px solid #ff0000';
              highlight.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
              highlight.style.pointerEvents = 'none';
              highlight.style.zIndex = '2147483646'; // Just below the floating icon
              
              document.body.appendChild(highlight);
            };
            
            // Add mouseover event to highlight elements
            document.addEventListener('mouseover', (e) => {
              if (isSelectionModeActive) {
                highlightElement(e.target as Element);
              }
            });
            
            // Add click event to select elements
            document.addEventListener('click', (e) => {
              if (isSelectionModeActive) {
                e.preventDefault();
                e.stopPropagation();
                
                const target = e.target as Element;
                
                // Don't select the floating icon or toolbar
                if (floatingIcon.contains(target) || toolbar.contains(target) || resolutionPicker.contains(target)) {
                  return;
                }
                
                // Get element info
                const computedStyle = window.getComputedStyle(target);
                const cssProperties: Record<string, string> = {};
                
                for (let i = 0; i < computedStyle.length; i++) {
                  const prop = computedStyle[i];
                  cssProperties[prop] = computedStyle.getPropertyValue(prop);
                }
                
                // Store selected element info in window object
                (window as any).selectedElement = {
                  selector: getUniqueSelector(target),
                  html: target.outerHTML,
                  css: cssProperties
                };
                
                // Exit selection mode
                isSelectionModeActive = false;
                
                // Change floating icon back to original
                floatingIcon.style.backgroundColor = '#007bff';
                floatingIcon.innerHTML = `
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 8l4 4-4 4"></path>
                    <path d="M3 12h18"></path>
                  </svg>
                `;
                
                // Remove highlight
                const highlight = document.querySelector('.mcp-element-highlight');
                if (highlight) {
                  document.body.removeChild(highlight);
                }
                
                // Turn the selected element green
                const originalBackgroundColor = (target as HTMLElement).style.backgroundColor;
                (target as HTMLElement).style.backgroundColor = 'rgba(40, 167, 69, 0.3)'; // Green with transparency
                (target as HTMLElement).style.transition = 'background-color 0.3s ease';
                
                // Create dialog box for sending a message
                const dialogBox = document.createElement('div');
                dialogBox.id = 'mcp-dialog-box';
                dialogBox.style.position = 'fixed';
                dialogBox.style.top = '50%';
                dialogBox.style.left = '50%';
                dialogBox.style.transform = 'translate(-50%, -50%)';
                dialogBox.style.backgroundColor = 'white';
                dialogBox.style.borderRadius = '8px';
                dialogBox.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
                dialogBox.style.padding = '20px';
                dialogBox.style.zIndex = '2147483647';
                dialogBox.style.width = '400px';
                dialogBox.style.maxWidth = '90%';
                
                // Add dialog content
                dialogBox.innerHTML = `
                  <h3 style="margin-top: 0; color: #333; font-family: sans-serif;">Element Selected</h3>
                  <p style="color: #666; font-family: sans-serif;">Selected element: ${getUniqueSelector(target)}</p>
                  <textarea id="mcp-message-input" placeholder="Enter your message here..." style="width: 100%; height: 100px; padding: 8px; margin: 10px 0; border-radius: 4px; border: 1px solid #ddd; font-family: sans-serif; resize: vertical;"></textarea>
                  <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="mcp-cancel-btn" style="padding: 8px 16px; border: none; border-radius: 4px; background-color: #6c757d; color: white; cursor: pointer; font-family: sans-serif;">Cancel</button>
                    <button id="mcp-send-btn" style="padding: 8px 16px; border: none; border-radius: 4px; background-color: #28a745; color: white; cursor: pointer; font-family: sans-serif;">Send</button>
                  </div>
                `;
                
                document.body.appendChild(dialogBox);
                
                // Focus the textarea
                setTimeout(() => {
                  const textarea = document.getElementById('mcp-message-input');
                  if (textarea) {
                    textarea.focus();
                  }
                }, 100);
                
                // Add event listeners for dialog buttons
                document.getElementById('mcp-cancel-btn')?.addEventListener('click', () => {
                  // Remove dialog box
                  document.body.removeChild(dialogBox);
                  
                  // Restore original background color
                  (target as HTMLElement).style.backgroundColor = originalBackgroundColor;
                });
                
                document.getElementById('mcp-send-btn')?.addEventListener('click', () => {
                  const messageInput = document.getElementById('mcp-message-input') as HTMLTextAreaElement;
                  const message = messageInput.value.trim();
                  
                  if (message) {
                    // Store the message in the window object
                    (window as any).selectedElementMessage = message;
                    
                    // Show success notification
                    const notification = document.createElement('div');
                    notification.style.position = 'fixed';
                    notification.style.top = '20px';
                    notification.style.left = '50%';
                    notification.style.transform = 'translateX(-50%)';
                    notification.style.backgroundColor = '#28a745';
                    notification.style.color = 'white';
                    notification.style.padding = '10px 20px';
                    notification.style.borderRadius = '5px';
                    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
                    notification.style.zIndex = '2147483647';
                    notification.textContent = 'Message sent!';
                    
                    document.body.appendChild(notification);
                    
                    // Remove notification after 2 seconds
                    setTimeout(() => {
                      document.body.removeChild(notification);
                    }, 2000);
                  }
                  
                  // Remove dialog box
                  document.body.removeChild(dialogBox);
                  
                  // Keep the element green for a moment, then restore original color
                  setTimeout(() => {
                    (target as HTMLElement).style.backgroundColor = originalBackgroundColor;
                  }, 2000);
                });
              }
            }, true);
            
            // Function to get a unique CSS selector for an element
            function getUniqueSelector(element: Element): string {
              if (element.id) {
                return '#' + element.id;
              }
              
              if (element.tagName === 'BODY') {
                return 'body';
              }
              
              const parent = element.parentElement;
              if (!parent) {
                return element.tagName.toLowerCase();
              }
              
              // Get all siblings with the same tag
              const siblings = Array.from(parent.children).filter(
                child => child.tagName === element.tagName
              );
              
              // If there's only one element with this tag, use the tag name
              if (siblings.length === 1) {
                return getUniqueSelector(parent) + ' > ' + element.tagName.toLowerCase();
              }
              
              // Find the index of the element among its siblings
              const index = siblings.indexOf(element as Element);
              
              // Use nth-child selector
              return getUniqueSelector(parent) + ' > ' + element.tagName.toLowerCase() + ':nth-child(' + (index + 1) + ')';
            }
          } else {
            // Change floating icon back to original
            floatingIcon.style.backgroundColor = '#007bff';
            floatingIcon.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 8l4 4-4 4"></path>
                <path d="M3 12h18"></path>
              </svg>
            `;
            
            // Remove highlight
            const highlight = document.querySelector('.mcp-element-highlight');
            if (highlight) {
              document.body.removeChild(highlight);
            }
          }
        });
        
        // Close toolbar and resolution picker when clicking outside
        document.addEventListener('click', (e) => {
          const target = e.target as Element;
          
          // Don't close if clicking on the floating icon, toolbar, or resolution picker
          if (floatingIcon.contains(target) || toolbar.contains(target) || resolutionPicker.contains(target)) {
            return;
          }
          
          // Don't close if in selection mode
          if (isSelectionModeActive) {
            return;
          }
          
          // Close toolbar and resolution picker
          isToolbarVisible = false;
          isResolutionPickerVisible = false;
          toolbar.style.display = 'none';
          resolutionPicker.style.display = 'none';
        });
      });

      // Wait a moment for the UI to be fully injected
      await new Promise(resolve => setTimeout(resolve, 500));

      // Take a screenshot
      const screenshot = await page.screenshot({ encoding: 'base64' });

      return {
        content: [
          {
            type: 'text',
            text: 'Element inspection mode enabled. You should see a blue floating icon in the bottom-right corner. Click on it to show the toolbar.',
          },
          {
            type: 'image',
            data: screenshot,
            mimeType: 'image/png',
          },
        ],
      };
    } catch (error) {
      console.error('Error enabling inspection mode:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error enabling inspection mode: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Browser Inspector MCP server running on stdio');
  }
}

const server = new BrowserInspectorServer();
server.run().catch(console.error);
