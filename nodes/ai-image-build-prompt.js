// AI 이미지 — 프리셋 → ComfyUI API 워크플로우 JSON 변환
// 입력: $input.first().json (webhook body 직접 매핑)
// 출력: { comfyPrompt, prompt_text, preset, seed, callback_url, comfyHost }

const input = $input.first().json;
const prompt = input.prompt || '';
const preset = input.preset || 'retro_hisat';
const seed = input.seed != null ? Number(input.seed) : Math.floor(Math.random() * 2147483647);
const callback_url = input.callback_url || '';

const COMFY_HOST = 'COMFYUI_HOST_HERE';
const COMFY_PORT = 'COMFYUI_PORT_HERE';
const comfyBase = `http://${COMFY_HOST}:${COMFY_PORT}`;

// ─── 프리셋 정의 ──────────────────────────────────────────
const presets = {
    retro_hisat: {
        checkpoint: 'flux1-dev-fp8.safetensors',
        loras: [{ name: 'xjie-retro-high-saturation-anime.safetensors', strength: 0.8 }],
        width: 960, height: 1280,
        cfg: 3.5, steps: 25, sampler: 'euler', scheduler: 'sgm_uniform',
        negative: '',
        triggerWord: '',
    },
    gothic_niji: {
        checkpoint: 'flux1-dev-fp8.safetensors',
        loras: [{ name: 'MoriiMee_Gothic_Niji_Style_FLUX.safetensors', strength: 0.85 }],
        width: 960, height: 1280,
        cfg: 3.5, steps: 25, sampler: 'euler', scheduler: 'sgm_uniform',
        negative: '',
        triggerWord: '',
    },
    dark_noir: {
        checkpoint: 'flux1-dev-fp8.safetensors',
        loras: [
            { name: 'dark_fantasy_flux.safetensors', strength: 0.6 },
            { name: 'MoXinV1.safetensors', strength: 0.35 },
        ],
        width: 960, height: 1280,
        cfg: 3.5, steps: 25, sampler: 'euler', scheduler: 'sgm_uniform',
        negative: '',
        triggerWord: '',
    },
    retro_vintage: {
        checkpoint: 'flux1-dev-fp8.safetensors',
        loras: [
            { name: 'dark_fantasy_flux.safetensors', strength: 0.5 },
            { name: 'RetroAnimeFluxV1.safetensors', strength: 0.65 },
        ],
        width: 960, height: 1280,
        cfg: 3.5, steps: 25, sampler: 'euler', scheduler: 'sgm_uniform',
        negative: '',
        triggerWord: '',
    },
    kimhongdo: {
        checkpoint: 'sd_xl_turbo_1.0_fp16.safetensors',
        loras: [{ name: 'KimHongDo_a1_ZIT.safetensors', strength: 1.0 }],
        width: 576, height: 1024,
        cfg: 1.5, steps: 6, sampler: 'euler_ancestral', scheduler: 'normal',
        negative: 'low quality, blurry, deformed',
        triggerWord: 'khd_a1, ',
    },
};

const p = presets[preset];
if (!p) {
    throw new Error(`알 수 없는 프리셋: ${preset}. 사용 가능: ${Object.keys(presets).join(', ')}`);
}

const finalPrompt = p.triggerWord + prompt;

// ─── ComfyUI API 워크플로우 JSON 생성 ──────────────────────
// 노드 ID를 순차 부여
let nodeId = 1;
const nodes = {};

// 1) CheckpointLoaderSimple
const ckptId = String(nodeId++);
nodes[ckptId] = {
    class_type: 'CheckpointLoaderSimple',
    inputs: { ckpt_name: p.checkpoint },
};

// 2) LoRA 체이닝
let prevModelOutput = [ckptId, 0]; // MODEL
let prevClipOutput = [ckptId, 1];  // CLIP

for (const lora of p.loras) {
    const loraId = String(nodeId++);
    nodes[loraId] = {
        class_type: 'LoraLoader',
        inputs: {
            lora_name: lora.name,
            strength_model: lora.strength,
            strength_clip: lora.strength,
            model: prevModelOutput,
            clip: prevClipOutput,
        },
    };
    prevModelOutput = [loraId, 0];
    prevClipOutput = [loraId, 1];
}

// 3) CLIPTextEncode — positive
const posId = String(nodeId++);
nodes[posId] = {
    class_type: 'CLIPTextEncode',
    inputs: {
        text: finalPrompt,
        clip: prevClipOutput,
    },
};

// 4) CLIPTextEncode — negative
const negId = String(nodeId++);
nodes[negId] = {
    class_type: 'CLIPTextEncode',
    inputs: {
        text: p.negative,
        clip: prevClipOutput,
    },
};

// 5) EmptyLatentImage
const latentId = String(nodeId++);
nodes[latentId] = {
    class_type: 'EmptyLatentImage',
    inputs: {
        width: p.width,
        height: p.height,
        batch_size: 1,
    },
};

// 6) KSampler
const samplerId = String(nodeId++);
nodes[samplerId] = {
    class_type: 'KSampler',
    inputs: {
        seed: seed,
        steps: p.steps,
        cfg: p.cfg,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        denoise: 1,
        model: prevModelOutput,
        positive: [posId, 0],
        negative: [negId, 0],
        latent_image: [latentId, 0],
    },
};

// 7) VAEDecode
const vaeDecId = String(nodeId++);
nodes[vaeDecId] = {
    class_type: 'VAEDecode',
    inputs: {
        samples: [samplerId, 0],
        vae: [ckptId, 2], // VAE는 checkpoint 3번째 출력
    },
};

// 8) SaveImage
const saveId = String(nodeId++);
nodes[saveId] = {
    class_type: 'SaveImage',
    inputs: {
        filename_prefix: `ai_${preset}`,
        images: [vaeDecId, 0],
    },
};

return [{
    json: {
        comfyPrompt: nodes,
        prompt_text: finalPrompt,
        preset,
        seed,
        callback_url,
        comfyBase,
        saveNodeId: saveId,
    },
}];
