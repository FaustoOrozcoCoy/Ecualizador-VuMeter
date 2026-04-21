# Ecualizador didactico de 3 bandas

Aplicacion web pensada para ilustrar el resultado esperado de un laboratorio de Circuitos 2, en el que los estudiantes desarrollan un ecualizador de audio por bandas y observan su efecto sobre una señal musical.

## Uso rapido

1. Abre `index.html` en un navegador moderno.
2. Si existe `cancion.mp3` en la misma carpeta, la aplicacion intentara cargarla por defecto.
3. Si quieres usar otra pista, pulsa **Cargar audio**.
4. Reproduce el audio y ajusta graves, medios y agudos.
5. Observa los medidores por banda y la grafica del espectro de salida.

Si prefieres ejecutarla con un servidor local:

```powershell
python -m http.server 8000
```

Luego abre `http://localhost:8000`.

## Publicarlo en GitHub Pages

Coloca en la raiz del repositorio:

- `index.html`
- `styles.css`
- `app.js`
- `cancion.mp3`

Pasos:

1. Crea un repositorio publico en GitHub.
2. Sube esos archivos.
3. En `Settings > Pages`, activa `Deploy from a branch`.
4. Elige la rama `main` y la carpeta `/ (root)`.

GitHub te dara un enlace similar a:

`https://TU_USUARIO.github.io/ecualizador-3-bandas/`
