const audioElement = document.getElementById("audio-element");
const fileInput = document.getElementById("audio-file-input");
const playButton = document.getElementById("play-button");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");
const resetGainsButton = document.getElementById("reset-gains-button");
const statusText = document.getElementById("status-text");
const defaultAudioFileName = "Half A Man.M4A";
const defaultAudioFileRelativePath = `./${encodeURIComponent(defaultAudioFileName)}`;

const bandControls = {
  bass: {
    slider: document.getElementById("gain-bass"),
    valueLabel: document.getElementById("value-bass"),
    meter: document.getElementById("meter-bass"),
    rangeLabel: "20 Hz - 250 Hz"
  },
  mid: {
    slider: document.getElementById("gain-mid"),
    valueLabel: document.getElementById("value-mid"),
    meter: document.getElementById("meter-mid"),
    rangeLabel: "250 Hz - 4 kHz"
  },
  treble: {
    slider: document.getElementById("gain-treble"),
    valueLabel: document.getElementById("value-treble"),
    meter: document.getElementById("meter-treble"),
    rangeLabel: "4 kHz - 20 kHz"
  }
};

// Parametros didacticos del banco de filtros.
// Cada rama representa la forma canonica de segundo orden:
// Pasabajas: H_LP(s) = (K * w0^2) / (s^2 + (w0/Q)s + w0^2)
// Pasabandas: H_BP(s) = (K * (w0/Q)s) / (s^2 + (w0/Q)s + w0^2)
// Pasaaltas: H_HP(s) = (K * s^2) / (s^2 + (w0/Q)s + w0^2)
//
// En esta simulacion, la parte K se implementa con un GainNode independiente
// para que el usuario pueda variar la ganancia en tiempo real sin reconfigurar
// el filtro base. La parte dinamica de segundo orden se implementa con
// BiquadFilterNode, que corresponde a un filtro IIR de segundo orden.
const bandFilterSpecifications = {
  bass: {
    bandName: "Graves",
    filterType: "lowpass",
    canonicalTransfer: "H_LP(s) = (K * w0^2) / (s^2 + (w0/Q)s + w0^2)",
    f0Hz: 250,
    q: 0.707
  },
  mid: {
    bandName: "Medios",
    filterType: "bandpass",
    canonicalTransfer: "H_BP(s) = (K * (w0/Q)s) / (s^2 + (w0/Q)s + w0^2)",
    f0Hz: 1000,
    q: 0.53
  },
  treble: {
    bandName: "Agudos",
    filterType: "highpass",
    canonicalTransfer: "H_HP(s) = (K * s^2) / (s^2 + (w0/Q)s + w0^2)",
    f0Hz: 4000,
    q: 0.707
  }
};

let audioContext = null;
let sourceNode = null;
let masterGain = null;
let animationFrameId = null;
let currentFileUrl = null;

const audioGraph = {
  filters: {},
  gains: {},
  analysers: {},
  buffers: {},
  specifications: bandFilterSpecifications
};

function ensureAudioContext() {
  if (audioContext) {
    return;
  }

  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaElementSource(audioElement);
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.9;

  buildBandGraph();
  masterGain.connect(audioContext.destination);
  startMeterLoop();
}

function buildBandGraph() {
  Object.entries(bandFilterSpecifications).forEach(([bandKey, specification]) => {
    const canonicalFilterNode = createSecondOrderCanonicalFilter(audioContext, specification);
    const bandGainNode = createBandGainNode(audioContext);
    const bandAnalyserNode = createBandAnalyserNode(audioContext);

    sourceNode.connect(canonicalFilterNode);
    canonicalFilterNode.connect(bandGainNode);
    bandGainNode.connect(masterGain);

    // La energia se mide despues de aplicar la ganancia K de la banda.
    bandGainNode.connect(bandAnalyserNode);

    audioGraph.filters[bandKey] = canonicalFilterNode;
    audioGraph.gains[bandKey] = bandGainNode;
    audioGraph.analysers[bandKey] = bandAnalyserNode;
    audioGraph.buffers[bandKey] = new Float32Array(bandAnalyserNode.fftSize);
  });
}

function dbToLinear(gainDb) {
  return Math.pow(10, gainDb / 20);
}

function hzToRadPerSecond(frequencyHz) {
  return 2 * Math.PI * frequencyHz;
}

function createSecondOrderCanonicalFilter(context, specification) {
  const filterNode = context.createBiquadFilter();

  filterNode.type = specification.filterType;
  filterNode.frequency.value = specification.f0Hz;
  filterNode.Q.value = specification.q;

  // El nodo biquad realiza digitalmente una respuesta IIR de segundo orden
  // equivalente a la familia canonica seleccionada para cada banda.
  filterNode.channelCountMode = "explicit";

  return filterNode;
}

function createBandGainNode(context) {
  const gainNode = context.createGain();
  gainNode.gain.value = 1;
  return gainNode;
}

function createBandAnalyserNode(context) {
  const analyserNode = context.createAnalyser();
  analyserNode.fftSize = 2048;
  analyserNode.smoothingTimeConstant = 0.72;
  return analyserNode;
}

function updateGain(bandKey, gainDb) {
  const gainNode = audioGraph.gains[bandKey];
  const control = bandControls[bandKey];
  const numericValue = Number(gainDb);

  if (!gainNode) {
    return;
  }

  gainNode.gain.setTargetAtTime(dbToLinear(numericValue), audioContext.currentTime, 0.01);
  control.valueLabel.textContent = `${numericValue.toFixed(1)} dB`;
}

function setStatus(message) {
  statusText.textContent = message;
}

function loadSelectedFile(file) {
  if (!file) {
    return;
  }

  if (currentFileUrl) {
    URL.revokeObjectURL(currentFileUrl);
  }

  currentFileUrl = URL.createObjectURL(file);
  audioElement.src = currentFileUrl;
  audioElement.load();
  setStatus(`Archivo cargado: ${file.name}`);
}

function loadDefaultAudioFromProjectFolder() {
  if (currentFileUrl) {
    URL.revokeObjectURL(currentFileUrl);
    currentFileUrl = null;
  }

  // GitHub Pages y servidores estaticos pueden entregar el audio como un
  // recurso local del proyecto. Por eso se intenta cargar por defecto
  // el archivo "Half A Man.M4A" desde la misma carpeta del index.html.
  audioElement.src = defaultAudioFileRelativePath;
  audioElement.load();
  setStatus(`Audio por defecto preparado: ${defaultAudioFileName}`);
}

function calculateRmsDb(analyser, buffer) {
  analyser.getFloatTimeDomainData(buffer);

  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const sample = buffer[i];
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / buffer.length);

  if (rms < 0.000001) {
    return -60;
  }

  return 20 * Math.log10(rms);
}

function dbToMeterPercent(levelDb) {
  const clampedDb = Math.max(-48, Math.min(0, levelDb));
  return ((clampedDb + 48) / 48) * 100;
}

function updateMeters() {
  Object.keys(bandControls).forEach((bandKey) => {
    const analyser = audioGraph.analysers[bandKey];
    const buffer = audioGraph.buffers[bandKey];
    const meter = bandControls[bandKey].meter;
    const specification = audioGraph.specifications[bandKey];

    if (!analyser || !buffer) {
      return;
    }

    const levelDb = calculateRmsDb(analyser, buffer);
    const meterPercent = dbToMeterPercent(levelDb);
    meter.style.height = `${meterPercent}%`;
    meter.title =
      `${bandControls[bandKey].rangeLabel} | Nivel: ${levelDb.toFixed(1)} dB | ` +
      `f0=${specification.f0Hz} Hz | w0=${hzToRadPerSecond(specification.f0Hz).toFixed(1)} rad/s | ` +
      `Q=${specification.q}`;
  });

  animationFrameId = window.requestAnimationFrame(updateMeters);
}

function startMeterLoop() {
  if (animationFrameId !== null) {
    return;
  }

  animationFrameId = window.requestAnimationFrame(updateMeters);
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  loadSelectedFile(file);
});

audioElement.addEventListener("loadedmetadata", () => {
  const isDefaultTrack = audioElement.currentSrc.includes(encodeURIComponent(defaultAudioFileName));

  if (isDefaultTrack) {
    setStatus(`Audio por defecto listo: ${defaultAudioFileName}`);
  }
});

audioElement.addEventListener("error", () => {
  const isDefaultTrack = audioElement.currentSrc.includes(encodeURIComponent(defaultAudioFileName));

  if (isDefaultTrack) {
    setStatus(
      `No se encontro ${defaultAudioFileName} en la carpeta del proyecto. ` +
      "Puedes agregarlo o cargar otro archivo manualmente."
    );
  } else {
    setStatus("No se pudo cargar el archivo de audio seleccionado.");
  }
});

playButton.addEventListener("click", async () => {
  if (!audioElement.src) {
    setStatus("Primero carga un archivo de audio.");
    return;
  }

  ensureAudioContext();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  try {
    await audioElement.play();
    setStatus("Reproduccion activa. Ajusta los deslizadores para escuchar el efecto en tiempo real.");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo iniciar la reproduccion. Revisa el archivo cargado.");
  }
});

pauseButton.addEventListener("click", () => {
  audioElement.pause();
  setStatus("Reproduccion en pausa.");
});

restartButton.addEventListener("click", async () => {
  if (!audioElement.src) {
    setStatus("Primero carga un archivo de audio.");
    return;
  }

  ensureAudioContext();
  audioElement.currentTime = 0;

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  try {
    await audioElement.play();
    setStatus("Reproduccion reiniciada desde el inicio.");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo reiniciar la reproduccion.");
  }
});

resetGainsButton.addEventListener("click", () => {
  Object.entries(bandControls).forEach(([bandKey, control]) => {
    control.slider.value = "0";
    if (audioContext) {
      updateGain(bandKey, 0);
    } else {
      control.valueLabel.textContent = "0.0 dB";
    }
  });

  setStatus("Ganancias restablecidas a 0 dB.");
});

Object.entries(bandControls).forEach(([bandKey, control]) => {
  control.slider.addEventListener("input", (event) => {
    const gainDb = Number(event.target.value);
    control.valueLabel.textContent = `${gainDb.toFixed(1)} dB`;

    if (!audioContext) {
      return;
    }

    updateGain(bandKey, gainDb);
  });
});

audioElement.addEventListener("ended", () => {
  setStatus("La reproduccion ha terminado.");
});

loadDefaultAudioFromProjectFolder();
