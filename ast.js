
const criteriagrid = {
  // Configuration constants
  ROW_HEIGHT: 30,
  SCROLLBAR_WIDTH: 20,
  LOGOP_WIDTH: 40,
  CONTRACTED_LOGOP_WIDTH: 20,
  
  // State variables
  selectedCells: new Set(),
  isDragging: false,
  startCell: null,
  contractedLogop: true,
  
  // Metadata configuration
  metadata: { 
    "c0": { editable: true },
    "c1": { editable: true, width: 40 },
    "c2": { editable: true },
    "c3": { width: 40, logop: 1, label: "" }  
  },

  // Initialize the grid
  init() {
    this.setupEventListeners();
  },

  // Setup global event listeners
  setupEventListeners() {
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
  },

  // Main create method - clears SVG and redraws with new AST
  create(ast) {
    // Clear existing grid
    const grid = document.getElementById('grid-content');
    grid.innerHTML = '';
    
    // Add row numbers to AST nodes
    this.addRowNumbers(ast);

    // Find max depth and add level attributes
    const maxDepth = this.findMaxDepth(ast);
    this.addLevelAttributes(ast, maxDepth);

    // Get all expressions and operators from AST
    const { expressions, operators, operatorScopes } = this.collectExpressionsAndOperators(ast);
    let currentCols = maxDepth + 4; 
    let currentRows = this.countExpressionNodes(ast, 0);
    
    // Add operator metadata based on AST
    operatorScopes.forEach((scope, index) => {
      // Find the operator node in the AST to get its level
      const operatorNode = this.findOperatorNode(ast, scope.operator);
      const col = currentCols - 1 - (maxDepth - operatorNode.level);

      // If this is the root node (first in operatorScopes), make it span all rows
      let startRow = scope.startRow;
      let endRow = scope.endRow;
      if (index === 0) {
        startRow = 0;
        endRow = currentRows - 1;
      }

      const cellIds = [];
      for (let row = startRow; row <= endRow; row++) {
        cellIds.push(`c${col}r${row}`);
      }
      
      // If contracted, show '&' and narrow width
      if (this.contractedLogop && scope.operator === 'AND') {
        this.metadata[cellIds.join(',')] = {
          backcolor: "#eeeeff",
          consolidated: true,
          label: '&',
          logop: 2,
          not: scope.not,
          width: this.CONTRACTED_LOGOP_WIDTH
        };
      } else {
        this.metadata[cellIds.join(',')] = {
          backcolor: "#eeeeff",
          consolidated: true,
          label: scope.operator,
          logop: 2,
          not: scope.not,
          width: this.LOGOP_WIDTH
        };
      }
    });

    // Set NOT labels for expressions with not:true
    expressions.forEach((expr, row) => {
      if (expr.not) {
        const cellKey = `c3r${row}`;
        this.metadata[cellKey] = {
          ...this.metadata[cellKey],
          width: 40,
          logop: 1,
          label: "NOT"
        };
      }
    });

    // Also check for NOT in operator scopes
    operatorScopes.forEach((scope, index) => {
      if (scope.not) {
        const cellKey = `c3r${scope.startRow}`;
        this.metadata[cellKey] = {
          ...this.metadata[cellKey],
          width: 40,
          logop: 1,
          label: "NOT"
        };
      }
    });

    const totalHeight = currentRows * this.ROW_HEIGHT;
    const needsScrollbar = totalHeight >= 300 - 2;
    
    // Find the container column for the SVG (middle col-12 col-md-6)
    const svg = document.getElementById('where');
    // Find the parent column (should be the .col containing the SVG)
    let svgContainer = svg.closest('.col');
    let dynamicWidth = 500; // fallback
    if (svgContainer) {
      // Use clientWidth to get the actual rendered width
      dynamicWidth = svgContainer.clientWidth || svgContainer.getBoundingClientRect().width || 500;
    }
    // Calculate known widths and remaining space
    const knownWidths = this.getKnownCellWidths(currentCols);
    const totalKnownWidth = knownWidths.reduce((sum, width) => sum + width, 0);
    const remainingWidth = dynamicWidth - totalKnownWidth;
    const unknownColCount = currentCols - knownWidths.length;
    const defaultWidth = unknownColCount > 0 ? remainingWidth / unknownColCount : 0;
    // Set SVG dimensions
    svg.setAttribute('width', dynamicWidth);
    svg.setAttribute('height', totalHeight);
    
    // Create cells
    for (let row = 0; row < currentRows; row++) {
      const expression = expressions[row];
      let currentX = 0;
      
      // Iterate columns from right to left
      for (let col = currentCols - 1; col >= 0; col--) {
        // Get width from metadata or use calculated default
        const colKey = `c${col}`;
        let cellWidth;
        if (col >= 4) {
          // Use width from metadata if present for logop columns
          let logopWidth = this.LOGOP_WIDTH;
          for (const key in this.metadata) {
            if (key.startsWith(colKey) && this.metadata[key].logop === 2 && this.metadata[key].width) {
              logopWidth = this.metadata[key].width;
              break;
            }
          }
          cellWidth = logopWidth;
        } else if (this.metadata[colKey]?.width) {
          cellWidth = this.metadata[colKey].width;
        } else {
          cellWidth = defaultWidth;
        }
        
        const isLastColumn = col === 0;
        const adjustedWidth = isLastColumn && needsScrollbar ? 
          cellWidth - this.SCROLLBAR_WIDTH : 
          cellWidth;

        const cell = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        cell.setAttribute("x", currentX);
        cell.setAttribute("y", row * this.ROW_HEIGHT);
        cell.setAttribute("width", adjustedWidth);
        cell.setAttribute("height", this.ROW_HEIGHT);
        cell.setAttribute("data-id", `c${col}r${row}`);
        cell.id = `cell-${col}-${row}`;
        
        // Apply metadata-based styling
        const cellKey = `c${col}r${row}`;
        let cellColor = '#ffffff';
        let isConsolidated = false;
        let consolidatedGroup = null;
        let consolidatedLabel = null;
        let isMiddleCell = false;
        
        // Check for cell-specific metadata
        for (const key in this.metadata) {
          const cellIds = key.split(',');
          if (cellIds.includes(cellKey)) {
            if (this.metadata[key].backcolor) {
              cellColor = this.metadata[key].backcolor;
            }
            if (this.metadata[key].consolidated === true) {
              isConsolidated = true;
              consolidatedGroup = cellIds;
              consolidatedLabel = this.metadata[key].label;
              // Check if this is the middle cell of the group
              const cellIndex = cellIds.indexOf(cellKey);
              isMiddleCell = cellIndex === Math.floor(cellIds.length / 2);
            }
            break;
          }
        }
        
        cell.setAttribute("fill", cellColor);
        cell.setAttribute("stroke", "#ddd");
        cell.setAttribute("stroke-width", "1");
        
        // Handle consolidated cells - hide horizontal borders between cells in the same group
        if (isConsolidated && consolidatedGroup) {
          const cellIndex = consolidatedGroup.indexOf(cellKey);
          if (consolidatedGroup.length > 1) {
            // Hide top border if not the first cell in the group
            if (cellIndex > 0) {
              cell.setAttribute("stroke-dasharray", `0,${adjustedWidth},0,${this.ROW_HEIGHT},0,${adjustedWidth},0,${this.ROW_HEIGHT}`);
            }
            // Hide bottom border if not the last cell in the group
            if (cellIndex < consolidatedGroup.length - 1) {
              cell.setAttribute("stroke-dasharray", `0,${adjustedWidth},0,${this.ROW_HEIGHT},0,${adjustedWidth},0,${this.ROW_HEIGHT}`);
            }
          }
        }
        
        cell.style.cursor = "pointer";
        cell.addEventListener('click', this.handleCellClick.bind(this));
        cell.addEventListener('mousedown', this.handleMouseDown.bind(this));
        
        // Add cell data
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", currentX + adjustedWidth/2);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        
        // Set text content based on column and metadata
        if (isConsolidated && isMiddleCell && consolidatedLabel) {
          // For root operator, center label in the full group
          if (consolidatedGroup.length === currentRows && col >= 4) {
            text.setAttribute("y", (currentRows * this.ROW_HEIGHT) / 2);
          } else {
            text.setAttribute("y", row * this.ROW_HEIGHT + this.ROW_HEIGHT/2);
          }
          text.textContent = consolidatedLabel;
        } else if (isConsolidated) {
          text.textContent = "";
        } else if (col === 0) {  // Leftmost column (c0)
          text.setAttribute("y", row * this.ROW_HEIGHT + this.ROW_HEIGHT/2);
          text.textContent = expression.right;
        } else if (col === 1) {  // Second from left (c1)
          text.setAttribute("y", row * this.ROW_HEIGHT + this.ROW_HEIGHT/2);
          text.textContent = expression.operator;
        } else if (col === 2) {  // Third from left (c2)
          text.setAttribute("y", row * this.ROW_HEIGHT + this.ROW_HEIGHT/2);
          text.textContent = expression.left;
        } else if (col === 3) {  // NOT column (c3)
          text.setAttribute("y", row * this.ROW_HEIGHT + this.ROW_HEIGHT/2 + 2);
          // Check for cell-specific metadata first
          const cellKey = `c3r${row}`;
          if (this.metadata[cellKey] && this.metadata[cellKey].label !== undefined) {
            text.textContent = this.metadata[cellKey].label;
          } else if (this.metadata['c3'] && this.metadata['c3'].label !== undefined) {
            text.textContent = this.metadata['c3'].label;
          }
        }
        
        text.style.cursor = "pointer";
        text.style.overflow = "hidden";
        text.style.textOverflow = "ellipsis";
        text.style.whiteSpace = "nowrap";

        // Add vertical alignment for consolidated cells
        if (isConsolidated) {
          // Calculate the total height of the consolidated cells
          const totalHeight = consolidatedGroup.length * this.ROW_HEIGHT;
          // Calculate the center point of the consolidated cells
          const centerY = (totalHeight / consolidatedGroup.length) - this.ROW_HEIGHT - 12;
          text.setAttribute("transform", `translate(0, ${centerY})`);
          text.style.textAnchor = "middle";
          text.style.dominantBaseline = "middle";
        }

        text.setAttribute("width", adjustedWidth - 4);
        text.addEventListener('click', this.handleCellClick.bind(this));
        text.addEventListener('mousedown', this.handleMouseDown.bind(this));
        
        grid.appendChild(cell);
        grid.appendChild(text);
        
        currentX += adjustedWidth;
      }
    }

    // Draw vertical lines at each column boundary
    let x = 0;
    for (let col = currentCols - 1; col >= 0; col--) {
      let colKey = `c${col}`;
      let colWidth;
      if (col >= 4) {
        let logopWidth = this.LOGOP_WIDTH;
        for (const key in this.metadata) {
          if (key.startsWith(colKey) && this.metadata[key].logop === 2 && this.metadata[key].width) {
            logopWidth = this.metadata[key].width;
            break;
          }
        }
        colWidth = logopWidth;
      } else if (this.metadata[colKey]?.width) {
        colWidth = this.metadata[colKey].width;
      } else {
        colWidth = (dynamicWidth - this.getKnownCellWidths(currentCols).reduce((sum, width) => sum + width, 0)) / (currentCols - this.getKnownCellWidths(currentCols).length);
      }
      // Draw the vertical line
      const vLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      vLine.setAttribute("x1", x);
      vLine.setAttribute("y1", 0);
      vLine.setAttribute("x2", x);
      vLine.setAttribute("y2", totalHeight);
      vLine.setAttribute("stroke", "#ddd");
      vLine.setAttribute("stroke-width", "1");
      grid.appendChild(vLine);
      x += colWidth;
    }
    // Draw the rightmost border
    const rightLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    rightLine.setAttribute("x1", dynamicWidth);
    rightLine.setAttribute("y1", 0);
    rightLine.setAttribute("x2", dynamicWidth);
    rightLine.setAttribute("y2", totalHeight);
    rightLine.setAttribute("stroke", "#ddd");
    rightLine.setAttribute("stroke-width", "1");
    grid.appendChild(rightLine);
  },

  // Helper methods
  addRowNumbers(node, currentRow = 0) {
    if (!node) return currentRow;
    
    if (node.type === "Expression") {
      node.row = currentRow;
      return currentRow + 1;
    }
    
    if (node.type === "LogicalExpression" && node.children) {
      for (const child of node.children) {
        currentRow = this.addRowNumbers(child, currentRow);
      }
    }
    
    return currentRow;
  },

  findMaxDepth(node, currentDepth = 0) {
    if (!node) return currentDepth;
    
    let maxDepth = currentDepth;
    
    if (node.type === "LogicalExpression" && node.children) {
      for (const child of node.children) {
        maxDepth = Math.max(maxDepth, this.findMaxDepth(child, currentDepth + 1));
      }
    }
    
    return maxDepth;
  },

  addLevelAttributes(node, currentLevel) {
    if (!node) return;
    
    node.level = currentLevel;
    
    if (node.type === "LogicalExpression" && node.children) {
      for (const child of node.children) {
        this.addLevelAttributes(child, currentLevel - 1);
      }
    }
  },

  collectExpressionsAndOperators(node, expressions = [], operators = [], operatorScopes = []) {
    if (!node) return { expressions, operators, operatorScopes };
    
    if (node.type??'' === "Expression") {
      expressions.push({
        right: node.right.value,
        operator: node.operator,
        left: node.left.name,
        not: node.not || false
      });
    } else if (node.operator??'' === "=") {
      // Handle direct equality expressions
      expressions.push({
        right: node.right.value,
        operator: node.operator,
        left: node.left.name,
        not: node.not || false
      });
    }
    
    // Collect operators in depth-first order
    if (node.type === "LogicalExpression") {
      operators.push(node.operator);
      // Calculate which rows this operator applies to
      const startRow = expressions.length;
      let endRow = startRow;
      
      // If this is an OR operator, it applies to the next two expressions
      if (node.operator === "OR") {
        endRow = startRow + 1;
      }
      // If this is an AND operator, it applies to all remaining expressions
      else if (node.operator === "AND") {
        endRow = expressions.length + 1; // +1 because we'll add one more expression
      }
      
      operatorScopes.push({
        operator: node.operator,
        startRow,
        endRow,
        not: node.not || false
      });

      // Process children
      if (node.children) {
        for (const child of node.children) {
          this.collectExpressionsAndOperators(child, expressions, operators, operatorScopes);
        }
      }
    }
    
    return { expressions, operators, operatorScopes };
  },

  countExpressionNodes(node, count = 0) {
    if (!node) return 0;
    if (node.type === "Expression") count++;
    if (node.children) for (const child of node.children) count = this.countExpressionNodes(child, count);
    return count;
  },

  findOperatorNode(node, targetOperator) {
    if (!node) return null;
    if (node.operator === targetOperator) return node;
    if (node.type === "LogicalExpression" && node.children) {
      for (const child of node.children) {
        const result = this.findOperatorNode(child, targetOperator);
        if (result) return result;
      }
    }
    return null;
  },

  getKnownCellWidths(cols) {
    let knownWidths = [];
    for (let col = cols - 1; col >= 0; col--) {
      const colKey = `c${col}`;
      // Use metadata width if present, else LOGOP_WIDTH
      if (this.metadata[colKey]?.width || col >= 4) {
        if (col >= 4) {
          // Use width from metadata if present for logop columns
          let logopWidth = this.LOGOP_WIDTH;
          // Find a logop metadata entry for this col
          for (const key in this.metadata) {
            if (key.startsWith(colKey) && this.metadata[key].logop === 2 && this.metadata[key].width) {
              logopWidth = this.metadata[key].width;
              break;
            }
          }
          knownWidths.push(logopWidth);
        } else knownWidths.push(this.metadata[colKey].width);
      }
    }
    return knownWidths;
  },

  // Event handlers
  handleCellClick(event) {
    // Get the cell element - either the rect or its parent if text was clicked
    const cell = event.target.tagName === 'rect' ? event.target : event.target.previousElementSibling;
    const cellId = cell.getAttribute('data-id');
    const colKey = cellId.split('r')[0];
    const rowKey = `r${cellId.split('r')[1]}`;
    const row = parseInt(cellId.split('r')[1]);
    
    // Check if cell has logop attribute
    let logopValue = null;
    let currentLabel = '';
    let metadataKey = null;
    let consolidatedCells = null;
    let isMiddleCell = false;
    
    // First check if this cell is part of a consolidated group
    for (const key in this.metadata) {
      const cellIds = key.split(',');
      if (cellIds.includes(cellId)) {
        if (this.metadata[key].consolidated) {
          consolidatedCells = cellIds;
          if (this.metadata[key].logop !== undefined) {
            logopValue = this.metadata[key].logop;
            currentLabel = this.metadata[key].label || '';
            metadataKey = key;
            // Check if this is the middle cell of the group
            const cellIndex = cellIds.indexOf(cellId);
            isMiddleCell = cellIndex === Math.floor(cellIds.length / 2);
          }
          break;
        }
      }
    }
    
    // If not part of a consolidated group, check for cell-specific metadata
    if (!consolidatedCells) {
      for (const key in this.metadata) {
        const cellIds = key.split(',');
        if (cellIds.includes(cellId)) {
          if (this.metadata[key].logop !== undefined) {
            logopValue = this.metadata[key].logop;
            currentLabel = this.metadata[key].label || '';
            metadataKey = key;
            break;
          }
        }
      }
    }
    
    // If no cell-specific logop found, check column-level metadata
    if (logopValue === null && this.metadata[colKey] && this.metadata[colKey].logop !== undefined) {
      logopValue = this.metadata[colKey].logop;
      currentLabel = this.metadata[colKey].label || '';
      metadataKey = colKey;
    }
    
    // Handle label toggling if logop is present
    if (logopValue !== null) {
      let newLabel = '';
      // Handle contractedLogop first
      if (logopValue === 2 && this.contractedLogop && currentLabel === '&') {
        // Expand to AND, widen column
        newLabel = 'AND';
        this.contractedLogop = false;
        // Update all relevant metadata entries for this logop group
        if (metadataKey) {
          this.metadata[metadataKey].label = newLabel;
          this.metadata[metadataKey].width = this.LOGOP_WIDTH;
        }
        // Re-render grid
        this.regenerateAST();
        return;
      }
      // Toggle between "AND", "OR", "!AND", "!OR", then contract to '&'
      if (logopValue === 2 && !this.contractedLogop) {
        const labels = ["AND", "OR", "!AND", "!OR", "&"];
        let currentIndex = labels.indexOf(currentLabel.replace('\n', ' '));
        if (currentIndex === -1) currentIndex = 0;
        let nextIndex = (currentIndex + 1) % labels.length;
        newLabel = labels[nextIndex];
        if (newLabel === "&") {
          // Contract back to '&' and narrow width
          this.contractedLogop = true;
          if (metadataKey) {
            this.metadata[metadataKey].label = newLabel;
            this.metadata[metadataKey].width = this.CONTRACTED_LOGOP_WIDTH;
          }
          this.regenerateAST();
          return;
        } else {
          // Normal toggle logic
          if (metadataKey) {
            this.metadata[metadataKey].label = newLabel;
            this.metadata[metadataKey].width = this.LOGOP_WIDTH;
          }
          this.regenerateAST();
          return;
        }
      }
      
      if (logopValue === 1) {
        // Toggle between "NOT" and ""
        newLabel = currentLabel === "NOT" ? "" : "NOT";
      } else if (logopValue === 2) {
        // Toggle between "AND", "OR", "NOT AND", and "NOT OR"
        const labels = ["AND", "OR", "!AND", "!OR"];
        const currentIndex = labels.indexOf(currentLabel.replace('\n', ' '));
        newLabel = labels[(currentIndex + 1) % labels.length];
      }
      
      // Update the label in the metadata
      if (metadataKey) {
        this.metadata[metadataKey].label = newLabel;
        
        // Only update the display if this is the middle cell of a consolidated group
        // or if it's not part of a consolidated group
        if (!consolidatedCells || isMiddleCell) {
          const text = cell.nextElementSibling;
          if (text) {
            text.textContent = newLabel;
          }
        }
      }
      return; // Exit after handling label toggle
    }
    
    // Check if cell is editable
    let isEditable = false;
    
    // Check for cell-specific metadata
    for (const key in this.metadata) {
      const cellIds = key.split(',');
      if (cellIds.includes(cellId) && this.metadata[key].editable === true) {
        isEditable = true;
        break;
      } else if (key === colKey && this.metadata[key].editable === true) {
        isEditable = true;
        break;
      }
    }
    
    if (isEditable) {
      const text = cell.nextElementSibling;
      const currentText = text.textContent;
      
      // Get the grid container's position
      const gridContainer = document.getElementById('grid-container');
      const containerRect = gridContainer.getBoundingClientRect();
      
      // Create input element
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentText;
      input.style.position = 'absolute';
      
      // Get computed font properties from SVG text
      const textStyle = window.getComputedStyle(text);
      input.style.fontFamily = textStyle.fontFamily;
      input.style.fontSize = textStyle.fontSize;
      input.style.fontWeight = textStyle.fontWeight;
      input.style.fontStyle = textStyle.fontStyle;
      input.style.lineHeight = textStyle.lineHeight;
      input.style.letterSpacing = textStyle.letterSpacing;
      
      input.style.border = 'none';
      input.style.outline = 'none';
      
      // Calculate position relative to the grid container
      const cellX = parseFloat(cell.getAttribute('x'));
      const cellY = parseFloat(cell.getAttribute('y'))-2;
      const cellWidth = parseFloat(cell.getAttribute('width'));
      
      // Set input width to match cell width with small padding
      const inputWidth = cellWidth - 4;
      input.style.width = inputWidth + 'px';
      input.style.height = '20px';
      input.style.textAlign = 'center';
      input.style.padding = '0';
      input.style.backgroundColor = 'transparent';
      input.style.overflow = 'hidden';
      input.style.textOverflow = 'ellipsis';
      input.style.whiteSpace = 'nowrap';
      
      input.style.left = (containerRect.left + cellX + 2) + 'px';
      input.style.top = (containerRect.top + cellY + (this.ROW_HEIGHT/2) - 10) + 'px';
      
      // Replace text with input
      text.style.display = 'none';
      document.body.appendChild(input);
      input.focus();
      
      // Handle input completion
      const finishEditing = () => {
        text.textContent = input.value;
        text.style.display = '';
        document.body.removeChild(input);
      };
      
      input.addEventListener('blur', finishEditing);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          finishEditing();
        }
      });
      return; // Exit after handling edit
    }
    
    // Check if cell is selectable
    let isSelectable = false;
    
    // Check for cell-specific metadata
    for (const key in this.metadata) {
      const cellIds = key.split(',');
      if (cellIds.includes(cellId) && this.metadata[key].selectable === true) {
        isSelectable = true;
        break;
      } else if (key === colKey && this.metadata[key].selectable === true) {
        isSelectable = true;
        break;
      }
    }
    
    // Only handle selection if cell is selectable
    if (isSelectable && !this.isDragging) {
      // Handle cell selection
      if (event.shiftKey) {
        // Toggle selection
        if (this.selectedCells.has(cellId)) {
          this.selectedCells.delete(cellId);
          cell.classList.remove('selected');
        } else {
          this.selectedCells.add(cellId);
          cell.classList.add('selected');
        }
      } else {
        // Clear all selections and select only this cell
        this.selectedCells.forEach(id => {
          const prevCell = document.querySelector(`rect[data-id="${id}"]`);
          if (prevCell) {
            prevCell.classList.remove('selected');
          }
        });
        this.selectedCells.clear();
        this.selectedCells.add(cellId);
        cell.classList.add('selected');
      }
    }
  },

  handleMouseDown(event) {
    // Get the cell element - either the rect or its parent if text was clicked
    const cell = event.target.tagName === 'rect' ? event.target : event.target.previousElementSibling;
    const cellId = cell.getAttribute('data-id');
    const colKey = cellId.split('r')[0];
    
    // Check if cell is selectable
    let isSelectable = false;
    
    // Check for cell-specific metadata
    for (const key in this.metadata) {
      const cellIds = key.split(',');
      if (cellIds.includes(cellId) && this.metadata[key].selectable === true) {
        isSelectable = true;
        break;
      } else if (key === colKey && this.metadata[key].selectable === true) {
        isSelectable = true;
        break;
      }
    }
    
    // Only start dragging if cell is selectable
    if (isSelectable) {
      this.isDragging = true;
      this.startCell = cellId;
      
      // Clear previous selection if not holding shift
      if (!event.shiftKey) {
        this.selectedCells.forEach(id => {
          const prevCell = document.querySelector(`rect[data-id="${id}"]`);
          if (prevCell) prevCell.classList.remove('selected');
        });
        this.selectedCells.clear();
      }
      
      // Add initial cell to selection
      this.selectedCells.add(cellId);
      cell.classList.add('selected');
    }
  },
  
  handleMouseMove(event) {
    if (!this.isDragging) return;
    
    // Get the cell under the mouse
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const cell = elements.find(el => el.tagName === 'rect' || el.tagName === 'text');
    if (!cell) return;
    
    const currentCell = cell.tagName === 'rect' ? cell : cell.previousElementSibling;
    const currentCellId = currentCell.getAttribute('data-id');
    
    // Get start and current cell coordinates
    const [startCol, startRow] = this.startCell.replace('c', '').split('r').map(Number);
    const [currentCol, currentRow] = currentCellId.replace('c', '').split('r').map(Number);
    
    // Calculate selection rectangle
    const minCol = Math.min(startCol, currentCol);
    const maxCol = Math.max(startCol, currentCol);
    const minRow = Math.min(startRow, currentRow);
    const maxRow = Math.max(startRow, currentRow);
    
    // Clear previous selection if not holding shift
    if (!event.shiftKey) {
      this.selectedCells.forEach(id => {
        const prevCell = document.querySelector(`rect[data-id="${id}"]`);
        if (prevCell) prevCell.classList.remove('selected');
      });
      this.selectedCells.clear();
    }
    
    // Select all cells in the rectangle that are selectable
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const cellId = `c${col}r${row}`;
        const colKey = `c${col}`;
        
        // Check if cell is selectable
        let isSelectable = false;
        for (const key in this.metadata) {
          const cellIds = key.split(',');
          if (cellIds.includes(cellId) && this.metadata[key].selectable === true) {
            isSelectable = true;
            break;
          } else if (key === colKey && this.metadata[key].selectable === true) {
            isSelectable = true;
            break;
          }
        }
        
        if (isSelectable) {
          const cell = document.querySelector(`rect[data-id="${cellId}"]`);
          if (cell) {
            this.selectedCells.add(cellId);
            cell.classList.add('selected');
          }
        }
      }
    }
  },
  
  handleMouseUp(event) {
    this.isDragging = false;
    this.startCell = null;
  },

  // Function to regenerate AST from grid state
  regenerateAST() {
    const expressions = [];
    const operators = [];
    
    // Get current grid dimensions from the DOM
    const gridRows = document.querySelectorAll('rect[data-id^="c0r"]').length;
    const gridCols = Math.max(...Array.from(document.querySelectorAll('rect[data-id]')).map(el => {
      const match = el.getAttribute('data-id').match(/c(\d+)r/);
      return match ? parseInt(match[1]) : 0;
    })) + 1;
    
    // Collect all expressions and their metadata
    for (let row = 0; row < gridRows; row++) {
      const rightCell = document.querySelector(`rect[data-id="c0r${row}"]`);
      const opCell = document.querySelector(`rect[data-id="c1r${row}"]`);
      const leftCell = document.querySelector(`rect[data-id="c2r${row}"]`);
      const notCell = document.querySelector(`rect[data-id="c3r${row}"]`);
      
      if (rightCell && opCell && leftCell) {
        const rightText = rightCell.nextElementSibling.textContent;
        const opText = opCell.nextElementSibling.textContent;
        const leftText = leftCell.nextElementSibling.textContent;
        const notText = notCell ? notCell.nextElementSibling.textContent : "";
        
        expressions.push({
          right: { type: "Literal", value: rightText },
          operator: opText,
          left: { type: "Identifier", name: leftText },
          not: notText === "NOT"
        });
      }
    }
    
    // Collect all operators and their metadata
    for (let col = 4; col < gridCols; col++) {
      const cellIds = [];
      for (let row = 0; row < gridRows; row++) {
        cellIds.push(`c${col}r${row}`);
      }
      const key = cellIds.join(',');
      if (this.metadata[key] && this.metadata[key].consolidated) {
        const label = this.metadata[key].label || "";
        const isNot = label.startsWith('!');
        const operator = isNot ? label.substring(1) : label;
        
        operators.push({
          operator: operator,
          not: isNot,
          startRow: parseInt(cellIds[0].split('r')[1]),
          endRow: parseInt(cellIds[cellIds.length - 1].split('r')[1])
        });
      }
    }
    
    // Build new AST
    function buildAST(startRow, endRow) {
      if (startRow === endRow) {
        const expr = expressions[startRow];
        return {
          type: "Expression",
          operator: expr.operator,
          left: expr.left,
          right: expr.right,
          not: expr.not
        };
      }
      
      // Find operator that covers this range
      const op = operators.find(o => o.startRow === startRow && o.endRow === endRow);
      if (!op) return null;
      
      const midRow = startRow + 1;
      return {
        type: "LogicalExpression",
        operator: op.operator,
        not: op.not,
        children: [
          buildAST(startRow, midRow - 1),
          buildAST(midRow, endRow)
        ]
      };
    }
    
    // Rebuild AST
    const newAst = buildAST(0, gridRows - 1);
    
    // Recalculate metadata
    const newMaxDepth = this.findMaxDepth(newAst);
    this.addLevelAttributes(newAst, newMaxDepth);
    const { expressions: newExpressions, operators: newOperators, operatorScopes: newOperatorScopes } = this.collectExpressionsAndOperators(newAst);
    
    // Update metadata for operators
    newOperatorScopes.forEach((scope, index) => {
      const operatorNode = this.findOperatorNode(newAst, scope.operator);
      const col = gridCols - 1 - (newMaxDepth - operatorNode.level);
      
      const cellIds = [];
      for (let row = scope.startRow; row <= scope.endRow; row++) {
        cellIds.push(`c${col}r${row}`);
      }
      this.metadata[cellIds.join(',')] = {
        backcolor: "#eeeeff",
        consolidated: true,
        label: scope.operator,
        logop: 2,
        not: scope.not
      };
    });
    
    // Update NOT labels
    newExpressions.forEach((expr, row) => {
      if (expr.not) {
        const cellKey = `c3r${row}`;
        this.metadata[cellKey] = {
          ...this.metadata[cellKey],
          width: 40,
          logop: 1,
          label: "NOT"
        };
      }
    });

    // Recreate grid with new AST
    this.create(newAst);
  }
};
