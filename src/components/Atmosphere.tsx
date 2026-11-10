import { useMemo } from 'react'
import { AdditiveBlending, FrontSide, Vector3 } from 'three'

const atmosphereVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vPlanetCenter;
varying float vAtmosphereRadius;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vPlanetCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vAtmosphereRadius = 2.0 * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const atmosphereFragment = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uRayleighCoefficients;
uniform float uMieCoefficient;
uniform float uIntensity;
varying vec3 vWorldPosition;
varying vec3 vPlanetCenter;
varying float vAtmosphereRadius;

const int VIEW_STEPS = 5;
const int LIGHT_STEPS = 2;
const float PI = 3.14159265359;

vec2 raySphere(vec3 origin, vec3 direction, vec3 center, float radius) {
  vec3 offset = origin - center;
  float b = dot(offset, direction);
  float c = dot(offset, offset) - radius * radius;
  float discriminant = b * b - c;
  if (discriminant < 0.0) return vec2(1e5, -1e5);
  float root = sqrt(discriminant);
  return vec2(-b - root, -b + root);
}

vec2 densityAt(vec3 point, float planetRadius, vec2 scaleHeights) {
  float height = max(length(point - vPlanetCenter) - planetRadius, 0.0);
  return exp(-height / scaleHeights);
}

float rayleighPhase(float cosTheta) {
  return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
}

float miePhase(float cosTheta) {
  float g = 0.62;
  float g2 = g * g;
  float denominator = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * PI * pow(max(denominator, 0.0001), 1.5));
}

void main() {
  vec3 rayOrigin = cameraPosition;
  vec3 rayDirection = normalize(vWorldPosition - rayOrigin);
  vec3 lightDirection = normalize(uSunDirection);
  float atmosphereRadius = vAtmosphereRadius;
  float planetRadius = atmosphereRadius / 1.05;
  float atmosphereHeight = atmosphereRadius - planetRadius;

  vec2 atmosphereHit = raySphere(rayOrigin, rayDirection, vPlanetCenter, atmosphereRadius);
  vec2 planetHit = raySphere(rayOrigin, rayDirection, vPlanetCenter, planetRadius);
  float rayStart = max(atmosphereHit.x, 0.0);
  float rayEnd = atmosphereHit.y;
  if (planetHit.x > 0.0) rayEnd = min(rayEnd, planetHit.x);

  float rayLength = max(rayEnd - rayStart, 0.0);
  if (rayLength < 0.00001) discard;
  float segmentLength = rayLength / float(VIEW_STEPS);

  vec2 scaleHeights = vec2(atmosphereHeight * 0.22, atmosphereHeight * 0.07);
  vec3 rayleighCoefficients = uRayleighCoefficients;
  float mieCoefficient = uMieCoefficient;
  float cosTheta = dot(rayDirection, lightDirection);
  float phaseR = rayleighPhase(cosTheta);
  float phaseM = miePhase(cosTheta);

  vec3 opticalDepthView = vec3(0.0);
  vec3 scattering = vec3(0.0);

  for (int i = 0; i < VIEW_STEPS; i++) {
    float sampleDistance = rayStart + (float(i) + 0.5) * segmentLength;
    vec3 samplePosition = rayOrigin + rayDirection * sampleDistance;
    vec2 density = densityAt(samplePosition, planetRadius, scaleHeights);
    vec3 extinction = rayleighCoefficients * density.x + vec3(mieCoefficient * density.y);
    vec3 opticalDepthSample = opticalDepthView + extinction * segmentLength * 0.5;

    vec2 lightAtmosphere = raySphere(samplePosition, lightDirection, vPlanetCenter, atmosphereRadius);
    vec2 lightPlanet = raySphere(samplePosition, lightDirection, vPlanetCenter, planetRadius);
    float sunHeight = dot(normalize(samplePosition - vPlanetCenter), lightDirection);
    float sunVisibility = smoothstep(-0.12, 0.06, sunHeight);
    float planetShadow = smoothstep(0.0, planetRadius * 0.015, lightPlanet.x)
      * step(0.0, lightPlanet.y);
    sunVisibility *= 1.0 - planetShadow;

    if (sunVisibility > 0.001) {
      float lightSegmentLength = max(lightAtmosphere.y, 0.0) / float(LIGHT_STEPS);
      vec3 opticalDepthLight = vec3(0.0);

      for (int j = 0; j < LIGHT_STEPS; j++) {
        vec3 lightSample = samplePosition + lightDirection
          * ((float(j) + 0.5) * lightSegmentLength);
        vec2 lightDensity = densityAt(lightSample, planetRadius, scaleHeights);
        opticalDepthLight += (
          rayleighCoefficients * lightDensity.x + vec3(mieCoefficient * lightDensity.y)
        ) * lightSegmentLength;
      }

      vec3 transmittance = exp(-(opticalDepthSample + opticalDepthLight));
      vec3 source = rayleighCoefficients * density.x * phaseR
        + vec3(mieCoefficient * density.y * phaseM);
      scattering += transmittance * source * segmentLength * sunVisibility;
    }

    opticalDepthView += extinction * segmentLength;
  }

  gl_FragColor = vec4(scattering * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const presets = {
  aurelia: { rayleigh: [0.43, 1.3, 2.72], mie: 0.8, intensity: 2.4 },
  dust: { rayleigh: [1.35, 0.72, 0.28], mie: 0.45, intensity: 1.5 },
  ice: { rayleigh: [0.55, 0.85, 1.05], mie: 0.3, intensity: 1.3 },
} as const

type AtmosphereProps = {
  sunDirection: Vector3
  variant?: 'aurelia' | 'dust' | 'ice'
}

export function Atmosphere({ sunDirection, variant = 'aurelia' }: AtmosphereProps) {
  const atmosphereUniforms = useMemo(() => {
    const preset = presets[variant]
    return {
      uSunDirection: { value: sunDirection },
      uRayleighCoefficients: { value: new Vector3(...preset.rayleigh) },
      uMieCoefficient: { value: preset.mie },
      uIntensity: { value: preset.intensity },
    }
  }, [sunDirection, variant])

  return (
    <mesh scale={1.05} renderOrder={2}>
      <sphereGeometry args={[2, 128, 128]} />
      <shaderMaterial
        vertexShader={atmosphereVertexShader}
        fragmentShader={atmosphereFragment}
        uniforms={atmosphereUniforms}
        side={FrontSide}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  )
}
