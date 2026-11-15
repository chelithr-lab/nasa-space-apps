// Destinations inside the assembled Serenity site (see tools/build-site.mjs).
const destinations = { lunar: './explorer/', mission: './missions/', payload: './payloads/' };

for (const button of document.querySelectorAll('[data-destination]')) {
  const url = destinations[button.dataset.destination];
  if (url) {
    const link = document.createElement('a');
    link.className = button.className;
    link.href = url;
    link.append(...button.childNodes);
    button.replaceWith(link);
  } else {
    button.addEventListener('click', () => {
      button.nextElementSibling.textContent = 'The destination link will be added here.';
    });
  }
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motionToggle = document.querySelector('.motion-toggle');
let motionEnabled = !reducedMotion.matches;
const topics = {
  horizon: ['A crater rim can block low-angle sunlight. Serenity checks whether the Sun’s centre, part of its disk, or the entire disk clears the local skyline.', 'Selected site'],
  earth: ['Check whether any part of Earth clears the terrain skyline. Geometric visibility helps assess a possible link. Radio performance also depends on antennas and ground stations.', 'Earth line of sight'],
  polar: ['Compare visibility at 49 sampled locations on an approximately 4 km grid, and replay how the results change with the shared simulation clock.', 'Polar sample grid'],
  departure: ['The journey begins near Earth. The next step depends on the spacecraft’s destination and mission profile.', ''],
  transfer: ['During the transfer, spacecraft can adjust course on the way to the Moon. The exact trajectory depends on the mission design.', ''],
  arrival: ['An arriving mission might enter lunar orbit, land on the surface, or fly past it. Each objective calls for a different approach.', ''],
  imaging: ['A camera can study terrain, recognise features, and document what happens around a lander.', 'Optical sensor'],
  power: ['A solar array produces electricity from incoming light. Available power depends on illumination and how the array is oriented.', 'Solar array'],
  radio: ['A radio technology demonstration can test how an instrument sends data. A working Earth link still depends on antenna, geometry, and receiving conditions.', 'Antenna'],
};

const mission = document.querySelector('.mission-scene');
const canvas = mission?.querySelector('canvas');
const pathContext = canvas?.getContext('2d');
const flightStops = { departure: .13, transfer: .53, arrival: .94 };
let progress = flightStops.departure;
let flightTarget = progress;
let flightFrame = 0;
let previousFrame = 0;
let flightTime = 0;
let missionVisible = false;

function drawFlight() {
  if (!pathContext) return;
  const {width, height} = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const scale = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  }
  pathContext.setTransform(scale, 0, 0, scale, 0, 0);
  pathContext.clearRect(0, 0, width, height);
  const narrow = width <= 800;
  const route = narrow
    ? [[.21,.69],[.35,.15],[.62,.13],[.72,.27]]
    : [[.12,.66],[.19,.17],[.32,.12],[.40,.28]];
  const point = (t) => route[0].map((_, axis) => (
    (1-t)**3 * route[0][axis] + 3*(1-t)**2*t*route[1][axis]
    + 3*(1-t)*t*t*route[2][axis] + t**3 * route[3][axis]
  ) * (axis === 0 ? width : height));
  const drawPath = (limit, colour, lineWidth, dash = []) => {
    pathContext.beginPath();
    pathContext.moveTo(...point(0));
    for (let step = 1; step <= 90; step++) pathContext.lineTo(...point(limit*step/90));
    pathContext.strokeStyle = colour;
    pathContext.lineWidth = lineWidth;
    pathContext.setLineDash(dash);
    pathContext.stroke();
  };
  drawPath(1, '#a4c8e37f', 1, [4, 6]);
  const lit = pathContext.createLinearGradient(...point(0), ...point(Math.max(.05, progress)));
  lit.addColorStop(0, '#8ebcf430');
  lit.addColorStop(1, '#d4e9ff');
  drawPath(progress, lit, 1.75);
  for (const stop of Object.values(flightStops)) {
    pathContext.beginPath();
    pathContext.arc(...point(stop), 4, 0, 2*Math.PI);
    pathContext.fillStyle = stop <= progress ? '#d4e9ff' : '#6c91bc';
    pathContext.fill();
  }
  pathContext.save();
  pathContext.shadowColor = '#90beff';
  pathContext.shadowBlur = 17;
  pathContext.beginPath();
  pathContext.arc(...point(progress), 6, 0, 2*Math.PI);
  pathContext.fillStyle = '#f1f7ff';
  pathContext.fill();
  pathContext.restore();

  // The moving light travels independently of the selected flight stage.
  const cycle = (flightTime % 7800) / 7800;
  const signal = .07 + cycle * .87;
  pathContext.save();
  pathContext.globalAlpha = Math.min(cycle * 9, (1 - cycle) * 8, 1);
  const tail = Math.max(.05, signal - .12);
  const trail = pathContext.createLinearGradient(...point(tail), ...point(signal));
  trail.addColorStop(0, '#abd4ff00');
  trail.addColorStop(1, '#a6d6ff');
  pathContext.beginPath();
  pathContext.setLineDash([]);
  pathContext.moveTo(...point(tail));
  for (let step = 1; step <= 16; step++) {
    pathContext.lineTo(...point(tail + (signal - tail) * step / 16));
  }
  pathContext.strokeStyle = trail;
  pathContext.lineWidth = 2;
  pathContext.stroke();
  pathContext.shadowColor = '#95c9ff';
  pathContext.shadowBlur = 16;
  pathContext.beginPath();
  pathContext.arc(...point(signal), 3.5, 0, 2 * Math.PI);
  pathContext.fillStyle = '#bce0ff';
  pathContext.fill();
  pathContext.restore();
}

function tickFlight(now) {
  const elapsed = previousFrame ? Math.min(now - previousFrame, 48) : 0;
  previousFrame = now;
  flightTime += elapsed;
  progress += (flightTarget - progress) * (1 - Math.exp(-elapsed / 270));
  drawFlight();
  flightFrame = requestAnimationFrame(tickFlight);
}

function updateFlightMotion() {
  if (motionEnabled && missionVisible && pathContext) {
    if (!flightFrame) flightFrame = requestAnimationFrame(tickFlight);
  } else if (flightFrame) {
    cancelAnimationFrame(flightFrame);
    flightFrame = 0;
    previousFrame = 0;
  }
}

function selectFlightStage(target) {
  flightTarget = target;
  if (!motionEnabled || !missionVisible) {
    progress = target;
    drawFlight();
  }
}

function setMotion(enabled) {
  motionEnabled = enabled;
  document.documentElement.dataset.motion = enabled ? 'running' : 'paused';
  if (motionToggle) motionToggle.textContent = enabled ? 'Pause motion' : 'Play motion';
  updateFlightMotion();
  if (!enabled) selectFlightStage(flightTarget);
}

if (canvas) {
  drawFlight();
  if ('ResizeObserver' in window) new ResizeObserver(drawFlight).observe(canvas);
  else window.addEventListener('resize', drawFlight);
}

const scenes = document.querySelectorAll('.scene');

for (const scene of scenes) {
  const controls = scene.querySelectorAll('[data-option]');
  const details = scene.querySelector('.scene-detail');
  const tag = scene.querySelector('.lunar-selection span, .instrument-tag span');
  for (const button of controls) {
    button.addEventListener('click', () => {
      const key = button.dataset.option;
      const [message, label] = topics[key];
      if (key === scene.dataset.view) return;
      scene.dataset.view = key;
      for (const control of controls) control.setAttribute('aria-pressed', String(control === button));
      details.textContent = message;
      if (tag) tag.textContent = label;
      if (scene === mission) selectFlightStage(flightStops[key]);
    });
  }
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const visible = entry.isIntersecting;
      entry.target.classList.toggle('on-screen', visible);
      if (visible) entry.target.classList.add('in-view');
      if (entry.target === mission) {
        missionVisible = visible;
        updateFlightMotion();
      }
    }
  });
  for (const scene of scenes) observer.observe(scene);
} else {
  for (const scene of scenes) scene.classList.add('on-screen', 'in-view');
  missionVisible = Boolean(mission);
}

setMotion(motionEnabled);
if (motionToggle) {
  motionToggle.hidden = false;
  motionToggle.addEventListener('click', () => setMotion(!motionEnabled));
}
reducedMotion.addEventListener?.('change', (event) => setMotion(!event.matches));

const moon = document.querySelector('.moon-scene');
const hero = document.querySelector('.hero');
if (moon && hero && matchMedia('(pointer: fine)').matches) {
  hero.addEventListener('pointermove', (event) => {
    if (!motionEnabled) return;
    const bounds = hero.getBoundingClientRect();
    moon.style.setProperty('--move-x', `${((event.clientX - bounds.left) / bounds.width - .5) * 13}px`);
    moon.style.setProperty('--move-y', `${((event.clientY - bounds.top) / bounds.height - .5) * 10}px`);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    moon.style.removeProperty('--move-x');
    moon.style.removeProperty('--move-y');
  });
}
