const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

// Configuración del broker MQTT
const MQTT_CONFIG = {
  host: 'ingestaprod.thesmartdelivery.com',
  port: 1883,
  username: 'verneAgent',
  password: 'LOIGK3xsdSGLJ',
  clientId: `mqtt_listener_${Math.random().toString(16).slice(3)}`
};

// Topics a escuchar
const TOPICS = [
  'cooler_mqtt/ics/#',
  // Topics del sistema (si están habilitados en el broker)
  '$SYS/broker/clients/+',
  '$SYS/broker/subscriptions/+',
  '$SYS/broker/connection/+',
  '$SYS/broker/log',
  // Topics comunes de Last Will Testament
  'clients/+/status',
  'devices/+/lwt',
  // Topics de estado general
  '+/status',
  '+/+/status'
];

// Configuración de archivos de log con rotación
const LOGS_DIR = path.join(__dirname, 'logs');
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB por archivo

// Función auxiliar para obtener fecha local en formato YYYY-MM-DD
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let LOG_FILE = path.join(LOGS_DIR, `mqtt_messages_${getLocalDateString()}_1.txt`);
let fileCounter = 1;

// Crear directorio de logs si no existe
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log('📁 Directorio de logs creado:', LOGS_DIR);
}

// Función para obtener timestamp en hora local
function getLocalTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// Función para guardar mensaje en archivo (texto plano con rotación)
function saveMessageToFile(topic, message, timestamp) {
  const logLine = `[${timestamp}] ${topic}\n${message.toString()}\n${'='.repeat(80)}\n`;
  
  // Verificar tamaño del archivo antes de escribir
  if (fs.existsSync(LOG_FILE)) {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_FILE_SIZE) {
      // Crear nuevo archivo con contador incrementado
      fileCounter++;
      const dateStr = getLocalDateString();
      LOG_FILE = path.join(LOGS_DIR, `mqtt_messages_${dateStr}_${fileCounter}.txt`);
      console.log(`📁 Rotando a nuevo archivo: ${path.basename(LOG_FILE)}`);
    }
  }
  
  // Guardar de forma asíncrona
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) {
      console.error('❌ Error guardando mensaje:', err.message);
    }
  });
}

console.log('🚀 Iniciando cliente MQTT...');
console.log(`📡 Conectando a: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);

// Crear cliente MQTT
const client = mqtt.connect(`mqtt://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`, {
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
  clientId: MQTT_CONFIG.clientId,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000
});

// Evento: Conexión exitosa
client.on('connect', (connack) => {
  console.log('✅ Conectado al broker MQTT');
  console.log(`🆔 Mi Client ID: ${MQTT_CONFIG.clientId}`);
  console.log(`🏠 Broker: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);
  console.log(`👤 Usuario: ${MQTT_CONFIG.username}`);
  
  // Información adicional de la conexión
  if (connack) {
    console.log('📊 Información de conexión:');
    console.log(`   • Session Present: ${connack.sessionPresent}`);
    console.log(`   • Return Code: ${connack.returnCode}`);
  }
  
  // Suscribirse a los topics
  console.log('📡 Intentando suscribirse a topics (algunos pueden fallar si no están disponibles):');
  TOPICS.forEach(topic => {
    client.subscribe(topic, { qos: 0 }, (err, granted) => {
      if (err) {
        console.error(`❌ Error al suscribirse a ${topic}:`, err.message);
      } else if (granted && granted.length > 0 && granted[0]) {
        const grantedQos = granted[0].qos;
        if (topic.startsWith('$SYS')) {
          console.log(`🔧 Sistema suscrito: ${topic} (QoS: ${grantedQos})`);
        } else {
          console.log(`📬 Suscrito a: ${topic} (QoS: ${grantedQos})`);
        }
      } else {
        // Suscripción rechazada por el broker
        if (topic.startsWith('$SYS') || topic.includes('status') || topic.includes('lwt')) {
          console.log(`⚠️  Topic no disponible (ignorado): ${topic}`);
        } else {
          console.log(`❌ Suscripción rechazada: ${topic}`);
        }
      }
    });
  });
  
  console.log(`💾 Los mensajes se guardarán en: ${LOG_FILE}`);
  console.log('👂 Escuchando mensajes...\n');
});

// Evento: Mensaje recibido
client.on('message', (topic, message, packet) => {
  const timestamp = getLocalTimestamp(); // Hora local en lugar de UTC
  const payload = message.toString();
  
  // 💾 GUARDAR MENSAJE EN ARCHIVO
  saveMessageToFile(topic, message, timestamp);
  
  console.log('─────────────────────────────────────────');
  console.log(`⏰ Timestamp: ${timestamp}`);
  console.log(`📍 Topic: ${topic}`);
  
  // Información adicional del paquete MQTT
  if (packet) {
    console.log(`� Info MQTT:`);
    console.log(`   • QoS: ${packet.qos}`);
    console.log(`   • Retain: ${packet.retain}`);
    console.log(`   • Duplicate: ${packet.dup}`);
  }
  
  console.log(`�📦 Mensaje:`);
  
  // Intentar parsear como JSON
  try {
    const jsonData = JSON.parse(payload);
    console.log(JSON.stringify(jsonData, null, 2));
    
    // Si el mensaje tiene SNU, mostrarlo destacado
    if (jsonData.SNU) {
      console.log(`🏷️  Device ID (SNU): ${jsonData.SNU}`);
    }
  } catch (e) {
    // Si no es JSON, mostrar como texto
    console.log(payload);
  }
  
  console.log(`💾 Guardado en: ${path.basename(LOG_FILE)}`);
  console.log('─────────────────────────────────────────\n');
});

// Evento: Error
client.on('error', (error) => {
  // Solo mostrar errores relevantes, ignorar errores de conexión normales durante reconexión
  if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
    console.error('❌ Error de red - verificar conectividad');
  } else if (!error.message.includes('client disconnecting')) {
    console.error('❌ Error MQTT:', error.message);
  }
});

// Evento: Reconexión
let reconnectAttempts = 0;
client.on('reconnect', () => {
  reconnectAttempts++;
  if (reconnectAttempts % 5 === 0) {
    console.log(`🔄 Intentando reconectar... (intento ${reconnectAttempts})`);
  }
});

// Evento: Desconexión
client.on('close', () => {
  console.log('🔌 Desconectado del broker MQTT');
  reconnectAttempts = 0;
});

// Evento: Offline
client.on('offline', () => {
  console.log('📴 Cliente MQTT offline');
});

// Evento: Paquete enviado
client.on('packetsend', (packet) => {
  if (packet.cmd === 'subscribe' || packet.cmd === 'unsubscribe') {
    console.log(`📤 Paquete enviado: ${packet.cmd} - ${JSON.stringify(packet.subscriptions || packet.unsubscriptions)}`);
  }
});

// Evento: Paquete recibido
client.on('packetreceive', (packet) => {
  if (packet.cmd === 'suback' || packet.cmd === 'unsuback') {
    console.log(`📥 Paquete recibido: ${packet.cmd}`);
  }
});

// Manejo de señales para cerrar limpiamente
process.on('SIGINT', () => {
  console.log('\n\n👋 Cerrando conexión...');
  console.log(`📊 Estadísticas de sesión:`);
  console.log(`   • Client ID usado: ${MQTT_CONFIG.clientId}`);
  console.log(`   • Tiempo de conexión: ${new Date().toISOString()}`);
  client.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Cerrando conexión...');
  client.end();
  process.exit(0);
});
