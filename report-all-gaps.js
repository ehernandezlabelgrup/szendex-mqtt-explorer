#!/usr/bin/env node

/**
 * Generador de Reporte Global de Gaps
 * Analiza TODOS los SIDs en los logs y genera un reporte de gaps
 * 
 * Uso: npm run report-gaps [--gap=4] [--sort=max|count] [--detail=SID]
 * 
 * Parámetros:
 * --gap=N         Mostrar SIDs con gaps mayores a N minutos (default: 4)
 * --sort=max      Ordenar por gap máximo (default) o 'count'
 * --detail=SID    Mostrar todos los gaps de un SID específico
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');
const MIN_GAP_MINUTES = 4;

// Parsear argumentos CLI
const args = process.argv.slice(2);
const filters = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    filters[key] = value;
  }
});

const targetGapMinutes = parseInt(filters.gap || MIN_GAP_MINUTES);
const sortBy = filters.sort || 'max'; // 'max' o 'count'
const detailSid = parseInt(filters.detail) || null;

console.log(`\n${'━'.repeat(80)}`);
console.log(`📊 REPORTE GLOBAL DE GAPS - TODOS LOS SIDs`);
console.log(`${'━'.repeat(80)}`);
console.log(`\n  Parámetros:`);
console.log(`  • Gaps reportables: > ${targetGapMinutes} minutos`);
console.log(`  • Ordenar por: ${sortBy === 'max' ? 'Gap máximo' : 'Cantidad de gaps'}\n`);

// Obtener archivos de log
let logFiles = [];
try {
  const files = fs.readdirSync(LOGS_DIR);
  logFiles = files
    .filter(f => f.match(/^mqtt_messages_\d{4}-\d{2}-\d{2}_\d+\.txt$/))
    .sort()
    .reverse();
} catch (err) {
  console.error('❌ Error leyendo directorio de logs:', err.message);
  process.exit(1);
}

if (logFiles.length === 0) {
  console.error('❌ No se encontraron archivos de log');
  process.exit(1);
}

console.log(`ℹ️  Analizando ${logFiles.length} archivo(s) de log...\n`);

// Agrupar registros por SID
const sidData = {}; // { sid: { records: [...], gapCount: 0, maxGap: 0, avgGap: 0 } }

logFiles.forEach(filename => {
  const filePath = path.join(LOGS_DIR, filename);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let currentRecord = null;
    let currentTimestamp = null;

    for (const line of lines) {
      // Línea de timestamp
      if (line.match(/^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/)) {
        const timeMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/);
        const snuMatch = line.match(/cooler_mqtt\/ics\/([a-f0-9\-]+)$/);
        
        if (timeMatch && snuMatch) {
          currentTimestamp = timeMatch[1];
          currentRecord = { snu: snuMatch[1], timestamp: currentTimestamp };
        }
      }
      // Línea JSON
      else if (line.trim().startsWith('{') && currentRecord) {
        try {
          const json = JSON.parse(line);
          currentRecord.data = json;

          const sid = json.SID;
          if (!sidData[sid]) {
            sidData[sid] = { records: [] };
          }
          sidData[sid].records.push(currentRecord);

          currentRecord = null;
        } catch (e) {
          // Ignorar
        }
      }
    }
  } catch (err) {
    console.error(`⚠️  Error leyendo ${filename}:`, err.message);
  }
});

// Calcular gaps para cada SID
const sidReports = [];

Object.entries(sidData).forEach(([sid, data]) => {
  // Ordenar registros por timestamp
  data.records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  let gapCount = 0;
  let maxGap = 0;
  let totalGap = 0;
  const gaps = [];

  for (let i = 0; i < data.records.length - 1; i++) {
    const current = data.records[i];
    const next = data.records[i + 1];

    const currentTime = new Date(current.timestamp);
    const nextTime = new Date(next.timestamp);
    const gapMs = nextTime - currentTime;
    const gapMinutes = gapMs / (1000 * 60);

    if (gapMinutes > targetGapMinutes) {
      gapCount++;
      totalGap += gapMinutes;
      maxGap = Math.max(maxGap, gapMinutes);
      
      gaps.push({
        gapMinutes: parseFloat(gapMinutes.toFixed(2)),
        lastTimestamp: current.timestamp,
        lastLog: current.data?.LOG,
        lastDvs: current.data?.DVS,
        nextTimestamp: next.timestamp,
        nextLog: next.data?.LOG,
        nextDvs: next.data?.DVS
      });
    }
  }

  if (gapCount > 0) {
    const avgGap = (totalGap / gapCount).toFixed(2);
    sidReports.push({
      sid: parseInt(sid),
      gapCount,
      maxGap: parseFloat(maxGap.toFixed(2)),
      avgGap: parseFloat(avgGap),
      totalRecords: data.records.length,
      firstSnu: data.records[0].snu,
      lastSnu: data.records[data.records.length - 1].snu,
      gaps
    });
  }
});

// Ordenar reportes
if (sortBy === 'max') {
  sidReports.sort((a, b) => b.maxGap - a.maxGap);
} else {
  sidReports.sort((a, b) => b.gapCount - a.gapCount);
}

// Mostrar resultados
if (sidReports.length === 0) {
  console.log(`✅ Excelente: No hay SIDs con gaps > ${targetGapMinutes} minutos\n`);
  process.exit(0);
}

console.log(`${'━'.repeat(80)}`);
console.log(`📋 SIDs CON ALERTAS (${sidReports.length} SID(s) encontrado(s))`);
console.log(`${'━'.repeat(80)}\n`);

sidReports.forEach((report, idx) => {
  const num = String(idx + 1).padStart(3, ' ');
  console.log(`${num}. SID: ${report.sid}`);
  console.log(`    Mensajes: ${report.totalRecords} | Nevera: ${report.firstSnu}`);
  console.log(`    Gaps: ${report.gapCount} | Máximo: ${report.maxGap}m | Promedio: ${report.avgGap}m`);
  
  // Mostrar detalles de cada gap
  if (report.gaps.length > 0 && report.gaps.length <= 5) {
    report.gaps.forEach((gap, gIdx) => {
      console.log(`      Gap ${gIdx + 1}: ${gap.gapMinutes}m`);
      console.log(`        ⬅️  Últ: ${gap.lastTimestamp} | LOG:${gap.lastLog} | DVS:${gap.lastDvs}`);
      console.log(`        ➡️  Próx: ${gap.nextTimestamp} | LOG:${gap.nextLog} | DVS:${gap.nextDvs}`);
    });
  }
  console.log();
});

// Estadísticas finales
const totalSids = sidReports.length;
const totalGaps = sidReports.reduce((sum, r) => sum + r.gapCount, 0);
const maxGapOverall = Math.max(...sidReports.map(r => r.maxGap));
const avgGapsPerSid = (sidReports.reduce((sum, r) => sum + r.gapCount, 0) / totalSids).toFixed(2);

console.log(`${'━'.repeat(80)}`);
console.log(`📈 ESTADÍSTICAS GLOBALES`);
console.log(`${'━'.repeat(80)}`);
console.log(`  • SIDs analizados: ${Object.keys(sidData).length}`);
console.log(`  • SIDs con alertas: ${totalSids}`);
console.log(`  • Total de gaps: ${totalGaps}`);
console.log(`  • Gap máximo encontrado: ${maxGapOverall} minutos`);
console.log(`  • Gaps promedio por SID: ${avgGapsPerSid}`);
console.log(`${'━'.repeat(80)}\n`);

// Si se solicita detalle de un SID específico
if (detailSid) {
  const detailReport = sidReports.find(r => r.sid === detailSid);
  
  if (detailReport) {
    console.log(`${'━'.repeat(80)}`);
    console.log(`📌 DETALLES DEL SID: ${detailSid}`);
    console.log(`${'━'.repeat(80)}\n`);
    console.log(`Total de mensajes: ${detailReport.totalRecords}`);
    console.log(`Nevera: ${detailReport.firstSnu}`);
    console.log(`Gaps reportados: ${detailReport.gapCount}\n`);
    
    detailReport.gaps.forEach((gap, idx) => {
      console.log(`${String(idx + 1).padStart(3, ' ')}. Gap: ${gap.gapMinutes} minutos`);
      console.log(`     ⬅️  Último:`);
      console.log(`         Hora: ${gap.lastTimestamp}`);
      console.log(`         LOG: ${gap.lastLog}, DVS: ${gap.lastDvs}`);
      console.log(`     ➡️  Próximo:`);
      console.log(`         Hora: ${gap.nextTimestamp}`);
      console.log(`         LOG: ${gap.nextLog}, DVS: ${gap.nextDvs}`);
      console.log();
    });
  } else {
    console.log(`❌ No se encontró el SID: ${detailSid}`);
  }
}
