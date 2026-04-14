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

## Publicarlo en GitHub Pages

### 1. Deja todos los archivos en una misma carpeta

Asegurate de tener juntos:

- `index.html`
- `styles.css`
- `app.js`
- `Half A Man.M4A`

El nombre del audio debe coincidir exactamente si quieres que cargue por defecto.

### 2. Crea un repositorio en GitHub

1. Entra a [GitHub](https://github.com).
2. Pulsa **New repository**.
3. Ponle un nombre, por ejemplo `ecualizador-3-bandas`.
4. Crea el repositorio publico.

### 3. Sube los archivos

Opcion simple desde la web:

1. Abre el repositorio recien creado.
2. Pulsa **Add file**.
3. Pulsa **Upload files**.
4. Arrastra `index.html`, `styles.css`, `app.js` y `Half A Man.M4A`.
5. Pulsa **Commit changes**.

Opcion con Git desde tu equipo:

```powershell
git init
git add .
git commit -m "Primera version del ecualizador didactico"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ecualizador-3-bandas.git
git push -u origin main
```

### 4. Activa GitHub Pages

1. En tu repositorio entra a **Settings**.
2. Busca la seccion **Pages**.
3. En **Source**, elige **Deploy from a branch**.
4. Selecciona la rama `main`.
5. En carpeta, deja `/ (root)`.
6. Guarda los cambios.

GitHub generara un enlace parecido a:

`https://TU_USUARIO.github.io/ecualizador-3-bandas/`

Ese sera el enlace que podras compartir con tus estudiantes.

### 5. Importante sobre el audio

- `Half A Man.M4A` debe quedar en la raiz del repositorio, junto a `index.html`.
- GitHub Pages servira ese archivo como recurso estatico.
- Si algun navegador no reproduce bien `M4A`, te conviene subir tambien una copia en `MP3` o `WAV` y cambiar el nombre por defecto en `app.js`.

## Como esta implementado

### 1. Separacion de bandas con funciones de transferencia de segundo orden

En `app.js` ahora se define explicitamente un banco de filtros basado en las formas canonicas:

- Pasabajas:
  `H_LP(s) = (K * w0^2) / (s^2 + (w0/Q)s + w0^2)`
- Pasabandas:
  `H_BP(s) = (K * (w0/Q)s) / (s^2 + (w0/Q)s + w0^2)`
- Pasaaltas:
  `H_HP(s) = (K * s^2) / (s^2 + (w0/Q)s + w0^2)`

La simulacion usa `BiquadFilterNode` como realizacion digital en tiempo real de esos filtros de segundo orden, mientras que la ganancia `K` de cada banda se aplica aparte con un `GainNode`.

Valores usados:

- Graves: pasabajas, `f0 = 250 Hz`, `Q = 0.707`
- Medios: pasabandas, `f0 = 1000 Hz`, `Q = 0.53`
- Agudos: pasaaltas, `f0 = 4000 Hz`, `Q = 0.707`

La eleccion prioriza una separacion didactica clara entre bandas y una respuesta audible facil de interpretar.

### 2. Ajuste de ganancia K

Cada rama tiene su propio `GainNode`, que corresponde al factor `K` de la funcion de transferencia.

- El valor del deslizador se expresa en dB
- Ese valor se convierte a escala lineal con `10^(dB/20)`
- La ganancia se aplica con `setTargetAtTime(...)` para que el cambio sea suave y rapido

### 3. Nivel de energia mostrado

Cada banda tiene un `AnalyserNode` conectado despues de su `GainNode`.

- Se toman muestras temporales con `getFloatTimeDomainData(...)`
- Se calcula el valor RMS de la señal
- El RMS se convierte a dB con `20 * log10(rms)`
- Ese nivel se transforma en un porcentaje para llenar la barra del VU meter

Esto permite ver una estimacion clara y estable de la energia presente en cada banda mientras suena el audio.

## Observaciones didacticas

- El canal de graves deja pasar con mayor fuerza el contenido por debajo de 250 Hz, por lo que refuerza bombo, bajo y componentes de baja frecuencia.
- El canal de medios enfatiza la zona central alrededor de 1 kHz y cubre de forma aproximada la franja media, haciendo mas evidentes voces, guitarras y presencia general.
- El canal de agudos resalta el contenido por encima de 4 kHz, haciendo mas notorios brillo, platillos y detalle.
- La app sigue priorizando una respuesta inmediata al mover los controles.
- La estructura del codigo separa claramente reproduccion, filtros canonicos de segundo orden, ganancias y visualizacion.
