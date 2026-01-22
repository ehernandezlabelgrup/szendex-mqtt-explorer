#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Parsear argumentos de línea de comandos
const args = process.argv.slice(2);
const filters = {};

args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    if (key && value !== undefined) {
      filters[key.toLowerCase()] = value;
    }
  }
});

// Validar que se proporcionó al menos un filtro
if (Object.keys(filters).length === 0) {
  console.error('❌ Error: Debes especificar al menos un filtro.');
  console.log('\n📖 Uso:');
  console.log('  npm run search -- --sid=1768468839');
  console.log('  npm run search -- --snu=019929c1-7ec6-7ae3-b456-a037c249c446');
  console.log('  npm run search -- --tsp=1768475007');
  console.log('  npm run search -- --log=1');
  console.log('  npm run search -- --dvs=6');
  console.log('  npm run search -- --lid=12345');
  console.log('\n🔀 Combina múltiples filtros (AND):');
  console.log('  npm run search -- --sid=1768468839 --dvs=6');
  console.log('  npm run search -- --lid=12345 --log=1\n');
  process.exit(1);
}

const LOGS_DIR = path.join(__dirname, 'logs');
const validFields = ['sid', 'snu', 'tsp', 'log', 'dvs', 'lid'];

// Validar que los filtros sean campos válidos
const invalidFields = Object.keys(filters).filter(f => !validFields.includes(f));
if (invalidFields.length > 0) {
  console.error(`❌ Campos inválidos: ${invalidFields.join(', ')}`);
  console.log(`✅ Campos válidos: ${validFields.join(', ')}\n`);
  process.exit(1);
}

// Función para buscar en archivos de log
function searchLogs() {
  let totalMatches = 0;
  const matchedCoolers = new Map(); // Para estadísticas por cooler
  const matchedRecords = []; // Para guardar todos los registros encontrados

  try {
    if (!fs.existsSync(LOGS_DIR)) {
      console.error(`❌ Directorio de logs no existe: ${LOGS_DIR}`);
      process.exit(1);
    }

    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('mqtt_messages_') && f.endsWith('.txt'))
      .sort();

    if (files.length === 0) {
      console.warn('⚠️  No hay archivos de log para procesar.');
      process.exit(0);
    }

    console.log('🔍 Buscando en archivos de log...\n');

    files.forEach(file => {
      const filePath = path.join(LOGS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      let i = 0;
      while (i < lines.length) {
        // Buscar línea de timestamp
        const timestampLine = lines[i];
        if (timestampLine.startsWith('[')) {
          const nextLine = lines[i + 1];
          
          // Intentar parsear JSON
          if (nextLine) {
            try {
              const jsonMatch = nextLine.match(/\{.*\}/);
              if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);

                // Verificar si el registro coincide con TODOS los filtros
                let matches = true;
                for (const [filterKey, filterValue] of Object.entries(filters)) {
                  const fieldValue = data[filterKey.toUpperCase()];
                  
                  // Comparación flexible (string o número)
                  if (String(fieldValue) !== String(filterValue)) {
                    matches = false;
                    break;
                  }
                }

                if (matches) {
                  totalMatches++;
                  const snu = data.SNU || 'N/A';
                  matchedCoolers.set(snu, (matchedCoolers.get(snu) || 0) + 1);
                  
                  // Guardar el registro completo
                  matchedRecords.push({
                    timestamp: timestampLine,
                    json: data,
                    rawLine: nextLine
                  });
                }
              }
            } catch (e) {
              // Ignorar líneas que no sean JSON válido
            }
          }
        }
        i++;
      }
    });

    // Mostrar resultados
    console.log(`📊 Resultados de búsqueda:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📌 Filtros aplicados:`);
    Object.entries(filters).forEach(([key, value]) => {
      console.log(`   • ${key.toUpperCase()}: ${value}`);
    });
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ Total de registros encontrados: ${totalMatches}`);

    if (matchedCoolers.size > 0) {
      console.log(`\n📦 Registros por cooler (SNU):`);
      const sortedCoolers = Array.from(matchedCoolers.entries())
        .sort((a, b) => b[1] - a[1]);
      
      sortedCoolers.forEach(([snu, count]) => {
        const percentage = ((count / totalMatches) * 100).toFixed(1);
        console.log(`   • ${snu}: ${count} registros (${percentage}%)`);
      });
    }

    console.log(`\n🗂️  Archivos escaneados: ${files.length}`);

    // Mostrar solo el último registro encontrado en formato bonito
    if (matchedRecords.length > 0) {
      const lastRecord = matchedRecords[matchedRecords.length - 1];
      const json = lastRecord.json;
      
      // Extraer timestamp (ej: [2026-01-19 11:03:03.115])
      const timeMatch = lastRecord.timestamp.match(/\[(.*?)\]/);
      const time = timeMatch ? timeMatch[1] : 'N/A';
      
      console.log(`\n${'━'.repeat(80)}`);
      console.log(`📋 ÚLTIMO REGISTRO ENCONTRADO`);
      console.log(`${'━'.repeat(80)}`);
      console.log(`\n  🕐 Hora:     ${time}`);
      console.log(`  🆔 SNU:      ${json.SNU}`);
      console.log(`  🔧 SID:      ${json.SID}`);
      console.log(`  📊 LOG:      ${json.LOG}`);
      console.log(`  📡 DVS:      ${json.DVS}`);
      console.log(`\n${'━'.repeat(80)}\n`);
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Error durante la búsqueda:', error.message);
    process.exit(1);
  }
}

searchLogs();
