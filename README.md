# Magik Image Preview

Standalone ComfyUI output node, category **Magik/Image**. Connect an IMAGE batch.

## Install

Extract `Magik_Image_Preview` into `ComfyUI/custom_nodes/`, restart ComfyUI, and refresh the browser. Add **Magik Image Preview**. It can coexist with iTools and has no iTools dependency. Uses NumPy and Pillow from your ComfyUI environment.

## Controls

- **History:** thumbnails grouped by generation; retains eight generations and all images in their batches. Click a thumbnail to select it.
- **◀ / ▶:** navigate retained images in batch order.
- **Latest:** return to the latest image.
- **Compare:** select A and B independently. Defaults to corresponding batch positions in the previous and latest generations when available. A is left; B is right. Move the pointer or use the slider to adjust the divider.
- **Fit each image:** fit each image independently to the same viewport. Ideal for an original and its upscale with matching composition/aspect ratio. Different aspect ratios retain their shape and are not registered or warped.
- **Same pixel scale:** both images use the same scale, centered; preserves their relative pixel dimensions.
- **Note:** edit the selected image's note (B in comparison mode). Notes appear beneath the viewport and in thumbnail tooltips.
- **Open:** open selected full-resolution PNG in a browser tab.
- **Clear:** clear this node's history references and notes.

History file references, notes and alignment preference are stored in workflow properties. Save the workflow to preserve them. Images themselves are temporary files under ComfyUI's temp directory, in `magik_image_preview/`. If that directory is cleared, restored history displays an unavailable message; run again to create new previews. This is not an archival image saver. Clear and history eviction do not delete files; normal ComfyUI temp-file management applies. Full-resolution PNGs are written for every batch image, plus small WebP thumbnails. Large batches still require proportional disk space.

PNG metadata contains the prompt and extra PNG information unless ComfyUI metadata is disabled. There is no prompt-history editor or viewer. Workflow properties can contain notes and file references even when PNG metadata is disabled.

Image descriptors enter history synchronously in execution/batch order, independent of network loading. History uses thumbnails; full-resolution decoding is limited to the active single image or comparison pair. Existing node callbacks are chained. The extension never changes the DOM wrapper dimensions or removes other extensions' widgets.

## Validation

Python compilation and JavaScript syntax checks passed. Four backend tests cover ordered batches and metadata, empty batches, grayscale/RGB/RGBA and nonfinite values, disabled metadata and invalid channel counts. Tests use a NumPy tensor adapter because Torch and ComfyUI are not installed in the build environment. Full integration, DOM layout and frontend-version compatibility require testing in ComfyUI.

The implementation uses the classic custom-node API and ComfyUI's `addDOMWidget` frontend facility.
