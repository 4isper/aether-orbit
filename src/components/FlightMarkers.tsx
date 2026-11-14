import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, type Group } from 'three'
import { FLIGHT_BODY_IDS, FLIGHT_BODY_RADII, flightBodyPosition, type FlightBodyId } from '../camera-math'
import { bodies } from '../planets'
import { t, type Locale } from '../strings'

/**
 * Flight markers: the name of every flyable body floating where the body
 * is, so a distant point of light answers to a name. A marker shows only
 * while its body is ahead of the pilot and still far enough to be a point;
 * up close the body itself fills the view and the label steps aside.
 */
export function FlightMarkers({
  timeRef,
  moonWorldRef,
  locale,
  flight,
  onAutopilot,
}: {
  locale: Locale
  timeRef: { current: number }
  moonWorldRef: { current: Vector3 }
  /** In flight the markers are the autopilot's own buttons: click a name,
   * and the ship flies itself to that body until a hand takes over. */
  flight: boolean
  onAutopilot: (id: FlightBodyId) => void
}) {
  const camera = useThree((state) => state.camera)
  const groups = useRef<Partial<Record<FlightBodyId, Group | null>>>({})
  const labels = useRef<Partial<Record<FlightBodyId, HTMLElement | null>>>({})
  const scratch = useMemo(() => new Vector3(), [])
  const forward = useMemo(() => new Vector3(), [])
  const toBody = useMemo(() => new Vector3(), [])

  useFrame(() => {
    camera.getWorldDirection(forward)
    for (const id of FLIGHT_BODY_IDS) {
      const group = groups.current[id]
      const label = labels.current[id]
      if (!group || !label) continue
      flightBodyPosition(id, moonWorldRef.current, timeRef.current, scratch)
      group.position.copy(scratch)
      toBody.copy(scratch).sub(camera.position)
      const distance = toBody.length()
      const ahead = toBody.dot(forward) > 0
      // The same gate drives the look and the click: a name that has stepped
      // aside is not a button.
      const shown = ahead && distance > FLIGHT_BODY_RADII[id] * 5
      label.style.opacity = shown ? '1' : '0'
      label.style.pointerEvents = shown ? 'auto' : 'none'
    }
  })

  return (
    <>
      {FLIGHT_BODY_IDS.map((id) => (
        <group
          key={id}
          ref={(node) => { groups.current[id] = node }}
        >
          <Html center zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}>
            {flight ? (
              <button
                type="button"
                className="flight-marker flight-marker--go"
                ref={(node) => { labels.current[id] = node }}
                onClick={() => onAutopilot(id)}
                aria-label={t(locale, 'autopilotFly', { name: bodies[id].name })}
              >
                {bodies[id].name}
              </button>
            ) : (
              <div className="flight-marker" ref={(node) => { labels.current[id] = node }}>
                {bodies[id].name}
              </div>
            )}
          </Html>
        </group>
      ))}
    </>
  )
}
