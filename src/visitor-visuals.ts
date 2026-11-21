import { BufferGeometry, MathUtils, Mesh, Object3D, Vector3 } from 'three'

import { type Visitor, position } from './visitor'

function mesh(parent: Object3D, prefix: string) {
  const part = parent.children.find((child) => child.name.startsWith(prefix))
  if (!(part instanceof Mesh)) throw new Error('Missing visitor part ' + prefix)
  return part
}

const up = new Vector3(0, 1, 0)
const stanceWidth = 0.116
const ankleHeight = 0.085
const angleBetween = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from))
const ease = (t: number) => t * t * (3 - 2 * t)

interface Foot {
  x: number
  z: number
  yaw: number
}

interface Step {
  index: 0 | 1
  from: Foot
  landing: Foot
  initialLift: number
  length: number
  progress: number
  stop?: { from: Foot; lift: number; progress: number }
}

interface Pet {
  point: Vector3
  amount: number
  side: -1 | 1
  yaw: number
}

// Reuse the exported bevel and material for both segments of each limb.
function limb(part: Object3D, parent: Object3D) {
  const geometry: unknown = part instanceof Mesh ? part.geometry : undefined
  if (!(geometry instanceof BufferGeometry))
    throw new Error('Missing geometry for ' + part.name)
  const second = part.clone()
  parent.add(part, second)
  const axis = new Vector3()
  geometry.computeBoundingBox()
  const height = geometry.boundingBox?.getSize(new Vector3()).y ?? 1

  function segment(
    piece: Object3D,
    start: Vector3,
    end: Vector3,
    overlap: number,
  ) {
    axis.subVectors(start, end)
    piece.position.copy(start).lerp(end, 0.5)
    piece.scale.y = (axis.length() + overlap) / height
    piece.quaternion.setFromUnitVectors(up, axis.normalize())
  }

  return (start: Vector3, joint: Vector3, end: Vector3, overlap: number) => {
    segment(part, start, joint, overlap)
    segment(second, joint, end, overlap)
  }
}

export function visitorVisuals(node: (name: string) => Object3D) {
  const root = node('Visitor')
  const torso = node('VisitorTorso')
  const hips = new Object3D()
  root.add(hips)
  hips.add(torso)
  torso.position.y = -0.73
  const head = new Object3D()
  head.position.y = 1.18
  torso.add(head)
  for (const part of [...torso.children]) {
    if (/^(Head|Hair|Eye)/.test(part.name)) {
      head.add(part)
      part.position.y -= head.position.y
    }
  }

  const sides = [-1, 1] as const
  const sleeves = torso.children.filter(
    (child): child is Mesh =>
      child instanceof Mesh && child.name.startsWith('Sleeve'),
  )
  const hands = torso.children.filter(
    (child): child is Mesh =>
      child instanceof Mesh && child.name.startsWith('Hand'),
  )
  const limbs = sides.map((side, i) => {
    const leg = node('VisitorLeg' + i)
    const shoe = mesh(leg, 'Shoe')
    root.add(shoe)
    const trouser = limb(mesh(leg, 'Trouser'), root)
    const sleeve = sleeves.find((part) => Math.sign(part.position.x) === side)
    const hand = hands.find((part) => Math.sign(part.position.x) === side)
    if (!sleeve || !hand) throw new Error('Missing visitor arm ' + i)
    const arm = limb(sleeve, torso)
    return { side, shoe, trouser, hand, arm, knee: new Vector3() }
  })
  const feet: [Foot, Foot] = [
    { x: 0, z: 0, yaw: 0 },
    { x: 0, z: 0, yaw: 0 },
  ]
  let step: Step | undefined
  let hasStance = false
  let targetYaw = 0
  let armSwing = 0
  let walkBlend = 0
  let previousLift = 0
  let seat = 1
  let crouch = 0
  let run = 0
  const hip = new Vector3()
  const knee = new Vector3()
  const ankle = new Vector3()
  const shoulder = new Vector3()
  const wrist = new Vector3()
  const elbow = new Vector3()
  const reach = new Vector3()
  const bend = new Vector3()
  const anchor = new Vector3()
  const petWrist = new Vector3()
  const kneeWrist = new Vector3()

  function footAt(index: 0 | 1, x: number, z: number, yaw: number, ahead = 0) {
    const side = sides[index] * stanceWidth
    return {
      x: x + Math.cos(yaw) * side - Math.sin(yaw) * ahead,
      z: z - Math.sin(yaw) * side - Math.cos(yaw) * ahead,
      yaw,
    }
  }

  function blendFoot(from: Foot, to: Foot, t: number): Foot {
    return {
      x: MathUtils.lerp(from.x, to.x, t),
      z: MathUtils.lerp(from.z, to.z, t),
      yaw: from.yaw + angleBetween(from.yaw, to.yaw) * t,
    }
  }

  function gait(x: number, z: number, yaw: number, stride: number, dt: number) {
    let lift = 0
    let movingFoot: 0 | 1 | undefined
    const lead = MathUtils.lerp(0.145, 0.1, crouch) + 0.04 * run
    const stepLength = MathUtils.lerp(0.34, 0.24, crouch) + 0.14 * run
    function startStep(index: 0 | 1, length: number, initialLift = 0): Step {
      return {
        index,
        from: feet[index],
        landing: footAt(index, x, z, yaw, length + lead),
        initialLift,
        length,
        progress: 0,
      }
    }

    if (stride > 0.0001) {
      if (step?.stop) {
        step = startStep(step.index, stepLength * 0.76, previousLift)
      } else if (!step) {
        // Lift the foot furthest back along the new direction of travel.
        const a = feet[0]
        const b = feet[1]
        const index =
          (a.x - b.x) * Math.sin(yaw) + (a.z - b.z) * Math.cos(yaw) >= 0 ? 0 : 1
        step = startStep(index, stepLength * 0.68)
      }
      const travel = (1 - step.progress) * step.length
      const landing = footAt(
        step.index,
        x,
        z,
        yaw,
        Math.max(0, travel - stride) + lead,
      )
      step.landing = blendFoot(step.landing, landing, 1 - Math.exp(-24 * dt))
      step.progress = Math.min(1, step.progress + stride / step.length)
      movingFoot = step.index
      feet[step.index] = blendFoot(step.from, step.landing, ease(step.progress))
      lift =
        step.initialLift * (1 - step.progress) +
        Math.sin(Math.PI * step.progress) *
          (MathUtils.lerp(0.105, 0.07, crouch) + 0.055 * run)
      armSwing = (2 * step.progress - 1) * sides[step.index]
      if (step.progress === 1)
        step = startStep(step.index === 0 ? 1 : 0, stepLength)
    } else {
      if (!step) {
        // If a turn left either foot pointing away, replant it in place.
        for (const index of [0, 1] as const) {
          const foot = feet[index]
          if (Math.abs(angleBetween(foot.yaw, yaw)) > 0.7) {
            step = startStep(index, 0)
            break
          }
        }
      }
      if (step) {
        movingFoot = step.index
        step.stop ??= {
          from: feet[step.index],
          lift: previousLift,
          progress: 0,
        }
        const stop = step.stop
        stop.progress = Math.min(1, stop.progress + dt / 0.18)
        const landing = footAt(step.index, x, z, yaw, 0.035)
        const t = ease(stop.progress)
        feet[step.index] = blendFoot(stop.from, landing, t)
        // Finish the airborne step while the opposite shoe stays planted.
        lift =
          stop.lift * (1 - t) +
          0.045 * Math.sin(Math.PI * stop.progress) * (1 - step.progress)
        if (stop.progress === 1) step = undefined
      }
    }
    previousLift = lift
    return { lift, movingFoot }
  }

  function body(
    visitor: Visitor,
    crouched: boolean,
    running: boolean,
    height: number,
    stride: number,
    dt: number,
    reduce: boolean,
    pet: Pet | undefined,
  ) {
    const p = position(visitor)
    root.position.set(p.x, height, p.z)
    const targetSeat = Number(visitor.kind === 'seated')
    const targetCrouch = Number(crouched && !targetSeat)
    const elapsed = dt || 1 / 60
    const reset = reduce || targetSeat > 0 || height > 0 || !hasStance
    if (reset || stride > 0.0001) targetYaw = visitor.yaw
    else if (pet) targetYaw = pet.yaw + pet.side * 0.22

    const turn = angleBetween(root.rotation.y, targetYaw)
    root.rotation.y +=
      reset || Math.abs(turn) < 0.005
        ? turn
        : turn * (1 - Math.exp(-15 * elapsed))
    const yaw = root.rotation.y
    if (reset) {
      feet[0] = footAt(0, p.x, p.z, yaw)
      feet[1] = footAt(1, p.x, p.z, yaw)
      step = undefined
      previousLift = 0
    }
    hasStance = !reduce && !targetSeat && height === 0

    function settle(value: number, target: number, speed: number) {
      return reduce || Math.abs(value - target) < 0.004
        ? target
        : MathUtils.damp(value, target, speed, elapsed)
    }
    seat = settle(seat, targetSeat, 14)
    crouch = settle(crouch, targetCrouch, 12)
    const targetRun = Number(running && stride > 0.0001 && !reduce)
    run = settle(run, targetRun, 14)
    walkBlend = settle(walkBlend, Number(!reduce && stride > 0.0001), 18)
    const { lift, movingFoot } = gait(
      p.x,
      p.z,
      targetYaw,
      reduce || height > 0 ? 0 : stride,
      elapsed,
    )
    const petLean = (pet?.amount ?? 0) * crouch
    hips.position.set(
      0,
      0.708 - 0.158 * seat - 0.442 * crouch + 0.19 * lift,
      0.112 * crouch - 0.052 * petLean,
    )
    hips.rotation.x = -0.06 * seat - 0.43 * crouch - 0.25 * petLean - 0.16 * run
    head.rotation.x = -0.19 * crouch - 0.12 * petLean
    head.rotation.y = pet ? -pet.side * 0.22 * petLean : 0

    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    for (const [
      i,
      { side, shoe, trouser, knee: kneePosition },
    ] of limbs.entries()) {
      const foot = feet[i === 0 ? 0 : 1]
      const dx = foot.x - p.x
      const dz = foot.z - p.z
      hip.set(side * 0.091, hips.position.y, hips.position.z)
      ankle.set(
        dx * cos - dz * sin,
        ankleHeight +
          0.12 * seat +
          (movingFoot === i ? lift : 0) +
          0.31 * height,
        dx * sin + dz * cos - 0.34 * seat + 0.18 * height,
      )

      // Bend each knee forward and slightly out, keeping both leg segments
      // close to their standing length even when the hips drop near the heels.
      reach.subVectors(ankle, hip)
      const distance = reach.length()
      reach.normalize()
      bend.set(side * 0.33 * crouch, 0, -1)
      bend.addScaledVector(reach, -bend.dot(reach)).normalize()
      knee
        .copy(hip)
        .lerp(ankle, 0.5)
        .addScaledVector(
          bend,
          Math.sqrt(Math.max(0, 0.333 ** 2 - (distance / 2) ** 2)),
        )
      trouser(hip, knee, ankle, 0.085)
      kneePosition.copy(knee)
      const shoeYaw = angleBetween(yaw, foot.yaw)
      shoe.rotation.y = shoeYaw
      shoe.position.copy(ankle)
      shoe.position.y -= 0.02
      shoe.position.x -= Math.sin(shoeYaw) * 0.04
      shoe.position.z -= Math.cos(shoeYaw) * 0.04
    }
    return (
      step !== undefined ||
      walkBlend !== 0 ||
      seat !== targetSeat ||
      crouch !== targetCrouch ||
      run !== targetRun ||
      Math.abs(angleBetween(yaw, targetYaw)) >= 0.005
    )
  }

  function arms(
    leftGrip: Vector3 | undefined,
    rightGrip: Vector3 | undefined,
    dt: number,
    reduce: boolean,
    pet: Pet | undefined,
  ) {
    let moving = false
    const swing = armSwing * walkBlend
    const height = root.position.y
    for (const { side, hand, arm, knee: kneePosition } of limbs) {
      const grip = side < 0 ? leftGrip : rightGrip
      shoulder.set(side * 0.207, 1.06, 0)
      if (grip) {
        torso.worldToLocal(wrist.copy(grip))
      } else {
        wrist.set(
          side * (0.228 + 0.045 * crouch),
          0.675 + 0.14 * seat + 0.17 * run + 0.31 * height,
          -0.15 * seat - swing * side * (0.2 + 0.09 * run) - 0.28 * height,
        )
        if (crouch > 0) {
          kneeWrist.copy(kneePosition)
          kneeWrist.y += 0.04
          kneeWrist.z += 0.015
          torso.worldToLocal(root.localToWorld(kneeWrist))
          wrist.lerp(kneeWrist, crouch * (1 - walkBlend))
        }
        if (pet?.side === side) {
          torso.worldToLocal(petWrist.copy(pet.point))
          const stroke = MathUtils.smoothstep(pet.amount, 0.12, 0.7)
          // The reaching shoulder follows the hand while the other arm braces.
          shoulder.addScaledVector(
            reach.subVectors(petWrist, shoulder).normalize(),
            stroke * 0.062,
          )
          wrist.lerp(petWrist, stroke)
        }
      }

      // Solve the elbow between the shoulder and the grip. Point it down
      // and out so a held prop does not pull the arm through the sweater.
      reach.subVectors(wrist, shoulder)
      const length = MathUtils.clamp(reach.length(), 0.05, 0.43)
      wrist.copy(shoulder).addScaledVector(reach.normalize(), length)
      if (grip || reduce || hand.position.distanceToSquared(wrist) < 0.00001) {
        hand.position.copy(wrist)
      } else {
        hand.position.lerp(wrist, 1 - Math.exp(-22 * (dt || 1 / 60)))
        moving = true
      }
      reach.subVectors(hand.position, shoulder)
      const distance = reach.length()
      reach.normalize()
      bend.set(side * 0.24, -0.75, 0.67)
      bend.addScaledVector(reach, -bend.dot(reach)).normalize()
      elbow
        .copy(shoulder)
        .lerp(hand.position, 0.5)
        .addScaledVector(
          bend,
          Math.sqrt(Math.max(0, 0.216 ** 2 - (distance / 2) ** 2)),
        )
      arm(shoulder, elbow, hand.position, 0.045)
      hand.rotation.x = grip ? -0.24 : swing * side * 0.3
    }
    return moving
  }

  return {
    root,
    body,
    arms,
    heading: () => root.rotation.y,
    carryHeight: () => root.position.y + hips.position.y + 0.16,
    sipHeight: () => torso.localToWorld(anchor.set(0, 1.18, -0.18)).y,
  }
}
