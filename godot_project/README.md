# Apex Velocity 3D — Godot 4.3 Android & Forward+ Project

This folder contains the native **Godot 4.3** 3D project for **Apex Velocity**, configured for Vulkan **Mobile** (Android arm64) and **Forward+** rendering with:

- `VehicleBody3D` + 4x `VehicleWheel3D` suspension, camber/slip tuning, downforce, 6-speed torque curve, and NOS boost (`scripts/vehicle_controller.gd`).
- Procedural `Path3D` circuit builder with damp clearcoat `StandardMaterial3D` asphalt, trimesh road collision, and highway lighting (`scripts/track_builder.gd`).
- `WorldEnvironment` with ACES Filmic tone mapping (`tonemap_mode = 3`), Screen-Space Reflections (`ssr_enabled = true`), SSAO, glow bloom, and `ProceduralSkyMaterial` twilight sky (`scenes/main_race.tscn`).
- Android touchscreen + accelerometer input hooks and preconfigured `Android` / `Web` export presets (`export_presets.cfg`).

## Opening & Exporting for Android
1. Download and open **Godot Engine 4.3+** (Standard edition).
2. Click **Import** and select `godot_project/project.godot`.
3. Install Godot Android Build Templates via **Editor -> Manage Export Templates**.
4. Open **Project -> Export...**, pick the **Android** preset, and click **Export Project** to build `apex_velocity_3d.apk`.
