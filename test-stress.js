const mqtt = require('mqtt');
require('dotenv').config();

// Configuración del broker MQTT desde variables de entorno
const MQTT_CONFIG = {
  host: 'ingestapre.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_publisher_stress_${Math.random().toString(16).slice(3)}`
};

// SNU de prueba (nevera específica)
const TEST_SNU = '019929bf-ee7f-7d05-a659-3532fe0d8802';
let TEST_SIDS = []; // Array con 20 SIDs

// Configuración de estrés
const TOTAL_SERVICES = 20;
const COMPLETE_SERVICES = 4;    // 20% - servicios que se completan
const INCOMPLETE_SERVICES = 16;  // 80% - servicios sin finalizar

// Generar secuencia de prueba automáticamente
function generateTestSequence() {
  const sequence = [];
  
  // 1. SERVICIOS INCOMPLETOS (1-16): 2 mensajes cada uno
  for (let i = 0; i < INCOMPLETE_SERVICES; i++) {
    sequence.push({ dvs: 3, log: 8, sidIndex: i, includeSid: true });   // Inicio
    sequence.push({ dvs: 3, log: 1, sidIndex: i, includeSid: true });   // Telemetría
  }
  
  // 2. SERVICIOS COMPLETOS (17-20): 10 mensajes cada uno (sigue messages-config.json)
  const completeSequence = [
    { dvs: 3, log: 8 },   // Recogida inicio
    { dvs: 3, log: 1 },   // Recogida telemetría
    { dvs: 4, log: 16 },  // En tránsito
    { dvs: 4, log: 1 },   // Telemetría tránsito
    { dvs: 5, log: 14 },  // Siguiente estado
    { dvs: 5, log: 1 },   // Telemetría
    { dvs: 6, log: 23 },  // Entregado
    { dvs: 6, log: 1 },   // Confirmación
    { dvs: 7, log: 21 },  // Final
    { dvs: 7, log: 1 }    // Finalización completa
  ];
  
  for (let i = 0; i < COMPLETE_SERVICES; i++) {
    const sidIndex = INCOMPLETE_SERVICES + i;
    completeSequence.forEach(msg => {
      sequence.push({
        dvs: msg.dvs,
        log: msg.log,
        sidIndex: sidIndex,
        includeSid: true
      });
    });
  }
  
  // 3. RESET FINAL (LOG:2 sin SID)
  sequence.push({ dvs: 4, log: 2, sidIndex: null, includeSid: false });
  
  return sequence;
}

const TEST_SEQUENCE = generateTestSequence();

console.log('🚀 Iniciando test STRESS publisher (20 servicios)...');
console.log(`📡 Conectando a: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);

// Crear cliente MQTT
const client = mqtt.connect(`mqtt://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`, {
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
  clientId: MQTT_CONFIG.clientId,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  protocolVersion: 4
});

let messageCount = 0;
let intervalIds = [];

// Función para generar datos de nevera según el paso de la secuencia
function generateCoolerData(step) {
  const now = Math.floor(Date.now() / 1000);
  
  // Determinar cuál SID usar
  let sidValue = 0;
  if (step.includeSid && step.sidIndex !== null) {
    sidValue = parseInt(TEST_SIDS[step.sidIndex]);
  }
  
  // Si LOG es 2 (reset), enviar LAT y LON como 0
  const lat = step.log === 2 ? 0 : 42.0407;
  const lon = step.log === 2 ? 0 : 2.9137;
  
  const payload = {
    SNU: TEST_SNU,
    SID: sidValue,
    TSP: now,
    LON: lon,
    LAT: lat,
    ORG: 0,
    DST: 0,
    STY: 255,
    TMP: 21.7,
    BMV: 8420,
    BPR: 98,
    STS: 32260,
    LOG: step.log,
    SER: {
      MNT: 0,
      MXT: 1,
      STE: 0,
      ORE: 0,
      SHK: 0
    },
    DVS: step.dvs,
    RSS: 17,
    BCN: 7,
    VLM: 0,
    ICN: 0,
    NST: 17.6,
    XST: 23.8,
    LGC: 815300,
    FWV: "3.3",
    USP: 3,
    serviceTimeError: 0
  };

  return payload;
}

// Función para publicar mensaje
function publishMessage(step, stepIndex) {
  const topic = `cooler_mqtt/ics/${TEST_SNU}`;
  const payload = generateCoolerData(step);
  const message = JSON.stringify(payload);
  
  client.publish(topic, message, { qos: 0 }, (err) => {
    if (err) {
      console.error(`❌ Error publicando mensaje ${stepIndex + 1}/${TEST_SEQUENCE.length}:`, err.message);
    } else {
      messageCount++;
      const timestamp = new Date().toLocaleString('es-ES');
      
      // Determinar qué SID mostrar
      let sidDisplay;
      if (step.includeSid && step.sidIndex !== null) {
        const serviceNum = step.sidIndex + 1;
        sidDisplay = `SRV${serviceNum}: ${payload.SID}`;
      } else {
        sidDisplay = `RESET (SID:0)`;
      }
      
      console.log(`✅ [${stepIndex + 1}/${TEST_SEQUENCE.length}] ${sidDisplay} | DVS:${step.dvs} | LOG:${step.log}`);
    }
  });
}

// Función para enviar mensajes secuencialmente con delay
function sendMessagesSequentially() {
  console.log(`\n📋 Total mensajes a enviar: ${TEST_SEQUENCE.length}`);
  console.log(`⏱️  Escenario: ${INCOMPLETE_SERVICES} servicios incompletos + ${COMPLETE_SERVICES} servicios completados + RESET final\n`);
  console.log('📤 Enviando mensajes con 800ms de separación...');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  TEST_SEQUENCE.forEach((step, index) => {
    const delay = index * 800; // 800ms entre mensajes para saturar más rápido
    
    setTimeout(() => {
      publishMessage(step, index);
      
      // Después del último mensaje, cerramos la conexión
      if (index === TEST_SEQUENCE.length - 1) {
        setTimeout(() => {
          console.log('\n═══════════════════════════════════════════════════════════════');
          console.log('✅ Todos los mensajes completados. Terminando...\n');
          cleanup();
        }, 1000);
      }
    }, delay);
  });
}

// Evento: Conexión exitosa
client.on('connect', () => {
  console.log('✅ Conectado al broker MQTT\n');
  
  // Generar 20 SIDs dinámicamente (uno por cada servicio)
  const baseTimestamp = Math.floor(Date.now() / 1000);
  TEST_SIDS = [];
  for (let i = 0; i < TOTAL_SERVICES; i++) {
    TEST_SIDS.push((baseTimestamp + i).toString());
  }
  
  console.log(`🔢 ${TOTAL_SERVICES} SIDs generados (timestamps):`);
  console.log(`   Servicios 1-${INCOMPLETE_SERVICES}: Incompletos`);
  TEST_SIDS.slice(0, INCOMPLETE_SERVICES).forEach((sid, idx) => {
    if (idx % 4 === 0 && idx > 0) console.log('');
    process.stdout.write(`   SRV${idx + 1}:${sid} `);
  });
  console.log('\n');
  console.log(`   Servicios ${INCOMPLETE_SERVICES + 1}-${TOTAL_SERVICES}: Completados`);
  TEST_SIDS.slice(INCOMPLETE_SERVICES).forEach((sid, idx) => {
    if (idx % 4 === 0 && idx > 0) console.log('');
    process.stdout.write(`   SRV${INCOMPLETE_SERVICES + idx + 1}:${sid} `);
  });
  console.log('\n');
  
  // Iniciar envío
  sendMessagesSequentially();
});

// Evento: Error
client.on('error', (error) => {
  if (!error.message.includes('client disconnecting')) {
    console.error('❌ Error en conexión MQTT:', error.message);
  }
});

// Evento: Reconexión
client.on('reconnect', () => {
  console.log('🔄 Intentando reconectar...');
});

// Evento: Desconexión
client.on('close', () => {
  console.log('🔌 Desconectado del broker MQTT');
});

// Evento: Offline
client.on('offline', () => {
  console.log('📴 Cliente MQTT offline');
});

// Manejo de señales para cerrar limpiamente
function cleanup() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('👋 Cerrando conexión...');
  
  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];
  
  client.end(false, () => {
    console.log('✅ Conexión cerrada correctamente');
    console.log(`📊 Total de mensajes enviados: ${messageCount}/${TEST_SEQUENCE.length}`);
    console.log('\n📈 Resumen de estrés:');
    console.log(`   • Total de servicios: ${TOTAL_SERVICES}`);
    console.log(`   • Servicios incompletos (cancelados por reset): ${INCOMPLETE_SERVICES} (80%)`);
    console.log(`   • Servicios completados (permanecen): ${COMPLETE_SERVICES} (20%)`);
    console.log(`   • Reset enviado: LOG:2 con SID:0, LAT:0, LON:0`);
    console.log(`   • Total de mensajes procesados: ${messageCount}`);
    process.exit(0);
  });
  
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
