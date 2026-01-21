#!/usr/bin/env node

/**
 * Exportador de Reporte Global de Gaps a Archivo
 * Genera un archivo de texto con estadísticas completas
 * Se sobrescribe cada vez que se ejecuta
 * 
 * Uso: npm run export-gaps [--gap=4]
 * 
 * Parámetros:
 * --gap=N         Mostrar gaps mayores a N minutos (default: 4)
 * 
 * Salida: gaps_report.txt (en el directorio actual)
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');
const REPORT_FILE = path.join(__dirname, 'gaps_report.txt');
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

let reportContent = '';

const addLine = (text = '') => {
  reportContent += text + '\n';
  process.stdout.write(text + '\n');
};

// Header
addLine(`${'━'.repeat(80)}`);
addLine(`📊 REPORTE GLOBAL DE GAPS - TODOS LOS SIDs`);
addLine(`📅 Generado: ${new Date().toLocaleString('es-ES')}`);
addLine(`${'━'.repeat(80)}\n`);
addLine(`Parámetros:`);
addLine(`  • Gaps reportables: > ${targetGapMinutes} minutos\n`);

// Obtener archivos de log
let logFiles = [];
try {
  const files = fs.readdirSync(LOGS_DIR);
  logFiles = files
    .filter(f => f.match(/^mqtt_messages_\d{4}-\d{2}-\d{2}_\d+\.txt$/))
    .sort()
    .reverse();
} catch (err) {
  addLine(`❌ Error leyendo directorio de logs: ${err.message}`);
  process.exit(1);
}

if (logFiles.length === 0) {
  addLine(`❌ No se encontraron archivos de log`);
  process.exit(1);
}

addLine(`ℹ️  Analizando ${logFiles.length} archivo(s) de log...\n`);

// Agrupar registros por SID
const sidData = {};

logFiles.forEach(filename => {
  const filePath = path.join(LOGS_DIR, filename);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let currentRecord = null;
    let currentTimestamp = null;

    for (const line of lines) {
      if (line.match(/^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/)) {
        const timeMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/);
        const snuMatch = line.match(/cooler_mqtt\/ics\/([a-f0-9\-]+)$/);
        
        if (timeMatch && snuMatch) {
          currentTimestamp = timeMatch[1];
          currentRecord = { snu: snuMatch[1], timestamp: currentTimestamp };
        }
      }
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
    addLine(`⚠️  Error leyendo ${filename}: ${err.message}`);
  }
});

// Calcular gaps para cada SID
const sidReports = [];

Object.entries(sidData).forEach(([sid, data]) => {
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

    // Omitir gaps donde DVS = 0 o DVS = 1 (estados inactivos/low power/sleep mode)
    if (gapMinutes > targetGapMinutes && 
        current.data?.DVS !== 0 && current.data?.DVS !== 1 && 
        next.data?.DVS !== 0 && next.data?.DVS !== 1) {
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

// Ordenar por gap máximo
sidReports.sort((a, b) => b.maxGap - a.maxGap);

// Mostrar resultados
if (sidReports.length === 0) {
  addLine(`✅ Excelente: No hay SIDs con gaps > ${targetGapMinutes} minutos\n`);
} else {
  addLine(`${'━'.repeat(80)}`);
  addLine(`📋 SIDs CON ALERTAS (${sidReports.length} SID(s) encontrado(s))`);
  addLine(`${'━'.repeat(80)}\n`);

  sidReports.forEach((report, idx) => {
    const num = String(idx + 1).padStart(4, ' ');
    addLine(`${num}. SID: ${report.sid}`);
    addLine(`    📦 Mensajes: ${report.totalRecords} | 🧊 Nevera: ${report.firstSnu}`);
    addLine(`    ⚠️  Gaps: ${report.gapCount} | 📈 Máximo: ${report.maxGap}m | 📊 Promedio: ${report.avgGap}m`);
    
    // Mostrar detalles de gaps
    if (report.gaps.length > 0 && report.gaps.length <= 10) {
      report.gaps.forEach((gap, gIdx) => {
        addLine(`\n      Gap ${gIdx + 1}: ${gap.gapMinutes} minutos`);
        addLine(`        ⬅️  Último:  ${gap.lastTimestamp} | LOG:${gap.lastLog} | DVS:${gap.lastDvs}`);
        addLine(`        ➡️  Próximo: ${gap.nextTimestamp} | LOG:${gap.nextLog} | DVS:${gap.nextDvs}`);
      });
    } else if (report.gaps.length > 10) {
      addLine(`      (Mostrando primeros 10 de ${report.gaps.length} gaps)`);
      report.gaps.slice(0, 10).forEach((gap, gIdx) => {
        addLine(`\n      Gap ${gIdx + 1}: ${gap.gapMinutes} minutos`);
        addLine(`        ⬅️  Último:  ${gap.lastTimestamp} | LOG:${gap.lastLog} | DVS:${gap.lastDvs}`);
        addLine(`        ➡️  Próximo: ${gap.nextTimestamp} | LOG:${gap.nextLog} | DVS:${gap.nextDvs}`);
      });
    }
    
    addLine();
  });
}

// Estadísticas finales
const totalSids = sidReports.length;
const totalGaps = sidReports.reduce((sum, r) => sum + r.gapCount, 0);
const maxGapOverall = sidReports.length > 0 ? Math.max(...sidReports.map(r => r.maxGap)) : 0;
const avgGapsPerSid = totalSids > 0 ? (sidReports.reduce((sum, r) => sum + r.gapCount, 0) / totalSids).toFixed(2) : 0;
const minGapOverall = sidReports.length > 0 ? Math.min(...sidReports.map(r => r.maxGap)) : 0;
const totalMessages = Object.values(sidData).reduce((sum, d) => sum + d.records.length, 0);

addLine(`${'━'.repeat(80)}`);
addLine(`📈 ESTADÍSTICAS GLOBALES COMPLETAS`);
addLine(`${'━'.repeat(80)}`);
addLine();
addLine(`SIDs:`);
addLine(`  • Total SIDs analizados: ${Object.keys(sidData).length}`);
addLine(`  • SIDs sin alertas: ${Object.keys(sidData).length - totalSids}`);
addLine(`  • SIDs con alertas (gaps > ${targetGapMinutes}m): ${totalSids}`);
addLine(`  • % SIDs con problemas: ${((totalSids / Object.keys(sidData).length) * 100).toFixed(2)}%`);
addLine();
addLine(`Mensajes:`);
addLine(`  • Total de mensajes: ${totalMessages}`);
addLine(`  • Promedio por SID: ${(totalMessages / Object.keys(sidData).length).toFixed(2)}`);
addLine();
addLine(`Gaps:`);
addLine(`  • Total de gaps reportados: ${totalGaps}`);
addLine(`  • Gap máximo encontrado: ${maxGapOverall.toFixed(2)} minutos`);
addLine(`  • Gap mínimo reportado: ${minGapOverall.toFixed(2)} minutos`);
addLine(`  • Gaps promedio por SID: ${avgGapsPerSid}`);
addLine();
addLine(`Performance:`);
addLine(`  • Archivos de log procesados: ${logFiles.length}`);
addLine(`  • Umbral de reporte: > ${targetGapMinutes} minutos`);
addLine();

// Top 5 SIDs con más gaps
addLine(`${'━'.repeat(80)}`);
addLine(`🏆 TOP 5 SIDs CON MÁS GAPS`);
addLine(`${'━'.repeat(80)}`);
addLine();
sidReports.slice(0, 5).forEach((report, idx) => {
  addLine(`${idx + 1}. SID ${report.sid}: ${report.gapCount} gaps (Max: ${report.maxGap}m)`);
});
addLine();

// Bottom 5 SIDs (menores gaps)
addLine(`${'━'.repeat(80)}`);
addLine(`📉 ÚLTIMOS 5 SIDs CON MENOS GAPS`);
addLine(`${'━'.repeat(80)}`);
addLine();
sidReports.slice(-5).reverse().forEach((report, idx) => {
  addLine(`${idx + 1}. SID ${report.sid}: ${report.gapCount} gaps (Max: ${report.maxGap}m)`);
});
addLine();

// Resumen por rango
addLine(`${'━'.repeat(80)}`);
addLine(`📊 DISTRIBUCIÓN DE GAPS`);
addLine(`${'━'.repeat(80)}`);
addLine();

const ranges = [
  { min: 0, max: 5, label: '0-5 min' },
  { min: 5, max: 10, label: '5-10 min' },
  { min: 10, max: 20, label: '10-20 min' },
  { min: 20, max: 60, label: '20-60 min' },
  { min: 60, max: Infinity, label: '60+ min' }
];

ranges.forEach(range => {
  const count = sidReports.filter(r => r.maxGap >= range.min && r.maxGap < range.max).length;
  const percentage = ((count / totalSids) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(percentage / 2));
  addLine(`  ${range.label.padEnd(10)} │ ${bar.padEnd(50)} │ ${count.toString().padStart(4)} SIDs (${percentage}%)`);
});

addLine();
addLine(`${'━'.repeat(80)}`);
addLine(`✅ Reporte generado exitosamente`);
addLine(`📁 Archivo guardado: ${REPORT_FILE}`);
addLine(`${'━'.repeat(80)}\n`);

// Guardar a archivo
try {
  fs.writeFileSync(REPORT_FILE, reportContent, 'utf8');
  console.log(`\n✅ Archivo exportado: ${REPORT_FILE}`);
} catch (err) {
  console.error(`❌ Error guardando archivo: ${err.message}`);
  process.exit(1);
}
