# Ecualizador didactico de 3 bandas

Aplicacion web local pensada como simulacion educativa de un sistema con:

- banco de filtros por bandas
- control de ganancia por banda
- indicador de energia por banda

## Archivos

- `index.html`: estructura de la interfaz
- `styles.css`: estilos visuales
- `app.js`: carga del audio, filtrado, ganancia y medidores

## Como ejecutar

1. Abre `index.html` en un navegador moderno como Chrome, Edge o Firefox.
2. Si en la misma carpeta existe el archivo `Half A Man.M4A`, la aplicacion intentara dejarlo cargado por defecto.
3. Si quieres usar otro archivo, pulsa **Cargar audio** y selecciona un MP3, WAV u otro formato compatible.
4. Usa **Reproducir** para iniciar el audio.
5. Mueve los deslizadores de **Graves**, **Medios** y **Agudos** mientras escuchas.
6. Observa los medidores verticales para ver el nivel de energia de cada banda.

Si prefieres servirlo localmente en lugar de abrir el HTML directamente, puedes usar por ejemplo:

```powershell
python -m http.server 8000
```

y luego abrir `http://localhost:8000`.


## Observaciones didacticas

- El canal de graves deja pasar con mayor fuerza el contenido por debajo de 250 Hz, por lo que refuerza bombo, bajo y componentes de baja frecuencia.
- El canal de medios enfatiza la zona central alrededor de 1 kHz y cubre de forma aproximada la franja media, haciendo mas evidentes voces, guitarras y presencia general.
- El canal de agudos resalta el contenido por encima de 4 kHz, haciendo mas notorios brillo, platillos y detalle.
- La app  prioriza una respuesta inmediata al mover los controles.
