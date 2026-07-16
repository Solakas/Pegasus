# Canvas Frame Extraction Workaround (replacing video.currentTime scrubbing)

## The Problem
The original implementation used a `<video>` element whose `currentTime` property was updated directly on every scroll event. This caused visible stuttering and freezing because compressed MP4 video uses keyframes (I-frames) spaced several frames apart. When the browser receives a seek to an arbitrary timestamp, it must:
1. Find the nearest preceding keyframe.
2. Decode every frame between that keyframe and the target time.

This decoding step is expensive and unpredictable, making real-time scroll-scrubbing inherently janky with `<video>`.

## The Solution
We replace the `<video>` element with a `<canvas>` and implement a frame pre-extraction pipeline:
1. On page load, a hidden `<video>` element loads the MP4 file.
2. A loop seeks to 80 (or more) evenly-spaced timestamps across the video's duration.
3. At each seek, `createImageBitmap(video)` captures the frame as a GPU-backed `ImageBitmap` object and stores it in an array.
4. Once all frames are extracted, the loading spinner is dismissed.
5. On scroll, instead of seeking through the video, the code calculates a frame index from the scroll position (`scrollFraction * totalFrames`) and draws that `ImageBitmap` onto the canvas using `ctx.drawImage()`.

## Why It Works
Drawing a pre-extracted `ImageBitmap` onto a canvas is essentially a flat array lookup + a single GPU draw call — \(O(1)\) with no decoding overhead. Every frame is already decoded and ready, so the browser doesn't need to touch the video codec at all during scrolling. This is the same technique Apple uses on their product pages (iPhone, MacBook) for smooth scroll-driven video sequences.

## Trade-off
The trade-off is a brief loading phase (2–4 seconds) while frames are extracted. During this time, a minimal, elegant loading spinner/progress bar is displayed. This is acceptable given the resulting 60fps buttery-smooth experience.
