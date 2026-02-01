// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabName === 'query') {
        document.querySelector('.tab-button:nth-child(1)').classList.add('active');
        document.getElementById('queryTab').classList.add('active');
    } else if (tabName === 'compare') {
        document.querySelector('.tab-button:nth-child(2)').classList.add('active');
        document.getElementById('compareTab').classList.add('active');
    }
}

// Comparison functionality
let currentSchemaDiff = null;
let currentDataDiff = null;

async function startComparison() {
    const db1 = document.getElementById('compareDb1').value;
    const db2 = document.getElementById('compareDb2').value;
    const includeData = document.getElementById('includeData').checked;
    const useChecksums = document.getElementById('useChecksums').checked;

    if (!db1 || !db2) {
        alert('Please enter paths for both databases');
        return;
    }

    document.getElementById('comparisonLoading').style.display = 'block';
    document.getElementById('comparisonResults').style.display = 'none';
    document.getElementById('comparisonEmpty').style.display = 'none';

    try {
        // Get schema comparison
        const schemaResponse = await authenticatedFetch('/api/compare/schema', {
            method: 'POST',
            body: JSON.stringify({ dbPath1: db1, dbPath2: db2 })
        });

        const schemaData = await schemaResponse.json();
        if (!schemaData.success) {
            throw new Error(schemaData.error || 'Schema comparison failed');
        }

        currentSchemaDiff = schemaData.schemaDiff;

        // Get data comparison if requested
        if (includeData) {
            const tablesToCompare = currentSchemaDiff.commonTables;

            if (tablesToCompare.length > 0) {
                const dataResponse = await authenticatedFetch('/api/compare/data', {
                    method: 'POST',
                    body: JSON.stringify({
                        dbPath1: db1,
                        dbPath2: db2,
                        tables: tablesToCompare,
                        useChecksums
                    })
                });

                const dataResult = await dataResponse.json();
                if (dataResult.success) {
                    currentDataDiff = dataResult.dataDiff;
                }
            }
        }

        displayComparisonResults();
    } catch (error) {
        alert('Comparison failed: ' + error.message);
        document.getElementById('comparisonLoading').style.display = 'none';
        document.getElementById('comparisonEmpty').style.display = 'block';
    }
}

function displayComparisonResults() {
    document.getElementById('comparisonLoading').style.display = 'none';
    document.getElementById('comparisonResults').style.display = 'block';

    // Update summary
    document.getElementById('addedCount').textContent = currentSchemaDiff.addedTables.length;
    document.getElementById('removedCount').textContent = currentSchemaDiff.removedTables.length;
    document.getElementById('modifiedCount').textContent = currentSchemaDiff.modifiedTables.length;

    // Display added tables
    const addedSection = document.getElementById('addedTablesSection');
    const addedList = document.getElementById('addedTablesList');
    if (currentSchemaDiff.addedTables.length > 0) {
        addedSection.style.display = 'block';
        addedList.innerHTML = currentSchemaDiff.addedTables.map(table =>
            `<div class="diff-item added">
                <div class="diff-item-title">
                    ${table}
                    <span class="diff-item-badge">ADDED</span>
                </div>
            </div>`
        ).join('');
    } else {
        addedSection.style.display = 'none';
    }

    // Display removed tables
    const removedSection = document.getElementById('removedTablesSection');
    const removedList = document.getElementById('removedTablesList');
    if (currentSchemaDiff.removedTables.length > 0) {
        removedSection.style.display = 'block';
        removedList.innerHTML = currentSchemaDiff.removedTables.map(table =>
            `<div class="diff-item removed">
                <div class="diff-item-title">
                    ${table}
                    <span class="diff-item-badge">REMOVED</span>
                </div>
            </div>`
        ).join('');
    } else {
        removedSection.style.display = 'none';
    }

    // Display modified tables
    const modifiedSection = document.getElementById('modifiedTablesSection');
    const modifiedList = document.getElementById('modifiedTablesList');
    if (currentSchemaDiff.modifiedTables.length > 0) {
        modifiedSection.style.display = 'block';
        modifiedList.innerHTML = currentSchemaDiff.modifiedTables.map(table =>
            `<div class="diff-item modified">
                <div class="diff-item-title">
                    ${table.name}
                    <span class="diff-item-badge">MODIFIED</span>
                </div>
                <div class="diff-details">
                    ${table.changes.columns.added.length > 0 ?
                        `<div class="diff-detail-item">Added columns: ${table.changes.columns.added.map(c => c.name).join(', ')}</div>` : ''}
                    ${table.changes.columns.removed.length > 0 ?
                        `<div class="diff-detail-item">Removed columns: ${table.changes.columns.removed.map(c => c.name).join(', ')}</div>` : ''}
                    ${table.changes.columns.modified.length > 0 ?
                        `<div class="diff-detail-item">Modified columns: ${table.changes.columns.modified.map(c => c.name).join(', ')}</div>` : ''}
                    ${table.changes.indexes.added.length > 0 ?
                        `<div class="diff-detail-item">Added indexes: ${table.changes.indexes.added.map(i => i.name).join(', ')}</div>` : ''}
                    ${table.changes.indexes.removed.length > 0 ?
                        `<div class="diff-detail-item">Removed indexes: ${table.changes.indexes.removed.map(i => i.name).join(', ')}</div>` : ''}
                    ${table.changes.foreignKeys.added.length > 0 ?
                        `<div class="diff-detail-item">Added foreign keys: ${table.changes.foreignKeys.added.length}</div>` : ''}
                    ${table.changes.foreignKeys.removed.length > 0 ?
                        `<div class="diff-detail-item">Removed foreign keys: ${table.changes.foreignKeys.removed.length}</div>` : ''}
                </div>
            </div>`
        ).join('');
    } else {
        modifiedSection.style.display = 'none';
    }

    // Display data differences
    const dataSection = document.getElementById('dataDiffSection');
    const dataList = document.getElementById('dataDiffList');
    if (currentDataDiff && Object.keys(currentDataDiff.tables).length > 0) {
        dataSection.style.display = 'block';
        dataList.innerHTML = Object.entries(currentDataDiff.tables).map(([table, diff]) =>
            `<div class="data-diff-row">
                <div>
                    <div class="data-diff-table-name">${table}</div>
                    <div class="data-diff-counts">
                        DB1: ${diff.rowCount.db1} rows | DB2: ${diff.rowCount.db2} rows
                    </div>
                </div>
                <div>
                    ${diff.difference !== 0 ?
                        `<span class="diff-item-badge ${diff.difference > 0 ? 'added' : 'removed'}">
                            ${diff.difference > 0 ? '+' : ''}${diff.difference}
                        </span>` :
                        '<span class="diff-item-badge" style="background: #333;">No difference</span>'}
                </div>
            </div>`
        ).join('');
    } else {
        dataSection.style.display = 'none';
    }
}

async function generateSyncScript() {
    if (!currentSchemaDiff) {
        alert('No comparison data available. Please run a comparison first.');
        return;
    }

    const db1 = document.getElementById('compareDb1').value;
    const db2 = document.getElementById('compareDb2').value;
    const direction = document.getElementById('syncDirection').value;

    try {
        const response = await authenticatedFetch('/api/compare/generate-sync', {
            method: 'POST',
            body: JSON.stringify({
                sourceDb: db1,
                targetDb: db2,
                direction,
                schemaDiff: currentSchemaDiff
            })
        });

        const data = await response.json();
        if (data.success) {
            document.getElementById('syncSqlPreview').textContent = data.syncScript;
            document.getElementById('syncPreview').style.display = 'block';
        } else {
            throw new Error(data.error || 'Failed to generate sync script');
        }
    } catch (error) {
        alert('Failed to generate sync script: ' + error.message);
    }
}

async function executeSync() {
    const sql = document.getElementById('syncSqlPreview').textContent;
    const direction = document.getElementById('syncDirection').value;
    const targetDb = direction === 'left-to-right' ?
        document.getElementById('compareDb2').value :
        document.getElementById('compareDb1').value;

    if (!confirm(`Are you sure you want to execute this sync script on ${targetDb}? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await authenticatedFetch('/api/query', {
            method: 'POST',
            body: JSON.stringify({
                dbPath: targetDb,
                sql
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('Sync completed successfully!');
            document.getElementById('syncPreview').style.display = 'none';
            startComparison(); // Refresh comparison
        } else {
            throw new Error(data.error || 'Sync failed');
        }
    } catch (error) {
        alert('Sync failed: ' + error.message);
    }
}

function cancelSync() {
    document.getElementById('syncPreview').style.display = 'none';
}

function exportDiffReport() {
    if (!currentSchemaDiff) {
        alert('No comparison data available');
        return;
    }

    const db1 = document.getElementById('compareDb1').value;
    const db2 = document.getElementById('compareDb2').value;

    let report = `Database Comparison Report\n`;
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `\nDatabase 1: ${db1}\n`;
    report += `Database 2: ${db2}\n`;
    report += `\n${'='.repeat(50)}\n\n`;

    report += `SUMMARY\n`;
    report += `-`.repeat(50) + `\n`;
    report += `Tables Added: ${currentSchemaDiff.addedTables.length}\n`;
    report += `Tables Removed: ${currentSchemaDiff.removedTables.length}\n`;
    report += `Tables Modified: ${currentSchemaDiff.modifiedTables.length}\n`;
    report += `Common Tables: ${currentSchemaDiff.commonTables.length}\n\n`;

    if (currentSchemaDiff.addedTables.length > 0) {
        report += `ADDED TABLES\n`;
        report += `-`.repeat(50) + `\n`;
        currentSchemaDiff.addedTables.forEach(table => {
            report += `  + ${table}\n`;
        });
        report += `\n`;
    }

    if (currentSchemaDiff.removedTables.length > 0) {
        report += `REMOVED TABLES\n`;
        report += `-`.repeat(50) + `\n`;
        currentSchemaDiff.removedTables.forEach(table => {
            report += `  - ${table}\n`;
        });
        report += `\n`;
    }

    if (currentSchemaDiff.modifiedTables.length > 0) {
        report += `MODIFIED TABLES\n`;
        report += `-`.repeat(50) + `\n`;
        currentSchemaDiff.modifiedTables.forEach(table => {
            report += `  * ${table.name}\n`;
            if (table.changes.columns.added.length > 0) {
                report += `    Added columns: ${table.changes.columns.added.map(c => c.name).join(', ')}\n`;
            }
            if (table.changes.columns.removed.length > 0) {
                report += `    Removed columns: ${table.changes.columns.removed.map(c => c.name).join(', ')}\n`;
            }
            if (table.changes.columns.modified.length > 0) {
                report += `    Modified columns: ${table.changes.columns.modified.map(c => c.name).join(', ')}\n`;
            }
        });
        report += `\n`;
    }

    if (currentDataDiff) {
        report += `DATA DIFFERENCES\n`;
        report += `-`.repeat(50) + `\n`;
        Object.entries(currentDataDiff.tables).forEach(([table, diff]) => {
            if (diff.difference !== 0) {
                report += `  ${table}: DB1=${diff.rowCount.db1}, DB2=${diff.rowCount.db2} (${diff.difference > 0 ? '+' : ''}${diff.difference})\n`;
            }
        });
    }

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `db-comparison-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportSyncScript() {
    const sql = document.getElementById('syncSqlPreview').textContent;
    if (!sql) {
        alert('No sync script to export');
        return;
    }

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-script-${Date.now()}.sql`;
    a.click();
    URL.revokeObjectURL(url);
}
