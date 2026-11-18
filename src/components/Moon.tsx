import { useMemo, type ReactNode } from 'react'
import type { Ref } from 'react'
import { Vector3, type Mesh, type ShaderMaterial } from 'three'
import { aureliaFrame } from '../orbits'
import { FLIGHT_BODY_RADII } from '../camera-math'
import { noiseGLSL } from '../shaders/noise'
import { bodyVertexGLSL, perturbNormalGLSL } from '../shaders/common'

const moonFragment = /* glsl */`#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uPlanetPosition;
uniform float uPlanetRadius;
uniform float uSunRadius;
uniform float uStarFlux;
varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
${noiseGLSL}
${perturbNormalGLSL}

void main() {
#include <logdepthbuf_fragment>
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
  float elevation = micro * 0.0022 * bumpFade;
  vec3 N = perturbNormal(vObjectPosition, geometricN, elevation);

  vec3 L = normalize(-vWorldPosition);
  // The eclipse shadow is a cone, matching eclipse.ts's moonLight term for
  // term: Solis outgrows Aurelia, so the umbra narrows behind the planet
  // (apex at D·Rp/(Rs−Rp)) while the penumbra diverges — a cylinder would
  // overstate both.
  vec3 axis = normalize(uPlanetPosition);
  vec3 offset = vWorldPosition - uPlanetPosition;
  float along = dot(offset, axis);
  float lit = 1.0;
  vec3 refracted = vec3(0.0);
  if (along > 0.0) {
    float perp = length(offset - axis * along);
    float sunPlanet = length(uPlanetPosition);
    float penumbraR = uPlanetRadius + along * (uSunRadius + uPlanetRadius) / sunPlanet;
    float umbraR = uPlanetRadius * max(1.0 - along * (uSunRadius - uPlanetRadius) / (sunPlanet * uPlanetRadius), 0.0);
    float shadow = smoothstep(umbraR, penumbraR, perp);
    lit = shadow;
    // The umbra is not black: Aurelia's own ring of sunrises and sunsets
    // refracts a dim copper glow onto it — every sunrise at once, blue
    // scattered away on the long limb path. The penumbra reddens the same
    // way as direct light grazes the limb.
    refracted = vec3(0.85, 0.30, 0.08) * 0.07 * uStarFlux * (1.0 - shadow * shadow);
    refracted += vec3(0.35, 0.10, 0.02) * 0.5 * uStarFlux * shadow * (1.0 - shadow);
  }

  float diffuse = max(dot(N, L), 0.0);
  vec3 color = albedo * (0.012 + diffuse * 1.1 * uStarFlux * lit) + albedo * refracted;

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

export function Moon({ radius = aureliaFrame.moonRadius, ref, materialRef, children }: MoonProps) {
  const uniforms = useMemo(
    () => ({
      uPlanetPosition: { value: new Vector3() },
      uPlanetRadius: { value: aureliaFrame.planetRadius },
      uSunRadius: { value: FLIGHT_BODY_RADII.star },
      uStarFlux: { value: 1 },
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
