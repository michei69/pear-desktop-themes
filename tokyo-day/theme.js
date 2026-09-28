const ALBUM_SELECTORS = [
  '.middle-controls .thumbnail-image-wrapper img',
  'ytmusic-player-bar .thumbnail-image-wrapper img',
  '#song-image img#img',
];

const SAMPLE_SIZE = 32;

const toHex = (value) => value.toString(16).padStart(2, '0');

/** [hue 0-360, saturation 0-1, lightness 0-1] */
const rgbToHsl = (red, green, blue) => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, lightness];

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;

  return [hue * 360, saturation, lightness];
};

/** Groups the pixels into coarse colour buckets, most common first. */
const quantize = (pixels) => {
  const buckets = new Map();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (pixels[i + 3] < 128) continue;

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map((bucket) => {
      const r = Math.round(bucket.r / bucket.count);
      const g = Math.round(bucket.g / bucket.count);
      const b = Math.round(bucket.b / bucket.count);
      return {
        hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
        hsl: rgbToHsl(r, g, b),
        count: bucket.count,
      };
    });
};

/** Reads the artwork through a fresh <img>, so the canvas stays untainted. */
const sample = (src) =>
  new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        resolve(quantize(data));
      } catch {
        // A cross-origin image taints the canvas; the palette fallbacks stay.
        resolve([]);
      }
    };
    image.onerror = () => resolve([]);
    image.src = src;
  });

const albumImage = () => {
  for (const selector of ALBUM_SELECTORS) {
    const image = document.querySelector(selector);
    if (image && image.src) return image;
  }
  return null;
};

/**
 * The most common colour that is not near-black, near-white or grey, which is
 * where the dominant colour lands for most artwork.
 */
const dominant = (colours) =>
  colours.find(
    (colour) =>
      colour.hsl[1] >= 0.15 && colour.hsl[2] > 0.05 && colour.hsl[2] < 0.95,
  ) || colours[0];

module.exports = {
  mount() {
    const style = document.createElement('style');
    style.id = 'tokyo-album-accent';
    document.head.appendChild(style);

    let colours = [];
    let source = '';
    let painted = '';

    const paint = (vars) => {
      const css = `:root{${Object.entries(vars)
        .map(([key, value]) => `${key}:${value};`)
        .join('')}}`;
      if (css === painted) return;
      painted = css;
      style.textContent = css;
    };

    /** Read a palette variable as the user sees it under Settings > Appearance. */
    const read = (key, fallback) => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue(`--pear-theme-${key}`)
        .trim();
      return value === '' ? fallback : value;
    };

    const num = (key, fallback) => {
      const value = Number.parseFloat(read(key, String(fallback)));
      return Number.isFinite(value) ? value : fallback;
    };

    const update = () => {
      const image = albumImage();
      const src = image ? image.currentSrc || image.src : '';
      if (src && src !== source) {
        source = src;
        sample(src).then((result) => {
          colours = result;
          render();
        });
      }
      render();
    };

    const render = () => {
      // Nothing sampled yet (or the artwork is cross-origin): the
      // stylesheet's own fallbacks stay in charge.
      if (!colours.length) return;

      const dom = dominant(colours);
      const hue = Math.round(dom.hsl[0]);
      // Drop the colour entirely when the artwork is near-black.
      const chroma = dom
        ? dom.hsl[2] < 0.1
          ? 0
          : Math.round(dom.hsl[1] * 100 * num('saturation', 0.8))
        : 0;

      // Detect light theme (Day variant): skip album tint if background is light
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--pear-theme-background')
        .trim();
      const isLight = /^#[0-9a-f]{6}$/i.test(bg) &&
        (parseInt(bg.slice(1, 3), 16) * 0.2126 +
         parseInt(bg.slice(3, 5), 16) * 0.7152 +
         parseInt(bg.slice(5, 7), 16) * 0.0722) / 255 > 0.6;

      if (isLight) return; // keep Day's own blue accent

      // Yellows and greens read brighter than blues at the same lightness,
      // so damp them slightly.
      const curve = hue > 35 && hue < 185 ? 0.6 : 1;
      const light = (key, fallback) => Math.round(num(key, fallback) * curve);

      paint({
        '--pear-theme-accent': `hsl(${hue}, ${chroma}%, ${light('lightness-accent', 55)}%)`,
        '--pear-theme-accent-light': `hsl(${hue}, ${chroma}%, ${Math.min(85, light('lightness-accent', 55) + 25)}%)`,
      });
    };

    const timer = setInterval(update, 1000);
    update();

    return () => {
      clearInterval(timer);
      style.remove();
    };
  },
  unmount() {},
};
