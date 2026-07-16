document.addEventListener('DOMContentLoaded', () => {
  // ----------------------------------------------------
  // 1. Lenis Smooth Scroll Setup
  // ----------------------------------------------------
  const lenis = new Lenis({
    duration: 1.5,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 1.5,
    infinite: false,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Smooth scroll links (on-page section jumps)
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetSection = document.querySelector(targetId);
      if (targetSection) {
        lenis.scrollTo(targetSection, { duration: 1.6 });
      }
    });
  });

  // Active navigation highlights based on scroll intersection
  const navLinks = document.querySelectorAll('.nav-links a');
  const sections = document.querySelectorAll('.story-section');
  const navObserverOptions = {
    root: null,
    rootMargin: '-30% 0px -40% 0px',
    threshold: 0
  };

  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, navObserverOptions);

  sections.forEach(section => navObserver.observe(section));

  // ----------------------------------------------------
  // 2. Canvas Frame Extraction Sequence (Optimized Lazy Loading)
  // ----------------------------------------------------
  const canvas = document.getElementById('video-canvas');
  const ctx = canvas.getContext('2d');
  const loader = document.getElementById('loader');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  const totalFrames = 60; // Sample at ~15fps (cut from 120) for 50% CPU/memory reduction
  const frames = new Array(totalFrames).fill(null);
  let metadataLoaded = false;
  let canvasWidth = 0;
  let canvasHeight = 0;

  // Static poster configuration
  const posterImg = new Image();
  let posterLoaded = false;
  posterImg.src = 'frame_start.jpg';

  function startAppImmediately() {
    if (loader && !loader.classList.contains('fade-out')) {
      loader.classList.add('fade-out');
      updateTelemetry();
      triggerInitialAnimations();
    }
  }

  posterImg.onload = () => {
    posterLoaded = true;
    resizeCanvas();
    startAppImmediately();
  };
  posterImg.onerror = () => {
    startAppImmediately();
  };
  // 1-second fallback safety net to guarantee page is never stuck
  setTimeout(startAppImmediately, 1000);

  function resizeCanvas() {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    drawFrameToCanvas(currentFrameIndex());
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function drawSourceToCanvas(source) {
    if (!source) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const sourceRatio = source.width / source.height;
    const canvasRatio = canvasWidth / canvasHeight;

    let sWidth, sHeight, sx, sy;

    if (canvasRatio > sourceRatio) {
      sWidth = source.width;
      sHeight = source.width / canvasRatio;
      sx = 0;
      sy = (source.height - sHeight) / 2;
    } else {
      sHeight = source.height;
      sWidth = source.height * canvasRatio;
      sx = (source.width - sWidth) / 2;
      sy = 0;
    }

    ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, canvasWidth, canvasHeight);
  }

  function drawFrameToCanvas(index) {
    if (document.body.classList.contains('canvas-failed')) return;

    const frame = frames[index];
    if (frame) {
      drawSourceToCanvas(frame);
    } else {
      // Find the nearest loaded frame, or fallback to the poster image
      let nearestFrame = null;
      let minDistance = Infinity;
      for (let i = 0; i < totalFrames; i++) {
        if (frames[i]) {
          const dist = Math.abs(i - index);
          if (dist < minDistance) {
            minDistance = dist;
            nearestFrame = frames[i];
          }
        }
      }
      if (nearestFrame) {
        drawSourceToCanvas(nearestFrame);
      } else if (posterLoaded) {
        drawSourceToCanvas(posterImg);
      }
    }
  }

  function currentFrameIndex() {
    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return 0;
    
    const scrollFraction = Math.min(Math.max(scrollY / maxScroll, 0), 1);
    return Math.min(Math.floor(scrollFraction * (totalFrames - 1)), totalFrames - 1);
  }

  // Pre-load video frames setup
  const video = document.createElement('video');
  video.src = 'assets/Plane window.mp4';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const loadTimeout = setTimeout(() => {
    if (!metadataLoaded) {
      console.warn("Video loading timed out. Swapping to static background images.");
      dismissLoaderAndInitFallback();
    }
  }, 10000);

  let decodeQueue = [];
  let processingQueue = false;

  video.addEventListener('loadedmetadata', () => {
    metadataLoaded = true;
    clearTimeout(loadTimeout);
    requestDecodes(currentFrameIndex());
  });

  video.addEventListener('error', () => {
    console.error("Video failed to load.");
    dismissLoaderAndInitFallback();
  });

  function seekVideoTo(videoElement, time) {
    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        videoElement.removeEventListener('seeked', onSeeked);
        videoElement.removeEventListener('error', onError);
        resolve();
      };
      const onError = (e) => {
        videoElement.removeEventListener('seeked', onSeeked);
        videoElement.removeEventListener('error', onError);
        reject(e);
      };
      videoElement.addEventListener('seeked', onSeeked);
      videoElement.addEventListener('error', onError);
      videoElement.currentTime = time;
    });
  }

  function captureFrameFallback(videoElement) {
    const tempCanvas = document.createElement('canvas');
    const originalWidth = videoElement.videoWidth || 1920;
    const originalHeight = videoElement.videoHeight || 1080;
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    const maxDim = 1280; // Cap resolution
    
    if (originalWidth > maxDim || originalHeight > maxDim) {
      if (originalWidth > originalHeight) {
        targetWidth = maxDim;
        targetHeight = Math.round((originalHeight * maxDim) / originalWidth);
      } else {
        targetHeight = maxDim;
        targetWidth = Math.round((originalWidth * maxDim) / originalHeight);
      }
    }
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
    return tempCanvas;
  }

  function requestDecodes(centerIndex) {
    const bufferSize = 15; // look-ahead and look-behind buffer
    const requested = [];

    if (frames[centerIndex] === null) {
      requested.push(centerIndex);
    }

    for (let r = 1; r <= bufferSize; r++) {
      const nextIndex = centerIndex + r;
      const prevIndex = centerIndex - r;
      if (nextIndex < totalFrames && frames[nextIndex] === null) {
        requested.push(nextIndex);
      }
      if (prevIndex >= 0 && frames[prevIndex] === null) {
        requested.push(prevIndex);
      }
    }

    decodeQueue = requested;
    processQueue();
  }

  async function processQueue() {
    if (processingQueue || !metadataLoaded) return;
    processingQueue = true;

    while (decodeQueue.length > 0) {
      const nextFrameIndex = decodeQueue.shift();
      if (frames[nextFrameIndex] !== null) continue;

      const duration = video.duration;
      const timestamp = (nextFrameIndex / (totalFrames - 1)) * duration;

      try {
        await seekVideoTo(video, timestamp);
        
        let bitmap;
        if (typeof window.createImageBitmap === 'function') {
          const originalWidth = video.videoWidth || 1920;
          const originalHeight = video.videoHeight || 1080;
          let targetWidth = originalWidth;
          let targetHeight = originalHeight;
          const maxDim = 1280; // Cap resolution fed to decoder
          
          if (originalWidth > maxDim || originalHeight > maxDim) {
            if (originalWidth > originalHeight) {
              targetWidth = maxDim;
              targetHeight = Math.round((originalHeight * maxDim) / originalWidth);
            } else {
              targetHeight = maxDim;
              targetWidth = Math.round((originalWidth * maxDim) / originalHeight);
            }
          }
          bitmap = await createImageBitmap(video, {
            resizeWidth: targetWidth,
            resizeHeight: targetHeight,
            resizeQuality: 'low'
          });
        } else {
          bitmap = captureFrameFallback(video);
        }

        frames[nextFrameIndex] = bitmap;

        // If the frame we decoded is still the current active one (or nearby), render it immediately
        const currentIndex = currentFrameIndex();
        if (Math.abs(currentIndex - nextFrameIndex) <= 1) {
          drawFrameToCanvas(currentIndex);
        }
      } catch (err) {
        console.error(`Frame lazy-decoding failed for frame ${nextFrameIndex}:`, err);
      }
    }

    processingQueue = false;
  }

  function dismissLoaderAndInitFallback() {
    startAppImmediately();
    document.body.classList.add('canvas-failed');
    
    ctx.fillStyle = '#050914';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, '#0a1a30');
    gradient.addColorStop(0.5, '#15325c');
    gradient.addColorStop(1, '#050914');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    triggerInitialAnimations();
  }

  // ----------------------------------------------------
  // 3. Flight Telemetry HUD Scroll Processor
  // ----------------------------------------------------
  const hudAlt = document.getElementById('hud-alt');
  const hudVsi = document.getElementById('hud-vsi');
  const hudVsiArrow = document.getElementById('hud-vsi-arrow');
  const hudSpeed = document.getElementById('hud-speed');
  const hudState = document.getElementById('hud-state');
  const hudGps = document.getElementById('hud-gps');

  function lerp(start, end, amt) {
    return start + (end - start) * amt;
  }

  function updateTelemetry() {
    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;

    const p = Math.min(Math.max(scrollY / maxScroll, 0), 1);
    
    // GPS path interpolation (London Farnborough to Paris Le Bourget)
    const currentLat = lerp(51.5074, 48.9615, p).toFixed(4);
    const currentLng = lerp(-0.1278, 2.4414, p);
    const lngStr = currentLng >= 0 ? `${currentLng.toFixed(4)} E` : `${Math.abs(currentLng).toFixed(4)} W`;
    if (hudGps) hudGps.textContent = `${currentLat} N, ${lngStr}`;

    // Altitude profile logic based on scroll percentage (takeoff -> cruise -> land)
    let altitude = 0;
    let speed = 0.00;
    let state = "GROUND";
    let vsi = 0;

    if (p < 0.15) {
      // Departure climb
      const sectorP = p / 0.15;
      altitude = lerp(0, 12000, sectorP);
      speed = lerp(0.00, 0.40, sectorP);
      vsi = 2500;
      state = "DEPARTURE";
    } else if (p < 0.45) {
      // Climbing to Cruise
      const sectorP = (p - 0.15) / 0.30;
      altitude = lerp(12000, 41000, sectorP);
      speed = lerp(0.40, 0.82, sectorP);
      vsi = 1800;
      state = "ASCENT";
    } else if (p < 0.65) {
      // Cruising
      altitude = 41000;
      speed = 0.82;
      vsi = 0;
      state = "CRUISE";
    } else if (p < 0.90) {
      // Descending
      const sectorP = (p - 0.65) / 0.25;
      altitude = lerp(41000, 1500, sectorP);
      speed = lerp(0.82, 0.28, sectorP);
      vsi = -1600;
      state = "DESCENT";
    } else {
      // Touchdown
      const sectorP = (p - 0.90) / 0.10;
      altitude = lerp(1500, 0, sectorP);
      speed = lerp(0.28, 0.00, sectorP);
      vsi = -600;
      state = "TOUCHDOWN";
    }

    // Format display outputs
    if (hudAlt) hudAlt.textContent = Math.round(altitude).toLocaleString();
    if (hudSpeed) hudSpeed.textContent = speed.toFixed(2);
    if (hudState) hudState.textContent = state;
    
    if (hudVsi && hudVsiArrow) {
      hudVsi.textContent = vsi === 0 ? "0 FPM" : `${vsi > 0 ? '+' : ''}${vsi} FPM`;
      if (vsi > 0) {
        hudVsiArrow.style.transform = 'rotate(0deg)';
        hudVsiArrow.style.borderBottomColor = 'var(--color-accent-cyan)';
      } else if (vsi < 0) {
        hudVsiArrow.style.transform = 'rotate(180deg)';
        hudVsiArrow.style.borderBottomColor = '#ff6f6f';
      } else {
        hudVsiArrow.style.transform = 'rotate(90deg)';
        hudVsiArrow.style.borderBottomColor = 'var(--color-text-muted)';
      }
    }
  }

  window.addEventListener('scroll', () => {
    updateTelemetry();
    const index = currentFrameIndex();
    drawFrameToCanvas(index);
    requestDecodes(index);
  });

  // ----------------------------------------------------
  // 4. Parallax scroll fallback details
  // ----------------------------------------------------
  const parallaxSections = document.querySelectorAll('.story-section');
  window.addEventListener('scroll', () => {
    if (!document.body.classList.contains('canvas-failed')) return;
    
    const windowHeight = window.innerHeight;
    parallaxSections.forEach(section => {
      const bg = section.querySelector('.parallax-bg');
      if (bg) {
        const rect = section.getBoundingClientRect();
        if (rect.top < windowHeight && rect.bottom > 0) {
          const totalScrolled = windowHeight + rect.height;
          const fraction = (windowHeight - rect.top) / totalScrolled;
          const offset = (fraction - 0.5) * 15;
          bg.style.transform = `translateY(${offset}%) scale(1.15)`;
        }
      }
    });
  });

  // ----------------------------------------------------
  // 5. Intersection Observer Fade Reveals
  // ----------------------------------------------------
  const faders = document.querySelectorAll('.hud-fact-card, .text-card-reveal, .panel-left, .panel-right');
  const appearOptions = {
    threshold: 0.12,
    rootMargin: "0px 0px -50px 0px"
  };

  const appearObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, appearObserver);

  faders.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
    appearObserver.observe(el);
  });

  function triggerInitialAnimations() {
    const heroElements = document.querySelectorAll('.text-card-reveal');
    heroElements.forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }

  // ----------------------------------------------------
  // 6. Booking Form logic
  // ----------------------------------------------------
  const bookingForm = document.getElementById('booking-form');
  const bookingSuccess = document.getElementById('booking-success');
  const resetBtn = document.getElementById('reset-booking-btn');

  const dateInput = document.getElementById('flight-date');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = tomorrow.toISOString().split('T')[0];
    dateInput.min = tomorrow.toISOString().split('T')[0];
  }

  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const submitBtn = bookingForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      
      submitBtn.textContent = 'FILING FLIGHT BOOKING...';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';

        bookingForm.classList.add('hidden');
        bookingSuccess.classList.remove('hidden');
        
        lenis.scrollTo(document.getElementById('book'), { duration: 1.0 });
      }, 1500);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (bookingForm && bookingSuccess) {
        bookingForm.reset();
        
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = tomorrow.toISOString().split('T')[0];

        bookingSuccess.classList.add('hidden');
        bookingForm.classList.remove('hidden');
        
        lenis.scrollTo(document.getElementById('book'), { duration: 1.0 });
      }
    });
  }
});
