/*
 * DG-0C3.3B issued-basemap print bridge.
 *
 * Chrome's PDF path has proved unreliable when a large composed PNG is nested
 * back inside the issued SVG as an <image>.  The production compositor already
 * creates the correct fixed-extent canvas before calling toDataURL().  This
 * bridge captures that exact canvas synchronously, places a real HTML canvas
 * directly beneath the transparent professional SVG, and leaves the existing
 * SVG vectors/title/legend untouched.
 *
 * No projection, tile selection or professional source geometry is changed.
 */
(function installIssuedCanvasBridge() {
  'use strict';

  const nativeToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const MAP_ID = 'sheetMap';
  const CANVAS_CLASS = 'issued-basemap-canvas';

  function drawingMap() {
    return document.getElementById(MAP_ID);
  }

  function drawingSvg(map) {
    return map?.querySelector('#drawingSvg') || null;
  }

  function topLevelBackground(svg) {
    return [...svg.children].find(child => child.tagName?.toLowerCase() === 'rect') || null;
  }

  function applyAppearance(canvas, svg) {
    canvas.style.opacity = svg.dataset.basemapEmphasis === 'faded' ? '0.8' : '1';
    canvas.style.filter = svg.dataset.basemapColour === 'greyscale' ? 'grayscale(1)' : 'none';
  }

  function installCanvas(sourceCanvas) {
    const map = drawingMap();
    const svg = drawingSvg(map);
    const svgBasemap = svg?.querySelector('.rendered-osm-basemap');
    if (!map || !svg || !svgBasemap) return false;

    const canvas = document.createElement('canvas');
    canvas.className = CANVAS_CLASS;
    canvas.dataset.basemapCanvas = 'true';
    canvas.setAttribute('aria-label', 'Rendered OpenStreetMap issued basemap');
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Issued basemap canvas context is unavailable.');
    context.drawImage(sourceCanvas, 0, 0);

    Object.assign(map.style, {
      position: 'relative',
      overflow: 'hidden',
      background: '#f7f7f3'
    });
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      zIndex: '1',
      pointerEvents: 'none'
    });
    Object.assign(svg.style, {
      position: 'relative',
      display: 'block',
      width: '100%',
      height: '100%',
      zIndex: '2'
    });

    // The SVG's neutral paper-colour rectangle previously sat above the new
    // HTML canvas. Make only that top-level background transparent; all
    // professional vectors, labels, north arrow, scale and borders remain SVG.
    const background = topLevelBackground(svg);
    if (background) background.setAttribute('fill', 'none');

    // Keep the composed SVG image in the DOM for diagnostics/tests but do not
    // ask Chrome PDF to paint it. The real HTML canvas is the issued raster.
    svgBasemap.style.visibility = 'hidden';

    map.querySelector(`.${CANVAS_CLASS}`)?.remove();
    map.prepend(canvas);
    applyAppearance(canvas, svg);
    map.dataset.basemapCanvasReady = 'true';
    return true;
  }

  HTMLCanvasElement.prototype.toDataURL = function issuedBasemapToDataURL(...args) {
    const value = nativeToDataURL.apply(this, args);
    const map = drawingMap();
    const svg = drawingSvg(map);
    const isIssuedBasemap = Boolean(
      map && svg && svg.querySelector('.rendered-osm-basemap')
      && this.width >= 1000 && this.height >= 500
      && (!args[0] || String(args[0]).toLowerCase() === 'image/png')
    );
    if (isIssuedBasemap && !installCanvas(this)) {
      throw new Error('Issued basemap canvas could not be installed for print.');
    }
    return value;
  };

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#printDrawing');
    if (!button) return;
    const map = drawingMap();
    if (map?.dataset.basemapCanvasReady === 'true') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.getElementById('drawingStatus');
    if (status) {
      status.textContent = 'BASEMAP INCOMPLETE — PRINT BLOCKED. Issued canvas is not ready.';
      status.className = 'status-message error';
    }
  }, true);
})();
