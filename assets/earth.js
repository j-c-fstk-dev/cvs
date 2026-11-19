const canvas = document.querySelector('#earth');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const rotationMs = 180_000;
const frameMs = 1000 / 20;
let render;
let initialization;
let animation;
let elapsed = 0;
let previous;
let running = false;

async function prepare() {
  const texture = new Image();
  // Earth map from the three.js examples, derived from NASA Visible Earth imagery.
  texture.src = new URL('./earth-texture.webp', import.meta.url);
  await texture.decode();
  const source = document.createElement('canvas');
  const width = source.width = texture.naturalWidth;
  const height = source.height = texture.naturalHeight;
  const sourceContext = source.getContext('2d', {willReadFrequently: true});
  const context = canvas.getContext('2d', {alpha: true});
  if (!sourceContext || !context) return;
  sourceContext.drawImage(texture, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, width, height).data;
  const size = canvas.width;
  const output = context.createImageData(size, size);
  const longitude = new Float32Array(size * size);
  const row = new Uint32Array(size * size);
  const lighting = new Float32Array(size * size);
  const rim = new Float32Array(size * size);
  const latitude = 22 * Math.PI / 180;
  const tilt = -12 * Math.PI / 180;

  for (let i = 0; i < size * size; i++) {
    const x = (2 * (i % size) + 1) / size - 1;
    const y = 1 - (2 * Math.floor(i / size) + 1) / size;
    const radius = Math.hypot(x, y);
    if (radius >= 1) continue;
    const z = Math.sqrt(1 - radius * radius);
    const globeX = x * Math.cos(tilt) + y * Math.sin(tilt);
    const globeY = y * Math.cos(tilt) - x * Math.sin(tilt);
    const north = globeY * Math.cos(latitude) + z * Math.sin(latitude);
    const front = z * Math.cos(latitude) - globeY * Math.sin(latitude);
    longitude[i] = width * (.55 + Math.atan2(globeX, front) / (2 * Math.PI));
    row[i] = Math.min(height - 1, Math.floor(height * (.5 - Math.asin(north) / Math.PI))) * width;
    lighting[i] = .38 + .83 * Math.max(0, -.38 * x + .55 * y + .74 * z);
    rim[i] = .42 * (1 - z) ** 4 * (.7 + .3 * y);
    output.data[i * 4 + 3] = Math.round(255 * Math.min(1, (1 - radius) * 90));
  }

  render = angle => {
    const offset = width * (1 - angle);
    const data = output.data;
    for (let i = 0; i < longitude.length; i++) {
      const target = 4 * i;
      if (!data[target + 3]) continue;
      const u = longitude[i] + offset;
      const texel = Math.floor(u);
      const fraction = u - texel;
      const a = 4 * (row[i] + texel % width);
      const b = 4 * (row[i] + (texel + 1) % width);
      const shade = lighting[i];
      const haze = rim[i];
      data[target] = (pixels[a] + (pixels[b] - pixels[a]) * fraction) * shade + 55 * haze;
      data[target + 1] = (pixels[a + 1] + (pixels[b + 1] - pixels[a + 1]) * fraction) * shade + 150 * haze;
      data[target + 2] = (pixels[a + 2] + (pixels[b + 2] - pixels[a + 2]) * fraction) * shade + 255 * haze;
    }
    context.putImageData(output, 0, 0);
  };
}

function tick(now) {
  if (previous === undefined || now - previous >= frameMs) {
    if (previous !== undefined) elapsed = (elapsed + now - previous) % rotationMs;
    previous = now;
    render(elapsed / rotationMs);
    if (!canvas.hasAttribute('data-active')) {
      canvas.dataset.active = '';
      canvas.dispatchEvent(new Event('earth-ready'));
    }
  }
  animation = requestAnimationFrame(tick);
}

async function syncMotion() {
  const shouldRun = !reducedMotion.matches && !document.hidden && !canvas.hasAttribute('data-static');
  if (!shouldRun) {
    running = false;
    cancelAnimationFrame(animation);
    previous = undefined;
    if (reducedMotion.matches) delete canvas.dataset.active;
    return;
  }
  if (running) return;
  initialization ??= prepare().catch(() => {});
  await initialization;
  if (!render) {
    canvas.dispatchEvent(new Event('earth-ready'));
    return;
  }
  if (running || reducedMotion.matches || document.hidden || canvas.hasAttribute('data-static')) return;
  running = true;
  animation = requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', syncMotion);
reducedMotion.addEventListener('change', syncMotion);
void syncMotion();
