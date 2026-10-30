export const TUNE_FIELDS_SCHEMA = [
  {
    category: 'tires', sectionKey: 'tire-pressure', title: '胎压',
    fields: [
      { id: 'frontPressure', label: '前胎压', min: 1.4, max: 2.8, step: 0.01, unit: 'bar' },
      { id: 'rearPressure', label: '后胎压', min: 1.4, max: 2.8, step: 0.01, unit: 'bar' }
    ]
  },
  {
    category: 'tires', sectionKey: 'alignment', title: '定位',
    fields: [
      { id: 'frontCamber', label: '前外倾角', min: -5, max: 0, step: 0.1, unit: '°' },
      { id: 'rearCamber', label: '后外倾角', min: -5, max: 0, step: 0.1, unit: '°' },
      { id: 'frontToe', label: '前束角', min: -0.5, max: 0.5, step: 0.1, unit: '°' },
      { id: 'rearToe', label: '后束角', min: -0.5, max: 0.5, step: 0.1, unit: '°' },
      { id: 'frontCaster', label: '前后倾角', min: 1, max: 7, step: 0.1, unit: '°' }
    ]
  },
  {
    category: 'suspension', sectionKey: 'anti-roll-bars', title: '防倾杆',
    fields: [
      { id: 'frontARB', label: '前防倾杆', min: 1, max: 65, step: 0.1, unit: '' },
      { id: 'rearARB', label: '后防倾杆', min: 1, max: 65, step: 0.1, unit: '' }
    ]
  },
  {
    category: 'suspension', sectionKey: 'springs', title: '弹簧',
    fields: [
      { id: 'frontSpring', label: '前弹簧硬度', min: 0.1, max: 200, step: 0.1, unit: 'kgf/mm' },
      { id: 'rearSpring', label: '后弹簧硬度', min: 0.1, max: 200, step: 0.1, unit: 'kgf/mm' },
      { id: 'frontRideHeight', label: '前车身高度', min: 3, max: 20, step: 1, unit: 'cm' },
      { id: 'rearRideHeight', label: '后车身高度', min: 3, max: 20, step: 1, unit: 'cm' }
    ]
  },
  {
    category: 'suspension', sectionKey: 'damping', title: '阻尼',
    fields: [
      { id: 'frontRebound', label: '前回弹阻尼', min: 1, max: 20, step: 0.1, unit: '' },
      { id: 'rearRebound', label: '后回弹阻尼', min: 1, max: 20, step: 0.1, unit: '' },
      { id: 'frontBump', label: '前压缩阻尼', min: 1, max: 20, step: 0.1, unit: '' },
      { id: 'rearBump', label: '后压缩阻尼', min: 1, max: 20, step: 0.1, unit: '' }
    ]
  },
  { category: 'drivetrain', title: '差速器', kind: 'differential' },
  { category: 'drivetrain', title: '传动比', kind: 'gearing' },
  {
    category: 'brakes', title: '制动系统',
    fields: [
      { id: 'balance', label: '制动力平衡', min: 0, max: 100, step: 1, unit: '%' },
      { id: 'pressure', label: '制动力压力', min: 20, max: 200, step: 1, unit: '%' }
    ]
  },
  {
    category: 'aero', title: '空气动力学',
    fields: [
      { id: 'frontDownforce', label: '前下压力', min: 0, max: 1000, step: 1, unit: 'kgf' },
      { id: 'rearDownforce', label: '后下压力', min: 0, max: 1000, step: 1, unit: 'kgf' }
    ]
  }
]

export const PARAM_NAMES_ZH = {
  frontTirePressure: '前胎压', rearTirePressure: '后胎压', frontCamber: '前外倾角', rearCamber: '后外倾角',
  frontToe: '前束角', rearToe: '后束角', frontCaster: '前后倾角', frontSpring: '前弹簧刚度', rearSpring: '后弹簧刚度',
  frontDamping: '前避震阻尼', rearDamping: '后避震阻尼', frontRebound: '前回弹阻尼', rebound_front: '前回弹阻尼',
  rebound_rear: '后回弹阻尼', bump_front: '前阻尼压缩', bump_rear: '后阻尼压缩', rearRebound: '后回弹阻尼',
  frontBump: '前阻尼压缩', rearBump: '后阻尼压缩', frontARB: '前防倾杆', rearARB: '后防倾杆',
  frontRideHeight: '前车身高度', rearRideHeight: '后车身高度', diffAccel: '差速器加速锁', diffDecel: '差速器减速锁',
  diffCenter: '中央差速偏置', frontDiffAccel: '前部差速器加速', frontDiffDecel: '前部差速器减速',
  rearDiffAccel: '后部差速器加速', rearDiffDecel: '后部差速器减速', finalDrive: '终传比', frontDownforce: '前下压力',
  rearDownforce: '后下压力', brakeBias: '刹车偏置', gear1: '1挡齿比', gear2: '2挡齿比', gear3: '3挡齿比',
  gear4: '4挡齿比', gear5: '5挡齿比', gear6: '6挡齿比', gear7: '7挡齿比', gear8: '8挡齿比', gear9: '9挡齿比', gear10: '10挡齿比',
  tire_pressure_front: '前胎压', tire_pressure_rear: '后胎压', tire_camber_front: '前外倾角', tire_camber_rear: '后外倾角',
  tire_toe_front: '前束角', tire_toe_rear: '后束角', caster_front: '前后倾角', spring_front: '前弹簧', spring_rear: '后弹簧',
  damping_front: '前避震阻尼', damping_rear: '后避震阻尼', arb_front: '前防倾杆', arb_rear: '后防倾杆',
  ride_height_front: '前车身高度', ride_height_rear: '后车身高度', diff_accel: '差速器加速锁', diff_decel: '差速器减速锁',
  diff_center: '中央差速偏置', diff_front_accel: '前差速器加速', diff_front_decel: '前差速器减速',
  diff_rear_accel: '后差速器加速', diff_rear_decel: '后差速器减速'
}
