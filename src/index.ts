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
        defaultViewport: null, // Allow viewport to be resizable
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

      // Inject element selection script
      await page.evaluate(() => {
        // Remove existing elements if any
        const existingElements = [
          'mcp-inspector-overlay',
          'mcp-inspector-info',
          'mcp-inspector-dialog',
          'mcp-inspector-highlight',
          'mcp-toggle-button'
        ];
        
        existingElements.forEach(id => {
          const element = document.getElementById(id);
          if (element) {
            element.remove();
          }
        });

        // Create overlay (initially hidden)
        const overlay = document.createElement('div');
        overlay.id = 'mcp-inspector-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
        overlay.style.zIndex = '9999';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'none'; // Initially hidden
        document.body.appendChild(overlay);

        // Create info panel (initially hidden)
        const infoPanel = document.createElement('div');
        infoPanel.id = 'mcp-inspector-info';
        infoPanel.style.position = 'fixed';
        infoPanel.style.bottom = '70px'; // Position above the toggle button
        infoPanel.style.left = '10px';
        infoPanel.style.backgroundColor = 'white';
        infoPanel.style.padding = '10px';
        infoPanel.style.borderRadius = '5px';
        infoPanel.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        infoPanel.style.zIndex = '10000';
        infoPanel.style.maxWidth = '300px';
        infoPanel.style.fontSize = '12px';
        infoPanel.style.fontFamily = 'monospace';
        infoPanel.style.display = 'none'; // Initially hidden
        infoPanel.innerHTML = 'Hover over elements and click to select one';
        document.body.appendChild(infoPanel);

        // Create dialog for modification requests
        const dialogBox = document.createElement('div');
        dialogBox.id = 'mcp-inspector-dialog';
        dialogBox.style.position = 'absolute';
        dialogBox.style.backgroundColor = 'white';
        dialogBox.style.padding = '10px';
        dialogBox.style.borderRadius = '5px';
        dialogBox.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        dialogBox.style.zIndex = '10002';
        dialogBox.style.display = 'none';
        dialogBox.style.width = '300px';
        dialogBox.innerHTML = `
          <div style="margin-bottom: 8px; font-weight: bold;">Modification Request</div>
          <textarea id="mcp-modification-request" style="width: 100%; height: 100px; margin-bottom: 8px; padding: 5px; border: 1px solid #ccc; border-radius: 3px;"></textarea>
          <div style="display: flex; justify-content: space-between;">
            <button id="mcp-cancel-button" style="padding: 5px 10px; border: none; border-radius: 3px; background-color: #f44336; color: white; cursor: pointer;">Cancel</button>
            <button id="mcp-submit-button" style="padding: 5px 10px; border: none; border-radius: 3px; background-color: #4CAF50; color: white; cursor: pointer;">Submit</button>
          </div>
        `;
        document.body.appendChild(dialogBox);

        // Create toggle button
        const toggleButton = document.createElement('button');
        toggleButton.id = 'mcp-toggle-button';
        toggleButton.style.position = 'fixed';
        toggleButton.style.bottom = '10px';
        toggleButton.style.left = '10px';
        toggleButton.style.padding = '10px 15px';
        toggleButton.style.backgroundColor = '#007bff';
        toggleButton.style.color = 'white';
        toggleButton.style.border = 'none';
        toggleButton.style.borderRadius = '5px';
        toggleButton.style.fontWeight = 'bold';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.zIndex = '10003';
        toggleButton.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.3)';
        toggleButton.innerHTML = 'Select Element';
        document.body.appendChild(toggleButton);

        // Create device selector
        const deviceSelector = document.createElement('div');
        deviceSelector.id = 'mcp-device-selector';
        deviceSelector.style.position = 'fixed';
        deviceSelector.style.top = '10px';
        deviceSelector.style.right = '10px';
        deviceSelector.style.backgroundColor = 'white';
        deviceSelector.style.padding = '10px';
        deviceSelector.style.borderRadius = '5px';
        deviceSelector.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.3)';
        deviceSelector.style.zIndex = '10003';
        deviceSelector.style.display = 'flex';
        deviceSelector.style.flexDirection = 'column';
        deviceSelector.style.gap = '5px';
        
        // Define common device sizes
        const deviceSizes = [
          { name: 'Desktop', width: 1280, height: 800 },
          { name: 'iPhone SE', width: 375, height: 667 },
          { name: 'iPhone XR/11', width: 414, height: 896 },
          { name: 'iPhone 12/13/14', width: 390, height: 844 },
          { name: 'iPhone 12/13/14 Pro Max', width: 428, height: 926 },
          { name: 'iPad', width: 768, height: 1024 },
          { name: 'iPad Pro', width: 1024, height: 1366 },
          { name: 'Galaxy S20', width: 360, height: 800 },
          { name: 'Pixel 5', width: 393, height: 851 }
        ];
        
        // Create device selector header
        const deviceSelectorHeader = document.createElement('div');
        deviceSelectorHeader.style.fontWeight = 'bold';
        deviceSelectorHeader.style.marginBottom = '5px';
        deviceSelectorHeader.innerHTML = 'Device Size:';
        deviceSelector.appendChild(deviceSelectorHeader);
        
        // Create device selector dropdown
        const deviceDropdown = document.createElement('select');
        deviceDropdown.id = 'mcp-device-dropdown';
        deviceDropdown.style.padding = '5px';
        deviceDropdown.style.borderRadius = '3px';
        deviceDropdown.style.border = '1px solid #ccc';
        deviceDropdown.style.width = '100%';
        
        // Add options to dropdown
        deviceSizes.forEach((device, index) => {
          const option = document.createElement('option');
          option.value = index.toString();
          option.text = `${device.name} (${device.width}x${device.height})`;
          deviceDropdown.appendChild(option);
        });
        
        deviceSelector.appendChild(deviceDropdown);
        
        // Create custom size inputs
        const customSizeContainer = document.createElement('div');
        customSizeContainer.style.display = 'flex';
        customSizeContainer.style.gap = '5px';
        customSizeContainer.style.marginTop = '5px';
        
        const widthInput = document.createElement('input');
        widthInput.id = 'mcp-width-input';
        widthInput.type = 'number';
        widthInput.placeholder = 'Width';
        widthInput.style.width = '50%';
        widthInput.style.padding = '5px';
        widthInput.style.borderRadius = '3px';
        widthInput.style.border = '1px solid #ccc';
        
        const heightInput = document.createElement('input');
        heightInput.id = 'mcp-height-input';
        heightInput.type = 'number';
        heightInput.placeholder = 'Height';
        heightInput.style.width = '50%';
        heightInput.style.padding = '5px';
        heightInput.style.borderRadius = '3px';
        heightInput.style.border = '1px solid #ccc';
        
        customSizeContainer.appendChild(widthInput);
        customSizeContainer.appendChild(heightInput);
        deviceSelector.appendChild(customSizeContainer);
        
        // Create apply button
        const applyButton = document.createElement('button');
        applyButton.id = 'mcp-apply-size';
        applyButton.innerHTML = 'Apply Size';
        applyButton.style.marginTop = '5px';
        applyButton.style.padding = '5px 10px';
        applyButton.style.backgroundColor = '#007bff';
        applyButton.style.color = 'white';
        applyButton.style.border = 'none';
        applyButton.style.borderRadius = '3px';
        applyButton.style.cursor = 'pointer';
        deviceSelector.appendChild(applyButton);
        
        document.body.appendChild(deviceSelector);

        // Store state
        let currentElement: Element | null = null;
        let selectedElement: Element | null = null;
        let highlightBox: HTMLElement | null = null;
        let isSelectionLocked = false;
        let isSelectionModeActive = false;

        // Function to create highlight box
        function createHighlightBox() {
          const box = document.createElement('div');
          box.id = 'mcp-inspector-highlight';
          box.style.position = 'fixed'; // Use fixed instead of absolute to ensure it's always visible
          box.style.border = '3px solid #007bff'; // Thicker border for better visibility
          box.style.backgroundColor = 'rgba(0, 123, 255, 0.1)'; // More transparent background
          box.style.pointerEvents = 'none';
          box.style.zIndex = '2147483647'; // Maximum z-index value to ensure it's on top
          box.style.display = 'none'; // Initially hidden
          box.style.boxShadow = '0 0 0 1px white'; // White outline for contrast
          document.body.appendChild(box);
          return box;
        }

        // Function to update highlight box
        function updateHighlightBox(element: Element, isSelected = false) {
          if (!highlightBox) {
            highlightBox = createHighlightBox();
          }
          
          const rect = element.getBoundingClientRect();
          highlightBox.style.top = rect.top + 'px';
          highlightBox.style.left = rect.left + 'px';
          highlightBox.style.width = rect.width + 'px';
          highlightBox.style.height = rect.height + 'px';
          highlightBox.style.display = 'block';
          
          if (isSelected) {
            highlightBox.style.border = '3px solid #28a745';
            highlightBox.style.backgroundColor = 'rgba(40, 167, 69, 0.1)';
            highlightBox.style.boxShadow = '0 0 0 1px white';
          } else {
            highlightBox.style.border = '3px solid #007bff';
            highlightBox.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
            highlightBox.style.boxShadow = '0 0 0 1px white';
          }
        }

        // Function to hide highlight box
        function hideHighlightBox() {
          if (highlightBox) {
            highlightBox.style.display = 'none';
          }
        }

        // Function to generate a unique selector for an element
        function getSelector(element: Element): string {
          if (element.id) {
            return '#' + element.id;
          }
          
          if (element.classList.length > 0) {
            return element.tagName.toLowerCase() + '.' + Array.from(element.classList).join('.');
          }
          
          let selector = element.tagName.toLowerCase();
          let parent = element.parentElement;
          
          if (parent) {
            let siblings = Array.from(parent.children).filter(child => child.tagName === element.tagName);
            if (siblings.length > 1) {
              let index = siblings.indexOf(element as Element);
              selector += `:nth-child(${index + 1})`;
            }
          }
          
          return selector;
        }

        // Function to update info panel
        function updateInfoPanel(element: Element, isSelected = false) {
          const selector = getSelector(element);
          const tagName = element.tagName.toLowerCase();
          const classes = Array.from(element.classList).join('.');
          const id = element.id ? `#${element.id}` : '';
          
          if (isSelected) {
            infoPanel.innerHTML = `
              <div><strong>Selected:</strong> ${tagName}${id ? ' ' + id : ''}${classes ? ' .' + classes : ''}</div>
              <div><strong>Selector:</strong> ${selector}</div>
              <div style="color: green; margin-top: 5px;">Element selected! Click again to open dialog or click outside to deselect.</div>
            `;
          } else {
            infoPanel.innerHTML = `
              <div><strong>Element:</strong> ${tagName}${id ? ' ' + id : ''}${classes ? ' .' + classes : ''}</div>
              <div><strong>Selector:</strong> ${selector}</div>
              <div><strong>Text:</strong> ${element.textContent?.substring(0, 50) || ''}</div>
              <div style="margin-top: 5px;">Click to select this element</div>
            `;
          }
          
          infoPanel.style.display = 'block';
        }

        // Function to position dialog next to element
        function positionDialog(element: Element) {
          const rect = element.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          
          // Position to the right if there's enough space, otherwise to the left
          if (rect.right + 320 < viewportWidth) {
            dialogBox.style.left = rect.right + 10 + 'px';
          } else {
            dialogBox.style.left = Math.max(10, rect.left - 310) + 'px';
          }
          
          // Vertical positioning
          dialogBox.style.top = rect.top + 'px';
          
          // Show the dialog
          dialogBox.style.display = 'block';
        }

        // Function to hide dialog
        function hideDialog() {
          dialogBox.style.display = 'none';
          const textarea = document.getElementById('mcp-modification-request') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = '';
          }
        }

        // Function to submit modification request
        function submitModificationRequest() {
          const textarea = document.getElementById('mcp-modification-request') as HTMLTextAreaElement;
          if (textarea && selectedElement) {
            const request = textarea.value.trim();
            if (request) {
              // Store the request along with element info
              (window as any).selectedElement = {
                element: selectedElement,
                selector: getSelector(selectedElement),
                html: selectedElement.outerHTML,
                css: window.getComputedStyle(selectedElement),
                modificationRequest: request
              };
              
              // Update info panel
              infoPanel.innerHTML = `
                <div style="color: green;">Modification request submitted!</div>
                <div style="margin-top: 5px;">Request: "${request.substring(0, 50)}${request.length > 50 ? '...' : ''}"</div>
              `;
              
              // Hide dialog
              hideDialog();
            }
          }
        }

        // Function to toggle selection mode
        function toggleSelectionMode() {
          isSelectionModeActive = !isSelectionModeActive;
          
          if (isSelectionModeActive) {
            // Enable selection mode
            toggleButton.style.backgroundColor = '#28a745';
            toggleButton.innerHTML = 'Selection Mode: ON';
            overlay.style.display = 'block';
            infoPanel.style.display = 'block';
            
            // Reset selection state
            isSelectionLocked = false;
            selectedElement = null;
            hideDialog();
            
            // Enable pointer events on overlay to capture clicks
            overlay.style.pointerEvents = 'none';
          } else {
            // Disable selection mode
            toggleButton.style.backgroundColor = '#007bff';
            toggleButton.innerHTML = 'Select Element';
            overlay.style.display = 'none';
            infoPanel.style.display = 'none';
            hideHighlightBox();
            hideDialog();
            
            // Reset selection state
            isSelectionLocked = false;
            selectedElement = null;
            currentElement = null;
          }
        }

        // Add event listeners for hovering (only active in selection mode)
        document.addEventListener('mouseover', (e) => {
          if (!isSelectionModeActive || isSelectionLocked) return;
          
          const target = e.target as Element;
          if (target !== overlay && target !== infoPanel && !infoPanel.contains(target) && 
              target !== dialogBox && !dialogBox.contains(target) && 
              target !== toggleButton && target.id !== 'mcp-inspector-highlight') {
            currentElement = target;
            updateHighlightBox(target);
            updateInfoPanel(target);
          }
        });

        // Add event listener for clicking
        document.addEventListener('click', (e) => {
          const target = e.target as Element;
          
          // Handle toggle button click
          if (target === toggleButton || toggleButton.contains(target)) {
            e.preventDefault();
            e.stopPropagation();
            toggleSelectionMode();
            return;
          }
          
          // Only process other clicks if selection mode is active
          if (!isSelectionModeActive) return;
          
          // Handle clicks on dialog buttons
          if (target.id === 'mcp-cancel-button') {
            e.preventDefault();
            e.stopPropagation();
            hideDialog();
            return;
          }
          
          if (target.id === 'mcp-submit-button') {
            e.preventDefault();
            e.stopPropagation();
            submitModificationRequest();
            return;
          }
          
          // Ignore clicks on the dialog itself
          if (dialogBox.contains(target)) {
            return;
          }
          
          // Handle clicks on the info panel
          if (infoPanel.contains(target)) {
            return;
          }
          
          // If selection is locked and clicking on the selected element
          if (isSelectionLocked && selectedElement && (selectedElement === target || selectedElement.contains(target))) {
            e.preventDefault();
            e.stopPropagation();
            positionDialog(selectedElement);
            return;
          }
          
          // If selection is locked and clicking outside
          if (isSelectionLocked) {
            isSelectionLocked = false;
            selectedElement = null;
            
            // Hide dialog if visible
            hideDialog();
            
            // If clicking on a valid element, select it
            if (target !== overlay && target.id !== 'mcp-inspector-highlight') {
              currentElement = target;
              updateHighlightBox(target);
              updateInfoPanel(target);
            }
            return;
          }
          
          // Normal selection (not locked yet)
          if (currentElement) {
            e.preventDefault();
            e.stopPropagation();
            
            // Lock selection
            isSelectionLocked = true;
            selectedElement = currentElement;
            
            // Update UI
            updateHighlightBox(selectedElement, true);
            updateInfoPanel(selectedElement, true);
          }
        });

        // Function to resize the window
        function resizeWindow(width: number, height: number) {
          // Add some padding for browser chrome
          const actualWidth = width + 16;
          const actualHeight = height + 88;
          
          // Resize the window
          window.resizeTo(actualWidth, actualHeight);
          
          // Update the custom size inputs
          const widthInput = document.getElementById('mcp-width-input') as HTMLInputElement;
          const heightInput = document.getElementById('mcp-height-input') as HTMLInputElement;
          
          if (widthInput && heightInput) {
            widthInput.value = width.toString();
            heightInput.value = height.toString();
          }
        }

        // Add event listeners for device selector
        document.getElementById('mcp-device-dropdown')?.addEventListener('change', (e) => {
          const dropdown = e.target as HTMLSelectElement;
          const selectedIndex = parseInt(dropdown.value);
          
          if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < deviceSizes.length) {
            const device = deviceSizes[selectedIndex];
            resizeWindow(device.width, device.height);
          }
        });

        document.getElementById('mcp-apply-size')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const widthInput = document.getElementById('mcp-width-input') as HTMLInputElement;
          const heightInput = document.getElementById('mcp-height-input') as HTMLInputElement;
          
          const width = parseInt(widthInput.value);
          const height = parseInt(heightInput.value);
          
          if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
            resizeWindow(width, height);
          }
        });

        // Add event listeners for cancel and submit buttons
        document.getElementById('mcp-cancel-button')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideDialog();
        });

        document.getElementById('mcp-submit-button')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          submitModificationRequest();
        });
      });

      // Take a screenshot
      const screenshot = await page.screenshot({ encoding: 'base64' });

      return {
        content: [
          {
            type: 'text',
            text: 'Element inspection mode enabled. Click on any element in the browser to select it.',
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

      // Get the selected element info
      const selectedElement = await page.evaluate(() => {
        return (window as any).selectedElement;
      });

      if (!selectedElement) {
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

      // Store element info for later use
      elementInfo = {
        selector: selectedElement.selector,
        html: selectedElement.html,
        css: JSON.stringify(selectedElement.css, null, 2)
      };

      // Take a screenshot
      const screenshot = await page.screenshot({ encoding: 'base64' });

      return {
        content: [
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
          },
        ],
      };
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

  private async closeBrowser() {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
      elementInfo = null;
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
