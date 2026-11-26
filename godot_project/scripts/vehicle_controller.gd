extends VehicleBody3D
class_name ApexVehicleController

@export_group("Engine & Drivetrain")
@export var max_engine_force: float = 3400.0
@export var max_brake_force: float = 130.0
@export var max_steer_angle_deg: float = 31.0
@export var steer_speed: float = 5.4
@export var nos_force_multiplier: float = 1.65
@export var nos_drain_rate: float = 24.0
@export var nos_regen_rate: float = 7.5
@export var downforce_coeff: float = 3.2

@export_group("Telemetry & Drift")
@export var use_accelerometer_steer: bool = false

var nos_charge: float = 100.0
var nos_active: bool = false
var current_gear: int = 1
var current_rpm: float = 980.0
var speed_kmh: float = 0.0
var drift_score: float = 0.0
var is_drifting: bool = false
var surface_grip_multiplier: float = 1.0

var _steer_target: float = 0.0
var _touch_throttle: float = 0.0
var _touch_brake: float = 0.0
var _touch_steer: float = 0.0
var _touch_handbrake: bool = false
var _touch_nos: bool = false

@onready var chase_cam: Camera3D = $ChaseCam
@onready var wheel_fl: VehicleWheel3D = $WheelFL
@onready var wheel_fr: VehicleWheel3D = $WheelFR
@onready var wheel_rl: VehicleWheel3D = $WheelRL
@onready var wheel_rr: VehicleWheel3D = $WheelRR
@onready var tail_light_left: OmniLight3D = $TailLightLeft
@onready var tail_light_right: OmniLight3D = $TailLightRight


func _ready() -> void:
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3(0.0, -0.34, 0.12)
	if chase_cam:
		chase_cam.current = true


func set_touch_controls(throttle: float, brake: float, steer: float, handbrake: bool, nos: bool) -> void:
	_touch_throttle = clamp(throttle, 0.0, 1.0)
	_touch_brake = clamp(brake, 0.0, 1.0)
	_touch_steer = clamp(steer, -1.0, 1.0)
	_touch_handbrake = handbrake
	_touch_nos = nos


func set_surface_grip_multiplier(mult: float) -> void:
	surface_grip_multiplier = clamp(mult, 0.55, 1.15)
	if wheel_fl:
		wheel_fl.wheel_friction_slip = 3.1 * surface_grip_multiplier
	if wheel_fr:
		wheel_fr.wheel_friction_slip = 3.1 * surface_grip_multiplier


func _physics_process(delta: float) -> void:
	var throttle_in: float = max(Input.get_action_strength("throttle"), _touch_throttle)
	var brake_in: float = max(Input.get_action_strength("brake"), _touch_brake)
	var handbrake_in: bool = Input.is_action_pressed("handbrake") or _touch_handbrake
	var nos_in: bool = Input.is_action_pressed("nos") or _touch_nos

	var key_steer: float = Input.get_action_strength("steer_left") - Input.get_action_strength("steer_right")
	var steer_in: float = clamp(key_steer + _touch_steer, -1.0, 1.0)

	if use_accelerometer_steer and OS.has_feature("mobile"):
		var accel: Vector3 = Input.get_accelerometer()
		steer_in = clamp(-accel.x * 0.28 + steer_in, -1.0, 1.0)

	# Speed-sensitive steering limit + smooth actuator
	var fwd_dir: Vector3 = -global_transform.basis.z
	var forward_speed: float = linear_velocity.dot(fwd_dir)
	speed_kmh = linear_velocity.length() * 3.6
	var speed_factor: float = clamp(1.0 - (speed_kmh / 340.0) * 0.58, 0.36, 1.0)
	_steer_target = deg_to_rad(max_steer_angle_deg * speed_factor) * steer_in
	steering = move_toward(steering, _steer_target, steer_speed * delta)

	# Aerodynamic downforce
	var aero_downforce: float = linear_velocity.length_squared() * downforce_coeff
	apply_central_force(-global_transform.basis.y * aero_downforce)

	# NOS Nitrous Boost
	if nos_in and nos_charge > 4.0 and throttle_in > 0.15:
		nos_active = true
		nos_charge = max(0.0, nos_charge - nos_drain_rate * delta)
	else:
		nos_active = false
		var regen_bonus: float = 1.6 if is_drifting else 1.0
		nos_charge = min(100.0, nos_charge + nos_regen_rate * regen_bonus * delta)

	# Torque curve & 6-speed automatic gearbox simulation
	var gear_thresholds := [0.0, 52.0, 98.0, 148.0, 198.0, 250.0, 340.0]
	current_gear = 1
	for g in range(1, gear_thresholds.size()):
		if speed_kmh >= gear_thresholds[g - 1]:
			current_gear = g

	var gear_min: float = gear_thresholds[current_gear - 1]
	var gear_max: float = gear_thresholds[current_gear]
	var gear_ratio: float = clamp((speed_kmh - gear_min) / max(1.0, gear_max - gear_min), 0.0, 1.0)
	current_rpm = lerp(2100.0, 8200.0, gear_ratio) if throttle_in > 0.05 else max(950.0, current_rpm - 3200.0 * delta)

	var torque_curve: float = 1.0 - 0.35 * abs(gear_ratio - 0.65)
	var boost: float = nos_force_multiplier if nos_active else 1.0
	var drive_force: float = 0.0
	if throttle_in > 0.01:
		drive_force = throttle_in * max_engine_force * torque_curve * boost
	elif brake_in > 0.01 and forward_speed < 2.0:
		drive_force = -brake_in * (max_engine_force * 0.55)

	engine_force = drive_force
	brake = brake_in * max_brake_force * lerp(0.8, 1.0, surface_grip_multiplier) if forward_speed > 1.5 else 0.0

	# Handbrake rear slip modulation scaled by weather surface grip
	if handbrake_in:
		wheel_rl.wheel_friction_slip = 1.15 * surface_grip_multiplier
		wheel_rr.wheel_friction_slip = 1.15 * surface_grip_multiplier
		wheel_rl.brake = max_brake_force * 0.85 * surface_grip_multiplier
		wheel_rr.brake = max_brake_force * 0.85 * surface_grip_multiplier
	else:
		wheel_rl.wheel_friction_slip = 2.65 * surface_grip_multiplier
		wheel_rr.wheel_friction_slip = 2.65 * surface_grip_multiplier
		wheel_rl.brake = 0.0
		wheel_rr.brake = 0.0

	# Drift detection & score banking
	var right_dir: Vector3 = global_transform.basis.x
	var lateral_speed: float = abs(linear_velocity.dot(right_dir))
	is_drifting = speed_kmh > 38.0 and lateral_speed > 4.2
	if is_drifting:
		drift_score += lateral_speed * speed_kmh * 0.045 * delta

	# Visual feedback: brake glow & speed FOV
	var brake_glow: float = 2.8 if (brake_in > 0.1 or handbrake_in) else 0.45
	if tail_light_left:
		tail_light_left.light_energy = brake_glow
	if tail_light_right:
		tail_light_right.light_energy = brake_glow

	if chase_cam:
		var target_fov: float = 64.0 + clamp(speed_kmh / 320.0, 0.0, 1.0) * 16.0 + (8.0 if nos_active else 0.0)
		chase_cam.fov = lerp(chase_cam.fov, target_fov, 6.0 * delta)
