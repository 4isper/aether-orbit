import type { Ref } from 'react'
import type { Mesh } from 'three'
import { noiseGLSL } from '../shaders/noise'

const moonVertex = /* glsl */ `
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vObjectPosition = normalize(position);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const moonFragment = /* glsl */ `
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}

vec3 perturbNormal(vec3 surfacePosition, vec3 surfaceNormal, float height) {
  vec3 sigmaX = normalize(dFdx(surfacePosition));
  vec3 sigmaY = normalize(dFdy(surfacePosition));
  vec3 R1 = cross(sigmaY, surfaceNormal);
  vec3 R2 = cross(surfaceNormal, sigmaX);
  float det = dot(sigmaX, R1);
  vec3 gradient = sign(det) * (
    dFdx(height) * R1 + dFdy(height) * R2
  );
  return normalize(abs(det) * surfaceNormal - gradient);
}

void main() {
  vec3 p = normalize(vObjectPosition);
  vec3 geometricN = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);

  float highlands = fbm4(p * 5.2 + vec3(3.1, -4.7, 1.9)) * 0.5 + 0.5;
  float craters = ridgedFbm(p * 9.5 + vec3(-2.4, 5.1, 3.3));
  vec3 albedo = mix(vec3(0.38, 0.37, 0.35), vec3(0.55, 0.54, 0.51), highlands);
  albedo *= 0.8 + craters * 0.4;

  float maria = smoothstep(0.42, 0.78, fbm(p * 1.9 + vec3(6.2, -1.4, 8.8)) * 0.5 + 0.5);
  albedo = mix(albedo, vec3(0.22, 0.23, 0.26), maria * 0.85);

  float micro = fbm4(p * 60.0 + vec3(1.7, 8.2, -3.4));
  float bumpFade = smoothstep(0.08, 0.34, max(dot(geometricN, V), 0.0));
  float elevation = micro * 0.004 * bumpFade;
  vec3 N = perturbNormal(vWorldPosition, geometricN, elevation);

  vec3 L = normalize(-vWorldPosition);
  float diffuse = max(dot(N, L), 0.0);
  vec3 color = albedo * (0.012 + diffuse * 1.1);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type MoonProps = {
  radius?: number
  ref?: Ref<Mesh>
}

export function Moon({ radius = 0.34, ref }: MoonProps) {
  return (
    <mesh ref={ref} scale={radius}>
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial vertexShader={moonVertex} fragmentShader={moonFragment} />
    </mesh>
  )
}
