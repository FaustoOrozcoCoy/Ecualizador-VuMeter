const audioElement = document.getElementById("audio-element");
const fileInput = document.getElementById("audio-file-input");
const playButton = document.getElementById("play-button");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");
const resetGainsButton = document.getElementById("reset-gains-button");
const statusText = document.getElementById("status-text");
const spectrumCanvas = document.getElementById("spectrum-canvas");
const theoryScaleKnob = document.getElementById("theory-scale-knob");
const theoryScaleLabel = document.getElementById("theory-scale-label");
const defaultAudioFileName = "cancion.mp3";

const bandControls = {
  bass: {
    slider: document.getElementById("gain-bass"),
    familySelect: document.getElementById("family-bass"),
    orderSelect: document.getElementById("order-bass"),
    cutoffInput: document.getElementById("cutoff-bass"),
    rippleInput: document.getElementById("ripple-bass"),
    stopInput: document.getElementById("stop-bass"),
    transitionInput: document.getElementById("transition-bass"),
    advancedContainer: document.getElementById("advanced-bass"),
    valueLabel: document.getElementById("value-bass"),
    meter: document.getElementById("meter-bass"),
    rangeLabel: "20 Hz - 250 Hz"
  },
  mid: {
    slider: document.getElementById("gain-mid"),
    familySelect: document.getElementById("family-mid"),
    orderSelect: document.getElementById("order-mid"),
    lowCutInput: document.getElementById("lowcut-mid"),
    highCutInput: document.getElementById("highcut-mid"),
    rippleInput: document.getElementById("ripple-mid"),
    stopInput: document.getElementById("stop-mid"),
    transitionInput: document.getElementById("transition-mid"),
    advancedContainer: document.getElementById("advanced-mid"),
    valueLabel: document.getElementById("value-mid"),
    meter: document.getElementById("meter-mid"),
    rangeLabel: "250 Hz - 4 kHz"
  },
  treble: {
    slider: document.getElementById("gain-treble"),
    familySelect: document.getElementById("family-treble"),
    orderSelect: document.getElementById("order-treble"),
    cutoffInput: document.getElementById("cutoff-treble"),
    rippleInput: document.getElementById("ripple-treble"),
    stopInput: document.getElementById("stop-treble"),
    transitionInput: document.getElementById("transition-treble"),
    advancedContainer: document.getElementById("advanced-treble"),
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
let defaultAudioUrl = null;

const audioGraph = {
  filters: {},
  gains: {},
  analysers: {},
  buffers: {},
  specifications: bandFilterSpecifications
};

const spectrumGraph = {
  outputAnalyser: null,
  outputFrequencyData: null,
  minFrequencyHz: 20,
  maxFrequencyHz: 20000,
  leftAxisMinDb: -110,
  leftAxisMaxDb: 0,
  rightAxisMinValue: -24,
  rightAxisMaxValue: 24,
  rightAxisUnit: "dB",
  sampleCount: 320,
  theoryScaleMode: "db"
};

const familyDisplayRules = {
  simple: { showRipple: false, showStop: false, showTransition: false },
  butterworth: { showRipple: false, showStop: false, showTransition: false },
  chebyshev: { showRipple: true, showStop: false, showTransition: false },
  elliptic: { showRipple: true, showStop: true, showTransition: true }
};

function ensureAudioContext() {
  if (audioContext) {
    return;
  }

  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaElementSource(audioElement);
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.9;
  spectrumGraph.outputAnalyser = createSpectrumAnalyserNode(audioContext);
  spectrumGraph.outputFrequencyData = new Float32Array(spectrumGraph.outputAnalyser.frequencyBinCount);
  spectrumGraph.outputAnalyser.connect(audioContext.destination);

  buildBandGraph();
  masterGain.connect(spectrumGraph.outputAnalyser);
  startMeterLoop();
}

function buildBandGraph() {
  sourceNode.disconnect();
  masterGain.disconnect();
  masterGain.connect(spectrumGraph.outputAnalyser);

  Object.entries(bandFilterSpecifications).forEach(([bandKey, specification]) => {
    const designParameters = getBandDesignParameters(bandKey);
    const filterStages = createBandFilterStages(audioContext, specification, designParameters);
    const bandGainNode = createBandGainNode(audioContext);
    const bandAnalyserNode = createBandAnalyserNode(audioContext);

    let previousNode = sourceNode;

    filterStages.forEach((filterNode) => {
      previousNode.connect(filterNode);
      previousNode = filterNode;
    });

    previousNode.connect(bandGainNode);
    bandGainNode.connect(masterGain);

    // La energia se mide despues de aplicar la ganancia K de la banda.
    bandGainNode.connect(bandAnalyserNode);

    audioGraph.filters[bandKey] = filterStages;
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

function createSecondOrderFilterCascade(context, specification, topology) {
  return topology.stageQs.map((stageQ) => {
    const filterNode = createSecondOrderCanonicalFilter(context, specification);
    filterNode.Q.value = stageQ;
    return filterNode;
  });
}

function createSimpleFirstOrderStage(context, filterType, cutoffHz) {
  const sampleRate = context.sampleRate;
  const omega = 2 * Math.PI * cutoffHz;
  const tanTerm = Math.tan((omega / sampleRate) / 2);
  const denominator = 1 + tanTerm;

  if (filterType === "lowpass") {
    const b0 = tanTerm / denominator;
    const b1 = tanTerm / denominator;
    const a1 = (tanTerm - 1) / denominator;
    return context.createIIRFilter([b0, b1], [1, a1]);
  }

  const b0 = 1 / denominator;
  const b1 = -1 / denominator;
  const a1 = (tanTerm - 1) / denominator;
  return context.createIIRFilter([b0, b1], [1, a1]);
}

function createFamilyCascadeStages(context, filterType, cutoffHz, bandKey, designParameters) {
  const stageCount =
    designParameters.family === "simple"
      ? Math.max(1, designParameters.order)
      : Math.max(1, Math.floor(designParameters.order / 2));

  if (designParameters.family === "simple") {
    return Array.from({ length: stageCount }, () => createSimpleFirstOrderStage(context, filterType, cutoffHz));
  }

  const stageQs = getFamilyStageQValues(bandKey, designParameters);

  return stageQs.map((stageQ) => {
    const filterNode = context.createBiquadFilter();
    filterNode.type = filterType;
    filterNode.frequency.value = cutoffHz;
    filterNode.Q.value = stageQ;
    return filterNode;
  });
}

function createBandFilterStages(context, specification, designParameters) {
  if (designParameters.bandKey === "mid") {
    return [
      ...createFamilyCascadeStages(context, "highpass", designParameters.lowCutHz, "mid", designParameters),
      ...createFamilyCascadeStages(context, "lowpass", designParameters.highCutHz, "mid", designParameters)
    ];
  }

  return createFamilyCascadeStages(
    context,
    specification.filterType,
    designParameters.cutoffHz,
    designParameters.bandKey,
    designParameters
  );
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

function createSpectrumAnalyserNode(context) {
  const analyserNode = context.createAnalyser();
  analyserNode.fftSize = 8192;
  analyserNode.smoothingTimeConstant = 0.78;
  analyserNode.minDecibels = -110;
  analyserNode.maxDecibels = 0;
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

function getDefaultAudioUrl() {
  if (!defaultAudioUrl) {
    // new URL(...) construye una ruta absoluta correcta tanto en GitHub Pages
    // como al servir la carpeta localmente con un servidor estatico.
    defaultAudioUrl = new URL(defaultAudioFileName, window.location.href).href;
  }

  return defaultAudioUrl;
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

  // La cancion de demostracion debe estar en la misma carpeta que index.html
  // con el nombre exacto "cancion.mp3".
  audioElement.src = getDefaultAudioUrl();
  audioElement.preload = "metadata";
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

function getCurrentTheoryScaleMode() {
  return theoryScaleKnob.value === "1" ? "linear" : "db";
}

function updateTheoryScaleLabel() {
  spectrumGraph.theoryScaleMode = getCurrentTheoryScaleMode();
  theoryScaleLabel.textContent = spectrumGraph.theoryScaleMode === "linear" ? "Lineal" : "dB";
}

function getSafeFrequency(value, fallbackValue) {
  return clamp(Number(value) || fallbackValue, 20, 20000);
}

function getSafeRippleDb(value) {
  return clamp(Number(value) || 1, 0.1, 6);
}

function getSafeStopDb(value) {
  return clamp(Number(value) || 40, 20, 120);
}

function getSafeTransitionFactor(value) {
  return clamp(Number(value) || 1.8, 1.1, 10);
}

function getBandDesignParameters(bandKey) {
  const control = bandControls[bandKey];
  const family = control.familySelect.value;
  const order = Number(control.orderSelect.value);
  const rippleDb = getSafeRippleDb(control.rippleInput.value);
  const stopbandDb = getSafeStopDb(control.stopInput.value);
  const transitionFactor = getSafeTransitionFactor(control.transitionInput.value);

  if (bandKey === "mid") {
    const lowCutHz = getSafeFrequency(control.lowCutInput.value, 250);
    const highCutHz = Math.max(lowCutHz + 10, getSafeFrequency(control.highCutInput.value, 4000));

    control.lowCutInput.value = String(Math.round(lowCutHz));
    control.highCutInput.value = String(Math.round(highCutHz));

    return {
      bandKey,
      family,
      order,
      rippleDb,
      stopbandDb,
      transitionFactor,
      lowCutHz,
      highCutHz
    };
  }

  const cutoffHz = getSafeFrequency(control.cutoffInput.value, bandFilterSpecifications[bandKey].f0Hz);
  control.cutoffInput.value = String(Math.round(cutoffHz));

  return {
    bandKey,
    family,
    order,
    rippleDb,
    stopbandDb,
    transitionFactor,
    cutoffHz
  };
}

function getBaseBandQ(bandKey) {
  return bandFilterSpecifications[bandKey].q;
}

function getButterworthNormalizedStageQs(order) {
  const stageCount = Math.max(1, Math.floor(order / 2));
  const qValues = [];

  for (let stageIndex = 1; stageIndex <= stageCount; stageIndex += 1) {
    const qValue = 1 / (2 * Math.sin(((2 * stageIndex - 1) * Math.PI) / (2 * order)));
    qValues.push(qValue);
  }

  return qValues.sort((firstValue, secondValue) => firstValue - secondValue);
}

function getFamilyQScale(family) {
  if (family === "chebyshev") {
    return 1.28;
  }

  if (family === "elliptic") {
    return 1.72;
  }

  return 1;
}

function getStageQValues(bandKey, family, order) {
  const stageCount = Math.max(1, Math.floor(order / 2));
  const baseQ = getBaseBandQ(bandKey);
  const normalizedButterworth = getButterworthNormalizedStageQs(order);
  const normalizationFactor = baseQ / 0.707;

  if (family === "simple") {
    return Array.from({ length: stageCount }, () => baseQ);
  }

  return normalizedButterworth.map((normalizedQ) =>
    clamp(normalizedQ * normalizationFactor * getFamilyQScale(family), 0.35, 12)
  );
}

function getChebyshevStageQs(order, rippleDb, baseQ) {
  const epsilon = Math.sqrt(Math.pow(10, rippleDb / 10) - 1);
  const alpha = Math.asinh(1 / epsilon) / order;
  const stageQs = [];

  for (let poleIndex = 1; poleIndex <= order / 2; poleIndex += 1) {
    const theta = ((2 * poleIndex - 1) * Math.PI) / (2 * order);
    const sigma = -Math.sinh(alpha) * Math.sin(theta);
    const omega = Math.cosh(alpha) * Math.cos(theta);
    const poleRadius = Math.sqrt(sigma * sigma + omega * omega);
    const stageQ = poleRadius / (-2 * sigma);

    stageQs.push(clamp(stageQ * (baseQ / 0.707), 0.35, 18));
  }

  return stageQs;
}

function getEllipticStageQs(order, rippleDb, stopbandDb, transitionFactor, baseQ) {
  const chebyshevQs = getChebyshevStageQs(order, rippleDb, baseQ);
  const selectivityBoost = 1 + (stopbandDb / 80) + ((transitionFactor - 1.1) / 4);

  return chebyshevQs.map((stageQ) => clamp(stageQ * selectivityBoost, 0.4, 24));
}

function getFamilyStageQValues(bandKey, designParameters) {
  const baseQ = getBaseBandQ(bandKey);

  if (designParameters.family === "simple") {
    return Array.from({ length: Math.max(1, Math.floor(designParameters.order / 2)) }, () => baseQ);
  }

  if (designParameters.family === "butterworth") {
    return getStageQValues(bandKey, "butterworth", designParameters.order);
  }

  if (designParameters.family === "chebyshev") {
    return getChebyshevStageQs(designParameters.order, designParameters.rippleDb, baseQ);
  }

  return getEllipticStageQs(
    designParameters.order,
    designParameters.rippleDb,
    designParameters.stopbandDb,
    designParameters.transitionFactor,
    baseQ
  );
}

function updateFamilyParameterVisibility() {
  Object.values(bandControls).forEach((control) => {
    const rules = familyDisplayRules[control.familySelect.value];
    const labels = control.advancedContainer.querySelectorAll(".control-label");
    const inputs = control.advancedContainer.querySelectorAll(".control-input");

    labels.forEach((label) => {
      const htmlFor = label.getAttribute("for");
      const shouldShow =
        (htmlFor.includes("ripple") && rules.showRipple) ||
        (htmlFor.includes("stop") && rules.showStop) ||
        (htmlFor.includes("transition") && rules.showTransition);

      label.style.display = shouldShow ? "" : "none";
    });

    inputs.forEach((input) => {
      const shouldShow =
        (input.id.includes("ripple") && rules.showRipple) ||
        (input.id.includes("stop") && rules.showStop) ||
        (input.id.includes("transition") && rules.showTransition);

      input.style.display = shouldShow ? "" : "none";
    });
  });
}

function clamp(value, minValue, maxValue) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function frequencyToLogRatio(frequencyHz) {
  const { minFrequencyHz, maxFrequencyHz } = spectrumGraph;
  const numerator = Math.log10(frequencyHz / minFrequencyHz);
  const denominator = Math.log10(maxFrequencyHz / minFrequencyHz);
  return clamp(numerator / denominator, 0, 1);
}

function mapSpectrumDbToY(levelDb, top, bottom) {
  const ratio =
    (clamp(levelDb, spectrumGraph.leftAxisMinDb, spectrumGraph.leftAxisMaxDb) - spectrumGraph.leftAxisMinDb) /
    (spectrumGraph.leftAxisMaxDb - spectrumGraph.leftAxisMinDb);

  return bottom - ratio * (bottom - top);
}

function mapTheoryValueToY(levelValue, top, bottom) {
  const ratio =
    (clamp(levelValue, spectrumGraph.rightAxisMinValue, spectrumGraph.rightAxisMaxValue) -
      spectrumGraph.rightAxisMinValue) /
    (spectrumGraph.rightAxisMaxValue - spectrumGraph.rightAxisMinValue);

  return bottom - ratio * (bottom - top);
}

function resizeSpectrumCanvas() {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const displayWidth = spectrumCanvas.clientWidth;
  const displayHeight = spectrumCanvas.clientHeight;

  if (displayWidth === 0 || displayHeight === 0) {
    return;
  }

  const nextWidth = Math.floor(displayWidth * devicePixelRatio);
  const nextHeight = Math.floor(displayHeight * devicePixelRatio);

  if (spectrumCanvas.width !== nextWidth || spectrumCanvas.height !== nextHeight) {
    spectrumCanvas.width = nextWidth;
    spectrumCanvas.height = nextHeight;
  }
}

function getCurrentLinearBandGain(bandKey) {
  const gainNode = audioGraph.gains[bandKey];

  if (gainNode) {
    return gainNode.gain.value;
  }

  return dbToLinear(Number(bandControls[bandKey].slider.value));
}

function getTheoreticalEqualizerMagnitudeLinear(frequencyHz) {
  let totalMagnitude = 0;

  Object.keys(bandFilterSpecifications).forEach((bandKey) => {
    totalMagnitude += getBandMagnitudeResponseLinear(bandKey, frequencyHz) * getCurrentLinearBandGain(bandKey);
  });

  return totalMagnitude;
}

function getTheoreticalEqualizerMagnitudeDb(frequencyHz) {
  return 20 * Math.log10(Math.max(getTheoreticalEqualizerMagnitudeLinear(frequencyHz), 0.0001));
}

function chebyshevPolynomial(order, value) {
  if (Math.abs(value) <= 1) {
    return Math.cos(order * Math.acos(value));
  }

  return Math.cosh(order * Math.acosh(Math.abs(value)));
}

function getSimpleMagnitude(filterType, order, normalizedFrequency) {
  if (filterType === "lowpass") {
    return 1 / Math.pow(1 + normalizedFrequency * normalizedFrequency, order / 2);
  }

  return Math.pow(normalizedFrequency, order) / Math.pow(1 + normalizedFrequency * normalizedFrequency, order / 2);
}

function getButterworthMagnitude(filterType, order, normalizedFrequency) {
  if (filterType === "lowpass") {
    return 1 / Math.sqrt(1 + Math.pow(normalizedFrequency, 2 * order));
  }

  return 1 / Math.sqrt(1 + Math.pow(1 / Math.max(normalizedFrequency, 0.0001), 2 * order));
}

function getChebyshevMagnitude(filterType, order, rippleDb, normalizedFrequency) {
  const epsilon = Math.sqrt(Math.pow(10, rippleDb / 10) - 1);
  const argument = filterType === "lowpass" ? normalizedFrequency : 1 / Math.max(normalizedFrequency, 0.0001);
  const polynomialValue = chebyshevPolynomial(order, argument);
  return 1 / Math.sqrt(1 + epsilon * epsilon * polynomialValue * polynomialValue);
}

function getPseudoEllipticMagnitude(filterType, order, rippleDb, stopbandDb, transitionFactor, normalizedFrequency) {
  const chebyshevBase = getChebyshevMagnitude(filterType, order, rippleDb, normalizedFrequency);
  const effectiveFrequency = filterType === "lowpass" ? normalizedFrequency : 1 / Math.max(normalizedFrequency, 0.0001);
  const stopbandRatio = Math.max(transitionFactor, 1.1);
  const attenuationFactor = Math.pow(10, stopbandDb / 20);
  const selectivityTerm = Math.pow(effectiveFrequency / stopbandRatio, 2 * order);
  const ellipticFactor = 1 / Math.sqrt(1 + attenuationFactor * attenuationFactor * selectivityTerm);

  return chebyshevBase * ellipticFactor;
}

function getFamilyMagnitudeResponseLinear(family, filterType, order, rippleDb, stopbandDb, transitionFactor, cutoffHz, frequencyHz) {
  const normalizedFrequency = frequencyHz / cutoffHz;

  if (family === "simple") {
    return getSimpleMagnitude(filterType, order, normalizedFrequency);
  }

  if (family === "butterworth") {
    return getButterworthMagnitude(filterType, order, normalizedFrequency);
  }

  if (family === "chebyshev") {
    return getChebyshevMagnitude(filterType, order, rippleDb, normalizedFrequency);
  }

  return getPseudoEllipticMagnitude(
    filterType,
    order,
    rippleDb,
    stopbandDb,
    transitionFactor,
    normalizedFrequency
  );
}

function getBandMagnitudeResponseLinear(bandKey, frequencyHz) {
  const designParameters = getBandDesignParameters(bandKey);

  if (bandKey === "mid") {
    const highPassMagnitude = getFamilyMagnitudeResponseLinear(
      designParameters.family,
      "highpass",
      designParameters.order,
      designParameters.rippleDb,
      designParameters.stopbandDb,
      designParameters.transitionFactor,
      designParameters.lowCutHz,
      frequencyHz
    );
    const lowPassMagnitude = getFamilyMagnitudeResponseLinear(
      designParameters.family,
      "lowpass",
      designParameters.order,
      designParameters.rippleDb,
      designParameters.stopbandDb,
      designParameters.transitionFactor,
      designParameters.highCutHz,
      frequencyHz
    );

    return highPassMagnitude * lowPassMagnitude;
  }

  return getFamilyMagnitudeResponseLinear(
    designParameters.family,
    bandFilterSpecifications[bandKey].filterType,
    designParameters.order,
    designParameters.rippleDb,
    designParameters.stopbandDb,
    designParameters.transitionFactor,
    designParameters.cutoffHz,
    frequencyHz
  );
}

function buildTheorySamples() {
  const samples = [];

  for (let sampleIndex = 0; sampleIndex < spectrumGraph.sampleCount; sampleIndex += 1) {
    const ratio = sampleIndex / (spectrumGraph.sampleCount - 1);
    const frequencyHz =
      spectrumGraph.minFrequencyHz *
      Math.pow(spectrumGraph.maxFrequencyHz / spectrumGraph.minFrequencyHz, ratio);
    const magnitudeLinear = getTheoreticalEqualizerMagnitudeLinear(frequencyHz);
    const magnitudeDb = 20 * Math.log10(Math.max(magnitudeLinear, 0.0001));

    samples.push({
      ratio,
      frequencyHz,
      magnitudeLinear,
      magnitudeDb
    });
  }

  return samples;
}

function buildRightAxisTicks(minValue, maxValue, tickCount) {
  const ticks = [];
  const safeTickCount = Math.max(2, tickCount);
  const step = (maxValue - minValue) / (safeTickCount - 1);

  for (let tickIndex = 0; tickIndex < safeTickCount; tickIndex += 1) {
    ticks.push(minValue + tickIndex * step);
  }

  return ticks;
}

function updateTheoryAxisRange(theorySamples) {
  if (spectrumGraph.theoryScaleMode === "linear") {
    const maxLinear = theorySamples.reduce(
      (currentMaximum, sample) => Math.max(currentMaximum, sample.magnitudeLinear),
      1
    );

    spectrumGraph.rightAxisMinValue = 0;
    spectrumGraph.rightAxisMaxValue = Math.max(1, Math.ceil(maxLinear * 1.15 * 10) / 10);
    spectrumGraph.rightAxisUnit = "Lineal";
    return;
  }

  const minDb = theorySamples.reduce((currentMinimum, sample) => Math.min(currentMinimum, sample.magnitudeDb), 0);
  const maxDb = theorySamples.reduce((currentMaximum, sample) => Math.max(currentMaximum, sample.magnitudeDb), 0);
  const padding = 3;

  spectrumGraph.rightAxisMinValue = Math.floor((minDb - padding) / 6) * 6;
  spectrumGraph.rightAxisMaxValue = Math.ceil((maxDb + padding) / 6) * 6;

  if (spectrumGraph.rightAxisMinValue === spectrumGraph.rightAxisMaxValue) {
    spectrumGraph.rightAxisMinValue -= 6;
    spectrumGraph.rightAxisMaxValue += 6;
  }

  spectrumGraph.rightAxisUnit = "dB";
}

function drawSpectrumGrid(context, left, top, right, bottom) {
  const frequencyTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const leftAxisTicks = [-100, -80, -60, -40, -20, 0];
  const rightAxisTicks = buildRightAxisTicks(spectrumGraph.rightAxisMinValue, spectrumGraph.rightAxisMaxValue, 5);

  context.save();
  context.strokeStyle = "rgba(148, 163, 184, 0.14)";
  context.fillStyle = "rgba(148, 163, 184, 0.78)";
  context.lineWidth = 1;
  context.font = "12px Segoe UI";

  frequencyTicks.forEach((frequencyHz) => {
    const x = left + frequencyToLogRatio(frequencyHz) * (right - left);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();

    const label = frequencyHz >= 1000 ? `${frequencyHz / 1000}k` : `${frequencyHz}`;
    context.fillText(label, x - 12, bottom + 18);
  });

  leftAxisTicks.forEach((levelDb) => {
    const y = mapSpectrumDbToY(levelDb, top, bottom);
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillText(`${levelDb} dB`, left - 42, y + 4);
  });

  rightAxisTicks.forEach((levelDb) => {
    const y = mapTheoryValueToY(levelDb, top, bottom);
    const label =
      spectrumGraph.theoryScaleMode === "linear" ? levelDb.toFixed(2) : `${Math.round(levelDb)} dB`;
    context.fillText(label, right + 8, y + 4);
  });

  context.fillStyle = "rgba(226, 232, 240, 0.9)";
  context.fillText("Frecuencia (Hz)", left + (right - left) / 2 - 40, bottom + 38);
  context.save();
  context.translate(18, top + (bottom - top) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText("Espectro de salida", -48, 0);
  context.restore();

  context.save();
  context.translate(right + 44, top + (bottom - top) / 2);
  context.rotate(Math.PI / 2);
  context.fillText(`Respuesta teorica (${spectrumGraph.rightAxisUnit})`, -86, 0);
  context.restore();
  context.restore();
}

function drawOutputSpectrum(context, left, top, right, bottom) {
  const analyser = spectrumGraph.outputAnalyser;
  const frequencyData = spectrumGraph.outputFrequencyData;

  if (!analyser || !frequencyData) {
    return;
  }

  analyser.getFloatFrequencyData(frequencyData);

  context.save();
  context.strokeStyle = "#38bdf8";
  context.lineWidth = 2;
  context.beginPath();

  let started = false;
  const nyquistFrequency = audioContext.sampleRate / 2;

  for (let index = 0; index < frequencyData.length; index += 1) {
    const frequencyHz = (index * nyquistFrequency) / frequencyData.length;

    if (frequencyHz < spectrumGraph.minFrequencyHz || frequencyHz > spectrumGraph.maxFrequencyHz) {
      continue;
    }

    const x = left + frequencyToLogRatio(frequencyHz) * (right - left);
    const y = mapSpectrumDbToY(frequencyData[index], top, bottom);

    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
  context.restore();
}

function drawTheoreticalEqualizerResponse(context, left, top, right, bottom, theorySamples) {
  context.save();
  context.strokeStyle = "#fb923c";
  context.lineWidth = 2;
  context.beginPath();

  theorySamples.forEach((sample, sampleIndex) => {
    const x = left + sample.ratio * (right - left);
    const responseValue = spectrumGraph.theoryScaleMode === "linear" ? sample.magnitudeLinear : sample.magnitudeDb;
    const y = mapTheoryValueToY(responseValue, top, bottom);

    if (sampleIndex === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });

  context.stroke();
  context.restore();
}

function drawSpectrumGraph() {
  resizeSpectrumCanvas();

  const context = spectrumCanvas.getContext("2d");
  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = spectrumCanvas.width / devicePixelRatio;
  const height = spectrumCanvas.height / devicePixelRatio;

  if (width === 0 || height === 0) {
    return;
  }

  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  const chartArea = {
    left: 56,
    top: 20,
    right: width - 64,
    bottom: height - 44
  };
  const theorySamples = buildTheorySamples();

  updateTheoryScaleLabel();
  updateTheoryAxisRange(theorySamples);

  context.fillStyle = "rgba(15, 23, 42, 0.85)";
  context.fillRect(0, 0, width, height);

  drawSpectrumGrid(context, chartArea.left, chartArea.top, chartArea.right, chartArea.bottom);
  drawOutputSpectrum(context, chartArea.left, chartArea.top, chartArea.right, chartArea.bottom);
  drawTheoreticalEqualizerResponse(
    context,
    chartArea.left,
    chartArea.top,
    chartArea.right,
    chartArea.bottom,
    theorySamples
  );
}

function updateMeters() {
  Object.keys(bandControls).forEach((bandKey) => {
    const analyser = audioGraph.analysers[bandKey];
    const buffer = audioGraph.buffers[bandKey];
    const meter = bandControls[bandKey].meter;
    const designParameters = getBandDesignParameters(bandKey);

    if (!analyser || !buffer) {
      return;
    }

    const levelDb = calculateRmsDb(analyser, buffer);
    const meterPercent = dbToMeterPercent(levelDb);
    meter.style.height = `${meterPercent}%`;
    meter.title = `${bandControls[bandKey].rangeLabel} | Nivel: ${levelDb.toFixed(1)} dB | ` +
      `${designParameters.family} | orden ${designParameters.order}`;
  });

  drawSpectrumGraph();
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
  const isDefaultTrack = audioElement.currentSrc.toLowerCase().includes(defaultAudioFileName.toLowerCase());

  if (isDefaultTrack) {
    setStatus(`Audio por defecto listo: ${defaultAudioFileName}`);
  }
});

audioElement.addEventListener("error", () => {
  const isDefaultTrack = audioElement.currentSrc.toLowerCase().includes(defaultAudioFileName.toLowerCase());

  if (isDefaultTrack) {
    setStatus(
      `No se encontro ${defaultAudioFileName} en la carpeta del proyecto. ` +
      "El nombre debe coincidir exactamente y en GitHub Pages tambien importan mayusculas, minusculas y extension."
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

  drawSpectrumGraph();
  setStatus("Ganancias restablecidas a 0 dB.");
});

Object.entries(bandControls).forEach(([bandKey, control]) => {
  control.slider.addEventListener("input", (event) => {
    const gainDb = Number(event.target.value);
    control.valueLabel.textContent = `${gainDb.toFixed(1)} dB`;

    if (!audioContext) {
      drawSpectrumGraph();
      return;
    }

    updateGain(bandKey, gainDb);
    drawSpectrumGraph();
  });

  control.familySelect.addEventListener("change", () => {
    updateFamilyParameterVisibility();
    if (audioContext) {
      buildBandGraph();
    }

    drawSpectrumGraph();
  });

  control.orderSelect.addEventListener("change", () => {
    if (audioContext) {
      buildBandGraph();
    }

    drawSpectrumGraph();
  });

  [
    control.cutoffInput,
    control.lowCutInput,
    control.highCutInput,
    control.rippleInput,
    control.stopInput,
    control.transitionInput
  ]
    .filter(Boolean)
    .forEach((inputElement) => {
      inputElement.addEventListener("input", () => {
        if (audioContext) {
          buildBandGraph();
        }

        drawSpectrumGraph();
      });
    });
});

audioElement.addEventListener("ended", () => {
  setStatus("La reproduccion ha terminado.");
});

theoryScaleKnob.addEventListener("input", () => {
  updateTheoryScaleLabel();
  drawSpectrumGraph();
});

window.addEventListener("resize", drawSpectrumGraph);

loadDefaultAudioFromProjectFolder();
updateFamilyParameterVisibility();
updateTheoryScaleLabel();
drawSpectrumGraph();
