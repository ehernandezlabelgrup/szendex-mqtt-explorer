# MQTT Explorer - Guía para Agentes IA

Sistema para **monitoreo y análisis** de mensajes MQTT de neveras inteligentes (coolers) del **proyecto SZENDEX**.

## 🎯 Propósito del Proyecto

Captura y análisis de datos telemétricos desde neveras inteligentes conectadas a MQTT, con tres interfaces principales:
- **Listener**: Logging persistente (100MB rotación)
- **Analizadores**: Scripts para búsqueda, análisis de gaps y reportes de servicios  
- **Publicador**: Generador de datos de prueba

**Contexto SZENDEX**: Sistema de gestión de logística inteligente donde este MQTT Explorer actúa como cerebro de monitoreo para detectar gaps de conectividad y optimizar rutas de envío.

---

## 📊 Arquitectura (3 Componentes Independientes)

### 1. **Listener Standalone** (`mqtt-listener.js`)
- **Propósito**: Monitoreo pasivo y persistencia
- **Almacenamiento**: `logs/mqtt_messages_YYYY-MM-DD_N.txt` (rotación a 100MB)
- **Timestamps**: Hora local (no UTC) - usa `padStart()`, NO `toISOString()`
- **Reconexión**: Automática cada 5 segundos si falla

### 2. **Analizadores de Datos** (Scripts de Análisis)
- **search-logs.js**: Búsqueda avanzada por SID/SNU/TSP/LOG/DVS con filtros combinados
- **check-service-gaps.js**: Análisis de gaps temporales para un SID específico
- **report-all-gaps.js**: Reporte global de gaps de todos los SIDs con ranking
- **export-gaps-report.js**: Exportador de reportes de gaps a CSV

### 3. **Publicador de Pruebas** (`mqtt-publisher.js`)
- **Propósito**: Generar datos falsos para testing
- **Funcionalidad**: Simula múltiples neveras con datos realistas

```
MQTT Broker (ingestaprod.thesmartdelivery.com:1883)
    ↓ Topic: cooler_mqtt/ics/#
    ├→ mqtt-listener.js → logs/*.txt
    └→ Análisis Scripts:
       ├→ search-logs.js (filtrado por campos)
       ├→ check-service-gaps.js (gaps de un SID)
       ├→ report-all-gaps.js → gaps_report.txt
       └→ export-gaps-report.js → CSV reports
```

---

## 🔧 Flujos de Trabajo Clave

### NPM Scripts (todos bloqueantes)
```bash
npm run listener     # Escucha MQTT + guarda logs
npm run publish      # Publicador de pruebas (genera datos falsos)

# 🔍 Análisis de Datos
npm run search       # Buscar mensajes por SID/SNU/TSP/LOG/DVS
npm run check-gaps   # Analizar gaps de un SID específico
npm run report-gaps  # Reporte global de gaps de todos los SIDs
npm run export-gaps  # Exportar reporte de gaps a CSV
```

### Configuración MQTT (Variables de entorno)
```javascript
// Configuración desde .env
const MQTT_CONFIG = {
  host: process.env.MQTT_HOST,
  port: parseInt(process.env.MQTT_PORT) || 1883,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: `mqtt_<name>_${Math.random().toString(16).slice(3)}` // único por script
};

// Configuración de conexión estandarizada
const client = mqtt.connect(`mqtt://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`, {
  username: MQTT_CONFIG.username,
  password: MQTT_CONFIG.password,
  clientId: MQTT_CONFIG.clientId,
  clean: true,
  reconnectPeriod: 5000,    // Reconecta cada 5 segundos
  connectTimeout: 30000     // Timeout de 30 segundos
});
```

**Variables de entorno (.env):**
```bash
MQTT_HOST=ingestaprod.thesmartdelivery.com  # Host específico del proyecto
MQTT_PORT=1883
MQTT_USERNAME=your_username  
MQTT_PASSWORD=your_password
```

**Topics específicos del sistema:**
- Principal: `cooler_mqtt/ics/#` (neveras IoT)
- Sistema: `$SYS/broker/clients/+`, `$SYS/broker/log` (opcionaler)
- Estado: `clients/+/status`, `devices/+/lwt` (Last Will Testament)

**Nota**: Cada componente genera su propio `clientId` aleatorio para evitar conflictos.

---

## 📝 Patrones de Código Específicos

### Formato de Archivos de Log
```
[2025-12-29 14:23:45.123] cooler_mqtt/ics/<uuid>
{"SNU": "uuid", "TMP": 23.5, "LAT": 42.071, "LON": 2.815, ...}
================================================================================
```
- Timestamps en hora **local** (no UTC)
- Separadores de 80 caracteres `=`
- JSON en línea única (sin formato)

### Rotación de Logs (100MB por archivo)
```javascript
const MAX_FILE_SIZE = 100 * 1024 * 1024;
// mqtt_messages_2025-12-29_1.txt → _2.txt (cuando supera 100MB)

// Lógica de rotación en mqtt-listener.js
function rotateFileIfNeeded() {
  if (fs.existsSync(LOG_FILE)) {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size >= MAX_FILE_SIZE) {
      fileCounter++;
      LOG_FILE = path.join(LOGS_DIR, `mqtt_messages_${getLocalDateString()}_${fileCounter}.txt`);
    }
  }
}
```

### Manejo de Errores y Reconexión MQTT
```javascript
// Patrón estandarizado para manejo de errores
client.on('error', (error) => {
  // Filtrar errores comunes de reconexión para evitar spam
  if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
    console.error('❌ Error de red - verificar conectividad');
  } else if (!error.message.includes('client disconnecting')) {
    console.error('❌ Error MQTT:', error.message);
  }
});

// Reconexión automática con contador
let reconnectAttempts = 0;
client.on('reconnect', () => {
  reconnectAttempts++;
  if (reconnectAttempts % 5 === 0) { // Solo mostrar cada 5 intentos
    console.log(`🔄 Intentando reconectar... (intento ${reconnectAttempts})`);
  }
});
```

### Suscripción a Topics con Manejo Silencioso
```javascript
// Los topics de sistema pueden no estar disponibles - manejar silenciosamente
client.subscribe(topic, { qos: 0 }, (err, granted) => {
  if (err) {
    console.error(`❌ Error al suscribirse a ${topic}:`, err.message);
  } else if (granted && granted.length > 0) {
    // Éxito
  } else {
    // Manejo silencioso para topics opcionales
    if (topic.startsWith('$SYS') || topic.includes('status') || topic.includes('lwt')) {
      // Silencioso para topics opcionales
    } else {
      console.log(`⚠️  No disponible: ${topic}`);
    }
  }
});
```

### Timestamps: Regla de Oro
**NUNCA convertir UTC+1 al recibir. Usar hora local siempre.**

```javascript
// ✓ CORRECTO: mqtt-listener.js usa hora local
function getLocalTimestamp() {
  const now = new Date();
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}
```

### Parsing de JSON en Logs
```javascript
// Usar REGEX para extraer JSON de logs
const match = line.match(/\{.*\}/);
if (match) JSON.parse(match[0]);
```

### Análisis de Datos y Gaps
```bash
# Búsqueda avanzada (filtros combinados AND)
npm run search -- --sid=1768468839 --dvs=6
npm run search -- --snu=019929c1-7ec6-7ae3-b456-a037c249c446 --log=1
npm run search -- --lid=12345 --dvs=4

# Análisis de gaps para SID específico
npm run check-gaps -- --sid=1768991496 --gap=5

# Reporte global de gaps (ordenado por gap máximo)
npm run report-gaps -- --gap=4 --sort=max --detail=1768468839
```

**Formato de Gaps en Reportes:**
```
SID: 1768468839 | Mensajes: 835 | Gaps: 16 | Máximo: 2910.15m | Promedio: 437.28m
  Gap 1: 2910.15 minutos
    ⬅️  Último:  2026-01-16 18:12:31.838 | LOG:1 | DVS:4
    ➡️  Próximo: 2026-01-18 18:42:40.734 | LOG:1 | DVS:4
```

### Limpieza de Procesos (Graceful Shutdown)
```javascript
// Patrón estandarizado para todos los scripts
function cleanup() {
  console.log('\n\n👋 Cerrando conexión...');
  // Limpiar intervalos si existen
  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];
  
  // Cerrar conexión MQTT
  client.end(false, () => {
    console.log('✅ Conexión cerrada correctamente');
    process.exit(0);
  });
  
  // Timeout de seguridad
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
```

---

## 🐛 Debugging Rápido

```bash
# Ver conexión MQTT
ping ingestaprod.thesmartdelivery.com
telnet ingestaprod.thesmartdelivery.com 1883

# Inspeccionar logs del día
tail -f logs/mqtt_messages_$(date +%Y-%m-%d)_1.txt
grep -c "^\[" logs/mqtt_messages_$(date +%Y-%m-%d)_1.txt
```

---

## 📦 Dependencias Críticas

```json
{
  "mqtt": "^5.3.4",      // Cliente MQTT (reconexión automática)
  "dotenv": "^16.x.x"    // Carga de variables de entorno
}
```
Sin dependencias de desarrollo (sin TypeScript, tests, ni linters).

---

## ⚠️ Anti-Patrones Documentados (NO son bugs)

1. **Configuración por .env**: Credenciales SOLO en variables de entorno
2. **Sin validación de esquema JSON**: Se acepta cualquier JSON válido
3. **Manejo de errores básico**: Solo `console.error()`, sin reintentos complejos

---

## 📊 Formato de Datos SZENDEX

### Estructura JSON de Neveras IoT
```json
{
  "SNU": "019929bf-ee7e-784c-abc5-ff4f3424946c",  // UUID del dispositivo
  "SID": 1769067286,                               // Service ID (identificador numérico)
  "TSP": 1769079079,                               // Timestamp Unix del mensaje
  "TMP": 18.4,                                     // Temperatura actual (°C)
  "LAT": 41.4271, "LON": 2.1413,                  // Coordenadas GPS
  "ORG": 131, "DST": 9,                           // Origen y destino logístico
  "STY": 2,                                        // Tipo de servicio
  "BMV": 7951, "BPR": 76,                         // Batería: voltaje y porcentaje
  "STS": 11793,                                    // Status del sistema
  "LOG": 23,                                       // Nivel logging (1=OK, >1=Error)
  "DVS": 5,                                        // Device Status (1-6)
  "RSS": 30,                                       // Señal de red (-dBm)
  "BCN": 7,                                        // Beacon count
  "VLM": 0,                                        // Volumen
  "ICN": 2,                                        // Icon number
  "NST": 18.4, "XST": 21.4,                       // Min/Max temperatura
  "LGC": 820200,                                   // Logic counter
  "FWV": "3.3",                                    // Firmware version
  "USP": 10,                                       // User Status Priority
  "SER": {                                         // Sensores
    "MNT": 0, "MXT": 0,                           // Min/Max temperatura 
    "STE": 1, "ORE": 0, "SHK": 1                  // Estados (temperatura, apertura, shock)
  }
}
```

### Campos Críticos para Análisis
- **SID**: Identificador principal para análisis de gaps y servicios
- **TSP**: Timestamp para cálculos temporales (Unix time)
- **LOG**: Indicador de errores (valores >1 indican problemas)
- **DVS**: Estado del dispositivo (crítico para análisis operacional)
- **LID**: Identificador de localización/lote (nuevo campo)
- **TMP**: Temperatura actual (monitoreo de cadena de frío)

---

## 🚀 Extensiones Posibles

- **Filtrado MQTT**: Regex en suscripción a topics
- **Compresión de logs**: gzip automático para archivos >100MB
- **Base de datos**: SQLite o PostgreSQL para análisis más complejos

---

## 📂 Estructura de Archivos Relevantes

```
mqtt-listener.js        → 244 líneas, listener principal
mqtt-explorer-listener.js → 312 líneas, listener con estadísticas
mqtt-publisher.js       → 166 líneas, generador de pruebas
logs/                   → Archivos de log rotados (100MB max)

# Análisis de Datos
search-logs.js          → 172 líneas, búsqueda por filtros
check-service-gaps.js   → 193 líneas, análisis gaps por SID
report-all-gaps.js      → 238 líneas, reporte global gaps
export-gaps-report.js   → Exportador gaps a CSV
gaps_report.txt         → Salida del reporte global
```
