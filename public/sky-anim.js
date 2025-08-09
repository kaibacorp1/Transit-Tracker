// sky-anim.js — minimal camera-aware sky preview (Alt/Az frame)

(function () {
  const TAU = Math.PI * 2;

  // Camera state
  const camera = {
    centerAz: 0,       // deg
    centerAlt: 0,      // deg
    fovDeg: 20,        // horizontal FOV in degrees
    rollDeg: 0,        // deg
    followBody: true,  // auto-center on sun/moon
    useCompass: false,
  };

  // Live body state for follow mode
  let bodyState = {
    az: 0, // deg
    alt: 0 // deg
  };

  // Data to draw (latest snapshot)
  let snapshot = {
    planes: [],         // [{az, alt, callsign}]
    marginDeg: 2.5,     // your detection margin
    selectedBody: 'sun' // 'sun' or 'moon'
  };

  // Rendering
  let canvas, ctx, rafId;
  let userLat = 0, userLon = 0, userElev = 0;

  // ------------- Helpers

  function toRad(d) { return d * Math.PI / 180; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function wrap180(d) {
    return ((d + 540) % 360) - 180; // -180..+180
  }

  // Map Alt/Az to canvas XY in equirectangular near center
  function azAltToXY(azDeg, altDeg, w, h) {
    const dAz  = wrap180(azDeg - camera.centerAz);
    const dAlt = (altDeg - camera.centerAlt);

    const halfFov = camera.fovDeg / 2;
    // use width for both to keep degrees “square”
    const px = (dAz  / halfFov) * (w / 2);
    const py = (-dAlt / halfFov) * (w / 2);

    // roll
    const r = toRad(camera.rollDeg);
    const xr =  px * Math.cos(r) - py * Math.sin(r);
    const yr =  px * Math.sin(r) + py * Math.cos(r);

    // center
    return { x: w / 2 + xr, y: h / 2 + yr };
  }

  function drawDisc(x, y, r, fill, stroke, sw = 1) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = sw;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function drawText(x, y, text, color = '#fff', align = 'center') {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  // ------------- Compass / device orientation (optional)
  let hasRequestedPerm = false;

  function enableCompass() {
    camera.useCompass = true;
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function' &&
        !hasRequestedPerm) {
      hasRequestedPerm = true;
      DeviceOrientationEvent.requestPermission()
        .catch(() => {})
        .finally(() => {});
    }
  }

  window.addEventListener('deviceorientation', (e) => {
    if (!camera.useCompass) return;
    // iOS provides webkitCompassHeading (0 = North, increases CW)
    const iosHeading = e.webkitCompassHeading;
    const alpha = e.alpha; // 0..360 (Android), relative to some reference
    if (typeof iosHeading === 'number') {
      camera.centerAz = iosHeading; // already compass heading
    } else if (typeof alpha === 'number') {
      // crude fallback: assume alpha ~ compass heading
      camera.centerAz = (360 - alpha) % 360; // make it CW from North
    }
    // Use pitch to approximate look-altitude (beta: -180..180, phone tilt)
    // Keep small to avoid wild jumps.
    if (typeof e.beta === 'number') {
      camera.centerAlt = clamp(camera.centerAlt + (e.beta * 0.02), -30, 80);
    }
    // roll for screen rotation (gamma)
    if (typeof e.gamma === 'number') {
      camera.rollDeg = clamp(e.gamma, -30, 30);
    }
  });

  // ------------- Public API

  function init(opts = {}) {
    const cId = opts.canvasId || 'skyAnim';
    canvas = document.getElementById(cId);
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false });
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';

    // Hook UI if present
    const followEl = document.getElementById('camFollowBody');
    const fovEl    = document.getElementById('camFov');
    const fovValEl = document.getElementById('camFovVal');
    const cmpEl    = document.getElementById('camUseCompass');
    const permBtn  = document.getElementById('camCompassPerm');

    if (followEl) {
      followEl.checked = camera.followBody;
      followEl.addEventListener('change', () => {
        camera.followBody = followEl.checked;
      });
    }
    if (fovEl) {
      camera.fovDeg = parseFloat(fovEl.value) || 20;
      if (fovValEl) fovValEl.textContent = `${camera.fovDeg}°`;
      fovEl.addEventListener('input', () => {
        camera.fovDeg = parseFloat(fovEl.value) || 20;
        if (fovValEl) fovValEl.textContent = `${camera.fovDeg}°`;
      });
    }
    if (cmpEl) {
      cmpEl.addEventListener('change', () => {
        camera.useCompass = cmpEl.checked;
        if (camera.useCompass && permBtn) {
          permBtn.style.display = (typeof DeviceOrientationEvent !== 'undefined' &&
                                   typeof DeviceOrientationEvent.requestPermission === 'function')
                                   ? 'inline-block' : 'none';
        } else if (permBtn) {
          permBtn.style.display = 'none';
        }
      });
    }
    if (permBtn) {
      permBtn.addEventListener('click', enableCompass);
    }

    loop();
  }

  // Call this on each app tick with fresh data
  function update(data) {
    // Required: user location & body Alt/Az
    userLat = data.userLat;
    userLon = data.userLon;
    userElev = data.userElev || 0;

    snapshot.selectedBody = data.selectedBody || 'sun';
    snapshot.marginDeg = (typeof data.marginDeg === 'number') ? data.marginDeg : 2.5;

    // Planes: [{az,alt,callsign}], already computed by your app
    snapshot.planes = Array.isArray(data.planes) ? data.planes.slice(0, 30) : [];

    // Body Alt/Az drives follow mode
    if (typeof data.bodyAz === 'number' && typeof data.bodyAlt === 'number') {
      bodyState.az = (data.bodyAz + 360) % 360;
      bodyState.alt = data.bodyAlt;
    }
  }

  // ------------- Draw

  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Follow mode centers camera on the body
    if (camera.followBody) {
      camera.centerAz  = bodyState.az;
      camera.centerAlt = bodyState.alt;
      // roll stays whatever user has set (usually 0)
    }

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Stars/horizon (optional): skip for now to keep it clean

    // Draw body disc (fixed size for preview)
    const bodyXY = azAltToXY(bodyState.az, bodyState.alt, w, h);
    const bodyR  = Math.max(4, (w * 0.018)); // small disc; not to scale
    const bodyFill = snapshot.selectedBody === 'sun' ? '#ffcc33' : '#9fd0ff';
    drawDisc(bodyXY.x, bodyXY.y, bodyR, bodyFill, '#222', 1);

    // Draw margin ring (your detection margin)
    const halfFov = camera.fovDeg / 2;
    const pxPerDeg = (w / 2) / halfFov;
    const ringR = snapshot.marginDeg * pxPerDeg;
    ctx.setLineDash([4, 3]);
    drawDisc(bodyXY.x, bodyXY.y, ringR, null, '#555', 1);
    ctx.setLineDash([]);

    // Draw planes
    snapshot.planes.forEach(p => {
      const xy = azAltToXY(p.az, p.alt, w, h);
      drawDisc(xy.x, xy.y, 3, '#fff', null, 0);
      if (p.callsign) {
        drawText(xy.x + 8, xy.y, p.callsign, '#bbb', 'left');
      }
    });

    // Overlay HUD text (FOV/center)
    ctx.fillStyle = '#8d8d8d';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${snapshot.selectedBody.toUpperCase()}  •  Center ${camera.centerAz.toFixed(1)}°/${camera.centerAlt.toFixed(1)}°  •  FOV ${camera.fovDeg}°`, 8, 6);
  }

  // Expose
  window.SkyAnim = {
    init,
    update
  };
})();
