const mqtt = require('mqtt');
require('dotenv').config();

// Configuración del broker MQTT desde variables de entorno
const MQTT_CONFIG = {
  host: 'ingestapre.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_publisher_test_${Math.random().toString(16).slice(3)}`
};

// SNU de prueba (nevera específica)
const TEST_SNU = '019929bf-ee7f-7d05-a659-3532fe0d8802';
const TEST_SID = '11';

// Coordenadas base (Granollers, Catalonia)
const BASE_LAT = 42.0714;
const BASE_LON = 2.8155;

console.log('🚀 Iniciando test publisher (2 mensajes)...');
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

// Función para generar datos de nevera con LOG y DVS específicos
function generateCoolerData(log, dvs) {
  const now = Math.floor(Date.now() / 1000);
  
  return {
    SNU: TEST_SNU,
    SID: TEST_SID,
    TSP: now,
    LON: 2.9137,
    LAT: 42.0407,
    ORG: 0,
    DST: 0,
    STY: 255,
    TMP: 21.7,
    BMV: 8420,
    BPR: 98,
    STS: 32260,
    LOG: log, // ← LOG específico
    SER: {
      MNT: 0,
      MXT: 1,
      STE: 1,
      ORE: 0,
      SHK: 0
    },
    DVS: dvs, // ← DVS específico
    RSS: 17,
    BCN: 7,
    VLM: 0,
    ICN: 0,
    NST: 17.6,
    XST: 23.8,
    LGC: 815300,
    FWV: "3.3",
    USP: 3
  };
}

// Función para publicar mensaje
function publishMessage(log, dvs, messageNum) {
  const topic = `cooler_mqtt/ics/${TEST_SNU}`;
  const payload = generateCoolerData(log, dvs);
  const message = JSON.stringify(payload);
  
  client.publish(topic, message, { qos: 0 }, (err) => {
    if (err) {
      console.error(`❌ Error publicando mensaje ${messageNum}:`, err.message);
    } else {
      messageCount++;
      const timestamp = new Date().toLocaleString('es-ES');
      console.log(`✅ Mensaje ${messageNum}/${2} enviado`);
      console.log(`   📍 Topic: ${topic}`);
      console.log(`   🕐 Timestamp: ${timestamp}`);
      console.log(`   📋 LOG: ${log} | DVS: ${dvs} | SID: ${TEST_SID}`);
      console.log(`   🌡️  TMP: ${payload.TMP}°C | BAT: ${payload.BPR}%\n`);
    }
  });
}

// Evento: Conexión exitosa
client.on('connect', () => {
  console.log('✅ Conectado al broker MQTT\n');
  console.log('📤 Enviando 2 mensajes con 1 segundo de diferencia...\n');
  
  // Mensaje 1: LOG 8, DVS 3
  publishMessage(8, 3, 1);
  
  // Mensaje 2: LOG 11, DVS 3 (enviado 1 segundo después)
  setTimeout(() => {
    publishMessage(11, 3, 2);
  }, 500);
  
  // Cerrar después de 2 segundos (para asegurar que ambos se enviaron)
  setTimeout(() => {
    console.log('✅ Test completado. Terminando...\n');
    cleanup();
  }, 2500);
});

// Evento: Error
client.on('error', (error) => {
  console.error('❌ Error en conexión MQTT:', error.message);
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
  console.log('👋 Cerrando conexión...');
  client.end(false, () => {
    console.log('✅ Conexión cerrada correctamente');
    console.log(`📊 Total de mensajes enviados: ${messageCount}`);
    process.exit(0);
  });
  
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
