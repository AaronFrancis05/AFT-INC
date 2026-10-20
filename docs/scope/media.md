# Epic: AI Media Studio

Back to the [scope index](index.md).

Generate commercial use images in HD and 4K, short 9:16 videos ready for TikTok, and later 3D models with turntable videos. Hosted models sit behind one internal interface; LLMs are multi provider. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Slice 7: Images and video

### 83. LLM gateway · needs a decision · GA
One internal way to call any LLM provider, with routing and fallback.
**Done when:** at least two providers work behind one interface; a provider outage falls back without the caller noticing (X6); model output is validated before use and user content is never treated as instructions (X14).
- [ ] Design it (spec): `/architect llm gateway`

### 84. AI spend controls · needs a decision · GA
Every AI call is costed, and nobody can overspend.
**Done when:** each call records its real cost; credits are reserved before a job and settled after (B8); per workspace caps and provider budgets stop runaway spend with a clear message.
- [ ] Design it (spec): `/architect ai spend controls`

### 85. AI eval harness · needs a decision
Measure model quality before changing prompts, models, or providers.
**Done when:** a fixed set of prompts runs on demand and in CI, scores are stored per model and prompt version, and a drop below a threshold fails the check.
- [ ] Design it (spec): `/architect ai eval harness`

### 86. Generation jobs and media adapters · needs a decision
The engine behind every image, video, and 3D generation.
**Done when:** a generation runs as a durable job through a provider adapter; hung jobs time out, fail, and refund (G1); closing the tab does not stop the job and the user is notified when it finishes (G7); outputs are copied to AFT storage immediately (G8).
- [ ] Design it (spec): `/architect generation jobs and media adapters`

### 87. Text to image · needs a decision
Type a prompt, get images.
**Done when:** a user picks style, size, and count, sees progress, and gets images saved to their library; credits are charged only for delivered images.
- [ ] Design it (spec): `/architect text to image`

### 88. Image to image and edits · needs a decision
Start from an uploaded image: variations, edits, and background changes.
**Done when:** uploads are checked for type and size, rotation is fixed, unusual formats are converted, and unsupported animated files are rejected with a reason (G6).
- [ ] Design it (spec): `/architect image to image and edits`

### 89. Upscaling to HD and 4K · needs a decision
Any image can be delivered at high resolution.
**Done when:** the real output size is checked, images below the requested resolution are upscaled to it, and the job fails with a refund if that is not possible (G4).
- [ ] Design it (spec): `/architect upscaling to hd and 4k`

### 90. Asset library · needs a decision
Every generated and uploaded file in one place.
**Done when:** assets are private by default with shareable links; storage quotas are checked before a job starts; deleting an asset in use warns first (G9).
- [ ] Design it (spec): `/architect asset library`

### 91. Content moderation · needs a decision
Unsafe prompts and outputs are stopped.
**Done when:** prompts and outputs are both checked; blocked requests explain why and refund (G2); disallowed content is hard blocked and escalated (G3).
- [ ] Design it (spec): `/architect content moderation`

### 92. Provenance and commercial licensing · needs a decision
Customers can prove they may use what they generated.
**Done when:** only commercially safe models are offered; each asset records provider, model, terms, and an embedded provenance manifest; the asset page shows the license (G10).
- [ ] Design it (spec): `/architect provenance and commercial licensing`

### 93. Short video generation · needs a decision
Prompt or image to a short vertical marketing video.
**Done when:** a user generates a 9:16 video from text or an image, sees progress, and receives it in the library; hung jobs time out and refund (G1).
- [ ] Design it (spec): `/architect short video generation`

### 94. TikTok ready export · needs a decision
Every video downloads in a format TikTok and Reels accept.
**Done when:** exports are always 1080x1920, H.264 with AAC audio, within length and size limits, and checked before download (G5).
- [ ] Design it (spec): `/architect tiktok ready export`

### 95. TikTok publishing · needs a decision
Post a finished video straight to a connected TikTok account.
**Done when:** a user connects TikTok and posts a video; expired tokens, wrong account types, limits, and rejections show the exact reason and fall back to download (G12).
- [ ] Design it (spec): `/architect tiktok publishing`

## Slice 8: 3D

### 96. 3D model generation · needs a decision
Text or image to a 3D model file.
**Done when:** a user gets a GLB (and USDZ) model in the library; broken or oversized meshes are repaired or simplified on the server (G11).
- [ ] Design it (spec): `/architect 3d model generation`

### 97. 3D viewer · needs a decision
Inspect 3D models in the browser.
**Done when:** models can be rotated and zoomed in the browser, and devices without WebGL get a preview image and video instead (G11).
- [ ] Design it (spec): `/architect 3d viewer`

### 98. Turntable video · needs a decision
Every 3D model gets an automatic spinning showcase video.
**Done when:** a turntable video renders automatically for each model and exports in the TikTok ready format from feature 94.
- [ ] Design it (spec): `/architect turntable video`
