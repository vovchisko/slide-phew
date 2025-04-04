/**
 * Draws an image on canvas maintaining aspect ratio using 'cover' approach
 * Similar to CSS background-size:cover
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLImageElement} img - Image element to draw
 * @param {number} x - Target x position
 * @param {number} y - Target y position
 * @param {number} width - Target width
 * @param {number} height - Target height
 */
export function drawImageCovered(ctx, img, x, y, width, height) {
  if (!img || !img.complete) return;
  
  // Calculate aspect ratios
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = width / height;
  
  let sw, sh, sx, sy;
  
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
  
  // Draw the image
  ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
}

/**
 * Create a blob from canvas with high quality
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {string} format - Image format ('image/jpeg', 'image/png', etc)
 * @param {number} quality - Quality (0-1) for lossy formats
 * @returns {Promise<Blob>} - Promise resolving to a Blob
 */
export function canvasToBlob(canvas, format = 'image/jpeg', quality = 0.9) {
  return new Promise(resolve => {
    canvas.toBlob(resolve, format, quality);
  });
}

/**
 * Calculate optimal JPEG quality based on image dimensions to stay under memory limits
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {number} - Optimal quality (0-1)
 */
export function calculateOptimalQuality(width, height) {
  const pixels = width * height;
  
  // Higher quality for smaller images, lower for larger
  if (pixels > 1000000) { // > 1MP
    return 0.85;
  } else if (pixels > 500000) { // > 0.5MP
    return 0.9;
  } else {
    return 0.95;
  }
}

/**
 * Get optimal FFmpeg encoding parameters based on resolution
 * @param {number} width - Video width
 * @param {number} height - Video height
 * @param {number} fps - Frames per second
 * @returns {Object} - Encoding parameters
 */
export function getEncodingParams(width, height, fps) {
  // Calculate optimal bitrate (very high for maximum quality)
  const pixels = width * height;
  const bitrate = Math.min(50000, Math.max(15000, Math.round(pixels / 35)));
  
  return {
    codec: [
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-preset', 'ultrafast', // Maximum speed
      '-tune', 'zerolatency', // Reduce latency
      '-pix_fmt', 'yuv420p'
    ],
    bitrate: [
      '-b:v', `${bitrate}k`,
      '-maxrate', `${bitrate * 1.5}k`,
      '-bufsize', `${bitrate * 2}k`,
      '-crf', '18'  // High quality (lower = better)
    ],
    mimeType: 'video/mp4'
  };
}

/**
 * Resize an image to cover target dimensions while maintaining aspect ratio
 * @param {HTMLImageElement} img - Original image
 * @param {number} targetWidth - Target width
 * @param {number} targetHeight - Target height
 * @returns {Promise<HTMLImageElement>} - Promise resolving to resized image
 */
export function resizeImageToCover(img, targetWidth, targetHeight) {
  return new Promise((resolve) => {
    // Create a canvas for resizing
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    
    // Calculate aspect ratios
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const targetRatio = targetWidth / targetHeight;
    
    let sw, sh, sx, sy;
    
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
    
    // Draw the image into the canvas, cropping to fit
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    
    // Create a new image from the canvas
    const resizedImg = new Image();
    resizedImg.onload = () => resolve(resizedImg);
    resizedImg.src = canvas.toDataURL('image/jpeg', 0.92);
  });
} 