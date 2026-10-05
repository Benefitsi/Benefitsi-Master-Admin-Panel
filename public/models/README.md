# Browser partner image upscaler

`realesr-general-x4v3-static384.onnx` is the fixed-shape browser export of the general-purpose Real-ESRGAN x4v3 model. It is licensed under BSD-3-Clause; see `REAL-ESRGAN-LICENSE`.

- Source export: <https://huggingface.co/Saimon8420/realesr-general-x4v3-web/tree/a09f86b>
- Original project: <https://github.com/xinntao/Real-ESRGAN>
- Model SHA-256: `85FF534471B543C25D65079838763531070E18951E441D43EDEED45F82CE320A`
- Export size: 4,878,946 bytes

The model is loaded only when an undersized raster image is selected. The image is processed in the browser; inference uses WebGPU when available and ONNX Runtime Web's browser CPU backend otherwise.
