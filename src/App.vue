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
        <video ref="videoPlayer" controls preload="auto">
          <source :src="downloadUrl" type="video/mp4">
          Your browser doesn't support HTML5 video.
        </video>
        <div class="player-controls">
          <a :href="downloadUrl" download="slideshow.mp4" class="download-btn">Download Video</a>
          <button @click="clearVideo">Close</button>
        </div>
      </div>
      
      <div class="export-controls" v-if="!generatedVideo">
        <button @click="startRecording" :disabled="isRecording || slides.length === 0">
          Generate Video
        </button>
        <div v-if="isRecording" class="encoding-stats">
          <div v-if="recordingStats.status === 'capturing'">
            Captured: {{ recordingStats.capturedFrames }} of {{ recordingStats.totalFrames }} frames
          </div>
          <div v-if="recordingStats.status === 'encoding'">
            Encoding: frame {{ recordingStats.encodingFrame }} | 
            Time: {{ recordingStats.encodingTime }} | 
            Size: {{ recordingStats.encodingSize }} | 
            Speed: {{ recordingStats.encodingSpeed }}
          </div>
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
            <option value="60">60</option>
          </select>
        </div>
        
        <div class="aspect-buttons">
          <label>Aspect Ratio</label>
          <div class="button-group">
            <button 
              :class="{ active: videoSettings.aspectRatio === 'square' }" 
              @click="setAspectAndSize('square', 500, 500)"
              :disabled="generatedVideo">
              Square (1:1)
            </button>
            <button 
              :class="{ active: videoSettings.aspectRatio === 'portrait' }" 
              @click="setAspectAndSize('portrait', 500, 1000)"
              :disabled="generatedVideo">
              Portrait (1:2)
            </button>
            <button 
              :class="{ active: videoSettings.aspectRatio === 'landscape' }" 
              @click="setAspectAndSize('landscape', 1000, 500)"
              :disabled="generatedVideo">
              Landscape (2:1)
            </button>
          </div>
        </div>
        
        <div class="resolution-buttons">
          <label>Resolution</label>
          <div class="button-group">
            <button 
              :class="{ active: getResolutionClass('low') }" 
              @click="setResolution('low')"
              :disabled="generatedVideo">
              500px
            </button>
            <button 
              :class="{ active: getResolutionClass('high') }" 
              @click="setResolution('high')"
              :disabled="generatedVideo">
              1080px
            </button>
          </div>
        </div>
        
        <div class="control">
          <label>Duration (seconds)</label>
          <input type="number" v-model.number="videoSettings.duration" min="3" max="15" :disabled="generatedVideo" />
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
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { drawImageCovered, canvasToBlob, calculateOptimalQuality, getEncodingParams, resizeImageToCover } from './utils.js'

// FFmpeg instance
const ffmpeg = new FFmpeg()
const ffmpegLoaded = ref(false)

// Canvas and context
let canvas, ctx
let animationFrame = null

// Group video settings into a single reactive object
const videoSettings = reactive({
  fps: 30,
  width: 500,
  height: 500,
  aspectRatio: 'square', // 'square' (1:1), 'landscape' (2:1) or 'portrait' (1:2)
  duration: 5,
  transitionTime: 0.5,
  format: 'mp4' // mp4 only
})

// Other state variables
const isRecording = ref(false)
const recordingStats = reactive({
  capturedFrames: 0,
  totalFrames: 0,
  encodingFrame: 0,
  encodingTime: '00:00:00',
  encodingSize: '0KB',
  encodingSpeed: '0x',
  status: 'ready'
})
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
onMounted(async () => {
  canvas = document.getElementById('preview-canvas')
  ctx = canvas.getContext('2d')
  
  // Enable high quality rendering
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  updateCanvasSize()
  addDefaultEffects()
  
  // Load FFmpeg
  try {
    // Set up log handler to parse progress info
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message)
      parseFFmpegProgress(message)
    })
    
    await ffmpeg.load()
    ffmpegLoaded.value = true
    console.log('FFmpeg loaded')
  } catch (e) {
    console.error('Error loading FFmpeg:', e)
  }
  
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
      img.onload = async () => {
        // Store the original image for future resizing
        const originalImg = img
        
        // Resize the image to match video dimensions while maintaining aspect ratio
        const resizedImg = await resizeImageToCover(img, videoSettings.width, videoSettings.height)
        
        slides.value.push({
          src: resizedImg.src, // Use the resized image src
          img: resizedImg,     // Store the resized image
          originalImg,         // Keep the original for future resizing
          transition: 'fade',  // Default transition is fade
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
      img.onload = async () => {
        // Create a square canvas for the effect at the right size
        const size = 60
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        
        // Draw the image properly maintaining aspect ratio
        drawImageCovered(ctx, img, 0, 0, size, size)
        
        // Create a new image from the canvas
        const resizedImg = new Image()
        resizedImg.onload = () => {
        effects.value.push({
            src: resizedImg.src,
            img: resizedImg,
            x: Math.random() * (canvas.width - size),
            y: Math.random() * (canvas.height - size),
          dx: (Math.random() - 0.5) * 4,
          dy: (Math.random() - 0.5) * 4,
            size: size
        })
        }
        resizedImg.src = canvas.toDataURL('image/png')
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// ------------------------------------
// Rendering and animation
// ------------------------------------
function animate(timestamp) {
  if (!ctx) return
  
  // Always use high quality rendering
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // Calculate elapsed time for animations
  let elapsed = 0
  
  if (isPlaying.value) {
    // Calculate elapsed time accounting for pauses
    elapsed = Date.now() - startTime - totalPausedTime
    
    // Cap at total duration
    if (elapsed >= videoSettings.duration * 1000) {
      elapsed = videoSettings.duration * 1000 - 10 // Just before end
      isPlaying.value = false
    }
  }
  
  // Use time-based animation for consistent FX movement
  renderFrameAtTime(elapsed)
  
  // Continue animation loop
  animationFrame = requestAnimationFrame(animate)
}

// Render a frame at a specific time point (used by both preview and recording)
function renderFrameAtTime(timeMs) {
  // Clear canvas with background color
  ctx.fillStyle = backgroundColor.value
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  // If no slides, just show a blank canvas with background
  if (slides.value.length === 0) return
    
  // Calculate animation state at this time
  const { slideIndex, prevSlideIndex, transitionProgress } = calculateAnimationState(timeMs)
  
  // Update reactive state (for UI)
  currentSlideIndex.value = slideIndex
  slideTransitionProgress.value = transitionProgress
  
  // Get the current slide
  const currentSlide = slides.value[slideIndex]
  
  // Handle transitions - each slide's transition property controls how it enters
  const transition = currentSlide.transition
  
  if (transitionProgress < 1 && slideIndex > 0) {
    // During transition, show previous slide underneath
    const prevSlide = slides.value[prevSlideIndex]
    drawImageCovered(ctx, prevSlide.img, 0, 0, canvas.width, canvas.height)
  }
  
  // Draw the current slide based on its transition type
  if (transition === 'none' || transitionProgress === 1) {
    // Just draw the slide at full opacity
    drawImageCovered(ctx, currentSlide.img, 0, 0, canvas.width, canvas.height)
  } else if (transition === 'fade') {
    // Fade in
    ctx.globalAlpha = transitionProgress
    drawImageCovered(ctx, currentSlide.img, 0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1.0
  } else if (transition === 'slide') {
    // Slide in from right
    const slideOffset = Math.floor(canvas.width * (1 - transitionProgress))
    
    ctx.save()
    ctx.beginPath()
    ctx.rect(slideOffset, 0, canvas.width - slideOffset, canvas.height)
    ctx.clip()
    drawImageCovered(ctx, currentSlide.img, 0, 0, canvas.width, canvas.height)
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
    drawImageCovered(ctx, currentSlide.img, -offsetX, -offsetY, scaledWidth, scaledHeight)
    ctx.restore()
  }
  
  // Position FX elements based on time
  positionEffectsAtTime(timeMs)
  
  // Draw all effects at their current positions
  effects.value.forEach(effect => {
    drawImageCovered(ctx, effect.img, effect.x, effect.y, effect.size, effect.size)
  })
}

// Calculate slide index and transition progress at a specific time
function calculateAnimationState(timeMs) {
  // Calculate slide timing - make sure to reserve time for the last slide
  const slideCount = slides.value.length
  const slideDisplayMs = videoSettings.duration * 1000 / slideCount
  const transitionMs = videoSettings.transitionTime * 1000
  
  // Ensure the last slide gets full time by adjusting the cutoff
  // Get current slide index with adjusted calculation
  const slideIndex = Math.min(
    Math.floor(timeMs / slideDisplayMs),
    slideCount - 1
  )
  
  const prevSlideIndex = Math.max(0, slideIndex - 1)
  
  // Calculate transition progress
  const slideStartTime = slideIndex * slideDisplayMs
  const slideElapsed = timeMs - slideStartTime
  
  // Transition happens at the BEGINNING of the slide display time
  let transitionProgress
  if (slideElapsed < transitionMs) {
    transitionProgress = slideElapsed / transitionMs
  } else {
    transitionProgress = 1 // Transition complete
  }
  
  return { slideIndex, prevSlideIndex, transitionProgress }
}

// Position FX elements using time-based periodic functions
function positionEffectsAtTime(timeMs) {
  // Only update positions during active playback or when capturing frames
  if (isRecording.value || isPlaying.value) {
    const timeFactorSec = timeMs / 1000 // Convert to seconds for smoother animation
    
    effects.value.forEach((effect, index) => {
      // Use different factors for different effects
      const speedX = index === 0 ? 0.8 : 0.6
      const speedY = index === 0 ? 0.5 : 0.7
      const amplitudeX = index === 0 ? 100 : 80
      const amplitudeY = index === 0 ? 80 : 100
      const offsetX = index === 0 ? 100 : 200
      const offsetY = index === 0 ? 100 : 200
      
      // Calculate positions using periodic functions
      effect.x = offsetX + Math.sin(timeFactorSec * speedX) * amplitudeX
      effect.y = offsetY + Math.cos(timeFactorSec * speedY) * amplitudeY
      
      // Ensure within bounds
      effect.x = Math.max(0, Math.min(canvas.width - effect.size, effect.x))
      effect.y = Math.max(0, Math.min(canvas.height - effect.size, effect.y))
    })
  }
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
async function startRecording() {
  if (isRecording.value || slides.value.length === 0 || !ffmpegLoaded.value) return
  
  // Reset and set up recording stats
  recordingStats.capturedFrames = 0
  recordingStats.totalFrames = 0
  recordingStats.encodingFrame = 0
  recordingStats.encodingTime = '00:00:00'
  recordingStats.encodingSize = '0KB'
  recordingStats.encodingSpeed = '0x'
  recordingStats.status = 'capturing'
  
  // Set up for recording
  isRecording.value = true
  
  const fps = parseInt(videoSettings.fps, 10)  // Ensure fps is a number
  const durationMs = videoSettings.duration * 1000
  
  // Calculate exact number of frames needed
  const totalFrames = Math.ceil(fps * (durationMs / 1000))
  
  console.log(`Recording ${totalFrames} frames at ${fps}fps for ${durationMs}ms duration`)
  
  // Set total frames in stats
  recordingStats.totalFrames = totalFrames
  
  // Clear any existing files
  try {
    const files = await ffmpeg.listDir('.').catch(() => [])
    for (const file of files) {
      if (file.name.startsWith('frame_') || file.name === 'input.txt' || file.name.startsWith('output.')) {
        await ffmpeg.deleteFile(file.name).catch(() => {})
      }
    }
  } catch (err) {
    console.log('Error clearing files:', err)
  }
  
  // Calculate optimal quality for this resolution
  const quality = calculateOptimalQuality(videoSettings.width, videoSettings.height)
  
  try {
    // Generate all frames at exact time points
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      // Calculate the exact time this frame represents
      const frameTimeMs = (frameIndex / fps) * 1000
      
      // Render the frame at this exact time point
      renderFrameAtTime(frameTimeMs)
      
      // Capture the frame
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      const fileName = `frame_${frameIndex.toString().padStart(5, '0')}.jpg`
      await ffmpeg.writeFile(fileName, await fetchFile(blob))
      
      // Update stats
      recordingStats.capturedFrames = frameIndex + 1
      
      // Give the UI a chance to update occasionally
      if (frameIndex % 10 === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
      
      // Check if recording was cancelled
      if (!isRecording.value) return
    }
    
    // Finished capturing frames, now generate video
    recordingStats.status = 'encoding'
    await encodeVideo(totalFrames, fps)
  } catch (err) {
    console.error('Error during frame capture:', err)
    isRecording.value = false
    recordingStats.status = 'ready'
  }
}

async function encodeVideo(frameCount, fps) {
  // Create input.txt for concat demuxer
  const fileList = Array.from({length: frameCount}, (_, i) => 
    `file frame_${i.toString().padStart(5, '0')}.jpg`
  ).join('\n')
  
  await ffmpeg.writeFile('input.txt', fileList)
  
  recordingStats.status = 'encoding'
  console.log(`Encoding ${frameCount} frames at ${fps} FPS`)
  
  const outputFile = 'output.mp4'
  
  try {
    // Use more explicit timing controls for FFmpeg
    await ffmpeg.exec([
      '-f', 'concat', 
      '-safe', '0',
      '-i', 'input.txt',
      // Force exact framerate with CFR
      '-framerate', `${fps}`,
      '-r', `${fps}`,
      '-vsync', 'cfr',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      // Duration explicitly set to match expected length
      '-t', `${videoSettings.duration}`,
      outputFile
    ])
  } catch (e) {
    console.error('FFmpeg error:', e)
    // Try with simpler settings
    await ffmpeg.exec([
      '-f', 'concat', 
      '-safe', '0',
      '-i', 'input.txt',
      '-r', `${fps}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      outputFile
    ])
  }
  
  console.log('Video encoding complete, now reading file')
  
  // Read output file
  const data = await ffmpeg.readFile(outputFile)
  const buffer = new Uint8Array(data.buffer).slice(0)
  
  // Create blob and URL
  const blob = new Blob([buffer], { type: 'video/mp4' })
  const url = URL.createObjectURL(blob)
  
  console.log('Video ready, blob URL created, size:', buffer.length)
  
  // Clean up files
  const cleanupFiles = await ffmpeg.listDir('.').catch(() => [])
  for (const file of cleanupFiles) {
    if (file.name.startsWith('frame_') || file.name === 'input.txt' || file.name === outputFile) {
      await ffmpeg.deleteFile(file.name).catch(() => {})
    }
  }
  
  // Update UI
  recordingStats.status = 'ready'
  downloadUrl.value = url
  isRecording.value = false
  isPlaying.value = false
  generatedVideo.value = true
  
  // Auto-play the video after a short delay to ensure it's loaded
  setTimeout(() => {
    if (videoPlayer.value) {
      videoPlayer.value.load()
      videoPlayer.value.play().catch(e => console.error('Video play error:', e))
    }
  }, 500)
}

// Function to set aspect ratio and resolution
async function setAspectAndSize(aspect, width, height) {
  videoSettings.aspectRatio = aspect
  videoSettings.width = width
  videoSettings.height = height
  updateCanvasSize()
  
  // Resize all existing slides to match new dimensions
  if (slides.value.length > 0) {
    // Create temporary array to hold new slides
    const newSlides = []
    
    // Process each slide to match new dimensions
    for (const slide of slides.value) {
      // Get the original image if available, or use current one
      const sourceImg = slide.originalImg || slide.img
      
      // Resize the image to new dimensions
      const resizedImg = await resizeImageToCover(sourceImg, width, height)
      
      // Add to new slides with original transition
      newSlides.push({
        src: resizedImg.src,
        img: resizedImg,
        originalImg: sourceImg, // Store original for future resizing
        transition: slide.transition
      })
    }
    
    // Replace slides with resized versions
    slides.value = newSlides
  }
  
  // Reset and regenerate FX elements to match new dimensions
  resetEffects()
}

// Function to reset and regenerate FX elements
function resetEffects() {
  // Clear existing effects
  effects.value = []
  
  // Add default effects matching new dimensions
  addDefaultEffects()
}

// Function to set resolution based on aspect ratio
function setResolution(resolution) {
  if (videoSettings.aspectRatio === 'square') {
    // For square: width = height
    if (resolution === 'low') {
      videoSettings.width = 500
      videoSettings.height = 500
    } else {
      videoSettings.width = 1080
      videoSettings.height = 1080
    }
  } else if (videoSettings.aspectRatio === 'portrait') {
    // For portrait: height is the primary dimension
    if (resolution === 'low') {
      videoSettings.height = 1000
      videoSettings.width = 500
    } else {
      videoSettings.height = 2160
      videoSettings.width = 1080
    }
  } else {
    // For landscape: width is the primary dimension
    if (resolution === 'low') {
      videoSettings.width = 1000
      videoSettings.height = 500
    } else {
      videoSettings.width = 2160
      videoSettings.height = 1080
    }
  }
  updateCanvasSize()
}

// Helper to determine if resolution button should be active
function getResolutionClass(resolution) {
  const isPortrait = videoSettings.aspectRatio === 'portrait'
  const primaryDimension = isPortrait ? videoSettings.height : videoSettings.width
  
  if (resolution === 'low') {
    return primaryDimension <= 500
  } else {
    return primaryDimension > 500
  }
}

// Add function to parse FFmpeg logs for progress information
function parseFFmpegProgress(message) {
  // Only parse progress messages
  if (!message.includes('frame=')) return
  
  try {
    // Extract frame number
    const frameMatch = message.match(/frame=\s*(\d+)/)
    if (frameMatch && frameMatch[1]) {
      recordingStats.encodingFrame = parseInt(frameMatch[1])
    }
    
    // Extract encoding time
    const timeMatch = message.match(/time=(\d+:\d+:\d+\.\d+)/)
    if (timeMatch && timeMatch[1]) {
      recordingStats.encodingTime = timeMatch[1]
    }
    
    // Extract file size
    const sizeMatch = message.match(/size=\s*(\d+kB)/)
    if (sizeMatch && sizeMatch[1]) {
      recordingStats.encodingSize = sizeMatch[1]
    }
    
    // Extract speed
    const speedMatch = message.match(/speed=\s*(\d+\.\d+x)/)
    if (speedMatch && speedMatch[1]) {
      recordingStats.encodingSpeed = speedMatch[1]
    }
  } catch (e) {
    console.error('Error parsing FFmpeg progress:', e)
  }
}
</script>
