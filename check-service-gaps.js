#!/usr/bin/env node

/**
 * Monitor de Gaps de Servicio por SID
 * Analiza el tiempo entre mensajes de un SID específico
 * 
 * Uso: npm run check-gaps --sid=1768991496 [--gap=5]
 * 
 * Parámetros:
 * --sid=value     SID del servicio a analizar (OBLIGATORIO)
 * --gap=N         Mostrar gaps mayores a N minutos (default: 5)
 * --dvs=list      Filtrar por DVS específico(s) ej: 3,4,5 (opcional, default: todos)
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');
const MIN_GAP_MINUTES = 4; // Threshold para reportar gap

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
  console.error('Uso: npm run check-gaps -- --sid=1768991496 [--gap=5] [--dvs=3,4,5]\n');
  process.exit(1);
}

const targetSid = parseInt(filters.sid);
const targetGapMinutes = parseInt(filters.gap || MIN_GAP_MINUTES);
const filterDvs = filters.dvs ? filters.dvs.split(',').map(d => parseInt(d.trim())) : null;

console.log(`\n${'━'.repeat(80)}`);
console.log(`📊 ANÁLISIS DE GAPS POR SID`);
console.log(`${'━'.repeat(80)}`);
console.log(`\n  Parámetros:`);
console.log(`  • SID objetivo: ${targetSid}`);
console.log(`  • Gap reportable: > ${targetGapMinutes} minutos`);
console.log(`  • Filtro DVS: ${filterDvs ? filterDvs.join(', ') : 'Ninguno (todos los DVS)'}\n`);

// Obtener archivos de log
let logFiles = [];
try {
  const files = fs.readdirSync(LOGS_DIR);
  logFiles = files
    .filter(f => f.match(/^mqtt_messages_\d{4}-\d{2}-\d{2}_\d+\.txt$/))
    .sort()
    .reverse(); // Más recientes primero
} catch (err) {
  console.error('❌ Error leyendo directorio de logs:', err.message);
  process.exit(1);
}

if (logFiles.length === 0) {
  console.error('❌ No se encontraron archivos de log');
  process.exit(1);
}

console.log(`ℹ️  Analizando ${logFiles.length} archivo(s) de log...`);

// Recopilar registros del SID objetivo
const sidRecords = [];

logFiles.forEach(filename => {
  const filePath = path.join(LOGS_DIR, filename);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let currentRecord = null;
    let currentTimestamp = null;

    for (const line of lines) {
      // Línea de timestamp: [YYYY-MM-DD HH:MM:SS.mmm] cooler_mqtt/ics/SNU
      if (line.match(/^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/)) {
        const timeMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\]/);
        const snuMatch = line.match(/cooler_mqtt\/ics\/([a-f0-9\-]+)$/);
        
        if (timeMatch && snuMatch) {
          currentTimestamp = timeMatch[1];
          currentRecord = { snu: snuMatch[1], timestamp: currentTimestamp };
        }
      }
      // Línea JSON: parsear datos
      else if (line.trim().startsWith('{') && currentRecord) {
        try {
          const json = JSON.parse(line);
          currentRecord.data = json;

          // Filtrar por SID objetivo
          if (json.SID === targetSid) {
            // Aplicar filtro DVS si se especifica
            if (!filterDvs || filterDvs.includes(json.DVS)) {
              sidRecords.push(currentRecord);
            }
          }

          currentRecord = null;
        } catch (e) {
          // Ignorar líneas JSON inválidas
        }
      }
    }
  } catch (err) {
    console.error(`⚠️  Error leyendo ${filename}:`, err.message);
  }
});

// Ordenar registros por timestamp
sidRecords.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

// Verificar si hay registros
if (sidRecords.length === 0) {
  console.log(`\n❌ No se encontraron registros para SID ${targetSid}`);
  if (filterDvs) {
    console.log(`   (con DVS: ${filterDvs.join(', ')})`);
  }
  console.log('');
  process.exit(1);
}

// Análisis de gaps
const gapAnalysis = [];
let maxGapMinutes = 0;
let totalGapTime = 0;

for (let i = 0; i < sidRecords.length - 1; i++) {
  const current = sidRecords[i];
  const next = sidRecords[i + 1];

  const currentTime = new Date(current.timestamp);
  const nextTime = new Date(next.timestamp);
  const gapMs = nextTime - currentTime;
  const gapMinutes = gapMs / (1000 * 60);
  const gapSeconds = Math.floor(gapMs / 1000);

  totalGapTime += gapMinutes;

  if (gapMinutes > targetGapMinutes) {
    gapAnalysis.push({
      index: i + 1,
      currentTimestamp: current.timestamp,
      currentSnu: current.snu,
      currentDvs: current.data.DVS,
      nextTimestamp: next.timestamp,
      nextSnu: next.snu,
      nextDvs: next.data.DVS,
      gapMinutes: gapMinutes.toFixed(2),
      gapSeconds: gapSeconds
    });

    maxGapMinutes = Math.max(maxGapMinutes, gapMinutes);
  }
}

const avgGapMinutes = (totalGapTime / (sidRecords.length - 1)).toFixed(2);

// Mostrar resultados
console.log(`\n${'━'.repeat(80)}`);
console.log(`📋 REGISTROS DEL SID ${targetSid}`);
console.log(`${'━'.repeat(80)}`);
console.log(`\n  ✓ Total de mensajes: ${sidRecords.length}`);
console.log(`  • Primero: ${sidRecords[0].timestamp} (SNU: ${sidRecords[0].snu})`);
console.log(`  • Último:  ${sidRecords[sidRecords.length - 1].timestamp} (SNU: ${sidRecords[sidRecords.length - 1].snu})`);
console.log(`  • Gap promedio: ${avgGapMinutes} minutos`);
console.log(`  • Gap máximo: ${maxGapMinutes.toFixed(2)} minutos\n`);

if (gapAnalysis.length === 0) {
  console.log(`✅ Excelente: No hay gaps > ${targetGapMinutes} minutos`);
  console.log(`   Los mensajes se envían regularmente.\n`);
} else {
  console.log(`⚠️  ALERTAS: ${gapAnalysis.length} gap(s) > ${targetGapMinutes} minutos detectado(s)\n`);

  gapAnalysis.forEach((gap, idx) => {
    const num = String(idx + 1).padStart(3, ' ');
    console.log(`  ${num}. 🕐 Pausa detectada: ${gap.gapMinutes}m (${gap.gapSeconds}s)`);
    console.log(`       Últ. msg: ${gap.currentTimestamp} | SNU: ${gap.currentSnu} | DVS: ${gap.currentDvs}`);
    console.log(`       Próx msg: ${gap.nextTimestamp} | SNU: ${gap.nextSnu} | DVS: ${gap.nextDvs}\n`);
  });
}

console.log(`${'━'.repeat(80)}\n`);
