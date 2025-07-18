function getSVGObject(attributes) {
	var element;
	for (const [key, value] of Object.entries(attributes)) if (key === 'type') element = document.createElementNS("http://www.w3.org/2000/svg", value);
	for (const [key, value] of Object.entries(attributes)) if (key !== 'type') element.setAttribute(key, value);
	return element;
}

function maxColumnWidth(rows, colName) {
	const headerLen = String(colName).length;
	const dataLen = rows.reduce((max, row) => { const val = row?.[colName]; return Math.max(max, String(val ?? '').length); }, 0);
	return Math.max(headerLen, dataLen);
}

function renderDataGrid() {
	const svg = document.getElementById('datagrid');
	const padding = 0;
	const headerHeight = 30;
	const rowHeight = 25;
	const width = 180;

	if (griddata.length > 0) {
		const headers = Object.keys(griddata[0]);

		// Calculate total width and height
		const totalHeight = headerHeight + (rowHeight * griddata.length);
		const totalWidth = headers.length * width;

		// Set SVG size
		svg.style.height = `${totalHeight}px`;
		svg.innerHTML = ''; // Clear existing content

		// Create header background
		svg.appendChild(getSVGObject({ type: 'rect', x: padding, y: padding, width: totalWidth, height: headerHeight, fill: '#f8f9fa', stroke: '#dee2e6' }));

		// Draw header cells
		let xOffset = padding;

		headers.forEach((col) => {
			// Header text
			//width = maxColumnWidth(griddata, col);
			const text = getSVGObject({ type: 'text', x: xOffset + width/2 - 20, y: padding + headerHeight/2 + 5, textAnchor: 'center', dominantBaseline: 'bottom' });
			text.textContent = col;
			svg.appendChild(text);

			xOffset += width;
		});

		// Draw data rows
		griddata.forEach((row, rowIndex) => {
			const yPos = padding + headerHeight + (rowHeight * rowIndex);

			// Row background (alternating colors)
			svg.appendChild(getSVGObject({ type: 'rect', x: padding, y: yPos, height: rowHeight, fill: rowIndex % 2 === 0 ? '#ffffff' : '#f8f9fa', stroke: '#dee2e6' }));

			// Draw cells
			let xOffset = padding;
			headers.forEach((col) => {
				// Cell background
				svg.appendChild(getSVGObject({ type: 'rect', x: xOffset, y: yPos, width: width, height: rowHeight, fill: 'none', stroke: '#dee2e6' }));

				// Cell text
				const text = getSVGObject({
						type: 'text',
						x: xOffset + 5,  // Left-aligned text
						y: yPos + rowHeight/2 + 5,
						dominantBaseline: 'middle'
				});
				text.textContent = row[col];
				svg.appendChild(text);

				xOffset += width;
			});
		});
	}
}

function setCheckbox(checkbox, state) {
	// Update the clicked checkbox
	checkbox.innerHTML = state ? '✕' : '';
	// Get the tree-item that contains this checkbox
	const treeItem = checkbox.closest('.tree-item');
	tvwmodel[treeItem.dataset.id].checked = state;
}

function checkboxClick(e, item) {
    if (e) e.stopPropagation();

    const checkbox = e.target;
    const newState = checkbox.innerHTML === '';  // true if currently empty
    setCheckbox(checkbox, newState);

    // If checked, ensure root parent node is checked
    let parentNode = checkbox.closest('.tree-node').parentElement;
    const parentCheckbox = parentNode.previousElementSibling.querySelector('.checkbox');
    if (parentCheckbox && newState) {
        const parentTreeItem = parentCheckbox.parentElement;
        const parentId = parentTreeItem.dataset.id;
        if (tvwmodel[parentId] && tvwmodel[parentId].parent === 0) {
            parentCheckbox.innerHTML = '✕';
            tvwmodel[parentId].checked = true;
        }
    }
    parentNode = parentNode.parentElement.closest('.child-container');

    runQuery();
}

function runQuery() {
	const sql = createSQLStatement();
	document.getElementById('sqlstmt').value = sql;
	griddata = executeSQL(sql);
	renderDataGrid();
}

function sqlChange() {
    // First, clear all checkboxes
    document.querySelectorAll('.checkbox').forEach(checkbox => {
        checkbox.innerHTML = '';
    });

    // Clear all checked states in tvwmodel
    Object.values(tvwmodel).forEach(node => {
        node.checked = false;
    });

    const selectStmt = parseSQL(document.getElementById('sqlstmt').value);
    if (selectStmt && selectStmt.from) {
        // Find the root node in tvwmodel matching selectStmt.from
        const root = Object.values(tvwmodel).find(node => node.parent === 0 && node.Name === selectStmt.from);
        if (root) {
            // Find the corresponding checkbox in the DOM and check it
            const rootCheckbox = document.querySelector(`.tree-item[data-id='${root.ID}'] .checkbox`);
            if (rootCheckbox) setCheckbox(rootCheckbox, true);

            // Collect all descendants of the root node
            const descendants = getAllDescendants(root.ID);

            // For each column in selectStmt.columns, check the matching column node
            if (Array.isArray(selectStmt.columns)) {
                selectStmt.columns.forEach(colName => {
                    // Find the column node under this root
                    let colParent = selectStmt.from;
                    if (colName.includes('.')) {
                        colParent = colName.split('.')[0];
                        colName = colName.split(' ')[0].split('.')[1];
                    }
                    let colNode = descendants.find(node => node.Name === colName && node.Table === colParent);

                    if (colNode) {
                        const colCheckbox = document.querySelector(`.tree-item[data-id='${colNode.ID}'] .checkbox`);
                        if (colCheckbox) {
                            setCheckbox(colCheckbox, true);
                        }
                    }
                });
            }
        }
    }

    criteriagrid.create({}); // Clear out the criteria grid
    if (selectStmt && selectStmt.conditions) {
        const ast = conditionsToAST(selectStmt.conditions);
        criteriagrid.create(ast);
    }

    if (selectStmt && selectStmt.conditions) {
        const ast = conditionsToAST(selectStmt.conditions);
        criteriagrid.create(ast);
    }
    //groupBy, orderBy, having, limit
}

// Helper: Convert flat conditions array to AST (AND/OR only, left-to-right, no parentheses)
function conditionsToAST(conditions) {
    if (!Array.isArray(conditions) || conditions.length === 0) return null;
    // If only one condition, return as Expression node
    if (conditions.length === 1 && !conditions[0].operatorLogical) {
        return {
            type: 'Expression',
            operator: conditions[0].operator,
            left: { type: 'Identifier', name: conditions[0].leftOperand },
            right: { type: 'Literal', value: conditions[0].rightOperand }
        };
    }
    // Otherwise, build a left-deep tree (assume AND between all for now)
    let ast = {
        type: 'Expression',
        operator: conditions[0].operator,
        left: { type: 'Identifier', name: conditions[0].leftOperand },
        right: { type: 'Literal', value: conditions[0].rightOperand }
    };
    for (let i = 1; i < conditions.length; i++) {
        ast = {
            type: 'LogicalExpression',
            operator: 'AND', // Could be improved if logical operator info is available
            children: [
                ast,
                {
                    type: 'Expression',
                    operator: conditions[i].operator,
                    left: { type: 'Identifier', name: conditions[i].leftOperand },
                    right: { type: 'Literal', value: conditions[i].rightOperand }
                }
            ]
        };
    }
    return ast;
}

function createSQLStatement() {
	let sql = 'SELECT ';
	for (const root of Object.values(tvwmodel)) if (root.parent === 0 && root.checked) sql = walktree(root.ID, sql, root.Name, '', true);

    // Add WHERE clause from criteriaGrid (AST)
    if (criteriagrid && criteriagrid.ast) {
        const where = astToWhereClause(criteriagrid.ast);
        if (where && where.trim().length > 0) {
            sql += ' WHERE ' + where;
        }
    }
	return sql;
}

// Helper: Convert AST to SQL WHERE clause string
function astToWhereClause(ast) {
    if (!ast) return '';
    if (ast.type === 'Expression') {
        let left = ast.left?.name || '';
        let op = ast.operator || '=';
        let right = ast.right?.value;
        // Add quotes for string literals if not numeric
        if (
            typeof right === 'string' &&
            !/^\d+(\.\d+)?$/.test(right) &&
            !(right.startsWith("'") && right.endsWith("'")) &&
            !(right.startsWith('"') && right.endsWith('"'))
        ) {
            right = `'${right.replace(/'/g, "''")}'`;
        }
        let expr = `${left} ${op} ${right}`;
        if (ast.not) expr = `NOT (${expr})`;
        return expr;
    } else if (ast.type === 'LogicalExpression' && Array.isArray(ast.children)) {
        let op = ast.operator || 'AND';
        let children = ast.children.map(astToWhereClause).filter(Boolean);
        let joined = children.join(` ${op} `);
        if (ast.not) return `NOT (${joined})`;
        return `(${joined})`;
    }
    return '';
}
// Patch: store last AST in criteriagrid for WHERE clause generation
(function() {
    const origCreate = criteriagrid.create;
    criteriagrid.create = function(ast) {
        this.ast = ast;
        return origCreate.call(this, ast);
    };
})();

// Helper: Check if any descendant columns of a node are checked
function hasCheckedDescendantColumns(nodeID) {
    for (const child of Object.values(tvwmodel)) {
        if (child.parent === nodeID) {
            if (child.checked) return true;
            if (hasCheckedDescendantColumns(child.ID)) return true;
        }
    }
    return false;
}

function walktree(nodeID, sql, from, foreignKey, isRoot = false) {
    if (foreignKey === undefined) foreignKey = '';
    const links = [];
    const backlinks = [];
    const node = tvwmodel[nodeID];
    if (!node) return sql; // safety

    // Collect links and backlinks
    for (const child of Object.values(tvwmodel)) {
        if (child.parent === nodeID && (child.Links??'').length > 0) links.push(child);
        if (child.parent === nodeID && (child.Backlink??'').length > 0) backlinks.push(child);
    }
    // Only set hasJoins to true if any join will actually be included
    let hasJoins = false;
    for (const child of links) {
        if (hasCheckedDescendantColumns(child.ID)) {
            hasJoins = true;
            break;
        }
    }
    if (!hasJoins) {
        for (const child of backlinks) {
            if (hasCheckedDescendantColumns(child.ID)) {
                hasJoins = true;
                break;
            }
        }
    }

    // Collect columns in a separate pass
    for (const child of Object.values(tvwmodel)) {
        if (child.parent === nodeID && child.checked) {
            let colPrefix = '';
            if (foreignKey.length > 0) {
                // This is a joined table's column, always prefix with table name
                colPrefix = foreignKey;
            } else if (hasJoins) {
                // This is the main table and there are joins, prefix with main table name
                colPrefix = from + '.';
            }
            // Build column string
            sql += (sql.at(-1) == ' ' ? '' : ',') + colPrefix + child.Name + (foreignKey.length == 0 ? '' : ' AS ' + foreignKey.replace('.','_') + child.Name);
        }
    }

    // Process linked tables recursively to collect all columns first, but only if needed
    for (const child of links) {
        if (hasCheckedDescendantColumns(child.ID)) {
            const linkedTable = child.Links.split('.')[0];
            sql = walktree(child.ID, sql, from, linkedTable + '.', false);
        }
    }
    for (const child of backlinks) {
        if (hasCheckedDescendantColumns(child.ID)) {
            const linkedTable = child.Name;
            sql = walktree(child.ID, sql, from, linkedTable + '.', false);
        }
    }

    // Add FROM clause only after all columns are collected
    if (isRoot && from && from.length > 0) {
        sql += ' FROM ' + from;

        // Add JOIN clauses after FROM, but only if needed
        for (const child of links) {
            if (hasCheckedDescendantColumns(child.ID)) {
                const linkedTable = child.Links.split('.')[0];
                sql += ' LEFT OUTER JOIN ' + linkedTable + ' ON ' + child.Table + '.' + child.Name + '=' + child.Links;
            }
        }
        for (const child of backlinks) {
            if (hasCheckedDescendantColumns(child.ID)) {
                const linkedTable = child.Name;
                sql += ' LEFT OUTER JOIN ' + linkedTable + ' ON ' + child.Name + '.' + child.Backlink;
            }
        }
    }

    return sql;
}

let lasttvwID = 0;
function newtvwID() { lasttvwID++; return lasttvwID; }
function initTreeview() {
    lasttvwID = 0;
    tvwmodel = {};
    let tables = Object.values(metadata).filter(node => node.Object === 'Table');
    tables.forEach(table => {
        const tblID = newtvwID();
        tvwmodel[tblID] = clone(table);
        tvwmodel[tblID].ID = tblID;
        tvwmodel[tblID].parent = 0;
        tvwmodel[tblID].expanded = true;
        tvwmodel[tblID].checked = false;

		let backlinks = [];
        let columns = Object.values(metadata).filter(node => node.Object === 'Column' && node.Table === table.Name);
        for (column of columns) {
            const colID = newtvwID();
            tvwmodel[colID] = clone(column);
            tvwmodel[colID].ID = colID;
            tvwmodel[colID].parent = tblID;
            tvwmodel[colID].expanded = false;
            tvwmodel[colID].checked = false;
			
			if (column.Backlinks) {
				const bklnx = Array.isArray(column.Backlinks) ? column.Backlinks : [column.Backlinks];
				bklnx.forEach(bklink => { backlinks.push([table.Name + '.' + column.Name, bklink]); });
			}
        }
		for (backlink of backlinks) {
			const backlinkTable = backlink[1].split('.')[0];
			const backlinkCol = backlink[1].split('.')[1];
			
			const backlinkID = newtvwID();
			tvwmodel[backlinkID] = {"Object": "Table"};
			tvwmodel[backlinkID].Name = backlinkTable;
			tvwmodel[backlinkID].ID = backlinkID;
			tvwmodel[backlinkID].Backlink = backlinkCol + '=' + backlink[0];		// [Books] AuthorKey=Authors.ID
			tvwmodel[backlinkID].parent = tblID;
			tvwmodel[backlinkID].expanded = false;
			tvwmodel[backlinkID].checked = false;
		}
    });
}

function loadNodeChildren(e, parentElement, children) {
	if (e && e !== null) e.stopPropagation();
	children.forEach(child => {
		parentElement.appendChild(createTreeItem(child, false, (child.Backlink??'').length>0));
	});
}

function renderPropBox() {
    const svg = document.getElementById('propbox');
    const padding = 0;
    const headerHeight = 2;
    const rowHeight = 25;
    const propWidth = svg.getBoundingClientRect().width;
    const columnWidths = {
        Property: propWidth * .4,
        Value: propWidth * .6
    };

    // Select or Clear the data source selection
    if (selectedObject == 0) document.getElementById('datasource').classList.add('selected'); else document.getElementById('datasource').classList.remove('selected');

    // Get the node data
    if (selectedObject === 0 && tvwmodel[0] === undefined) tvwmodel[0] = metadata[""];
    const nodeData = tvwmodel[selectedObject] || {};

    // Convert object to array of property/value pairs, filtering out certain properties
    const properties = nodeData ? Object.entries(nodeData).filter(([key]) =>
        !['ID', 'parent', 'expanded', 'checked', 'level'].includes(key)
    ) : [];

    // Calculate total width and height
    const totalWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0);
    const totalHeight = headerHeight + (rowHeight * (properties.length + 1));

    // Set SVG size
    svg.style.height = `${totalHeight+4}px`;
    svg.parentElement.style.height = `${totalHeight+4}px`;
    svg.innerHTML = ''; // Clear existing content

    // Draw data rows
    properties.forEach((prop, rowIndex) => {
        const [key, value] = prop;
        if (key !== 'Parent') {
        const yPos = padding + headerHeight + (rowHeight * rowIndex);

        // Row background (alternating colors)
        svg.appendChild(getSVGObject({ type: 'rect', x: padding, y: yPos, width: totalWidth, height: rowHeight, fill: rowIndex % 2 === 0 ? '#ffffff' : '#f8f9fa', stroke: '#dee2e6' }));

        // Property name
        svg.appendChild(getSVGObject({ type: 'rect', x: padding, y: yPos, width: columnWidths.Property, height: rowHeight, fill: 'none', stroke: '#dee2e6' }));

        const propText = getSVGObject({
            type: 'text',
            x: padding + 5,
            y: yPos + rowHeight/2 + 5,
            dominantBaseline: 'bottom'
        });
        propText.textContent = key;
        svg.appendChild(propText);

        // Property value - using foreignObject to embed HTML input
        const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObject.setAttribute("x", padding + columnWidths.Property);
        foreignObject.setAttribute("y", yPos);
        foreignObject.setAttribute("width", columnWidths.Value);
        foreignObject.setAttribute("height", rowHeight);

        const input = document.createElement("input");
        input.value = value;
        input.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            padding: 0 5px;
            background: transparent;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
        `;

        // Add event listener to update the data when input changes
        input.addEventListener('input', (e) => {
            tvwmodel[selectedObject][key] = e.target.value;
            saveDatabase();
        });

        foreignObject.appendChild(input);
        svg.appendChild(foreignObject);
        }
    });

    // Add empty row at bottom
    const emptyRowY = padding + headerHeight + (rowHeight * properties.length);

    // Empty row background
    svg.appendChild(getSVGObject({
        type: 'rect',
        x: padding,
        y: emptyRowY,
        width: totalWidth,
        height: rowHeight,
        fill: properties.length % 2 === 0 ? '#ffffff' : '#f8f9fa',
        stroke: '#dee2e6'
    }));

    // Create a group for the empty property cell and its content
    const emptyPropGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    emptyPropGroup.style.cursor = 'pointer';

    // Empty property cell background
    const emptyPropCell = getSVGObject({
        type: 'rect',
        x: padding,
        y: emptyRowY,
        width: columnWidths.Property,
        height: rowHeight,
        fill: 'none',
        stroke: '#dee2e6'
    });

    // Add placeholder text
    const placeholderText = getSVGObject({
        type: 'text',
        x: padding + 5,
        y: emptyRowY + rowHeight/2 + 4,
        dominantBaseline: 'middle',
        fill: '#999'
    });
    placeholderText.textContent = 'Add New Attribute';

    // Add elements to group
    emptyPropGroup.appendChild(emptyPropCell);
    emptyPropGroup.appendChild(placeholderText);

    // Add click handler for the group
    emptyPropGroup.addEventListener('click', () => {
        const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreignObject.setAttribute("x", padding);
        foreignObject.setAttribute("y", emptyRowY);
        foreignObject.setAttribute("width", columnWidths.Property);
        foreignObject.setAttribute("height", rowHeight);

        const input = document.createElement("input");
        input.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            padding: 0 5px;
            background: transparent;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
        `;

        input.addEventListener('blur', (e) => { if (e.target.value.trim()) addNewAttribute(input); });
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addNewAttribute(input); });

        foreignObject.appendChild(input);
        svg.replaceChild(foreignObject, emptyPropGroup);
        input.focus();
    });

    svg.appendChild(emptyPropGroup);

    // Empty value cell
    svg.appendChild(getSVGObject({
        type: 'rect',
        x: padding + columnWidths.Property,
        y: emptyRowY,
        width: columnWidths.Value,
        height: rowHeight,
        fill: 'none',
        stroke: '#dee2e6'
    }));
}
// Improved resize handler
function handleResize() {
    // Use requestAnimationFrame for better performance
    window.requestAnimationFrame(() => {
        // re-render Criteria Grid
    });
}

// Add resize listener
window.addEventListener('resize', handleResize);

function addNewAttribute(input) {
    input.blur();
    tvwmodel[selectedObject][input.value.trim()] = '';
    saveDatabase();
    renderPropBox(); // Refresh the display
}

document.getElementById('viewToggle').addEventListener('change', function(e) {
    if (this.checked) {
        document.getElementById('sqlbox').style.display = 'block';
        document.getElementById('datagrid').style.display = 'none';
    } else {
        document.getElementById('sqlbox').style.display = 'none';
        document.getElementById('datagrid').style.display = 'block';
        runQuery();
        renderDataGrid();
    }
});

document.getElementById('datasource').addEventListener('change', function() {
    const selectedValue = this.options[this.selectedIndex].value;
        document.getElementById('databaseFile').style.display = (selectedValue != 'sqlite') ? 'none' : 'block';
        switch (selectedValue) {
            case 'books-demo': loadSampleDatabase(selectedValue); break;
            case 'chinook': loadSQLiteRemote(selectedValue); break;
            case 'sqlite': 
                break;
        }
});

function selectObj(ID) {
    selectedObject = ID;

    // Remove highlight from all items
    document.querySelectorAll('.tree-item span').forEach(span => {
        span.classList.remove('selected');
    });

    // Find and highlight the corresponding tree item
    const treeItem = document.querySelector(`.tree-item[data-id="${ID}"] span`);
    if (treeItem) {
        treeItem.classList.add('selected');
    }

    // Update the selectedObject dropdown
    document.getElementById('selectedObject').value = ID;

    // Always render the propbox, even if treeItem wasn't found
    renderPropBox();
}

function newOptionItem(item){
    const option = document.createElement('option');
    option.value = item.ID;
    const typeIcons = {'Database': '∎', 'Table': '☰', 'Column': '┃' };
    if (item.Object == 'Column') option.textContent = `${typeIcons[item.Object]} ${item.Table}.${item.Name}`;
    else option.textContent = `${typeIcons[item.Object]} ${item.Name}`;
    return option;
}

function populateObjectList() {
    const selObj = document.getElementById('selectedObject');

    // Clear existing options
    while (selObj.options.length > 0) selObj.remove(0);

    // First add the database (ID 0)
    const databaseItem = newOptionItem({ Name: 'Database', Object: 'Database' });
    databaseItem.value = "0";
    selObj.appendChild(databaseItem);

    // Get all items from tvwmodel instead of metadata
    const items = Object.values(tvwmodel);

    // Add tables and their columns
    const tables = items.filter(item => item.Object === 'Table');
    tables.forEach(table => {
        selObj.appendChild(newOptionItem(table));

        // Find columns for this table
        const columns = items.filter(item => item.Object === 'Column' && item.Table === table.Name);
        columns.sort((a, b) => (a.Name).localeCompare(b.Name));

        columns.forEach(column => {
            selObj.appendChild(newOptionItem(column));
        });
    });

    // Add change event listener
    selObj.addEventListener('change', function() {
        selectObj(parseInt(this.value));
    });
}

/// TREEVIEW    ////////////////////////////////////////////////////////////////////////////

// Main entry point - initializes tree view
function renderTreeView(parent, level) {
    if (parent === undefined || parent === null) {
        const container = document.querySelector('#tvw .tree-view');
        container.innerHTML = '';
        renderTreeViewLevel(0, 1, container);
    }
}

// Main recursive rendering function
function renderTreeViewLevel(parent, level, parentContainer) {
    const objects = Object.values(tvwmodel).filter(node => node.parent == parent);
    const backlinks = [];
    if (!objects || objects.length === 0) return;

    for (const obj of objects) {
        const clonedObj = { ...obj, level: level };
        const nodeContainer = createNodeContainer(clonedObj, (obj.Backlink??'').length>0);
        if (obj.Backlinks && obj.Backlinks.length > 0) backlinks.push(obj);

        const children = Object.values(tvwmodel).filter(node => node.parent == clonedObj.ID);
        if (children.length > 0 && clonedObj.expanded) {
            const childContainer = createChildContainer(clonedObj);
            renderTreeViewLevel(clonedObj.ID, level + 1, childContainer);
            nodeContainer.appendChild(childContainer);
        }

        parentContainer.appendChild(nodeContainer);
	}
}

// Node container creation
function createNodeContainer(obj, isBacklink) {
    const nodeContainer = document.createElement('div');
    nodeContainer.className = 'tree-node';
    nodeContainer.dataset.id = obj.ID;

    const itemElement = createTreeItem(obj, false, isBacklink);
    nodeContainer.appendChild(itemElement);

    return nodeContainer;
}

function createChildContainer(obj) {
    const childContainer = document.createElement('div');
    childContainer.className = 'child-container';
    return childContainer;
}

// Tree item creation - main function
function createTreeItem(node, expanded, isBacklink) {
    const item = document.createElement('div');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'tree-item';
    itemDiv.setAttribute('data-id', node.ID);

    addSpacer(itemDiv, node);
    addToggleButton(itemDiv, node, expanded);
    addCheckbox(itemDiv, node);
    addTextElement(itemDiv, node, isBacklink);

    item.appendChild(itemDiv);
    return item;
}

// Spacer functionality
function addSpacer(itemDiv, node) {
    const spacer = document.createElement('div');
    const width = (25 * (node.level - 1)) + (node.level == 1 ? 0 : 10);
    spacer.style.width = `${width}px`;
    itemDiv.appendChild(spacer);
}

// Toggle button functionality
function addToggleButton(itemDiv, node, expanded) {
    if (!(node.Object === 'Table' || (node.Object === 'Column' && node.Links))) return;

    const toggleBtn = document.createElement('div');
    toggleBtn.className = node.level > 1 ? 'toggle-btn toggle-btn-pad' : 'toggle-btn';
    toggleBtn.textContent = expanded ? '-' : '+';

    toggleBtn.addEventListener('click', function() {
        handleToggleClick(node, this);
    });

    itemDiv.appendChild(toggleBtn);
}

function handleToggleClick(node, toggleElement) {
    const isDeepLevel = node.level > 1;
    const isCollapsed = toggleElement.closest('.tree-item').textContent.substr(0,1) === '+';

    if (isDeepLevel && isCollapsed) {
        expandRelation(node, toggleElement);
    } else {
        hideItem(toggleElement);
    }
}

// Checkbox functionality
function addCheckbox(itemDiv, node) {
    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox';
    checkbox.onclick = (e) => checkboxClick(e, itemDiv);

    // Set the checkbox state based on the node's checked property
    if (node && node.checked) {
        checkbox.innerHTML = '✕';
    }

    itemDiv.appendChild(checkbox);
}

// Text element functionality
function addTextElement(itemDiv, node, isBacklink) {
    const text = document.createElement('span');
    text.textContent = (isBacklink ? '♦ ':'') + node.Name;
    text.onclick = (e) => {
        e.stopPropagation();
        handleTextSelection(text, node);
    };
    itemDiv.appendChild(text);
}

function handleTextSelection(text, node) {
    document.querySelectorAll('.tree-item span').forEach(span => {
        span.classList.remove('selected');
    });
    text.classList.add('selected');
    selectedObject = node.ID;
    document.getElementById('selectedObject').value = node.ID;
    renderPropBox();
}

// Utility function for creating elements
function createElement(tagName, className = '') {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
}

function expandRelation(node, container) {
    // Find and update the original object in tvwmodel
    const originalNode = Object.values(tvwmodel).find(item => item.ID === node.ID);
    if (originalNode) originalNode.expanded = !originalNode.expanded;    

    let found = false;
    for (const item of Object.values(tvwmodel)) if (item.parent == node.ID) { found = true; break; }

    if (!found) {		
        let relTable = '';
		const backlinks = [];
		if (node.Links) relTable = getTableName(node.Links); else if (node.Backlink) relTable = node.Name;
        const columns = Object.values(metadata).filter(nod => nod.Object === 'Column' && nod.Table === relTable);
        for (const column of columns) {
            const colID = newtvwID();
            tvwmodel[colID] = clone(column);
            tvwmodel[colID].ID = colID;
            tvwmodel[colID].parent = node.ID;
            tvwmodel[colID].level = node.level + 1;
            tvwmodel[colID].expanded = false;
            tvwmodel[colID].checked = false;
			if (tvwmodel[colID].Backlinks) {
				const bklnx = Array.isArray(column.Backlinks) ? column.Backlinks : [column.Backlinks];
				bklnx.forEach(bklink => { backlinks.push([relTable.Name + '.' + column.Name, bklink]); });
			}
        }
		for (backlink of backlinks) {
			const backlinkTable = backlink[1].split('.')[0];
			const backlinkCol = backlink[1].split('.')[1];
			
			const backlinkID = newtvwID();
			tvwmodel[backlinkID] = {"Object": "Table"};
			tvwmodel[backlinkID].Name = backlinkTable;
			tvwmodel[backlinkID].ID = backlinkID;
			tvwmodel[backlinkID].Backlink = backlinkCol + '=' + backlink[0];		// [Books] AuthorKey=Authors.ID
			tvwmodel[backlinkID].parent = node.ID;
			tvwmodel[backlinkID].expanded = false;
			tvwmodel[backlinkID].checked = false;
		}
    }
    renderTreeView();
}

function hideItem(element) {
    // Find the node data and toggle its expanded state
    const treeItem = element.closest('.tree-item');
    const nodeId = treeItem.getAttribute('data-id');
    const originalNode = Object.values(tvwmodel).find(item => item.ID == nodeId);

    if (originalNode) {
        originalNode.expanded = !originalNode.expanded;
        renderTreeView();
    }
}

// Recursively collect all descendants of a node given its ID
function getAllDescendants(parentId) {
    const descendants = [];
    function recurse(id) {
        const children = Object.values(tvwmodel).filter(node => node.parent === id);
        for (const child of children) {
            descendants.push(child);
            recurse(child.ID);
        }
    }
    recurse(parentId);
    return descendants;
}

function setCookie(name, value, days) {
	const expires = new Date(Date.now() + days * 864e5).toUTCString(); 
	document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
	const m = document.cookie.match(new RegExp('(?:^|;)\\s*' + name + '=([^;]*)'));
	return m ? decodeURIComponent(m[1]) : null;
}

function expandNodeByName(nodeName) {
    // Find the node with the given name
    const node = Object.values(tvwmodel).find(n => n.Name === nodeName);
    if (node) {
        // Check if children are already loaded
        const hasChildren = Object.values(tvwmodel).some(n => n.parent === node.ID);
        if (!hasChildren && (node.Links || node.Backlink)) {
            // This mimics the user clicking the expand button for a relation node
            expandRelation(node);
        } else {
            node.expanded = true;
            renderTreeView();
        }
    }
}

function renderOrderBySVG(selectStmt) {
    const svg = document.getElementById('orderby');
    const padding = 10;
    const rowHeight = 25;
    const width = svg.getBoundingClientRect().width;
    const height = svg.getBoundingClientRect().height;

    // Clear existing content
    svg.innerHTML = '';

    // Background
    svg.appendChild(getSVGObject({ 
        type: 'rect', 
        x: 0, 
        y: 0, 
        width: width, 
        height: height, 
        fill: '#f8f9fa', 
        stroke: '#dee2e6' 
    }));

    let yOffset = padding;
    let rowIndex = 0;

    // Helper function to add a row
    function addRow(label, content) {
        if (!content || (Array.isArray(content) && content.length === 0)) return;
        
        // Row background
        svg.appendChild(getSVGObject({ 
            type: 'rect', 
            x: padding, 
            y: yOffset, 
            width: width - (padding * 2), 
            height: rowHeight, 
            fill: rowIndex % 2 === 0 ? '#ffffff' : '#f8f9fa', 
            stroke: '#dee2e6' 
        }));

        // Label
        const labelText = getSVGObject({
            type: 'text',
            x: padding + 5,
            y: yOffset + rowHeight/2 + 5,
            dominantBaseline: 'middle',
            fontSize: '12px',
            fontWeight: 'bold'
        });
        labelText.textContent = label;
        svg.appendChild(labelText);

        // Content
        let contentText = '';
        if (Array.isArray(content)) {
            if (content[0] && typeof content[0] === 'object' && content[0].column) {
                // Order by items with direction
                contentText = content.map(item => `${item.column} ${item.direction}`).join(', ');
            } else {
                // Group by columns
                contentText = content.join(', ');
            }
        } else {
            contentText = String(content);
        }

        const contentElement = getSVGObject({
            type: 'text',
            x: padding + 80,
            y: yOffset + rowHeight/2 + 5,
            dominantBaseline: 'middle',
            fontSize: '11px'
        });
        contentElement.textContent = contentText;
        svg.appendChild(contentElement);

        yOffset += rowHeight;
        rowIndex++;
    }

    // Add rows for each clause
    if (selectStmt.groupBy) {
        addRow('GROUP BY:', selectStmt.groupBy);
    }
    
    if (selectStmt.having) {
        const havingText = selectStmt.having.map(condition => 
            `${condition.leftOperand} ${condition.operator} ${condition.rightOperand}`
        ).join(' AND ');
        addRow('HAVING:', havingText);
    }
    
    if (selectStmt.orderBy) {
        addRow('ORDER BY:', selectStmt.orderBy);
    }
    
    if (selectStmt.limit) {
        let limitText = selectStmt.limit.toString();
        if (selectStmt.offset) {
            limitText += ` OFFSET ${selectStmt.offset}`;
        }
        addRow('LIMIT:', limitText);
    }

    // If no clauses, show placeholder
    if (yOffset === padding) {
        const placeholderText = getSVGObject({
            type: 'text',
            x: width/2,
            y: height/2,
            textAnchor: 'middle',
            dominantBaseline: 'middle',
            fontSize: '12px',
            fill: '#999'
        });
        placeholderText.textContent = '';
        svg.appendChild(placeholderText);
    }
}

function sqlChange() {
    // First, clear all checkboxes
    document.querySelectorAll('.checkbox').forEach(checkbox => {
        checkbox.innerHTML = '';
    });

    // Clear all checked states in tvwmodel
    Object.values(tvwmodel).forEach(node => {
        node.checked = false;
    });

    const selectStmt = parseSQL(document.getElementById('sqlstmt').value);
    if (selectStmt && selectStmt.from) {
        // Find the root node in tvwmodel matching selectStmt.from
        const root = Object.values(tvwmodel).find(node => node.parent === 0 && node.Name === selectStmt.from);
        if (root) {
            // Find the corresponding checkbox in the DOM and check it
            const rootCheckbox = document.querySelector(`.tree-item[data-id='${root.ID}'] .checkbox`);
            if (rootCheckbox) setCheckbox(rootCheckbox, true);

            // Collect all descendants of the root node
            const descendants = getAllDescendants(root.ID);

            // For each column in selectStmt.columns, check the matching column node
            if (Array.isArray(selectStmt.columns)) {
                selectStmt.columns.forEach(colName => {
                    // Find the column node under this root
                    let colParent = selectStmt.from;
                    if (colName.includes('.')) {
                        colParent = colName.split('.')[0];
                        colName = colName.split(' ')[0].split('.')[1];
                    }
                    let colNode = descendants.find(node => node.Name === colName && node.Table === colParent);

                    if (colNode) {
                        const colCheckbox = document.querySelector(`.tree-item[data-id='${colNode.ID}'] .checkbox`);
                        if (colCheckbox) {
                            setCheckbox(colCheckbox, true);
                        }
                    }
                });
            }
        }
    }

    criteriagrid.create({}); // Clear out the criteria grid
    if (selectStmt && selectStmt.conditions) {
        const ast = conditionsToAST(selectStmt.conditions);
        criteriagrid.create(ast);
    }

    // Render the orderby SVG with additional clauses
    renderOrderBySVG(selectStmt);
}
