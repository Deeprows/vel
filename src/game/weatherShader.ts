import * as THREE from 'three';

/**
 * Post-processing ShaderPass definition for Three.js EffectComposer.
 * Adds screen-space raindrop lens refraction, atmospheric volumetric mist haze,
 * and speed-responsive wet vignette during dynamic weather conditions.
 */
export const WeatherPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRainIntensity: { value: 0 },
    uFogIntensity: { value: 0 },
    uSpeedNorm: { value: 0 },
    uFogColor: { value: new THREE.Color(0x0c1320) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uRainIntensity;
    uniform float uFogIntensity;
    uniform float uSpeedNorm;
    uniform vec3 uFogColor;
    varying vec2 vUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    vec2 rainDropLayer(vec2 uv, float scale, float time) {
      vec2 grid = vec2(scale * 1.4, scale);
      vec2 st = uv * grid;
      st.y += time * 0.55;
      vec2 id = floor(st);
      vec2 f = fract(st) - 0.5;
      float n = hash21(id);
      if (n < 0.62) return vec2(0.0);

      float ySlide = fract(n * 31.7 + time * (0.28 + n * 0.35)) - 0.5;
      vec2 dropPos = vec2((n - 0.81) * 0.8, ySlide * 0.65);
      float d = length(f - dropPos);
      float radius = 0.08 + 0.05 * fract(n * 19.3);
      float mask = smoothstep(radius, radius * 0.2, d);
      vec2 normal = normalize(f - dropPos + 0.0001) * mask;
      return normal;
    }

    void main() {
      vec2 uv = vUv;
      float distFromCenter = length(uv - 0.5);

      // Wet-lens raindrop distortion concentrated softly toward outer windshield edges
      vec2 dropOffset = vec2(0.0);
      float dropSpec = 0.0;
      if (uRainIntensity > 0.01) {
        float edgeMask = smoothstep(0.12, 0.62, distFromCenter) * 0.85 + 0.15;
        vec2 n1 = rainDropLayer(uv, 10.0, uTime);
        vec2 n2 = rainDropLayer(uv + vec2(0.37, 0.19), 17.0, uTime * 1.35);
        vec2 combined = (n1 + n2 * 0.7) * edgeMask * uRainIntensity;
        dropOffset = combined * (0.014 + uSpeedNorm * 0.008);
        dropSpec = clamp(length(combined) * 0.45, 0.0, 0.25);
      }

      vec4 baseSample = texture2D(tDiffuse, clamp(uv + dropOffset, 0.001, 0.999));
      vec3 col = baseSample.rgb;

      // Subtle cool wet grading & specular droplet glint during rain
      if (uRainIntensity > 0.01) {
        vec3 wetTint = mix(col, col * vec3(0.92, 0.97, 1.08), uRainIntensity * 0.38);
        col = wetTint + vec3(0.65, 0.82, 1.0) * dropSpec * uRainIntensity;
      }

      // Volumetric fog atmospheric scatter & upper-horizon mist veil
      if (uFogIntensity > 0.01) {
        float horizonBand = smoothstep(0.0, 0.72, uv.y) * (1.0 - smoothstep(0.72, 1.0, uv.y) * 0.35);
        float mistAmount = clamp(uFogIntensity * (0.14 + horizonBand * 0.26), 0.0, 0.44);
        col = mix(col, uFogColor * 1.45, mistAmount);
        // Soft headlight/streetlight bloom halo bleed in heavy fog
        col += uFogColor * (0.04 * uFogIntensity);
      }

      // Subtle aerodynamic speed + weather lens vignette
      float vig = smoothstep(0.88, 0.32, distFromCenter);
      float vigStrength = 0.08 + uRainIntensity * 0.08 + uFogIntensity * 0.06 + uSpeedNorm * 0.05;
      col *= mix(1.0, vig, vigStrength);

      gl_FragColor = vec4(col, baseSample.a);
    }
  `,
};
