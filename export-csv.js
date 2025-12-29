const fs = require('fs');
const path = require('path');

/**
 * Exportador CSV de mensajes MQTT usando Node.js
 * Alternativa nativa a la versión de Python
 */

function parseLogFile(filePath) {
    console.log(`📖 Leyendo archivo: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: El archivo ${filePath} no existe`);
        return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const messages = [];

    for (const line of lines) {
        // Buscar líneas que contengan JSON
        const match = line.match(/\{.*\}/);
        if (match) {
            try {
                const jsonData = JSON.parse(match[0]);
                
                // Extraer timestamp de la línea
                const timestampMatch = line.match(/\[([\d-]+ [\d:]+)\]/);
                const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();
                
                messages.push({
                    timestamp,
                    data: jsonData
                });
            } catch (e) {
                // Ignorar líneas que no sean JSON válido
                continue;
            }
        }
    }

    console.log(`📊 Total de mensajes encontrados: ${messages.length}`);
    return messages;
}

function adjustTimestampToLocal(timestamp) {
    // Convertir timestamp a Date y añadir 1 hora (UTC+1)
    let date;
    
    if (timestamp.includes('T') && timestamp.includes('Z')) {
        // Formato ISO
        date = new Date(timestamp);
    } else if (timestamp.includes('[') || timestamp.includes(']')) {
        // Formato del log [YYYY-MM-DD HH:mm:ss]
        const cleanTimestamp = timestamp.replace(/[\[\]]/g, '');
        date = new Date(cleanTimestamp);
    } else {
        // Formato directo
        date = new Date(timestamp);
    }

    // Añadir 1 hora (3600000 ms)
    date.setTime(date.getTime() + (60 * 60 * 1000));
    
    // Formatear como YYYY-MM-DD HH:mm:ss
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function flattenJsonData(obj, prefix = '') {
    const flattened = {};
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}_${key}` : key;
            
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Recursivo para objetos anidados
                Object.assign(flattened, flattenJsonData(value, newKey));
            } else if (Array.isArray(value)) {
                // Convertir arrays a string
                flattened[newKey] = JSON.stringify(value);
            } else {
                flattened[newKey] = value;
            }
        }
    }
    
    return flattened;
}

function getAllColumns(messages) {
    const dataColumns = new Set();
    
    // Recopilar todas las columnas de los datos (excepto las especiales)
    for (const message of messages) {
        const flattened = flattenJsonData(message.data);
        Object.keys(flattened).forEach(key => dataColumns.add(key));
    }
    
    // Ordenar el resto de columnas alfabéticamente
    const sortedDataColumns = Array.from(dataColumns).sort();
    
    // Construir array final con orden específico:
    // 1. timestamp (hora local)
    // 2. SNU (identificador de nevera)
    // 3. timestamp_original (hora UTC original)
    // 4. Resto de campos ordenados
    const finalColumns = ['timestamp'];
    
    // Añadir SNU si existe
    if (sortedDataColumns.includes('SNU')) {
        finalColumns.push('SNU');
        sortedDataColumns.splice(sortedDataColumns.indexOf('SNU'), 1);
    }
    
    // Añadir timestamp original
    finalColumns.push('timestamp_original');
    
    // Añadir el resto de campos ordenados
    finalColumns.push(...sortedDataColumns);
    
    return finalColumns;
}

function escapeCSVValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    const stringValue = String(value);
    
    // Si contiene coma, comillas o salto de línea, escapar
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
}

function exportToCSV() {
    console.log('🚀 Iniciando exportación CSV con Node.js...\n');

    // Buscar el archivo de log más reciente
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
        console.error('❌ Error: No existe el directorio logs/');
        return;
    }

    const logFiles = fs.readdirSync(logsDir)
        .filter(file => file.startsWith('mqtt_messages_') && file.endsWith('.txt'))
        .sort()
        .reverse(); // Más reciente primero

    if (logFiles.length === 0) {
        console.error('❌ Error: No se encontraron archivos de log');
        return;
    }

    const latestLogFile = path.join(logsDir, logFiles[0]);
    console.log(`📂 Procesando: ${logFiles[0]}`);

    // Parsear mensajes
    const messages = parseLogFile(latestLogFile);
    if (messages.length === 0) {
        console.error('❌ No se encontraron mensajes para exportar');
        return;
    }

    // Obtener todas las columnas
    const columns = getAllColumns(messages);
    console.log(`📋 Columnas detectadas: ${columns.length}`);

    // Generar nombre del archivo CSV
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[-T:]/g, '').slice(0, 14);
    const baseFilename = path.basename(latestLogFile, '.txt');
    const csvFilename = `${baseFilename}_export_${timestamp}.csv`;

    console.log(`💾 Creando archivo: ${csvFilename}`);

    // Crear contenido CSV
    let csvContent = '';
    
    // Cabeceras
    csvContent += columns.map(col => escapeCSVValue(col)).join(',') + '\n';
    
    // Datos
    for (const message of messages) {
        const flattened = flattenJsonData(message.data);
        const row = [];
        
        for (const column of columns) {
            if (column === 'timestamp') {
                // Timestamp ajustado (UTC+1)
                row.push(escapeCSVValue(adjustTimestampToLocal(message.timestamp)));
            } else if (column === 'timestamp_original') {
                // Timestamp original
                row.push(escapeCSVValue(message.timestamp));
            } else {
                // Datos del mensaje
                row.push(escapeCSVValue(flattened[column] || ''));
            }
        }
        
        csvContent += row.join(',') + '\n';
    }

    // Escribir archivo
    fs.writeFileSync(csvFilename, csvContent, 'utf8');

    // Estadísticas
    const stats = {
        totalMessages: messages.length,
        fileSizeKB: Math.round(fs.statSync(csvFilename).size / 1024),
        columns: columns.length,
        firstMessage: messages[0] ? adjustTimestampToLocal(messages[0].timestamp) : 'N/A',
        lastMessage: messages[messages.length - 1] ? adjustTimestampToLocal(messages[messages.length - 1].timestamp) : 'N/A'
    };

    console.log('\n✅ Exportación completada con éxito!');
    console.log('📊 Estadísticas:');
    console.log(`   • Total mensajes: ${stats.totalMessages.toLocaleString()}`);
    console.log(`   • Tamaño archivo: ${stats.fileSizeKB.toLocaleString()} KB`);
    console.log(`   • Columnas: ${stats.columns}`);
    console.log(`   • Primer mensaje: ${stats.firstMessage}`);
    console.log(`   • Último mensaje: ${stats.lastMessage}`);
    console.log(`   • Archivo generado: ${csvFilename}`);
    console.log('\n🎯 Listo para abrir en Excel!');
}

// Ejecutar si se llama directamente
if (require.main === module) {
    exportToCSV();
}

module.exports = { exportToCSV, parseLogFile, adjustTimestampToLocal, flattenJsonData };