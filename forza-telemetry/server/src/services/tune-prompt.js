/**
 * AI 诊断 Prompt 里的「当前调校参数」片段构造器（纯函数）。
 *
 * 输出格式与既有实现逐字一致：既支持已保存的调校方案，也支持调校工坊里
 * 尚未保存的在途草稿（req.body.formData），无任何可用参数时返回原厂兜底文案。
 */

export function formatTuneParamsForPrompt(tune) {
  if (!tune) {
    return '该车辆目前使用的是未改动的原厂设定，没有可用的自定义调校参数。';
  }
  return `
  - 轮胎气压：前轮 ${tune.tires?.frontPressure || '未设置'} PSI, 后轮 ${tune.tires?.rearPressure || '未设置'} PSI
  - 轮胎外倾角：前轮 ${tune.tires?.frontCamber || '未设置'}°, 后轮 ${tune.tires?.rearCamber || '未设置'}°
  - 轮胎束角：前轮 ${tune.tires?.frontToe || '未设置'}°, 后轮 ${tune.tires?.rearToe || '未设置'}°
  - 悬架弹簧刚度：前部 ${tune.suspension?.frontSpring || '未设置'}, 后部 ${tune.suspension?.rearSpring || '未设置'}
  - 防倾杆硬度：前部 ${tune.suspension?.frontARB || '未设置'}, 后部 ${tune.suspension?.rearARB || '未设置'}
  - 车身高度：前部 ${tune.suspension?.frontRideHeight || '未设置'} cm, 后部 ${tune.suspension?.rearRideHeight || '未设置'} cm
  - 避震阻尼：前侧压缩 ${tune.suspension?.frontDamping || '未设置'}, 后侧压缩 ${tune.suspension?.rearDamping || '未设置'}
  - 差速器锁：加速锁 ${tune.drivetrain?.diffAccel || '未设置'}%, 减速锁 ${tune.drivetrain?.diffDecel || '未设置'}%, 中央分配 ${tune.drivetrain?.diffCenter || '未设置'}%
  - 空气动力学下压力：前部 ${tune.aero?.frontDownforce || '未设置'} lbs, 后部 ${tune.aero?.rearDownforce || '未设置'} lbs
  `;
}

/**
 * 选择注入 Prompt 的参数来源：在途草稿（formData）优先，其次已保存方案。
 * 只接受包含 tires/suspension/drivetrain/aero 任一字段的对象，避免把无关 body 当草稿。
 */
export function pickTuneForPrompt({ formData, savedTune } = {}) {
  const hasTuneShape = (value) => Boolean(value)
    && typeof value === 'object'
    && ['tires', 'suspension', 'drivetrain', 'aero'].some((key) => value[key] && typeof value[key] === 'object');

  if (hasTuneShape(formData)) {
    return { tune: formData, source: 'draft', sourceLabel: '用户当前在调校工坊中尚未保存的草稿参数' };
  }
  if (hasTuneShape(savedTune)) {
    return { tune: savedTune, source: 'saved', sourceLabel: '本场已保存的调校方案' };
  }
  return { tune: null, source: 'none', sourceLabel: '原厂设定' };
}
