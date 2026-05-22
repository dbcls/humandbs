// --- Configuration & Materials ---

export const INITIAL_CAROUSEL_RADIUS = 1500;
export const INITIAL_PARTICLE_SCALE = 400; // Global multiplier for physical marble size
export const INITIAL_CAROUSEL_ROTATION_SPEED = 0.02; // Radians per second
export const INITIAL_CAMERA_Y = 500; // Vertical position of the camera
export const INITIAL_CAMERA_Z = 2000; // Zoom distance of the camera (adjust based on your preference!)
export const INITIAL_SCENE_OFFSET_Y = 50; // Vertical offset to prevent cutoff at the bottom
export const INITIAL_MATERIAL_ROUGHNESS = 0.8; // High roughness for a matte look
export const INITIAL_LIGHT_AMBIENT = 3.0;
export const INITIAL_LIGHT_AMBIENT_COLOR = "#6ee0e2";
export const INITIAL_LIGHT_DIRECTIONAL = 1.0;
export const INITIAL_LIGHT_POINT_1 = 3.0;
export const INITIAL_LIGHT_POINT_2 = 3.0;
export const INITIAL_PHYSICS_FORCE = 0.1;
export const INITIAL_PARTICLE_LABEL_FONT_SIZE = 22;
export const INITIAL_FOG_NEAR = 650;
export const INITIAL_FOG_FAR = 5000;
export const INITIAL_MAX_PARTICLES = 100;

// Macromolecule HSL Color Parameters
export const MACRO_COLOR_S_NEUTRAL = 0.25; // Low saturation for neutral base
export const MACRO_COLOR_L_NEUTRAL = 0.9; // High lightness for neutral base
export const MACRO_COLOR_S_VIVID = 0.6; // Moderate saturation for vivid points (soft)
export const MACRO_COLOR_L_VIVID = 0.5; // Moderate lightness for vivid points (soft)
export const MACRO_VIVID_PROBABILITY = 0.1; // 10% chance for a particle to be a vivid point
