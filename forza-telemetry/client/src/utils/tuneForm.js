import { getDefaultParts } from '../data/parts'

// 将诊断规则的扁平参数键转换为调校表单的嵌套字段路径。
export const FIX_PARAM_MAP = {
  frontTirePressure: 'tires.frontPressure',
  rearTirePressure: 'tires.rearPressure',
  frontCamber: 'tires.frontCamber',
  rearCamber: 'tires.rearCamber',
  frontToe: 'tires.frontToe',
  rearToe: 'tires.rearToe',
  frontSpring: 'suspension.frontSpring',
  rearSpring: 'suspension.rearSpring',
  frontDamping: 'suspension.frontDamping',
  rearDamping: 'suspension.rearDamping',
  frontARB: 'suspension.frontARB',
  rearARB: 'suspension.rearARB',
  frontRideHeight: 'suspension.frontRideHeight',
  rearRideHeight: 'suspension.rearRideHeight',
  diffAccel: 'drivetrain.diffAccel',
  diffDecel: 'drivetrain.diffDecel',
  diffCenter: 'drivetrain.diffCenter',
  finalDrive: 'drivetrain.finalDrive',
  frontDownforce: 'aero.frontDownforce',
  rearDownforce: 'aero.rearDownforce',
  brakeBias: 'brakes.bias'
}

export function convertFixesToSuggestedChanges(fixes) {
  if (!fixes) return null
  const result = {}
  for (const [paramKey, fix] of Object.entries(fixes)) {
    const dotPath = FIX_PARAM_MAP[paramKey]
    if (!dotPath) continue
    const [category, field] = dotPath.split('.')
    if (!result[category]) result[category] = {}
    result[category][field] = fix.delta
  }
  return result
}

export const createDefaultFormData = () => ({
  name: '',
  tags: '',
  vehicleId: '',
  tires: {
    frontPressure: '', rearPressure: '', frontCamber: '', rearCamber: '', frontToe: '', rearToe: '', frontCaster: ''
  },
  suspension: {
    frontSpring: '', rearSpring: '', frontDamping: '', rearDamping: '',
    frontRebound: '', rearRebound: '', frontBump: '', rearBump: '',
    frontARB: '', rearARB: '', frontRideHeight: '', rearRideHeight: ''
  },
  drivetrain: {
    diffAccel: '', diffDecel: '', frontDiffAccel: '', frontDiffDecel: '', rearDiffAccel: '', rearDiffDecel: '', diffCenter: '',
    finalDrive: '', gear1: '', gear2: '', gear3: '', gear4: '', gear5: '', gear6: '', gear7: '', gear8: '', gear9: '', gear10: ''
  },
  brakes: { balance: '', pressure: '' },
  aero: { frontDownforce: '', rearDownforce: '' },
  parts: getDefaultParts(),
  freeMode: false,
  notes: ''
})

export const defaultFormData = createDefaultFormData()

const PI_CLASS_CAPS = [500, 600, 700, 800, 900, 998, 999]

export const nextPiClassCap = basePi => PI_CLASS_CAPS.find(cap => cap > Number(basePi)) || 999

export const isPiClassCap = value => PI_CLASS_CAPS.includes(value)
