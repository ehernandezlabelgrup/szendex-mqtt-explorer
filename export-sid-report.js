#!/usr/bin/env node

/**
 * Exportador de Mensajes por SID
 * Busca todos los mensajes de un SID específico en los logs
 * y los exporta a un archivo TXT detallado
 * 
 * Uso: npm run export-sid -- --sid=1768991496
 * 
 * Parámetros:
 * --sid=value     SID del servicio a exportar (OBLIGATORIO)
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');
const EXPORT_DIR = path.join(LOGS_DIR, 'export-sid');

// Parsear argumentos CLI
const args = process.argv.slice(2);
const filters = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    filters[key] = value;
  }
});

// Validar parámetro obligatorio
if (!filters.sid) {
  console.error('\n❌ Parámetro --sid es OBLIGATORIO\n');
  console.error('Uso: npm run export-sid -- --sid=1768991496\n');
  process.exit(1);
}

const targetSid = parseInt(filters.sid);

console.log(`\n${'━'.repeat(80)}`);
console.log(`📊 EXPORTADOR DE MENSAJES POR SID`);
console.log(`${'━'.repeat(80)}`);
console.log(`\n  Parámetros:`);
console.log(`  • SID objetivo: ${targetSid}\n`);

// Obtener archivos de log
function exportSidMessages() {
  let totalMessages = 0;
  const messages = [];

  try {
    if (!fs.existsSync(LOGS_DIR)) {
      console.error(`❌ Directorio de logs no existe: ${LOGS_DIR}`);
      process.exit(1);
    }

    // Crear directorio de exportación si no existe
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('mqtt_messages_') && f.endsWith('.txt'))
      .sort();

    if (files.length === 0) {
      console.error(`❌ No hay archivos de log en ${LOGS_DIR}`);
      process.exit(1);
    }

    console.log(`🔍 Escaneando ${files.length} archivo(s) de log...\n`);

    // Procesar cada archivo
    files.forEach(file => {
      const filePath = path.join(LOGS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Buscar línea de timestamp
        if (line.startsWith('[') && line.includes(']')) {
          const nextLine = lines[i + 1] ? lines[i + 1].trim() : null;

          if (nextLine) {
            try {
              const jsonMatch = nextLine.match(/\{.*\}/);
              if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);

                // Verificar si el SID coincide
                if (parseInt(data.SID) === targetSid) {
                  totalMessages++;

                  // Extraer timestamp de la línea de timestamp
                  const timestampMatch = line.match(/\[(.*?)\]/);
                  const timestamp = timestampMatch ? timestampMatch[1] : 'N/A';

                  messages.push({
                    timestamp,
                    snu: data.SNU || 'N/A',
                    tsp: data.TSP || 'N/A',
                    log: data.LOG || 'N/A',
                    dvs: data.DVS || 'N/A',
                    lid: data.LID || 'N/A',
                    fullData: data
                  });
                }
              }
            } catch (e) {
              // Ignorar líneas que no sean JSON válido
            }
          }
        }
      }
    });

    if (totalMessages === 0) {
      console.warn(`⚠️  No se encontraron mensajes para SID: ${targetSid}`);
      process.exit(0);
    }

    // Generar archivo de reporte
    const reportFileName = `sid_${targetSid}.txt`;
    const reportPath = path.join(EXPORT_DIR, reportFileName);

    let reportContent = '';
    reportContent += `${'═'.repeat(100)}\n`;
    reportContent += `REPORTE DE MENSAJES - SID: ${targetSid}\n`;
    reportContent += `${'═'.repeat(100)}\n\n`;
    reportContent += `📊 Resumen:\n`;
    reportContent += `  • Total de mensajes: ${totalMessages}\n`;
    reportContent += `  • Rango temporal: ${messages[0].timestamp} → ${messages[messages.length - 1].timestamp}\n`;
    reportContent += `  • Dispositivos únicos (SNU): ${new Set(messages.map(m => m.snu)).size}\n`;
    reportContent += `\n${'─'.repeat(100)}\n\n`;

    // Tabla de encabezados
    reportContent += `${'Timestamp'.padEnd(25)} | ${'SNU'.padEnd(40)} | ${'TSP'.padEnd(15)} | ${'LOG'.padEnd(5)} | ${'DVS'.padEnd(5)} | ${'LID'.padEnd(10)}\n`;
    reportContent += `${'-'.repeat(25)}-+-${'-'.repeat(40)}-+-${'-'.repeat(15)}-+-${'-'.repeat(5)}-+-${'-'.repeat(5)}-+-${'-'.repeat(10)}\n`;

    // Agregar mensajes
    messages.forEach(msg => {
      reportContent += `${msg.timestamp.padEnd(25)} | `;
      reportContent += `${String(msg.snu).padEnd(40)} | `;
      reportContent += `${String(msg.tsp).padEnd(15)} | `;
      reportContent += `${String(msg.log).padEnd(5)} | `;
      reportContent += `${String(msg.dvs).padEnd(5)} | `;
      reportContent += `${String(msg.lid).padEnd(10)}\n`;
    });

    reportContent += `\n${'─'.repeat(100)}\n\n`;
    reportContent += `📝 Notas:\n`;
    reportContent += `  • Timestamp: Hora de recepción del mensaje por MQTT\n`;
    reportContent += `  • TSP: Timestamp Unix de creación del mensaje en el dispositivo\n`;
    reportContent += `  • LOG: 1=OK, >1=Error/Información del dispositivo\n`;
    reportContent += `  • DVS: Estado del dispositivo (1-7)\n`;
    reportContent += `  • LID: Identificador del mensaje\n`;
    reportContent += `\n${'═'.repeat(100)}\n`;

    fs.writeFileSync(reportPath, reportContent);

    console.log(`✅ Reporte generado exitosamente`);
    console.log(`📁 Archivo: ${reportFileName}`);
    console.log(`📊 Mensajes exportados: ${totalMessages}`);
    console.log(`📍 Ruta: ${reportPath}\n`);

  } catch (error) {
    console.error(`\n❌ Error al procesar logs:`, error.message);
    process.exit(1);
  }
}

exportSidMessages();
