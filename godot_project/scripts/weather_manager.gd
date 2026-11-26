extends Node
class_name ApexWeatherManager

enum WeatherType {
	CLEAR,
	LIGHT_RAIN,
	FOG,
}

@export var world_environment: WorldEnvironment
@export var player_car: ApexVehicleController
@export var rain_particles: GPUParticles3D
@export var post_shader_rect: ColorRect

var active_weather: WeatherType = WeatherType.CLEAR
var current_grip_multiplier: float = 1.0


func _ready() -> void:
	randomize()
	trigger_random_race_weather()


func trigger_random_race_weather() -> void:
	var roll := randf()
	if roll < 0.5:
		apply_weather(WeatherType.LIGHT_RAIN)
	else:
		apply_weather(WeatherType.FOG)


func apply_weather(weather: WeatherType) -> void:
	active_weather = weather
	var env: Environment = world_environment.environment if world_environment else null
	var mat: ShaderMaterial = post_shader_rect.material as ShaderMaterial if post_shader_rect else null

	match weather:
		WeatherType.LIGHT_RAIN:
			current_grip_multiplier = 0.78
			if env:
				env.fog_enabled = true
				env.fog_light_color = Color(0.05, 0.08, 0.14)
				env.fog_density = 0.0052
				env.glow_bloom = 0.36
			if rain_particles:
				rain_particles.emitting = true
				rain_particles.visible = true
			if mat:
				mat.set_shader_parameter("rain_intensity", 0.85)
				mat.set_shader_parameter("fog_intensity", 0.25)
				mat.set_shader_parameter("fog_tint", Color(0.05, 0.08, 0.14, 1.0))

		WeatherType.FOG:
			current_grip_multiplier = 0.90
			if env:
				env.fog_enabled = true
				env.fog_light_color = Color(0.14, 0.18, 0.24)
				env.fog_density = 0.0125
				env.glow_bloom = 0.28
			if rain_particles:
				rain_particles.emitting = false
				rain_particles.visible = false
			if mat:
				mat.set_shader_parameter("rain_intensity", 0.0)
				mat.set_shader_parameter("fog_intensity", 0.88)
				mat.set_shader_parameter("fog_tint", Color(0.14, 0.18, 0.24, 1.0))

		_:
			current_grip_multiplier = 1.0
			if env:
				env.fog_enabled = true
				env.fog_light_color = Color(0.06, 0.08, 0.13)
				env.fog_density = 0.0022
			if rain_particles:
				rain_particles.emitting = false
				rain_particles.visible = false
			if mat:
				mat.set_shader_parameter("rain_intensity", 0.0)
				mat.set_shader_parameter("fog_intensity", 0.0)

	if player_car:
		player_car.set_surface_grip_multiplier(current_grip_multiplier)


func _process(_delta: float) -> void:
	if player_car and rain_particles and rain_particles.visible:
		rain_particles.global_position = player_car.global_position + Vector3(0.0, 9.0, -8.0)
	if player_car and post_shader_rect and post_shader_rect.material is ShaderMaterial:
		var mat := post_shader_rect.material as ShaderMaterial
		mat.set_shader_parameter("speed_norm", clamp(player_car.speed_kmh / 300.0, 0.0, 1.0))
