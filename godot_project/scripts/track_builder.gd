extends Node3D
class_name ApexTrackBuilder

@export var road_width: float = 15.0
@export var track_segments: int = 240
@export var kerb_width: float = 1.1
@export var barrier_height: float = 1.25

@onready var path_3d: Path3D = $CircuitPath


func _ready() -> void:
	if path_3d and path_3d.curve == null:
		_build_default_circuit_curve()
	_generate_track_geometry()


func _build_default_circuit_curve() -> void:
	var curve := Curve3D.new()
	var pts := [
		Vector3(0, 0, 0),
		Vector3(0, 0, -160),
		Vector3(55, 2.5, -280),
		Vector3(185, 5.0, -320),
		Vector3(295, 2.5, -245),
		Vector3(310, 0.5, -110),
		Vector3(235, 0.0, -25),
		Vector3(325, 0.5, 95),
		Vector3(345, 2.0, 220),
		Vector3(215, 1.5, 285),
		Vector3(85, 0.0, 235),
		Vector3(-25, 0.0, 130),
	]
	for p in pts:
		curve.add_point(p)
	curve.closed = true
	path_3d.curve = curve


func _generate_track_geometry() -> void:
	if not path_3d or not path_3d.curve:
		return

	var curve: Curve3D = path_3d.curve
	var length: float = curve.get_baked_length()
	var half_w: float = road_width * 0.5

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	for i in range(track_segments + 1):
		var t: float = float(i) / float(track_segments)
		var dist: float = fmod(t * length, length)
		var pos: Vector3 = curve.sample_baked(dist)
		var next_pos: Vector3 = curve.sample_baked(fmod(dist + 1.5, length))
		var fwd: Vector3 = (next_pos - pos).normalized()
		var right: Vector3 = fwd.cross(Vector3.UP).normalized()

		var left_pt: Vector3 = pos - right * half_w
		var right_pt: Vector3 = pos + right * half_w
		var v_coord: float = t * (length / 10.0)

		st.set_normal(Vector3.UP)
		st.set_uv(Vector2(0.0, v_coord))
		st.add_vertex(left_pt)

		st.set_normal(Vector3.UP)
		st.set_uv(Vector2(1.0, v_coord))
		st.add_vertex(right_pt)

	for i in range(track_segments):
		var base: int = i * 2
		st.add_index(base)
		st.add_index(base + 1)
		st.add_index(base + 2)
		st.add_index(base + 1)
		st.add_index(base + 3)
		st.add_index(base + 2)

	var road_mesh: ArrayMesh = st.commit()
	var road_mat := StandardMaterial3D.new()
	road_mat.albedo_color = Color(0.11, 0.13, 0.17)
	road_mat.roughness = 0.42
	road_mat.metallic = 0.08
	road_mat.clearcoat_enabled = true
	road_mat.clearcoat = 0.35
	road_mat.clearcoat_roughness = 0.35

	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = road_mesh
	mesh_instance.material_override = road_mat
	add_child(mesh_instance)

	# Generate static trimesh collision for realistic suspension contact
	var static_body := StaticBody3D.new()
	var col_shape := CollisionShape3D.new()
	col_shape.shape = road_mesh.create_trimesh_shape()
	static_body.add_child(col_shape)
	add_child(static_body)

	# Place highway streetlights along outer verge
	for i in range(0, track_segments, 12):
		var dist: float = (float(i) / float(track_segments)) * length
		var pos: Vector3 = curve.sample_baked(dist)
		var next_pos: Vector3 = curve.sample_baked(fmod(dist + 1.5, length))
		var fwd: Vector3 = (next_pos - pos).normalized()
		var right: Vector3 = fwd.cross(Vector3.UP).normalized()
		var side: float = 1.0 if (i / 12) % 2 == 0 else -1.0

		var lamp_light := OmniLight3D.new()
		lamp_light.position = pos + right * (half_w + 1.4) * side + Vector3(0.0, 5.4, 0.0)
		lamp_light.light_color = Color(1.0, 0.84, 0.56)
		lamp_light.light_energy = 2.4
		lamp_light.omni_range = 24.0
		add_child(lamp_light)
