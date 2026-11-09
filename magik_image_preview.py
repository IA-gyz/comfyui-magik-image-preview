"""Standalone temporary image previews; no iTools dependencies."""
import json
import os
import uuid

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import folder_paths
from comfy.cli_args import args


class MagikImagePreview:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",)},
                "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"}}

    RETURN_TYPES = ()
    FUNCTION = "preview"
    OUTPUT_NODE = True
    CATEGORY = "Magik/Image"
    DESCRIPTION = "Preview batches, browse generation history, compare images and attach notes."

    def preview(self, images, prompt=None, extra_pnginfo=None):
        if images is None or len(images) == 0:
            return {"ui": {"magik_preview": []}}
        if images.ndim != 4 or images.shape[-1] not in (1, 3, 4):
            raise ValueError("Expected IMAGE batch [batch, height, width, channels] with 1, 3 or 4 channels.")
        if images.shape[1] < 1 or images.shape[2] < 1:
            raise ValueError("Preview images must have positive width and height.")
        root = folder_paths.get_temp_directory()
        subfolder = "magik_image_preview"
        destination = os.path.join(root, subfolder)
        os.makedirs(destination, exist_ok=True)
        generation = uuid.uuid4().hex
        metadata = None
        if not args.disable_metadata:
            metadata = PngInfo()
            if prompt is not None:
                metadata.add_text("prompt", json.dumps(prompt))
            for key, value in (extra_pnginfo or {}).items():
                metadata.add_text(key, json.dumps(value))
        results = []
        for index, tensor in enumerate(images):
            array = tensor.detach().cpu().float().numpy()
            array = np.nan_to_num(array, nan=0.0, posinf=1.0, neginf=0.0)
            array = (np.clip(array, 0, 1) * 255).astype(np.uint8)
            if array.shape[-1] == 1:
                array = array[..., 0]
            image = Image.fromarray(array)
            filename = f"{generation}_{index:05}.png"
            thumbnail = f"{generation}_{index:05}_thumb.webp"
            image.save(os.path.join(destination, filename), pnginfo=metadata, compress_level=1)
            image.thumbnail((256, 256), Image.Resampling.LANCZOS)
            image.save(os.path.join(destination, thumbnail), format="WEBP", quality=80)
            results.append({"filename": filename, "thumbnail": thumbnail,
                            "subfolder": subfolder, "type": "temp",
                            "width": int(tensor.shape[1]), "height": int(tensor.shape[0]),
                            "batch_index": index, "generation": generation})
        return {"ui": {"magik_preview": results}}
