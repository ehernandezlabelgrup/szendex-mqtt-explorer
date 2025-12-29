#!/bin/bash

echo "🚀 Exportador de Mensajes MQTT a CSV"
echo "====================================="
echo ""

# Ejecutar el script de Python
python3 export_to_csv.py

echo ""
echo "✅ ¡Proceso completado!"
echo ""
echo "💡 Consejos para Excel:"
echo "   - Abre el archivo CSV en Excel"
echo "   - Si las fechas no se ven bien, selecciona la columna 'timestamp'"
echo "   - Ve a Datos > Texto en columnas > Delimitado > Siguiente > Finalizar"
echo "   - Puedes crear gráficos con las columnas TMP (temperatura), BMV (batería), etc."
echo ""