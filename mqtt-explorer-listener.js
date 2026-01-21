const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuración del broker MQTT desde variables de entorno
const MQTT_CONFIG = {
  host: process.env.MQTT_HOST,
  port: parseInt(process.env.MQTT_PORT) || 1883,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: `mqtt_explorer_${Math.random().toString(16).slice(3)}`
};

// Topics a escuchar (incluyendo topics del sistema)
const TOPICS = [
  'cooler_mqtt/ics/#',
  // Topics del sistema (si están habilitados en el broker)
  '$SYS/broker/clients/+',
  '$SYS/broker/subscriptions/+', 
  '$SYS/broker/connection/+',
  '$SYS/broker/log',
  '$SYS/broker/clients/connected',
  '$SYS/broker/clients/total',
  // Topics comunes de Last Will Testament
  'clients/+/status',
  'devices/+/lwt',
  // Topics de estado general  
  '+/status',
  '+/+/status'
];

// Configuración de archivos de log
const LOGS_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOGS_DIR, `mqtt_explorer_${new Date().toISOString().split('T')[0]}.txt`);

// Crear directorio de logs si no existe
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log('📁 Directorio de logs creado:', LOGS_DIR);
}

// Estadísticas de la sesión
let stats = {
  totalMessages: 0,
  clientIds: new Set(),
  deviceIds: new Set(),
  messageTypes: {},
  startTime: new Date()
};

// Función para guardar mensaje en archivo
function saveMessageToFile(topic, message, timestamp, clientIds = []) {
  const separator = '='.repeat(80);
  const clientInfo = clientIds.length > 0 ? `\nClient IDs encontrados: ${clientIds.join(', ')}` : '';
  const logLine = `[${timestamp}] Topic: ${topic}${clientInfo}\n${message.toString()}\n${separator}\n`;
  
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) {
      console.error('❌ Error guardando mensaje:', err.message);
    }
  });
}

// Función para analizar e identificar Client IDs
function extractClientIds(topic, payload) {
  const foundIds = [];
  
  try {
    const jsonData = JSON.parse(payload);
    
    // Buscar diferentes campos que podrían contener Client IDs
    if (jsonData.SNU) foundIds.push({ type: 'SNU', id: jsonData.SNU });
    if (jsonData.clientId) foundIds.push({ type: 'ClientID', id: jsonData.clientId });
    if (jsonData.client_id) foundIds.push({ type: 'Client_ID', id: jsonData.client_id });
    if (jsonData.deviceId) foundIds.push({ type: 'DeviceID', id: jsonData.deviceId });
    if (jsonData.device_id) foundIds.push({ type: 'Device_ID', id: jsonData.device_id });
    if (jsonData.id) foundIds.push({ type: 'ID', id: jsonData.id });
    if (jsonData.uuid) foundIds.push({ type: 'UUID', id: jsonData.uuid });
    if (jsonData.serial) foundIds.push({ type: 'Serial', id: jsonData.serial });
    
  } catch (e) {
    // Si no es JSON, buscar patrones en texto plano
    const patterns = [
      { regex: /client[_\-\s]*id[:\s]*([a-zA-Z0-9_\-]+)/i, type: 'ClientID' },
      { regex: /device[_\-\s]*id[:\s]*([a-zA-Z0-9_\-]+)/i, type: 'DeviceID' },
      { regex: /mqtt[_\-\s]*client[:\s]*([a-zA-Z0-9_\-]+)/i, type: 'MQTT_Client' },
      { regex: /uuid[:\s]*([a-zA-Z0-9\-]+)/i, type: 'UUID' },
      { regex: /serial[:\s]*([a-zA-Z0-9_\-]+)/i, type: 'Serial' }
    ];
    
    patterns.forEach(pattern => {
      const match = payload.match(pattern.regex);
      if (match) {
        foundIds.push({ type: pattern.type, id: match[1] });
      }
    });
  }
  
  // Analizar el topic para extraer IDs
  const topicParts = topic.split('/');
  topicParts.forEach((part, index) => {
    // Buscar UUIDs en el topic
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(part)) {
      foundIds.push({ type: 'Topic_UUID', id: part });
    }
    // Buscar otros patrones de ID en topics
    if (part.length > 10 && /^[a-zA-Z0-9_\-]+$/.test(part) && index > 1) {
      foundIds.push({ type: 'Topic_ID', id: part });
    }
  });
  
  return foundIds;
}

console.log('🚀 Iniciando MQTT Explorer Listener...');
console.log(`📡 Conectando a: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);
console.log(`🆔 Mi Client ID: ${MQTT_CONFIG.clientId}`);

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
  console.log(`🏠 Broker: ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`);
  console.log(`👤 Usuario: ${MQTT_CONFIG.username}`);
  
  if (connack) {
    console.log('📊 Información de conexión:');
    console.log(`   • Session Present: ${connack.sessionPresent}`);
    console.log(`   • Return Code: ${connack.returnCode}`);
  }
  
  console.log('\n🔗 Intentando suscribirse a topics (algunos pueden fallar si no están disponibles):');
  
  // Suscribirse a los topics con diferentes QoS
  TOPICS.forEach((topic, index) => {
    setTimeout(() => {
      client.subscribe(topic, { qos: 0 }, (err, granted) => {
        if (err) {
          console.error(`❌ Error: ${topic}`);
        } else if (granted && granted.length > 0 && granted[0]) {
          const qos = granted[0].qos;
          if (topic.startsWith('$SYS')) {
            console.log(`🔧 Sistema: ${topic}`);
          } else if (topic.includes('status') || topic.includes('lwt')) {
            console.log(`⚡ Estado: ${topic}`);
          } else {
            console.log(`📬 Principal: ${topic}`);
          }
        } else {
          // Suscripción rechazada o no disponible (común con $SYS y status topics)
          if (topic.startsWith('$SYS') || topic.includes('status') || topic.includes('lwt')) {
            // Silencioso para topics opcionales
          } else {
            console.log(`⚠️  No disponible: ${topic}`);
          }
        }
      });
    }, index * 100); // Espaciar suscripciones para evitar overload
  });
  
  setTimeout(() => {
    console.log(`\n💾 Los mensajes se guardarán en: ${path.basename(LOG_FILE)}`);
    console.log('👂 Escuchando todos los mensajes y buscando Client IDs...\n');
  }, TOPICS.length * 100 + 500);
});

// Evento: Mensaje recibido
client.on('message', (topic, message, packet) => {
  const timestamp = new Date().toISOString();
  const payload = message.toString();
  
  // Actualizar estadísticas
  stats.totalMessages++;
  
  // Identificar tipo de mensaje
  let messageType = '📦 Normal';
  if (topic.startsWith('$SYS')) {
    messageType = '🔧 Sistema';
    stats.messageTypes.system = (stats.messageTypes.system || 0) + 1;
  } else if (topic.includes('status') || topic.includes('lwt')) {
    messageType = '⚡ Estado/LWT';
    stats.messageTypes.status = (stats.messageTypes.status || 0) + 1;
  } else if (topic.includes('cooler_mqtt')) {
    messageType = '❄️ IoT Device';
    stats.messageTypes.iot = (stats.messageTypes.iot || 0) + 1;
  } else {
    stats.messageTypes.other = (stats.messageTypes.other || 0) + 1;
  }
  
  // Extraer posibles Client IDs
  const clientIds = extractClientIds(topic, payload);
  
  // Guardar IDs únicos encontrados
  clientIds.forEach(idInfo => {
    stats.clientIds.add(`${idInfo.type}:${idInfo.id}`);
    if (idInfo.type.includes('SNU') || idInfo.type.includes('Device')) {
      stats.deviceIds.add(idInfo.id);
    }
  });
  
  // Guardar en archivo
  saveMessageToFile(topic, message, timestamp, clientIds.map(c => `${c.type}:${c.id}`));
  
  console.log('─'.repeat(60));
  console.log(`⏰ ${timestamp}`);
  console.log(`📍 ${topic}`);
  console.log(`📂 Tipo: ${messageType}`);
  
  if (packet) {
    console.log(`📡 QoS:${packet.qos} Retain:${packet.retain} Dup:${packet.dup}`);
  }
  
  // Mostrar Client IDs encontrados
  if (clientIds.length > 0) {
    console.log(`🏷️ Client IDs encontrados:`);
    clientIds.forEach(idInfo => {
      console.log(`   • ${idInfo.type}: ${idInfo.id}`);
    });
  }
  
  // Mostrar mensaje (limitado si es muy largo)
  const truncatedPayload = payload.length > 200 ? payload.substring(0, 200) + '...' : payload;
  try {
    const jsonData = JSON.parse(payload);
    console.log(`📦 JSON:`, JSON.stringify(jsonData, null, 2).substring(0, 300));
  } catch (e) {
    console.log(`📦 Text: ${truncatedPayload}`);
  }
  
  console.log(`💾 [${stats.totalMessages}] guardado\n`);
});

// Mostrar estadísticas cada 30 segundos
setInterval(() => {
  const uptime = Math.floor((new Date() - stats.startTime) / 1000);
  console.log('\n📊 ESTADÍSTICAS DE SESIÓN');
  console.log(`⏱️ Tiempo activo: ${uptime}s`);
  console.log(`📨 Total mensajes: ${stats.totalMessages}`);
  console.log(`🆔 Client IDs únicos encontrados: ${stats.clientIds.size}`);
  console.log(`📱 Device IDs únicos: ${stats.deviceIds.size}`);
  console.log(`📈 Por tipo:`, stats.messageTypes);
  
  if (stats.clientIds.size > 0) {
    console.log(`🏷️ Client IDs detectados:`);
    Array.from(stats.clientIds).slice(0, 10).forEach(id => {
      console.log(`   • ${id}`);
    });
    if (stats.clientIds.size > 10) {
      console.log(`   ... y ${stats.clientIds.size - 10} más`);
    }
  }
  console.log('─'.repeat(50) + '\n');
}, 30000);

// Eventos de conexión
let reconnectAttempts = 0;

client.on('error', (error) => {
  // Filtrar errores comunes de reconexión
  if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
    console.error('❌ Error de red - verificar conectividad');
  } else if (!error.message.includes('client disconnecting')) {
    console.error('❌ Error MQTT:', error.message);
  }
});

client.on('reconnect', () => {
  reconnectAttempts++;
  if (reconnectAttempts % 5 === 0) {
    console.log(`🔄 Intentando reconectar... (intento ${reconnectAttempts})`);
  }
});

client.on('close', () => {
  console.log('🔌 Desconectado del broker MQTT');
  reconnectAttempts = 0;
});

client.on('offline', () => {
  console.log('📴 Cliente MQTT offline');
});

// Cerrar limpiamente
process.on('SIGINT', () => {
  console.log('\n\n👋 Cerrando MQTT Explorer Listener...');
  console.log(`📊 Estadísticas finales:`);
  console.log(`   • Total mensajes procesados: ${stats.totalMessages}`);
  console.log(`   • Client IDs únicos encontrados: ${stats.clientIds.size}`);
  console.log(`   • Device IDs únicos: ${stats.deviceIds.size}`);
  console.log(`   • Archivo de log: ${path.basename(LOG_FILE)}`);
  
  if (stats.clientIds.size > 0) {
    console.log(`\n🏷️ Lista completa de Client IDs encontrados:`);
    Array.from(stats.clientIds).forEach(id => {
      console.log(`   • ${id}`);
    });
  }
  
  client.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Cerrando conexión...');
  client.end();
  process.exit(0);
});