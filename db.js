let db = null;  // Global variable to hold the database
let SQL = null; // Global variable to hold the SQL.js instance

const dbtestSchema = () => {
    const [{ values: [[createSQL]] }] = db.exec(`
      SELECT sql FROM sqlite_master
      WHERE type='table';
    `); // AND name='Books'
    console.log('Full CREATE statement (as stored):\n', createSQL);
}

// Initialize SQL.js and create database
function initializeApp() {
    initSqlJs({ locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}` })
        .then(function(sql) {
            SQL = sql;
            db = new SQL.Database();
            loadSampleDatabase('books-demo');
        })
        .catch(function(err) {
            console.error("Error initializing SQL.js:", err);
            alert("Error initializing SQL.js. Please refresh the page.");
        });
}

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already ready
    initializeApp();
}


// The selected data source is kept here: document.getElementById('datasource').textContent
let selectedObject = 0; // The ID of the currently selected item
const template = {
   "Database" : { Object: "Database", Name: "", "Database Type": ["PostgreSQL"], "Host Name": "", Port: "5432", Username: "", Persist: ["Local Storage"], Description: "", "Default Join Type":"LEFT OUTER"},
   "Table" : { Object: "Table", Name: "", Description: "" },
   "Column" : { Object: "Column", Name: "", DataType: "", ShowValueSelection: false, Description: "" },
}

let metadata = {};  // Simple model: DB object, list of Tables and Columns
let tvwmodel = {};  // the full model, reflecting queries

const samples = {
   'books-demo':
       {'script' : [`CREATE TABLE Authors (ID INT,Name STRING,BirthDate STRING,Country STRING);`, `INSERT INTO Authors (ID, Name, BirthDate, Country) VALUES (1, 'George Orwell', '1903-06-25', 'United Kingdom'),(2, 'Jane Austen', '1775-12-16', 'United Kingdom'),(3, 'Mark Twain', '1835-11-30', 'United States'),(4, 'Agatha Christie', '1890-09-15', 'United Kingdom'),(5, 'J.R.R. Tolkien', '1892-01-03', 'United Kingdom'),(6, 'Harper Lee', '1926-04-28', 'United States'),(7, 'Ernest Hemingway', '1899-07-21', 'United States'),(8, 'F. Scott Fitzgerald', '1896-09-24', 'United States'),(9, 'Charles Dickens', '1812-02-07', 'United Kingdom'),(10, 'Leo Tolstoy', '1828-09-09', 'Russia')`, `CREATE TABLE Books (ID INT,Title STRING,ISBN STRING,Genre STRING,PublishDate STRING,AuthorKey INT)`, `INSERT INTO Books (ID, Title, ISBN, Genre, PublishDate, AuthorKey) VALUES (1, '1984', '9780451524935', 'Literary Fiction', '1949-06-08', 1),(2, 'Pride and Prejudice', '9780192833554', 'Romance', '1813-01-28', 2),(3, 'The Adventures of Tom Sawyer', '9780143039563', 'Adventure', '1876-06-01', 3),(4, 'Murder on the Orient Express', '9780062693662', 'Mystery', '1934-01-01', 4),(5, 'The Hobbit', '9780345339683', 'Fantasy', '1937-09-21', 5),(6, 'To Kill a Mockingbird', '9780060935467', 'Literary Fiction', '1960-07-11', 6),(7, 'The Old Man and the Sea', '9780684801223', 'Literary Fiction', '1952-09-01', 7),(8, 'The Great Gatsby', '9780743273565', 'Literary Fiction', '1925-04-10', 8),(9, 'A Tale of Two Cities', '9780141439600', 'Historical Fiction', '1859-04-30', 9),(10, 'War and Peace', '9780199232765', 'Historical Fiction', '1869-01-01', 10),(11, 'Anna Karenina', '9780143035008', 'Romance', '1877-01-01', 10)` ],
       'metadata': {
            "": {"Object": "Database","Name": "books-demo","Database Type": "PostgreSQL","Host Name": "127.0.0.1","Port": "5432","Username": "postgres","Persist": "Local Storage","Description": ""},
            "Books": {"Object": "Table","Name": "Books","Description": ""},
            "Books.ID": {"Object": "Column","Name": "ID","DataType": "INTEGER","Table": "Books","Description": ""},
            "Books.Title": {"Object": "Column","Name": "Title","DataType": "VARCHAR(255)","Table": "Books","Description": ""},
            "Books.ISBN": {"Object": "Column","Name": "ISBN","DataType": "VARCHAR(13)","Table": "Books","Description": ""},
            "Books.Genre": {"Object": "Column","Name": "Genre","DataType": "VARCHAR(50)","Table": "Books","Description": ""},
            "Books.PublishDate": {"Object": "Column","Name": "PublishDate","DataType": "DATE","Table": "Books","Description": ""},
            "Books.AuthorKey": {"Object": "Column","Name": "AuthorKey","DataType": "INTEGER","Table": "Books","Description": "","Links":"Authors.ID"},
            "Authors": {"Object": "Table","Name": "Authors","Description": ""},
            "Authors.ID": {"Object": "Column","Name": "ID","DataType": "INTEGER","Table": "Authors","Description": "","Backlinks":["Books.AuthorKey"]},
            "Authors.Name": {"Object": "Column","Name": "Name","DataType": "VARCHAR(150)","Table": "Authors","Description": ""},
            "Authors.BirthDate": {"Object": "Column","Name": "BirthDate","DataType": "DATE","Table": "Authors","Description": ""},
            "Authors.Country": {"Object": "Column","Name": "Country","DataType": "VARCHAR(150)","Table": "Authors","Description": ""}
        }
    }
}
const sampleFile = {
    chinook: {
        url : 'https://2e81355f29072d85d84c-a2e208642c3d2c2c74271f0bccb40011.ssl.cf5.rackcdn.com/chinook2.db',
        links : {'Albums.ArtistId':'Artists.ArtistId','Customers.SupportRepId':'Employees.EmployeeId',
            'Employees.ReportsTo':'Employees.EmployeeId','Invoices.CustomerId':'Customers.CustomerId',
            'Invoice_Items.InvoiceId':'Invoices.InvoiceId','Invoice_Items.TrackId':'Tracks.TrackId',
            'Playlist_Track.PlaylistId':'Playlists.PlaylistId','Playlist_Track.TrackId':'Tracks.TrackId',
            'Tracks.AlbumId':'Albums.AlbumId','Tracks.MediaTypeId':'Media_Types.MediaTypeId','Tracks.GenreId':'Genres.GenreId'}
            /* A shortcut: normally find these from Foreign Key constraints, a data dictionary, or mining existing queries */
    }
}

var griddata = [];

const criteria = {
    100: {ID: 100, Not: false, LOperand: "Column A", COperator: "=", ROperand: "value 1" },
    201: {ID: 201, Not: false, LOperand: "Column B", COperator: ">", ROperand: "value 2" },
    302: {ID: 302, Not: false, LOperand: "Column C", COperator: "<", ROperand: "value 3" }
};
const logicalOperators = {   // LogicalOperator : AND, OR, NOT
    LO_1: {Op: 'AND', IDs: [100, 201] },
    LO_2: {Op: 'NOT', IDs:[302]}
};

function clone(source) {
  const clone = {};
  Object.keys(source).forEach(key => { clone[key] = source[key]; });
  return clone;
}

function saveDatabase() {
    const datasource = document.getElementById('datasource').options[document.getElementById('datasource').selectedIndex].value;
    localStorage.setItem(datasource, JSON.stringify(metadata));
}

function loadDB() {
    renderDataGrid();
    initTreeview();
    renderTreeView();  // Actually render the tree view to the DOM
    criteriagrid.init();
    populateObjectList();
    selectObj(0);  // Select the database first as default 
}

function loadSampleDatabase(dbname) {
   metadata = {};
   if (samples[dbname] && samples[dbname].script) { // if it's a sample
       for (const stmt of samples[dbname].script) db.run(stmt);
       metadata = samples[dbname].metadata;
   }

   // Check if any changes were made
   const savedAttributes = localStorage.getItem(dbname);
   if (savedAttributes) metadata = JSON.parse(savedAttributes);

   loadDB();
}

const executeSQL = (sql) => {
    const stmt = db.prepare(sql);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

function getTableName(link) { return link.split('.')[0]; }

// Initialize SQL.js
function initSQL() {
   const config = {
       locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}`
   };

   initSqlJs(config).then(function(SQL) {
       window.SQL = SQL; // Make SQL available globally
       console.log("SQL.js initialized.");
   });
}

// Load a SQLite database file
function loadSQLiteDatabase(event) {
   const file = event.target.files[0];
   if (!file) {
       alert("No file selected.");
       return;
   }

   const reader = new FileReader();
   reader.onload = function() {
       const uint8Array = new Uint8Array(reader.result);
       db = new SQL.Database(uint8Array); // Load the database from the file
       console.log("Database loaded.");
       queryDatabase();
   };
   reader.readAsArrayBuffer(file);
}

// Query the database
function queryDatabase() {
   if (!db) { alert("No database loaded."); return; }
   // Example query
   //const result = db.exec("SELECT * FROM test;"); // Replace with your table name
}

function parseSQL(sql) {
    //const sql = document.getElementById('sqlstmt').value.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!sql || sql.trim() === '') return;

    const result = {};
        sql = sql.replace(/[\n\t\r\u0000-\u001F\u007F-\u009F]/g, ''); // remove special characters
    result.from = sql.match(/FROM\s+(\w+)/i)[1].trim();

    result.tables = extractTables(sql);

    let columns;
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
        const columnClause = selectMatch[1].trim();
        result.columns = extractColumns(columnClause);
    }

    let conditions;
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+LIMIT|$)/i);
    if (whereMatch) {
        const whereClause = whereMatch[1].trim();
        result.conditions = extractConditions(whereClause);
    }

    // Parse GROUP BY clause
    const groupByMatch = sql.match(/GROUP\s+BY\s+(.+?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|$)/i);
    if (groupByMatch) {
        const groupByClause = groupByMatch[1].trim();
        result.groupBy = extractGroupByColumns(groupByClause);
    }

    // Parse HAVING clause (comes after GROUP BY)
    const havingMatch = sql.match(/HAVING\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
    if (havingMatch) {
        const havingClause = havingMatch[1].trim();
        result.having = extractConditions(havingClause);
    }

    // Parse ORDER BY clause
    const orderByMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    if (orderByMatch) {
        const orderByClause = orderByMatch[1].trim();
        result.orderBy = extractOrderByColumns(orderByClause);
    }

    // Parse LIMIT clause
    const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
    if (limitMatch) {
        result.limit = parseInt(limitMatch[1]);
        if (limitMatch[2]) {
            result.offset = parseInt(limitMatch[2]);
        }
    }

    return result;
}


function extractTables(tableClause) {
    const tables = [];
    // Handle JOIN clauses and multiple tables
    const tableParts = tableClause.split(/\s+(?:JOIN|,)\s+/i);

    tableParts.forEach(part => {
        const tableName = part.trim().split(/\s+(?:AS\s+)?(\w+)?/i)[0].trim();
        if (tableName && !tables.includes(tableName) && tableName != 'SELECT') {
            tables.push(tableName);
        }
    });

    return tables;
}

function extractColumns(columnClause) {
    if (columnClause === '*') return ['*'];    
    return splitByComma(columnClause);
}

function extractColumnName(columnExpression) {
    // Handle function calls like COUNT(*), MAX(table.column)
    if (columnExpression.includes('(')) {
        const funcMatch = columnExpression.match(/\w+\(([^)]+)\)/);
        if (funcMatch) {
            return funcMatch[1].trim();
        }
    }

    // If table.column format, keep the period and return as is
    if (columnExpression.includes('.')) {
        return columnExpression.trim();
    }

    // Handle aliases
    const aliasMatch = columnExpression.match(/^([^\s]+)/);
    if (aliasMatch) {
        return aliasMatch[1].trim();
    }

    return columnExpression.trim();
}

function extractConditions(whereClause) {
    const conditions = [];

    // Split by AND/OR, but be careful with nested parentheses
    const conditionParts = splitByLogicalOperator(whereClause);

    conditionParts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed) {
            // Extract condition components
            const condition = parseCondition(trimmed);
            if (condition) {
                conditions.push(condition);
            }
        }
    });

    return conditions;
}

function parseCondition(conditionStr) {
    // Match patterns like: column = value, column > value, etc.
    const operators = ['=', '!=', '<>', '<', '<=', '>', '>=', 'LIKE', 'IN', 'BETWEEN'];

    for (const op of operators) {
        const pattern = new RegExp(`(.+?)\\s+${op}\\s+(.+)`, 'i');
        const match = conditionStr.match(pattern);
        if (match) {
            return {
                leftOperand: match[1].trim(),
                operator: op,
                rightOperand: match[2].trim()
            };
        }
    }

    return null;
}

function extractValues(valuesList) {
    const values = [];
    const valueParts = splitByComma(valuesList);

    valueParts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed) {
            // Remove quotes if present
            const value = trimmed.replace(/^['"`]|['"`]$/g, '');
            values.push(value);
        }
    });

    return values;
}

function extractSetColumns(setClause) {
    const columns = [];
    const setParts = splitByComma(setClause);

    setParts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed) {
            const equalMatch = trimmed.match(/^([^=]+)=/);
            if (equalMatch) {
                const columnName = equalMatch[1].trim();
                columns.push(columnName);
            }
        }
    });

    return columns;
}

function extractColumnDefinitions(columnDefs) {
    const columns = [];
    const defParts = splitByComma(columnDefs);

    defParts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed) {
            const nameMatch = trimmed.match(/^(\w+)/);
            if (nameMatch) {
                columns.push(nameMatch[1]);
            }
        }
    });

    return columns;
}

function splitByComma(str) {
    const parts = [];
    let current = '';
    let parenCount = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;
        else if (char === ',' && parenCount === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    if (current.trim()) {
        parts.push(current.trim());
    }

    return parts;
}

function splitByLogicalOperator(str) {
    const parts = [];
    let current = '';
    let parenCount = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;

        // Check for AND/OR operators
        if (parenCount === 0) {
            const remaining = str.substring(i);
            if (remaining.match(/^\s+(AND|OR)\s+/i)) {
                if (current.trim()) {
                    parts.push(current.trim());
                    current = '';
                }
                i += remaining.match(/^\s+(AND|OR)\s+/i)[0].length - 1;
                continue;
            }
        }

        current += char;
    }

    if (current.trim()) {
        parts.push(current.trim());
    }

    return parts;
}

function extractGroupByColumns(groupByClause) {
    const columns = [];
    const columnParts = splitByComma(groupByClause);

    columnParts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed) {
            // Extract column name (remove aliases and functions)
            const columnName = extractColumnName(trimmed);
            if (columnName && !columns.includes(columnName)) {
                columns.push(columnName);
            }
        }
    });

    return columns;
}

function extractOrderByColumns(orderByClause) {
    const orderByItems = [];
    const itemParts = splitByComma(orderByClause);

    itemParts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed) {
            // Parse ORDER BY item: column [ASC|DESC]
            const orderMatch = trimmed.match(/^(.+?)(?:\s+(ASC|DESC))?$/i);
            if (orderMatch) {
                const columnName = extractColumnName(orderMatch[1].trim());
                const direction = orderMatch[2] ? orderMatch[2].toUpperCase() : 'ASC';
                
                if (columnName) {
                    orderByItems.push({
                        column: columnName,
                        direction: direction
                    });
                }
            }
        }
    });

    return orderByItems;
}

function loadLinksBacklinks(dbname) {
    // If demo load directly.  (Normally find these from Foreign Key constraints, a data dictionary, or mining existing queries)
    if (dbname && sampleFile[dbname] && sampleFile[dbname].links)  {
        Object.entries(sampleFile[dbname].links).forEach(([fk, pk]) => {            
            metadata[fk].Links = pk;
            (metadata[pk].Backlinks ??= []).push(fk);
        });
        return;
    }

    const tables = [];
    for (key of Object.keys(metadata)) if (metadata[key].Object == "Table") tables.push(key);
    for (key of Object.keys(metadata)) {
        if (metadata[key].Object == "Column") {
            const table = key.split('.')[0];
            const col = key.split('.')[1];
            const fkcol = col.replace(/(?:key|ID)$/i, '');
            const fktable = tables.find(item => item === fkcol || item === fkcol+'s') || null;
            if (fktable) {
                metadata[key].Links = `${fktable}.ID`; // for now
                metadata[`${fktable}.ID`].Backlinks = key;
            }
        }
    }
}

function loadSQLiteRemote(dbname) {
    if (sampleFile[dbname]) {        
        fetch(sampleFile[dbname].url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to load file');
                return response.arrayBuffer();
            })
            .then(buffer => loadSQLiteDB(buffer, dbname))
            .catch(err => {
                console.error("Error loading SQLite DB:", err);
                alert("Failed to load SQLite DB: " + err.message);
            });
    }
}

function loadSQLiteLocal(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    file.arrayBuffer().then(buffer => loadSQLiteDB(buffer, file.name));
}

function loadSQLiteDB(buffer, dbname) {
    db = new SQL.Database(new Uint8Array(buffer));
    // Read tables from sqlite_master
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    metadata = {};
    const backlinks = [];
    if (tables.length > 0) {
        // Add database-level metadata
        metadata[""] = {
            Object: "Database",
            Name: dbname,
            "Database Type": "SQLite",
            "Host Name": "",
            Port: "",
            Username: "",
            Persist: "",
            Description: ""
        };
        for (tableNames of tables[0].values) {
            const tableName = Array.isArray(tableNames) ? tableNames[0] : tableNames;
            metadata[tableName] = { Object: "Table", Name: tableName, Description: "" };
            // Get columns for this table
            const pragma = db.exec(`PRAGMA table_info(${tableName});`);
            if (pragma.length > 0) {
                for (col of pragma[0].values) {                
                    const [cid, name, type, notnull, dflt_value, pk] = col;
                    metadata[`${tableName}.${name}`] = {
                        Object: "Column",
                        Name: name,
                        DataType: type,
                        Table: tableName,
                        Description: ""
                    };
                }
            }
        }
        loadLinksBacklinks(dbname);
    }
    loadDB();
}
