import { useMemo, type ReactNode } from 'react'
import type { Ref } from 'react'
import { Vector3, type Mesh, type ShaderMaterial } from 'three'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'

export const MOON_RADIUS = 0.34
export const MOON_ORBIT_RADIUS = 3.6
export const MOON_ANGULAR_SPEED = 0.35

const moonFragment = /* glsl */ `
uniform vec3 uPlanetPosition;
uniform float uPlanetRadius;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}
${perturbNormalGLSL}

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
  vec3 toPlanet = uPlanetPosition - vWorldPosition;
  float planetAlong = dot(toPlanet, L);
  float lit = 1.0;
  if (planetAlong > 0.0) {
    float perp = sqrt(max(dot(toPlanet, toPlanet) - planetAlong * planetAlong, 0.0));
    lit = 1.0 - (1.0 - smoothstep(uPlanetRadius * 0.82, uPlanetRadius * 1.04, perp)) * 0.92;
  }

  float diffuse = max(dot(N, L), 0.0);
  vec3 color = albedo * (0.012 + diffuse * 1.1) * lit;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type MoonProps = {
  radius?: number
  ref?: Ref<Mesh>
  materialRef?: Ref<ShaderMaterial>
  children?: ReactNode
}

export function Moon({ radius = MOON_RADIUS, ref, materialRef, children }: MoonProps) {
  const uniforms = useMemo(
    () => ({
      uPlanetPosition: { value: new Vector3() },
      uPlanetRadius: { value: 2 },
    }),
    [],
  )

  return (
    <mesh ref={ref} scale={radius}>
      {children}
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={bodyVertexGLSL(false)}
        fragmentShader={moonFragment}
        uniforms={uniforms}
      />
    </mesh>
  )
}
