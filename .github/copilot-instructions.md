# MQTT Explorer - Guía para Agentes IA

Sistema para **monitoreo y análisis** de mensajes MQTT de neveras inteligentes (coolers).

## 🎯 Propósito del Proyecto

Captura y análisis de datos telemétricos desde neveras inteligentes conectadas a MQTT, con tres interfaces principales:
- **Listener**: Logging persistente (100MB rotación)
- **Analizadores**: Scripts para búsqueda, análisis de gaps y reportes de servicios  
- **Publicador**: Generador de datos de prueba

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
```

**Variables de entorno (.env):**
```bash
MQTT_HOST=your_mqtt_host.com
MQTT_PORT=1883
MQTT_USERNAME=your_username  
MQTT_PASSWORD=your_password
```

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

## 🚀 Extensiones Posibles

- **Filtrado MQTT**: Regex en suscripción a topics
- **Compresión de logs**: gzip automático para archivos >100MB
- **Base de datos**: SQLite o PostgreSQL para análisis más complejos

---

## 📂 Estructura de Archivos Relevantes

```
mqtt-listener.js        → 244 líneas, listener principal
mqtt-publisher.js       → 166 líneas, generador de pruebas
logs/                   → Archivos de log rotados (100MB max)

# Análisis de Datos
search-logs.js          → 172 líneas, búsqueda por filtros
check-service-gaps.js   → 193 líneas, análisis gaps por SID
report-all-gaps.js      → 238 líneas, reporte global gaps
export-gaps-report.js   → Exportador gaps a CSV
gaps_report.txt         → Salida del reporte global
```
