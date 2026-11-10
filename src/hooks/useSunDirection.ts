import { useCallback, useMemo } from 'react'
import { Vector3, type Group } from 'three'

type GroupRef = { current: Group | null }

/**
 * Per-frame direction from a body to the star at the origin. Call `update()`
 * at the top of the body's useFrame; the returned vectors are stable and can
 * be shared by the body's shader uniforms across renders.
 */
export function useSunDirection(groupRef: GroupRef) {
  const sunDirection = useMemo(() => new Vector3(-1, 0, 0), [])
  const worldPosition = useMemo(() => new Vector3(), [])
  const updateSunDirection = useCallback(() => {
    if (groupRef.current) {
      groupRef.current.getWorldPosition(worldPosition)
      sunDirection.copy(worldPosition).multiplyScalar(-1).normalize()
    }
  }, [groupRef, worldPosition, sunDirection])
  return { sunDirection, worldPosition, updateSunDirection }
}
