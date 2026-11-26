shader_type canvas_item;

uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_linear_mipmap;
uniform float rain_intensity : hint_range(0.0, 1.0) = 0.0;
uniform float fog_intensity : hint_range(0.0, 1.0) = 0.0;
uniform float speed_norm : hint_range(0.0, 1.0) = 0.0;
uniform vec4 fog_tint : source_color = vec4(0.12, 0.16, 0.22, 1.0);

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

vec2 rain_drop_layer(vec2 uv, float scale, float t) {
	vec2 grid = vec2(scale * 1.4, scale);
	vec2 st = uv * grid;
	st.y += t * 0.55;
	vec2 id = floor(st);
	vec2 f = fract(st) - 0.5;
	float n = hash21(id);
	if (n < 0.62) {
		return vec2(0.0);
	}
	float slide = fract(n * 31.7 + t * (0.28 + n * 0.35)) - 0.5;
	vec2 pos = vec2((n - 0.81) * 0.8, slide * 0.65);
	float d = length(f - pos);
	float rad = 0.08 + 0.05 * fract(n * 19.3);
	float mask = smoothstep(rad, rad * 0.2, d);
	return normalize(f - pos + vec2(0.0001)) * mask;
}

void fragment() {
	vec2 uv = SCREEN_UV;
	float dist_center = length(uv - vec2(0.5));
	vec2 drop_offset = vec2(0.0);
	float drop_spec = 0.0;

	if (rain_intensity > 0.01) {
		float edge_mask = smoothstep(0.12, 0.62, dist_center) * 0.85 + 0.15;
		vec2 n1 = rain_drop_layer(uv, 10.0, TIME);
		vec2 n2 = rain_drop_layer(uv + vec2(0.37, 0.19), 17.0, TIME * 1.35);
		vec2 combined = (n1 + n2 * 0.7) * edge_mask * rain_intensity;
		drop_offset = combined * (0.014 + speed_norm * 0.008);
		drop_spec = clamp(length(combined) * 0.45, 0.0, 0.25);
	}

	vec4 base_col = texture(SCREEN_TEXTURE, clamp(uv + drop_offset, vec2(0.001), vec2(0.999)));
	vec3 col = base_col.rgb;

	if (rain_intensity > 0.01) {
		col = mix(col, col * vec3(0.92, 0.97, 1.08), rain_intensity * 0.38);
		col += vec3(0.65, 0.82, 1.0) * drop_spec * rain_intensity;
	}

	if (fog_intensity > 0.01) {
		float horizon_band = smoothstep(0.0, 0.72, uv.y) * (1.0 - smoothstep(0.72, 1.0, uv.y) * 0.35);
		float mist_amount = clamp(fog_intensity * (0.14 + horizon_band * 0.26), 0.0, 0.44);
		col = mix(col, fog_tint.rgb * 1.45, mist_amount);
		col += fog_tint.rgb * (0.04 * fog_intensity);
	}

	float vig = smoothstep(0.88, 0.32, dist_center);
	float vig_strength = 0.08 + rain_intensity * 0.08 + fog_intensity * 0.06 + speed_norm * 0.05;
	col *= mix(1.0, vig, vig_strength);

	COLOR = vec4(col, 1.0);
}
