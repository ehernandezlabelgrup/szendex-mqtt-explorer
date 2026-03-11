# Plan: Modificar `mqtt-publisher-test.js` — Escenario "LOG Reset sin SID"

## 🎯 Objetivo del Test

Verificar que la web de SZENDEX detecta y **finaliza automáticamente** los servicios que quedan
en estado pendiente cuando un dispositivo envía un **LOG:2 (reset)** sin incluir el campo `SID`.

---

## 📋 Escenario a Simular

```
Servicio A (SID generado dinámico)
  │
  ├─ [Msg 1] DVS:3, LOG:8  → Inicio de servicio (recogida)
  ├─ [Msg 2] DVS:3, LOG:1  → Telemetría normal
  ├─ [Msg 3] DVS:4, LOG:16 → Cambio de estado (en tránsito)
  ├─ [Msg 4] DVS:4, LOG:1  → Telemetría normal
  │
  ├─ [Msg 5] LOG:2, SIN SID → ⚠️ RESET del dispositivo (sin SID)
  │
  └─ FIN — El servicio queda PENDIENTE (nunca llega DVS:6/7 de finalización)
```

**Resultado esperado en la web**: El servicio aparece como "pendiente" y la lógica
de la web lo debe detectar y cerrar automáticamente.

---

## 🔧 Cambios a Implementar en `mqtt-publisher-test.js`

### 1. Estructura de mensajes hardcodeada (sin `messages-config.json`)

Definir un array local con la secuencia exacta de 5 mensajes:

```javascript
const TEST_SEQUENCE = [
  { dvs: 3, log: 8,  includeSid: true  },  // Inicio servicio
  { dvs: 3, log: 1,  includeSid: true  },  // Telemetría normal
  { dvs: 4, log: 16, includeSid: true  },  // Cambio estado
  { dvs: 4, log: 1,  includeSid: true  },  // Telemetría normal
  { dvs: 4, log: 2,  includeSid: false },  // ⚠️ RESET sin SID
];
```

### 2. SID generado dinámicamente

El `SID` se genera **una sola vez** al conectar (timestamp Unix actual), igual que hace `mqtt-publisher.js`:

```javascript
const TEST_SID = Math.floor(Date.now() / 1000).toString();
```

### 3. Función `generateCoolerData(step)`

- Recibe el paso actual del array `TEST_SEQUENCE`
- Si `step.includeSid === true` → incluye `SID: TEST_SID` en el payload
- Si `step.includeSid === false` → **omite completamente el campo SID** del objeto JSON

```javascript
function generateCoolerData(step) {
  const payload = {
    SNU: TEST_SNU,
    // SID se añade condicionalmente abajo
    TSP: Math.floor(Date.now() / 1000),
    ...camposRestantes,
    LOG: step.log,
    DVS: step.dvs,
    ...
  };

  if (step.includeSid) {
    payload.SID = TEST_SID;
  }
  // Si includeSid=false, SID simplemente no existe en el objeto

  return payload;
}
```

### 4. Envío secuencial con delay de 1.5 segundos entre mensajes

Usar `setTimeout` encadenado (o un bucle con `async/await`) para enviar los mensajes
uno por uno, con **1500ms de separación** entre cada uno.

```
[0ms]    → Mensaje 1 (DVS:3 LOG:8 con SID)
[1500ms] → Mensaje 2 (DVS:3 LOG:1 con SID)
[3000ms] → Mensaje 3 (DVS:4 LOG:16 con SID)
[4500ms] → Mensaje 4 (DVS:4 LOG:1 con SID)
[6000ms] → Mensaje 5 (DVS:4 LOG:2 SIN SID)  ← El reset
[7000ms] → Cerrar conexión y terminar proceso
```

### 5. Logs en consola claros

Cada mensaje debe mostrar claramente si incluye o no el SID:

```
✅ [1/5] DVS:3 | LOG:8  | SID: 1741690234  ← Inicio de servicio
✅ [2/5] DVS:3 | LOG:1  | SID: 1741690234
✅ [3/5] DVS:4 | LOG:16 | SID: 1741690234  ← Cambio estado
✅ [4/5] DVS:4 | LOG:1  | SID: 1741690234
⚠️  [5/5] DVS:4 | LOG:2  | SID: ❌ NO INCLUIDO  ← RESET sin SID
```

### 6. Graceful shutdown igual que siempre

```javascript
function cleanup() { ... }
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
```

---

## 📂 Archivo a Modificar

- **Archivo**: `mqtt-publisher-test.js` (en la raíz del proyecto)
- **Acción**: Reemplazar completamente el contenido actual

---

## ✅ Criterios de Éxito

1. El script se conecta al broker `ingestapre.thesmartdelivery.com:1883`
2. Envía exactamente **5 mensajes** en orden y con los delays indicados
3. Los mensajes 1-4 contienen el campo `SID`
4. El mensaje 5 contiene `LOG:2` y **NO** contiene el campo `SID`
5. El proceso termina limpiamente tras enviar el último mensaje
6. En la web SZENDEX el servicio generado en el test aparece como "pendiente"

---

## 🔑 Datos de Conexión (mantener igual que el original)

```javascript
host: 'ingestapre.thesmartdelivery.com'
port: 1883
username: 'verneAgent'
password: 'LOIGK3xsdSGLJ'
TEST_SNU: '019929bf-ee7f-7d05-a659-3532fe0d8802'
```

---

## 💡 Notas Adicionales

- El `TEST_SID` debe generarse con `Math.floor(Date.now() / 1000).toString()` al conectar,
  para que sea único en cada ejecución del test
- NO usar `messages-config.json` — la secuencia está hardcodeada en el propio script
- El topic MQTT es siempre: `cooler_mqtt/ics/${TEST_SNU}`
- QoS: 0 (igual que el test original)
