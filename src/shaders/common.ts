/**
 * Shared GLSL snippets for planet-scale surfaces. Kept as strings so shader
 * materials can compose them next to ${noiseGLSL}.
 */

/** Vertex stage: object-space direction, world position and world normal, with optional uv. */
export function bodyVertexGLSL(withUv: boolean) {
  return /* glsl */`#include <common>
#include <logdepthbuf_pars_vertex>

${withUv ? 'varying vec2 vUv;' : ''}
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
${withUv ? '  vUv = uv;' : ''}
  vObjectPosition = normalize(position);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
#include <logdepthbuf_vertex>
}
`
}

/** Tangent-space normal perturbation for micro-relief shading. The tangent
 * frame is built from *object-space* derivatives: the surface position in
 * world space sits at ~1e4 from Solis, and float32 quantization there
 * (steps of ~0.0014 units) out-paces the per-pixel footprint of the small
 * close-up bodies — speckle. Object space stays small and exact. */
export const perturbNormalGLSL = /* glsl */ `
vec3 perturbNormal(vec3 surfacePosition, vec3 surfaceNormal, float height) {
  // Derivatives collapse on degenerate silhouette quads; falling back to the
  // geometric normal there keeps a single NaN pixel out of the bloom chain,
  // where the blur would otherwise spread it over the whole frame.
  vec3 dx = dFdx(surfacePosition);
  vec3 dy = dFdy(surfacePosition);
  vec3 sigmaX = length(dx) > 1e-7 ? dx / length(dx) : surfaceNormal;
  vec3 sigmaY = length(dy) > 1e-7 ? dy / length(dy) : surfaceNormal;
  vec3 R1 = cross(sigmaY, surfaceNormal);
  vec3 R2 = cross(surfaceNormal, sigmaX);
  float det = dot(sigmaX, R1);
  vec3 gradient = sign(det) * (
    dFdx(height) * R1 + dFdy(height) * R2
  );
  vec3 bent = abs(det) * surfaceNormal - gradient;
  return length(bent) > 1e-9 ? bent / length(bent) : surfaceNormal;
}
`
