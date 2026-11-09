import { MathUtils, type Object3D, Quaternion, Vector3 } from 'three'

export type BookPose = 'rest' | 'held' | 'reading' | 'placed'

export function bookTransform(object?: Object3D) {
  return {
    position: object?.position.clone() ?? new Vector3(),
    rotation: object?.quaternion.clone() ?? new Quaternion(),
    scale: object?.scale.clone() ?? new Vector3(1, 1, 1),
  }
}

type BookTransform = ReturnType<typeof bookTransform>

export function bookMotion(object: Object3D, shelf?: Vector3) {
  let pose: BookPose = 'rest'
  let openness = 0
  let transition:
    | {
        from: BookTransform
        start: number
        openness: number
        fromShelf: boolean
      }
    | undefined

  return function move(
    destination: BookPose,
    target: BookTransform,
    now: number,
    reduce: boolean,
  ) {
    if (destination !== pose) {
      transition = {
        from: bookTransform(object),
        start: now,
        openness,
        fromShelf: shelf !== undefined && pose === 'rest' && !transition,
      }
      pose = destination
    }

    if (transition && !reduce) {
      const { from, start, fromShelf } = transition
      const reading = pose === 'reading'
      const toShelf = shelf !== undefined && pose === 'rest'
      const elapsed = now - start
      const closeDuration = reading ? 0 : 200 * transition.openness
      const flightDuration = reading || transition.openness > 0 ? 260 : 340
      const progress = MathUtils.smoothstep(
        elapsed,
        closeDuration,
        closeDuration + flightDuration,
      )
      const turn = MathUtils.smoothstep(
        progress,
        fromShelf ? 0.26 : 0,
        toShelf ? 0.74 : 1,
      )
      object.position.lerpVectors(from.position, target.position, turn)
      const lift = turn * (1 - turn)
      object.position.y += lift * 0.33
      if (shelf && fromShelf) {
        const extraction = MathUtils.smoothstep(progress, 0, 0.26)
        object.position.addScaledVector(shelf, extraction * (1 - turn))
      }
      if (shelf && toShelf) {
        const insertion = MathUtils.smoothstep(progress, 0.74, 1)
        object.position.addScaledVector(shelf, (1 - insertion) * turn)
      }
      object.quaternion.slerpQuaternions(from.rotation, target.rotation, turn)
      object.scale.lerpVectors(from.scale, target.scale, progress)
      openness = reading
        ? MathUtils.lerp(
            transition.openness,
            1,
            MathUtils.smoothstep(elapsed, 105, 345),
          )
        : transition.openness *
          (1 - MathUtils.smoothstep(elapsed, 0, closeDuration || 1))
      if (progress < 1 || (reading && openness < 1))
        return { openness, moving: true }
    }

    transition = undefined
    object.position.copy(target.position)
    object.quaternion.copy(target.rotation)
    object.scale.copy(target.scale)
    openness = pose === 'reading' ? 1 : 0
    return { openness, moving: false }
  }
}
