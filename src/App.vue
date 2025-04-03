<template>
  <main>
    <div class="preview-panel">
      <div class="canvas-container">
        <canvas id="preview-canvas" :width="videoSettings.width" :height="videoSettings.height"></canvas>
        <div class="preview-controls" v-if="!generatedVideo">
          <button @click="togglePreview">
            {{ isPlaying ? 'Pause' : 'Play' }}
          </button>
        </div>
      </div>
      
      <div v-if="generatedVideo" class="player-container">
        <video ref="videoPlayer" controls>
          <source :src="downloadUrl" type="video/webm">
        </video>
        <div class="player-controls">
          <a :href="downloadUrl" download="slideshow.webm">Download Video</a>
          <button @click="clearVideo">Close</button>
        </div>
      </div>
      
      <div class="export-controls" v-if="!generatedVideo">
        <button @click="startRecording" :disabled="isRecording || slides.length === 0">
          Generate Video
        </button>
        <div v-if="isRecording" class="progress-bar">
          <div class="progress" :style="{ width: `${recordingProgress}%` }"></div>
        </div>
      </div>
    </div>
    
    <div class="settings" :class="{ disabled: generatedVideo }">
      <div class="settings-group">
        <h4>Video Settings</h4>
        <div class="control">
          <label>FPS</label>
          <select v-model="videoSettings.fps" :disabled="generatedVideo">
            <option value="24">24</option>
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="60">60</option>
            <option value="120">120</option>
          </select>
        </div>
        <div class="control">
          <label>Size</label>
          <div class="size-inputs">
            <input type="number" placeholder="Width" v-model.number="videoSettings.width" :disabled="generatedVideo" />
            <span>×</span>
            <input type="number" placeholder="Height" v-model.number="videoSettings.height" :disabled="generatedVideo" />
          </div>
        </div>
        <div class="control">
          <label>Duration (seconds)</label>
          <input type="number" v-model.number="videoSettings.duration" :disabled="generatedVideo" />
        </div>
        <div class="control">
          <label>Transition Time (seconds)</label>
          <input type="number" v-model.number="videoSettings.transitionTime" step="0.1" :disabled="generatedVideo" />
        </div>
      </div>

      <div class="settings-group">
        <h4>Slides</h4>
        
        <div class="upload-row">
          <div class="upload-section">
            <input type="file" id="slideUpload" multiple accept="image/*" @change="handleSlideUpload" :disabled="generatedVideo" />
            <label for="slideUpload" :disabled="generatedVideo">Upload Images</label>
          </div>
          
          <div class="color-section">
            <label>Background</label>
            <input type="color" v-model="backgroundColor" :disabled="generatedVideo" />
          </div>
        </div>
        
        <div class="assets-list">
          <div v-for="(slide, index) in slides" :key="index" class="asset-item">
            <img :src="slide.src" alt="Slide" />
            <div class="slide-controls">
              <select v-model="slide.transition" :disabled="generatedVideo">
                <option value="none">No Effect</option>
                <option value="fade">Fade In</option>
                <option value="slide">Slide In</option>
                <option value="zoom">Zoom In</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h4>Effects</h4>
        <input type="file" id="fxUpload" multiple accept="image/*" @change="handleFxUpload" :disabled="generatedVideo" />
        <label for="fxUpload" :disabled="generatedVideo">Upload FX Images</label>
        <div class="assets-list">
          <div v-for="(fx, index) in effects" :key="index" class="asset-item">
            <img :src="fx.src" alt="Effect" />
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, watch, onUnmounted } from 'vue'

// Canvas and context
let canvas, ctx
let animationFrame = null

// Group video settings into a single reactive object
const videoSettings = reactive({
  fps: 60,
  width: 512,
  height: 512,
  duration: 5,
  transitionTime: 0.5,
  // Quality settings - always maximum
  bitrate: 20000 // kbps (maximum)
})

// Other state variables
const isRecording = ref(false)
const recordingProgress = ref(0)
const downloadUrl = ref('')
const slides = ref([])
const effects = ref([])
const isPlaying = ref(false)
const generatedVideo = ref(false)
const videoPlayer = ref(null)
const backgroundColor = ref('#000000')

// Timing variables
const currentSlideIndex = ref(0)
const slideTransitionProgress = ref(0)
let startTime = 0
let pauseTime = 0
let totalPausedTime = 0

// ------------------------------------
// Lifecycle hooks
// ------------------------------------
onMounted(() => {
  canvas = document.getElementById('preview-canvas')
  ctx = canvas.getContext('2d')
  
  // Enable high quality rendering
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  updateCanvasSize()
  addDefaultEffects()
  
  animationFrame = requestAnimationFrame(animate)
})

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
})

// ------------------------------------
// Watchers
// ------------------------------------
// Reset playback when video settings change
watch(videoSettings, resetPlayback, { deep: true })

// Reset playback when slides change
watch(slides, resetPlayback, { deep: true })

// Reset playback when background color changes
watch(backgroundColor, resetPlayback)

// Update canvas size when dimensions change
watch([() => videoSettings.width, () => videoSettings.height], updateCanvasSize)

// ------------------------------------
// Core functions
// ------------------------------------
function resetPlayback() {
  isPlaying.value = false
  startTime = Date.now()
  pauseTime = 0
  totalPausedTime = 0
  currentSlideIndex.value = 0
  slideTransitionProgress.value = 0
}

function updateCanvasSize() {
  if (!canvas) return
  
  canvas.width = videoSettings.width
  canvas.height = videoSettings.height
  
  // Keep displayed size consistent
  canvas.style.width = `${videoSettings.width}px`
  canvas.style.height = `${videoSettings.height}px`
}

function togglePreview() {
  if (slides.value.length === 0) return
  
  isPlaying.value = !isPlaying.value
  
  if (isPlaying.value) {
    // Start playback
    if (pauseTime > 0) {
      // Resume from pause
      totalPausedTime += (Date.now() - pauseTime)
      pauseTime = 0
    } else {
      // Start from beginning
      startTime = Date.now()
      totalPausedTime = 0
      currentSlideIndex.value = 0
    }
  } else {
    // Pause playback
    pauseTime = Date.now()
  }
}

function clearVideo() {
  generatedVideo.value = false
  downloadUrl.value = ''
  
  // Reset preview
  isPlaying.value = false
  pauseTime = 0
  totalPausedTime = 0
  // Don't reset startTime to keep animation state
}

// ------------------------------------
// File handling
// ------------------------------------
function handleSlideUpload(event) {
  const files = Array.from(event.target.files)
  
  files.forEach(file => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        slides.value.push({
          src: reader.result,
          img,
          transition: 'fade', // Default transition is fade
          // This transition controls how THIS slide will enter the screen
        })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

function handleFxUpload(event) {
  const files = Array.from(event.target.files)
  
  files.forEach(file => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        effects.value.push({
          src: reader.result,
          img,
          x: Math.random() * (canvas.width - 60),
          y: Math.random() * (canvas.height - 60),
          dx: (Math.random() - 0.5) * 4,
          dy: (Math.random() - 0.5) * 4,
          size: 60
        })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// ------------------------------------
// Rendering and animation
// ------------------------------------
function drawImageCovered(img, x, y, width, height) {
  if (!img || !img.complete) return;
  
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = width / height;
  
  let sw, sh, sx, sy, dw, dh;
  
  if (imgRatio > targetRatio) {
    // Image is wider than target - match heights
    sh = img.naturalHeight;
    sw = sh * targetRatio;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    // Image is taller than target - match widths
    sw = img.naturalWidth;
    sh = sw / targetRatio;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  
  // Destination rectangle
  dw = width;
  dh = height;
  
  ctx.drawImage(img, sx, sy, sw, sh, x, y, dw, dh);
}

function animate(timestamp) {
  if (!ctx) return
  
  // Always use high quality rendering
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // Clear canvas with background color
  ctx.fillStyle = backgroundColor.value
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  // If no slides, just show a blank canvas with background
  if (slides.value.length === 0) {
    animationFrame = requestAnimationFrame(animate)
    return
  }
  
  // Initialize slide variables
  let slideIndex = currentSlideIndex.value
  let prevSlideIndex = Math.max(0, slideIndex - 1)
  let transitionProgress = slideTransitionProgress.value
  
  // Draw current slide and handle transitions
  if (isPlaying.value) {
    // Calculate elapsed time accounting for pauses
    let elapsed = Date.now() - startTime - totalPausedTime
    
    // Calculate slide timing
    const slideDisplayMs = (videoSettings.duration * 1000) / slides.value.length
    const transitionMs = videoSettings.transitionTime * 1000
    
    // Get current slide index
    slideIndex = Math.min(
      Math.floor(elapsed / slideDisplayMs),
      slides.value.length - 1
    )
    
    prevSlideIndex = Math.max(0, slideIndex - 1)
    
    // Calculate transition progress
    let slideStartTime = slideIndex * slideDisplayMs
    let slideElapsed = elapsed - slideStartTime
    
    // Transition happens at the BEGINNING of the slide display time
    if (slideElapsed < transitionMs) {
      transitionProgress = slideElapsed / transitionMs
    } else {
      transitionProgress = 1 // Transition complete
    }
    
    // Stop at the end of the slides
    if (elapsed >= videoSettings.duration * 1000) {
      isPlaying.value = false
      slideIndex = slides.value.length - 1
      prevSlideIndex = slideIndex - 1
      transitionProgress = 1
    }
    
    // Update reactive state
    currentSlideIndex.value = slideIndex
    slideTransitionProgress.value = transitionProgress
  }
  
  // Get the current slide
  const currentSlide = slides.value[slideIndex]
  
  // Handle transitions - each slide's transition property controls how it enters
  const transition = currentSlide.transition
  
  if (transitionProgress < 1 && slideIndex > 0) {
    // During transition, show previous slide underneath
    const prevSlide = slides.value[prevSlideIndex]
    drawImageCovered(prevSlide.img, 0, 0, canvas.width, canvas.height)
  }
  
  // Draw the current slide based on its transition type
  if (transition === 'none' || transitionProgress === 1) {
    // Just draw the slide at full opacity
    drawImageCovered(currentSlide.img, 0, 0, canvas.width, canvas.height)
  } else if (transition === 'fade') {
    // Fade in
    ctx.globalAlpha = transitionProgress
    drawImageCovered(currentSlide.img, 0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1.0
  } else if (transition === 'slide') {
    // Slide in from right
    const slideOffset = Math.floor(canvas.width * (1 - transitionProgress))
    
    ctx.save()
    ctx.beginPath()
    ctx.rect(slideOffset, 0, canvas.width - slideOffset, canvas.height)
    ctx.clip()
    drawImageCovered(currentSlide.img, 0, 0, canvas.width, canvas.height)
    ctx.restore()
  } else if (transition === 'zoom') {
    // Zoom in
    const scale = 1.5 - transitionProgress * 0.5 // Start at 1.5x size and shrink to 1x
    const scaledWidth = canvas.width * scale
    const scaledHeight = canvas.height * scale
    const offsetX = (scaledWidth - canvas.width) / 2
    const offsetY = (scaledHeight - canvas.height) / 2
    
    ctx.save()
    ctx.globalAlpha = transitionProgress
    drawImageCovered(
      currentSlide.img,
      -offsetX, -offsetY,
      scaledWidth, scaledHeight
    )
    ctx.restore()
  }
  
  // Animate effects
  animateEffects()
  
  animationFrame = requestAnimationFrame(animate)
}

function animateEffects() {
  effects.value.forEach(effect => {
    // Update positions when playing
    if (isPlaying.value || isRecording.value) {
      effect.x += effect.dx
      effect.y += effect.dy
      
      // Bounce off edges
      if (effect.x <= 0 || effect.x + effect.size >= canvas.width) {
        effect.dx *= -1
        effect.x = Math.max(0, Math.min(canvas.width - effect.size, effect.x))
      }
      
      if (effect.y <= 0 || effect.y + effect.size >= canvas.height) {
        effect.dy *= -1
        effect.y = Math.max(0, Math.min(canvas.height - effect.size, effect.y))
      }
    }
    
    // Draw the effect
    ctx.drawImage(effect.img, effect.x, effect.y, effect.size, effect.size)
  })
}

// ------------------------------------
// Default content
// ------------------------------------
function addDefaultEffects() {
  if (effects.value.length === 0 && canvas) {
    const defaultCanvas = document.createElement('canvas')
    defaultCanvas.width = 60
    defaultCanvas.height = 60
    const dctx = defaultCanvas.getContext('2d')

    // Create orange square
    dctx.fillStyle = 'orange'
    dctx.fillRect(0, 0, 60, 60)
    const squareDataUrl = defaultCanvas.toDataURL()
    const square = new Image()
    square.onload = () => {
      effects.value.push({
        src: squareDataUrl,
        img: square,
        x: 100,
        y: 100,
        dx: 2,
        dy: 1.5,
        size: 60
      })
    }
    square.src = squareDataUrl

    // Clear canvas and create cyan triangle
    dctx.clearRect(0, 0, 60, 60)
    dctx.fillStyle = 'cyan'
    dctx.beginPath()
    dctx.moveTo(30, 0)
    dctx.lineTo(60, 60)
    dctx.lineTo(0, 60)
    dctx.closePath()
    dctx.fill()
    const triangleDataUrl = defaultCanvas.toDataURL()
    const triangle = new Image()
    triangle.onload = () => {
      effects.value.push({
        src: triangleDataUrl,
        img: triangle,
        x: 200,
        y: 200,
        dx: -1.2,
        dy: 2,
        size: 60
      })
    }
    triangle.src = triangleDataUrl
  }
}

// ------------------------------------
// Video recording
// ------------------------------------
function startRecording() {
  if (isRecording.value || slides.value.length === 0) return
  
  // Set up for recording
  isRecording.value = true
  recordingProgress.value = 0
  isPlaying.value = true  // Start playback for recording
  startTime = Date.now()  // Reset timing
  totalPausedTime = 0
  
  // Get actual FPS based on transitions
  // If we have complex transitions, use higher FPS for smoother results
  const hasComplexTransitions = slides.value.some(slide => 
    slide.transition === 'slide' || slide.transition === 'zoom'
  )
  
  // For complex transitions, use higher FPS if original setting is low
  const recordingFps = hasComplexTransitions && videoSettings.fps < 40 
    ? Math.max(videoSettings.fps, 40) 
    : videoSettings.fps
  
  // Setup recording with quality settings
  const totalDuration = videoSettings.duration * 1000 // ms
  const stream = canvas.captureStream(recordingFps)
  
  // Apply bitrate and codec settings for better quality
  const recorder = new MediaRecorder(stream, { 
    mimeType: 'video/webm',
    videoBitsPerSecond: videoSettings.bitrate * 1000 // convert kbps to bps
  })
  
  const chunks = []
  
  recorder.ondataavailable = e => chunks.push(e.data)
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' })
    const url = URL.createObjectURL(blob)
    downloadUrl.value = url
    isRecording.value = false
    isPlaying.value = false
    generatedVideo.value = true
    
    // Auto-play the video when it's ready
    setTimeout(() => {
      if (videoPlayer.value) {
        videoPlayer.value.play()
      }
    }, 100)
  }
  
  let recordingStartTime = Date.now()
  
  // Start recording
  recorder.start()
  
  const timer = setInterval(() => {
    const elapsed = Date.now() - recordingStartTime
    
    // Update progress
    recordingProgress.value = Math.min(100, (elapsed / totalDuration) * 100)
    
    if (elapsed >= totalDuration) {
      clearInterval(timer)
      recorder.stop()
    }
  }, 50) // Update progress about 20 times per second
}
</script>
